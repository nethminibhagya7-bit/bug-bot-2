# WhatsApp Downloader Bot

Sends back the video whenever someone posts a YouTube, Instagram, TikTok, or
Facebook link in a chat the bot is in.

## ⚠️ Before you use this

- WhatsApp's Terms of Service do not permit unofficial/automated clients like
  the library this bot uses (Baileys). Meta actively detects and bans numbers
  that use it, especially with heavy use.
- Strongly recommend linking this to a **spare/secondary number**, not your
  main personal WhatsApp.
- Downloading content from these platforms may also violate their own terms
  of service — this is for personal/private use, not redistribution.

## Setup

1. `npm install` (this also downloads a yt-dlp binary automatically)
2. `npm start`
3. A QR code will print in the console/terminal
4. On your phone: WhatsApp > Settings > Linked Devices > Link a Device
5. Scan the QR code
6. Once connected, post a supported link in any chat the bot is part of —
   it will reply "Downloading..." then send the video back

## Notes

- Login session is saved in `auth_info/` so you don't need to re-scan the QR
  every restart — but if you delete this folder, you'll need to scan again.
- Videos over 50MB are skipped with a warning (WhatsApp media limits).
- If a platform changes its site structure, the underlying `yt-dlp` engine
  may need updating — run `npm update yt-dlp-exec` if downloads start failing.
