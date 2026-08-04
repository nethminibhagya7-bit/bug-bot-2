const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const youtubedl = require("yt-dlp-exec");
const fs = require("fs");
const path = require("path");
const os = require("os");
const pino = require("pino");

const AUTH_DIR = path.join(__dirname, "auth_info");
const TMP_DIR = os.tmpdir();
const MAX_FILESIZE_MB = 50; // WhatsApp media caps out well below this in practice; keep it safe

// Matches a YouTube, Instagram, TikTok, or Facebook URL anywhere in the message text
const LINK_REGEX =
  /(https?:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com|fb\.watch)\/[^\s]+)/i;

async function downloadMedia(url) {
  const outPath = path.join(TMP_DIR, `dl_${Date.now()}.mp4`);
  await youtubedl(url, {
    output: outPath,
    format: "mp4",
    noPlaylist: true,
    maxFilesize: `${MAX_FILESIZE_MB}M`,
  });
  if (!fs.existsSync(outPath)) {
    throw new Error("Download did not produce a file (may be too large or unsupported).");
  }
  return outPath;
}

async function startBot() {
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
