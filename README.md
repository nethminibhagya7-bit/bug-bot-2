# Bug Bot

A Discord bot that lets you `/start`, `/stop`, `/restart`, and check `/status`
of your Pterodactyl-panel game server, right from Discord.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Create a Discord application**
   - Go to https://discord.com/developers/applications and create a New Application.
   - Under **Bot**, click "Reset Token" to get your `DISCORD_TOKEN`. Enable no privileged intents (not needed).
   - Under **OAuth2 > URL Generator**, select scopes `bot` and `applications.commands`,
     permission `Send Messages`, then use the generated URL to invite the bot to your server.
   - Copy the **Application (Client) ID** from General Information — this is `CLIENT_ID`.
   - Enable Developer Mode in Discord (User Settings > Advanced), then right-click
     your server icon and "Copy Server ID" — this is `GUILD_ID`.

3. **Get your panel API key**
   - In the panel, go to Account Settings > API Credentials > Create API Key.
     This is `PANEL_API_KEY` (starts with `ptlc_`).
   - `PANEL_URL` is your panel's base URL (e.g. `https://privete.lakiyahost.buzz`).
   - `SERVER_ID` is the short server identifier shown in your server's panel URL.

4. **Configure environment variables**
   - Copy `.env.example` to `.env` and fill in all the values.
   - Never commit `.env` — it's already in `.gitignore`.

5. **Run it**
   ```
   npm start
   ```

## Commands

| Command    | Description                     |
|------------|----------------------------------|
| `/start`   | Sends the start signal            |
| `/stop`    | Sends the stop signal             |
| `/restart` | Sends the restart signal          |
| `/status`  | Shows current state, CPU & memory |

## Security note

Your `PANEL_API_KEY` gives full control over the server it's scoped to. Keep it
in environment variables only — never hard-code it or commit it to the repo.
