# 🎉 Party Games

A multiplayer web app for playing party games with friends: create a room, share an
invite link, everyone picks a display name, and you play together in real time.

## What's in the MVP

The platform (rooms, invite links, display names, lobby, reconnect) is fully built
and designed so new games can be dropped in without touching anything else. Three
games are fully implemented to prove out each category:

| Game | Category | Players |
|---|---|---|
| **Switch** (Uno-style) | 🃏 Card | 2–8 |
| **Connect Four** | 🎲 Board | 2 |
| **Bluff Trivia** (Fibbage/Family-Feud-style) | 📱 Party | 3–12 |

**Not built yet** (shown greyed-out in the lobby as "coming soon"): Monopoly, The
Game of Life, Family Feud, Name That Tune, Hearts. These are much bigger builds —
Monopoly and Life especially need property/board/banking systems — see
[Adding a new game](#adding-a-new-game) below for how to add them when you're ready.
I can build any of these out next if you want to keep going.

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
  `GameDefinition` interface (`lib/types.ts`) — pure functions for creating state,
  applying a validated action, and producing a per-player "view" that hides
  information the player shouldn't see (e.g. opponents' Uno hands, other players'
  bluff answers before voting).
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
