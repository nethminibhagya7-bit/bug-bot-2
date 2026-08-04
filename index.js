const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const { execFile } = require("child_process");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const pino = require("pino");

const AUTH_DIR = path.join(__dirname, "auth_info");
const BIN_DIR = path.join(__dirname, "bin");
const YTDLP_PATH = path.join(BIN_DIR, "yt-dlp");
const TMP_DIR = os.tmpdir();
const MAX_FILESIZE_MB = 50; // WhatsApp media caps out well below this in practice; keep it safe

// Matches a YouTube, Instagram, TikTok, or Facebook URL anywhere in the message text
const LINK_REGEX =
  /(https?:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com|fb\.watch)\/[^\s]+)/i;

// ---------- Download and prepare a static yt-dlp binary (no Python required) ----------
function httpsGetFollowRedirects(url, destStream) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          httpsGetFollowRedirects(res.headers.location, destStream).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download yt-dlp binary: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(destStream);
        destStream.on("finish", resolve);
        destStream.on("error", reject);
      })
      .on("error", reject);
  });
}

async function ensureYtDlp() {
  if (fs.existsSync(YTDLP_PATH)) return;
  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log("Downloading yt-dlp binary (first run only)...");
  const dest = fs.createWriteStream(YTDLP_PATH);
  await httpsGetFollowRedirects(
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
    dest
  );
  fs.chmodSync(YTDLP_PATH, 0o755);
  console.log("yt-dlp binary ready.");
}

function downloadMedia(url) {
  return new Promise((resolve, reject) => {
    const outPath = path.join(TMP_DIR, `dl_${Date.now()}.mp4`);
    execFile(
      YTDLP_PATH,
      [
        "-f",
        "mp4",
        "-o",
        outPath,
        "--no-playlist",
        "--max-filesize",
        `${MAX_FILESIZE_MB}M`,
        url,
      ],
      { maxBuffer: 1024 * 1024 * 20 },
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        if (!fs.existsSync(outPath)) {
          reject(new Error("Download did not produce a file (may be too large or unsupported)."));
          return;
        }
        resolve(outPath);
      }
    );
  });
}

// ---------- WhatsApp bot ----------
async function startBot() {
  await ensureYtDlp();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Scan this QR code with WhatsApp (Linked Devices > Link a Device):");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnecting:", shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("WhatsApp connection open. Bot is ready.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const match = text.match(LINK_REGEX);
    if (!match) return;

    const url = match[1];
    console.log("Download requested:", url);

    let filePath;
    try {
      await sock.sendMessage(jid, { text: "⏳ Downloading, hang on..." }, { quoted: msg });
      filePath = await downloadMedia(url);

      const stats = fs.statSync(filePath);
      const mb = stats.size / (1024 * 1024);
      if (mb > MAX_FILESIZE_MB) {
        await sock.sendMessage(
          jid,
          { text: `⚠️ That video is too large (${mb.toFixed(1)}MB) to send over WhatsApp.` },
          { quoted: msg }
        );
        return;
      }

      await sock.sendMessage(
        jid,
        { video: fs.readFileSync(filePath), caption: "✅ Here you go!" },
        { quoted: msg }
      );
    } catch (err) {
      console.error("Download error:", err.message);
      await sock.sendMessage(
        jid,
        { text: `⚠️ Couldn't download that: ${err.message}` },
        { quoted: msg }
      );
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlink(filePath, () => {});
      }
    }
  });
}

startBot().catch((err) => {
  console.error("Fatal error starting bot:", err);
  process.exit(1);
});
