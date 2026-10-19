# Shill Shock: running and deploying the online server

Local play needs nothing: double-click `index.html`.
**Online play** (up to 12 people, 2 teams of up to 6, each in their own browser) needs the small Node.js server in `server/`.
It serves the game files over HTTP **and** hosts the lobbies over WebSocket on the **same port**, so one free web
service is all you need. Everybody opens the server's URL; there is nothing else to install for players.

## 1. Run it on your own computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd server
npm install        # installs the only dependency: ws
npm start          # -> Shill Shock server on http://localhost:8080
```

Open <http://localhost:8080>, click **PLAY ONLINE**, enter a name and **CREATE LOBBY**.
Other people on the same Wi-Fi can join at `http://<your-computer's-IP>:8080` (for example `http://192.168.1.20:8080`)
with the 4-letter room code, or with the link shown in the lobby.
Use another port with `PORT=9000 npm start` (Windows PowerShell: `$env:PORT=9000; npm start`).

To play with friends over the internet, deploy it (below) and send them the link.

## 2. Deploy for free on Render (recommended)

Render's free "Web Service" plan runs Node apps and supports WebSockets. You don't need a credit card.

1. Put the game folder in a GitHub (or GitLab) repository. The repository must contain `index.html`, `style.css`,
   `js/`, and `server/` (with `server.js` and `package.json`). Don't commit `server/node_modules`.
2. Sign in at <https://render.com> with GitHub and click **New → Web Service**.
3. Pick your repository and fill in:
   - **Root Directory:** leave it empty (the repository root, the folder that contains `index.html`)
   - **Runtime:** Node
   - **Build Command:** `cd server && npm install`
   - **Start Command:** `cd server && npm start`
   - **Instance Type:** Free
   - Leave the `PORT` variable alone: Render sets it, and the server reads it.
4. Click **Create Web Service** and wait for "Your service is live". You get a URL like
   `https://shill-shock-xxxx.onrender.com`.
5. Open that URL, **PLAY ONLINE → CREATE LOBBY**, and share the room link (`…/?room=ABCD`) with your friends.
   `https://…/healthz` should answer `ok`.

Free-plan notes: the service goes to sleep after about 15 minutes with no visitors, and the first visit afterwards takes
about 30 to 60 seconds to wake it. Lobbies live in memory, so a restart or redeploy ends the games in progress.

## 3. Alternatives

### Railway
1. <https://railway.app> → **New Project → Deploy from GitHub repo** and pick the repository.
2. In the service **Settings**, set **Build Command** `cd server && npm install` and **Start Command** `cd server && npm start`.
3. Under **Networking**, click **Generate Domain**. Railway sets `PORT` for you.
(Railway gives a trial credit rather than an always-free tier.)

### Fly.io
1. Install `flyctl` and run `fly auth signup` (or `fly auth login`).
2. In the game folder, add this `Dockerfile`:
   ```Dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY . .
   RUN cd server && npm install --omit=dev
   ENV PORT=8080
   EXPOSE 8080
   CMD ["node", "server/server.js"]
   ```
3. Run `fly launch` (accept internal port 8080, no database), then `fly deploy`. Open `https://<app>.fly.dev`.

### Any VPS or home server
Run `cd server && npm install && PORT=8080 node server.js` under a process manager (pm2, systemd). If you put
nginx or Caddy in front, enable WebSocket upgrades (Caddy does this by default; for nginx, set
`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).

## How online play works (short version)
- The **host** (whoever creates the lobby) runs the real game simulation in their browser, including all CPU bots.
  Other players' browsers send only their key presses, and only when it's their turn. The host streams the results
  back 20 times a second: unit positions, HP, projectiles, turn and timer, plus an ordered log of terrain edits and
  effects. Everybody sees the same game, and the final state (HP, positions, winner, terrain) is identical.
- **Disconnects:** a bot plays a dropped player's unit until they come back. To rejoin, open the same link (or enter
  the code) with the same name. If the host drops, the next player becomes host automatically and the game goes on;
  the turn that was in progress is skipped.
- **Turn timer:** 45 s by default (the host can choose 15 to 90 s). Each human controls one unit; empty slots are bots.
- The server only serves `index.html`, `style.css`, `README.md`, `MOVES.md`, `DEPLOY.md` and `js/**/*.js`. It stores
  nothing on disk.
