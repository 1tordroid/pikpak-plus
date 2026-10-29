<p align="center">
  <img src="pikpak-plus-client/public/tordroid-plus-icon.svg" alt="Tordroid Plus" width="120">
</p>

<h1 align="center">Tordroid Plus</h1>

<p align="center">
  A private family portal for a shared PikPak Premium account: torrent downloads,
  in-app video playback with VLC hand-off, and read-only WebDAV access.
  <br />
  <a href="https://tordroid.com"><strong>tordroid.com</strong></a>
</p>

## Features

- **Family-only sign-up** with an invite code (`FAMILY_INVITE_CODE`); registration is closed when it is not set.
- **Watch downloads**: finished torrents get a player that uses PikPak's browser-friendly transcodes (HLS via hls.js) with a quality switcher, and can be opened in **VLC** on Android, iOS and desktop for anything the browser can't decode.
- **Read-only WebDAV** logins (`https://dav.mypikpak.com`) generated automatically every 24 hours, so family can browse and stream from apps like VLC, Solid Explorer or Infuse without being able to delete anything.
- **Downloads**: add magnet links to the shared PikPak account and track progress.
- **Share links**, quota monitoring, usage statistics and an admin dashboard.
- **Android app** (Trusted Web Activity) and installable PWA.

## Architecture

| Part | Tech |
|---|---|
| Web | Next.js 16, React 19, Tailwind CSS 4 (`pikpak-plus-client/`) |
| API | Flask 3, Gunicorn, Celery worker + beat, Redis (`pikpak-plus-server/`) |
| Database | Supabase (Postgres), locked down so only the server's secret key can access it |
| Images | Built by GitHub Actions for amd64 + arm64 and published to `ghcr.io/1tordroid/tordroid-plus-{web,server}` |
| Public access | Cloudflare Tunnel (no open inbound ports), or Caddy with automatic HTTPS |

## Deploy

1. **Database**: create a Supabase project and run [`pikpak-plus-server/tordroid_plus_setup.sql`](pikpak-plus-server/tordroid_plus_setup.sql) in its SQL editor. Use the project's **secret** key on the server.
2. **Server** (Ubuntu, e.g. Oracle Cloud Always Free):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/1tordroid/pikpak-plus/main/deploy/setup-server.sh | sudo bash
   ```
   This adds swap, installs Docker, and puts `docker-compose.yml` and a template `.env` in `/opt/tordroid-plus`.
3. **Settings**: fill in `/opt/tordroid-plus/.env` (see [`example.env`](example.env)): PikPak login, `SUPABASE_URL`/`SUPABASE_KEY`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `FAMILY_INVITE_CODE`, `JWT_SECRET_KEY`.
4. **Public address**, one of:
   - **Cloudflare Tunnel**: put the tunnel's `config.yml` and credentials in `/opt/tordroid-plus/cloudflared/` and set `COMPOSE_PROFILES=tunnel`.
   - **Caddy**: open ports 80/443 and set `COMPOSE_PROFILES=https` and `SITE_DOMAIN=your.domain`.
5. Start it:
   ```bash
   cd /opt/tordroid-plus && docker compose pull && docker compose up -d
   ```

### Local development

```bash
# Web
cd pikpak-plus-client && npm install && npm run dev

# API (needs Redis)
cd pikpak-plus-server && pip install -r requirements.txt && python run.py
celery -A app.celery_app.celery_app worker --loglevel=info
celery -A app.celery_app.celery_app beat --loglevel=info
```

## Security notes

- WebDAV credentials are only returned to signed-in users; WebDAV management endpoints require an admin.
- Generated WebDAV clients are read-only; a client that can't be made read-only is deleted instead of handed out.
- The Supabase schema grants nothing to the public (anon/publishable) key.

## Credits & license

Tordroid Plus is based on [PikPak Plus](https://github.com/bharathganji/pikpak-plus) by Bharath Ganji and contributors, and remains licensed under the **GNU General Public License v3.0**; see [LICENSE.txt](LICENSE.txt).

It also builds on [PikPakAPI](https://github.com/Quan666/PikPakAPI) and other projects acknowledged by the original repository. Tordroid Plus is not affiliated with PikPak.
