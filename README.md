# 🎉 Party Games

A multiplayer web app for playing party games with friends: create a room, share an
invite link, everyone picks a display name, and you play together in real time.

## What's in it

The platform (rooms, invite links, display names, lobby, reconnect) is built so
new games drop in as self-contained plugins without touching anything else.
Eleven games are fully implemented:

| Game | Category | Players |
|---|---|---|
| **Switch** (Uno-style) | 🃏 Card | 2–8 |
| **Trivia Night** | 📱 Party | 2–12 |
| **Family Feud** | 📱 Party | 4–12 |
| **Doodle Guess** (Pictionary/skribbl-style) | 📱 Party | 3–10 |
| **Name That Tune** | 📱 Party | 2–12 |
| **Wildest Answer** (Quiplash-style prompt/vote) | 📱 Party | 4–8 |
| **Tank Arena** | 📱 Party (real-time) | 2–8 |
| **Paddle Battle** (Pong-style) | 📱 Party (real-time) | 2 |
| **Void Raiders** (Galaga/Space Invaders-style) | 📱 Party (real-time) | 1–4 |
| **The Game of Life** | 🎲 Board | 2–6 |
| **Monopoly** | 🎲 Board | 2–6 |

**Sound**: every game that can meaningfully use sound effects has them — card
plays, buzzers, reveals, shots, wins, and so on. There are no audio files to
license or download: every effect is synthesized on the fly with the Web Audio
API (`lib/sound.ts`). A speaker icon in the room header (lobby and in-game) opens
volume/mute controls, saved per-browser via `localStorage`.

Nothing is on the "coming soon" shelf right now — see
[Adding a new game](#adding-a-new-game) if you want to keep going.

**After a game ends**, you see that game's own final scoreboard — the same
rich per-game view you had while playing (points, kills, net worth, whatever
was relevant to what you just played), not a generic room-wide tally. The
host gets a **🔁 Play again** button that restarts the same game immediately
(no need to revisit the lobby), plus a **Back to lobby** button. The lobby
separately tracks **session standings** — wins across every game played in
that room — so that info isn't lost, it just lives in the right place.

The host can tune each round-based game before starting it — a **Settings** panel
appears in the lobby once a game is picked (rounds; Trivia Night also gets
category/difficulty; Name That Tune gets genre/decade; Tank Arena and Void
Raiders get match length, Tank Arena also gets solo-vs-teams; Paddle Battle gets
the winning score). Board games (Uno, Life, Monopoly) don't have a settings
panel since they play to a win condition rather than N rounds.

**Freshness**: every trivia/question/song-based game is designed not to repeat
itself. Trivia Night pulls live from a database of thousands of real questions.
Family Feud has 100+ original questions and tracks which ones it's already asked,
across games, for as long as the server keeps running. Name That Tune does the
same for songs — and doesn't store a song list at all (see below). None of these
reset until their pool is exhausted, and even then
they only start reusing — they never *guarantee* a repeat within a normal night.

**Known simplifications**, called out here rather than hidden:
- **Monopoly** has real trading (propose/accept/decline, cash + properties both
  ways), auctions when a purchase is declined, piece selection, a real square
  board with prices and live rent shown on every tile, an animated dice roll,
  and a fullscreen toggle. Still simplified vs. the physical game: house
  building doesn't enforce the "even build" rule, and a player going bankrupt
  doesn't get a grace period to mortgage their way out of it first. The host
  can also force-end the game at any time — the richest player (cash +
  property value) wins — since real Monopoly games can run long at a party.
- **The Game of Life** has piece selection and a winding road-style board (an
  SVG path, not a plain grid) with a mountain at the start, a resort glow at
  retirement, and a real 10-segment spinner wheel. Still simplified: single
  track (no board forks), no stock/business spaces, no insurance, house values
  don't fluctuate.
- **Family Feud**'s face-off is a real buzz-in: first captain to buzz gets the
  first guess, and if they miss it passes to the other captain. Guessing while in
  control rotates through your team in order rather than letting everyone answer
  at once, and the full survey reveals at the end of every round. Everyone's on
  a real clock — 7 seconds to answer once you've buzzed in for the face-off, 25
  seconds per guess while controlling the board or attempting a steal; running
  out of time counts as a miss/strike, same as a wrong answer. Answer matching
  is fuzzy (Levenshtein distance, scaled to word length) so near-misses like
  "hangover" for "hungover" still count, not just exact or substring matches.
  Each team also gets a **private team chat** (see the chat panel next to the
  round log) that only teammates can read — handy for strategizing a steal
  without the other team seeing. The question bank is original (written in the
  show's style, not scraped from broadcasts) — see
  [Family Feud content note](#family-feud-content-note) below; it hasn't been
  independently fact-checked against real survey data, since no free/accessible
  source of certified Family Feud answers exists, but the fuzzy matching above
  should meaningfully cut down on valid answers being wrongly rejected.
- **Trivia Night** is powered live by the free, keyless
  [Open Trivia Database](https://opentdb.com) — real questions across categories
  and difficulties, no account or API key needed. Once a round ends, everyone
  sees a "who picked what" breakdown — each player's chosen answer letter and
  whether it was right — not just the final scores.
- **Switch** (Uno) auto-draws for you if nothing in your hand is legal to play
  (after a short pause so you can see why), instead of leaving you stuck. The
  host can also turn on a **stacking house rule** before starting: a +2 or +4
  becomes a pending draw that the next player can escalate by playing a
  matching draw card, or must absorb (drawing the accumulated total and
  losing their turn) — off by default, matching classic rules.
- **Name That Tune** pulls its song pool from Apple's free, keyless
  [iTunes Search API](https://performance-partners.apple.com/search-api) — no
  account or API key, no stored song list at all. When a genre/decade is
  picked, the server searches iTunes directly (`country=US`, so results are
  scoped to the US storefront/catalog) with a query like "1980s rock hits";
  the *search itself* is the source of "biggest songs of that decade and
  genre", and the same call returns each hit's real preview clip and cover
  art, so there's no separate storage or lookup step (see
  `lib/games/songSource.ts`). Results are also filtered against Apple's own
  `primaryGenreName` metadata (not just the search text), which is what keeps
  "Electronic" from pulling in R&B tracks that merely matched the query
  wording. Two genre-ish options round out the list: **Billboard Hits** and
  **TV Show Songs**. Guess the title or artist — guessing both in one guess
  earns bonus points — and matching is forgiving of accented characters
  ("café" vs "cafe") and digit/word numbers ("3 Days Grace" vs "Three Days
  Grace"). The round now ends when the clip actually finishes playing (the
  client listens for the `<audio>` element's `ended` event) rather than a
  fixed guess-window timer that could cut a longer clip off early; a generous
  fixed cap is still there as a fallback in case playback never starts.
  Playback also nudges a little past the very start of the clip rather than
  always beginning at dead air — there's no real "hook" timestamp data
  available for free, so this is a light heuristic (skip a small, capped
  fraction of the clip), not exact hook detection. The preview clip's own
  volume follows the same persisted setting as the rest of the app's sound
  (see `lib/sound.ts`) instead of resetting to the browser's max every round.
  This is all still best-effort, not an exact chart — iTunes has no true
  decade filter, so relevance comes from the query wording rather than
  certified chart data; a filter also screens out lullaby/karaoke/tribute-album
  covers that otherwise rank surprisingly high for generic "hits" searches.
- **Tank Arena**, **Paddle Battle**, and **Void Raiders** are the real-time
  games here — everyone else is turn-based. All three run on the server's
  physics tick loop (see [How it's built](#how-its-built)) rather than
  reacting only to discrete moves. Tank Arena: WASD to move, aim/shoot with
  the mouse, solo free-for-all or 2 teams. Paddle Battle: a two-player
  Pong-style paddle-and-ball game, W/S or ↑/↓ to move, first to the target
  score wins — ball speed ramps up with each rally and the bounce angle
  depends on where it hits your paddle. Void Raiders: a Galaga/Space
  Invaders-style shooter, A/D or ←/→ to move, space or click/hold to fire at
  a descending enemy formation that gets tougher each wave — real vector-drawn
  ships and pixel-invader enemies (canvas paths, not plain circles/triangles),
  color-coded and lightly animated per row — solo or
  co-op/competitive up to 4 players sharing one arena, highest score when
  time's up (or everyone's ships are destroyed) wins.
- **Wildest Answer** is an original Quiplash-style prompt-and-vote game (the
  prompts are written fresh for this app, not pulled from any commercial
  game — same approach as Family Feud's question bank). Each round, players
  are randomly paired up (a group of 3 if the player count is odd) and each
  pair gets a shared silly prompt to answer separately and privately;
  everyone *not* in that pair then votes anonymously on which answer is
  funnier. Points come from votes received plus a bonus for winning your
  group outright. Needs at least 4 players so every group always has
  someone outside it left to vote.

### Family Feud content note

The question bank (100+ prompts) was written originally, in the style of the show's
typical categories (daily life, food, work, family, etc.) rather than scraped
verbatim from broadcast episodes or a compiled third-party database of exact
show answers and point values — that avoids bulk-copying copyrighted material
while still giving you the real Family Feud *feel*. If you'd rather have exact
answers from real episodes, you'd need to source and license that data yourself
and swap it into `lib/games/familyFeud.ts`'s `QUESTION_BANK`.

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
  survey answers before they're revealed). Most games are pure, synchronous, and
  turn-based; a game can also return a `Promise` from `createInitialState`/
  `applyAction` if it needs to await something external (Trivia Night and Name
  That Tune await a public API). `lib/rooms.ts` serializes a room's actions so two
  async operations for the same room can't race each other.
- **Real-time games**: a game can optionally implement `tick(state, dtMs)` and set
  `meta.tickIntervalMs`; `lib/rooms.ts` then runs that game's physics step on a
  timer (independent of player actions) and broadcasts whenever it changes state.
  Tank Arena, Paddle Battle, and Void Raiders all use this — everything else
  reacts only to discrete player actions. Players stream continuous state
  (which keys are held, where the mouse is aiming) as regular actions; the
  tick loop is what actually moves things and resolves hits.
- **`components/`**: lobby, invite link, chat, and one view component per game.
- **`lib/sound.ts`**: a tiny synthesized sound-effects engine (Web Audio API
  oscillators/noise, no audio files) with a shared, `localStorage`-persisted
  mute/volume setting; `<SoundSettingsButton />` renders the control, and any
  game view can call `playSound("shoot" | "success" | ...)`.
- Games can declare `meta.options` (a number or select field, e.g. "Rounds" or
  "Genre") and the lobby renders controls for them automatically
  (`components/GameOptionsPanel.tsx`); the room manager validates/defaults them
  and passes the resolved values into `createInitialState`.

Sessions (so refreshing the page or a dropped wifi connection doesn't kick you out
of a room) are stored in the browser via `localStorage`, keyed per room code, and
used to silently reconnect via a `room:rejoin` socket event.

## Adding a new game

1. Create `lib/games/yourgame.ts` implementing `GameDefinition<State, View, Action>`
   from `lib/types.ts`: `createInitialState`, `applyAction` (throw `GameActionError`
   for illegal moves), `getPlayerView` (strip anything the player shouldn't see),
   `isGameOver`, `getWinnerIds`. For a real-time game, also implement `tick` and
   set `meta.tickIntervalMs`.
2. Register it in `lib/games/registry.ts`.
3. Add a view component in `components/games/YourGameView.tsx` and wire it into
   `components/GameView.tsx`'s dispatcher — shared by `GameHost.tsx` (while
   playing) and `FinishedBanner.tsx` (frozen on the final tick after the game
   ends), so your view's own "game over" state doubles as the post-game
   scoreboard for free.

The room/socket/reconnect layer needs no changes — that's the whole point of the
plugin split.
