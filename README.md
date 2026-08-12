# 🎉 Party Games

A multiplayer web app for playing party games with friends: create a room, share an
invite link, everyone picks a display name, and you play together in real time.

## What's in it

The platform (rooms, invite links, display names, lobby, reconnect) is built so
new games drop in as self-contained plugins without touching anything else. Nine
games are fully implemented:

| Game | Category | Players |
|---|---|---|
| **Switch** (Uno-style) | 🃏 Card | 2–8 |
| **Trivia Night** | 📱 Party | 2–12 |
| **Family Feud** | 📱 Party | 4–12 |
| **Doodle Guess** (Pictionary/skribbl-style) | 📱 Party | 3–10 |
| **Name That Tune** | 📱 Party | 2–12 |
| **Finish the Lyric** | 📱 Party | 2–12 |
| **Tank Arena** | 📱 Party (real-time) | 2–8 |
| **The Game of Life** | 🎲 Board | 2–6 |
| **Monopoly** | 🎲 Board | 2–6 |

**Sound**: every game that can meaningfully use sound effects has them — card
plays, buzzers, reveals, shots, wins, and so on. There are no audio files to
license or download: every effect is synthesized on the fly with the Web Audio
API (`lib/sound.ts`). A speaker icon in the room header (lobby and in-game) opens
volume/mute controls, saved per-browser via `localStorage`.

Nothing is on the "coming soon" shelf right now — see
[Adding a new game](#adding-a-new-game) if you want to keep going.

The host can tune each round-based game before starting it — a **Settings** panel
appears in the lobby once a game is picked (rounds; Trivia Night also gets
category/difficulty; Name That Tune and Finish the Lyric get genre/decade; Tank
Arena gets solo-vs-teams and match length). Board games (Uno, Life, Monopoly)
don't have a settings panel since they play to a win condition rather than N
rounds.

**Freshness**: every trivia/question/song-based game is designed not to repeat
itself. Trivia Night pulls live from a database of thousands of real questions.
Family Feud has 100+ original questions and tracks which ones it's already asked,
across games, for as long as the server keeps running. Name That Tune and Finish
the Lyric do the same for songs — and neither of them stores a song list at all
(see below). None of these reset until their pool is exhausted, and even then
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
  at once, and the full survey reveals at the end of every round. The question
  bank is original (written in the show's style, not scraped from broadcasts) —
  see [Family Feud content note](#family-feud-content-note) below.
- **Trivia Night** is powered live by the free, keyless
  [Open Trivia Database](https://opentdb.com) — real questions across categories
  and difficulties, no account or API key needed.
- **Name That Tune** and **Finish the Lyric** both pull their song pool from
  Apple's free, keyless [iTunes Search API](https://performance-partners.apple.com/search-api)
  — no account or API key, no stored song list at all. When a genre/decade is
  picked, the server searches iTunes directly with a query like "1980s rock
  hits"; the *search itself* is the source of "biggest songs of that decade and
  genre", and the same call returns each hit's real 30-second preview clip, so
  there's no separate storage or lookup step (see `lib/games/songSource.ts`).
  This is best-effort, not an exact chart — iTunes has no true decade filter,
  so relevance comes from the query wording rather than certified chart data;
  a filter also screens out lullaby/karaoke/tribute-album covers that otherwise
  rank surprisingly high for generic "hits" searches. Name That Tune has you
  guess the title/artist (guessing both in one guess earns bonus points);
  Finish the Lyric fetches the song's real lyrics from the free, keyless
  [lyrics.ovh](https://lyrics.ovh) API and blanks out the *opening* line —
  matching is lenient (small typos still count). Neither API exposes
  word-level timing, so instead of guessing a fixed cutoff, the client
  decodes the clip itself with the Web Audio API and runs real onset
  detection (`lib/audioOnset.ts`): it measures energy in ~50ms windows,
  takes the first second as the "quiet intro" baseline, and looks for the
  first *sustained* jump well above that baseline (a single transient like a
  drum hit doesn't count — it has to hold for ~200ms) as the moment vocals
  actually start. The clip is cut right there, and the blank line only
  appears once it stops — so the cutoff is grounded in that song's actual
  audio rather than a blind fixed number, with a fixed ~7s fallback if
  detection doesn't find a confident onset (e.g. an unusually quiet or noisy
  clip). It's still a heuristic, not true lyric-to-audio alignment — that
  would need real transcription (e.g. Whisper) matched against the fetched
  lyrics, which is a meaningfully heavier addition — so it can still
  occasionally miss on songs that open cold with vocals already going, but
  it's noticeably more accurate than a fixed cutoff for the common case of
  "instrumental intro, then vocals."
- **Tank Arena** is the one real-time game here — everyone else is turn-based.
  WASD to move, aim/shoot with the mouse, solo free-for-all or 2 teams. The server
  runs a physics tick ~20x/second independent of player actions (see
  [How it's built](#how-its-built)) rather than reacting only to discrete moves.

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
  Tank Arena is the only game using this so far — everything else reacts only to
  discrete player actions. Players stream continuous state (which keys are held,
  where the mouse is aiming) as regular actions; the tick loop is what actually
  moves things and resolves hits.
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
   `components/GameHost.tsx`'s dispatcher.

The room/socket/reconnect layer needs no changes — that's the whole point of the
plugin split.
