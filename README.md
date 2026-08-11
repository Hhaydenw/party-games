# 🎉 Party Games

A multiplayer web app for playing party games with friends: create a room, share an
invite link, everyone picks a display name, and you play together in real time.

## What's in it

The platform (rooms, invite links, display names, lobby, reconnect) is built so
new games drop in as self-contained plugins without touching anything else. Eight
games are fully implemented:

| Game | Category | Players |
|---|---|---|
| **Switch** (Uno-style) | 🃏 Card | 2–8 |
| **Connect Four** | 🎲 Board | 2 |
| **The Game of Life** | 🎲 Board | 2–6 |
| **Monopoly** | 🎲 Board | 2–6 |
| **Bluff Trivia** (Fibbage-style) | 📱 Party | 3–12 |
| **Family Feud** | 📱 Party | 4–12 |
| **Doodle Guess** (Pictionary/skribbl-style) | 📱 Party | 3–10 |
| **Name That Tune** | 📱 Party | 2–12 |

Nothing is on the "coming soon" shelf right now — see
[Adding a new game](#adding-a-new-game) if you want to keep going (Hearts, trading in
Monopoly, more Life board forks, etc.).

**Known simplifications**, called out here rather than hidden:
- **Monopoly**: no player-to-player trading (a full offer/counter-offer UI is its
  own project), no property auctions when a purchase is declined, and house
  building doesn't enforce the "even build" rule. The host can also force-end the
  game at any time — the richest player (cash + property value) wins — since real
  Monopoly games can run long at a party.
- **The Game of Life**: single track (no board forks), no stock/business spaces,
  no insurance, house values don't fluctuate.
- **Name That Tune** fetches real 30-second clips live from Apple's free, keyless
  [iTunes Search API](https://performance-partners.apple.com/search-api) — no
  account or API key needed, but it does mean that game needs your server to have
  outbound internet access (fine on Render/any normal host).

## Running it locally

```bash
cd ~/party-games
npm install   # first time only
npm run dev
```

Open **http://localhost:3000**. Create a room, then share the room code or the
`/room/CODE` link with whoever's in the same session.

## Playing with friends over the internet

The dev server only listens on your machine by default. To let friends outside your
house join, expose it with a tunnel, e.g. [ngrok](https://ngrok.com/):

```bash
brew install ngrok
ngrok http 3000
```

Ngrok gives you a public URL like `https://abcd1234.ngrok-free.app`. Create a room
there and send friends the `/room/CODE` link it generates — that's now your shareable
invite link. Close the ngrok tunnel and the game stops being reachable from outside.

For a permanent link, deploy properly (see below) instead of using ngrok every time.

## Deploying for real (optional next step)

This uses a custom Node server (`server/index.ts`) that runs Next.js and Socket.IO
together, because the realtime game state needs a persistent WebSocket connection —
that rules out pure serverless hosts like Vercel's default deploy. Easiest options:

- **Render / Railway / Fly.io**: run `npm run build && npm start` as a long-lived
  Node service. Works out of the box with this repo.
- **A VPS**: `npm run build`, then run `npm start` behind a reverse proxy (Caddy/Nginx)
  with TLS, e.g. via `pm2` or a systemd service so it survives reboots.

Room state currently lives in memory on the server process — restarting the server
clears all active rooms. That's fine for casual game nights; if you want rooms to
survive deploys/restarts, the next step would be swapping `lib/rooms.ts`'s in-memory
`Map` for Redis.

## How it's built

- **Next.js 16 (App Router) + React 18 + TypeScript**, styled with Tailwind.
- **Socket.IO** over a custom Node server (`server/index.ts`) for realtime state sync.
- **`lib/rooms.ts`**: in-memory room manager — codes, players, host, reconnection
  tokens, game lifecycle.
- **`lib/games/*.ts`**: each game is a self-contained plugin implementing the
  `GameDefinition` interface (`lib/types.ts`) — functions for creating state,
  applying a validated action, and producing a per-player "view" that hides
  information the player shouldn't see (e.g. opponents' Uno hands, other players'
  bluff answers before voting). Most games are pure and synchronous; a game can
  also return a `Promise` from `createInitialState`/`applyAction` if it needs to
  await something external (Name That Tune awaits the iTunes API for each song).
  `lib/rooms.ts` serializes a room's actions so two async operations for the same
  room can't race each other.
- **`components/`**: lobby, invite link, chat, and one view component per game.

Sessions (so refreshing the page or a dropped wifi connection doesn't kick you out
of a room) are stored in the browser via `localStorage`, keyed per room code, and
used to silently reconnect via a `room:rejoin` socket event.

## Adding a new game

1. Create `lib/games/yourgame.ts` implementing `GameDefinition<State, View, Action>`
   from `lib/types.ts`: `createInitialState`, `applyAction` (throw `GameActionError`
   for illegal moves), `getPlayerView` (strip anything the player shouldn't see),
   `isGameOver`, `getWinnerIds`.
2. Register it in `lib/games/registry.ts`.
3. Add a view component in `components/games/YourGameView.tsx` and wire it into
   `components/GameHost.tsx`'s dispatcher.

The room/socket/reconnect layer needs no changes — that's the whole point of the
plugin split.
