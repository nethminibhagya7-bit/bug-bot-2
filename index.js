require("dotenv").config();
const express = require("express");
const axios = require("axios");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");

// ---------- Config (from environment variables) ----------
const {
  DISCORD_TOKEN,   // Discord bot token
  CLIENT_ID,       // Discord application (client) ID
  GUILD_ID,        // Discord server ID where commands will be registered
  PANEL_URL,       // e.g. https://privete.lakiyahost.buzz
  PANEL_API_KEY,   // Pterodactyl Client API key (starts with ptlc_)
  SERVER_ID,       // Server identifier from the panel (e.g. ed696308)
} = process.env;

const REQUIRED_VARS = [
  "DISCORD_TOKEN",
  "CLIENT_ID",
  "GUILD_ID",
  "PANEL_URL",
  "PANEL_API_KEY",
  "SERVER_ID",
];
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length) {
  console.error("Missing required environment variables:", missing.join(", "));
  console.error("Set these in a .env file (locally) or in your host's environment variables panel.");
  process.exit(1);
}

// ---------- Keep-alive web server ----------
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bug Bot Running!"));
app.listen(PORT, () => console.log("Web server started on " + PORT));

// ---------- Pterodactyl API helper ----------
const panel = axios.create({
  baseURL: `${PANEL_URL.replace(/\/+$/, "")}/api/client`,
  headers: {
    Authorization: `Bearer ${PANEL_API_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

async function sendPowerSignal(signal) {
  // signal: "start" | "stop" | "restart" | "kill"
  await panel.post(`/servers/${SERVER_ID}/power`, { signal });
}

async function getServerStatus() {
  const { data } = await panel.get(`/servers/${SERVER_ID}/resources`);
  return data.attributes; // { current_state, resources: { memory_bytes, cpu_absolute, disk_bytes }, ... }
}

// ---------- Discord bot ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName("start").setDescription("Start the game server"),
  new SlashCommandBuilder().setName("stop").setDescription("Stop the game server"),
  new SlashCommandBuilder().setName("restart").setDescription("Restart the game server"),
  new SlashCommandBuilder().setName("status").setDescription("Check the game server status"),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("Slash commands registered.");
  } catch (err) {
    console.error("Failed to register commands:", err.response?.data || err.message);
  }
}

function stateEmoji(state) {
  switch (state) {
    case "running":
      return "🟢";
    case "starting":
      return "🟡";
    case "stopping":
      return "🟠";
    case "offline":
      return "🔴";
    default:
      return "⚪";
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    if (commandName === "start") {
      await interaction.deferReply();
      await sendPowerSignal("start");
      await interaction.editReply("🟢 Start signal sent. The server should be booting up now — use `/status` in a bit to check progress.");
    } else if (commandName === "stop") {
      await interaction.deferReply();
      await sendPowerSignal("stop");
      await interaction.editReply("🔴 Stop signal sent.");
    } else if (commandName === "restart") {
      await interaction.deferReply();
      await sendPowerSignal("restart");
      await interaction.editReply("🟠 Restart signal sent.");
    } else if (commandName === "status") {
      await interaction.deferReply();
      const attrs = await getServerStatus();
      const state = attrs.current_state;
      const mb = (attrs.resources.memory_bytes / 1024 / 1024).toFixed(0);
      const cpu = attrs.resources.cpu_absolute.toFixed(1);
      const embed = new EmbedBuilder()
        .setTitle("Server Status")
        .setDescription(`${stateEmoji(state)} **${state}**`)
        .addFields(
          { name: "CPU", value: `${cpu}%`, inline: true },
          { name: "Memory", value: `${mb} MB`, inline: true }
        )
        .setColor(state === "running" ? 0x57f287 : state === "offline" ? 0xed4245 : 0xfee75c);
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    const msg = err.response?.data?.errors?.[0]?.detail || err.message || "Unknown error";
    console.error("Command error:", msg);
    const reply = { content: `⚠️ Something went wrong: ${msg}` };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(DISCORD_TOKEN);
