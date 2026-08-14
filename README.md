# 🎉 Party Games

A multiplayer web app for playing party games with friends: create a room, share an
invite link, everyone picks a display name, and you play together in real time.

## What's in it

The platform (rooms, invite links, display names, lobby, reconnect) is built so
new games drop in as self-contained plugins without touching anything else.
Sixteen games are fully implemented:

| Game | Category | Players |
|---|---|---|
| **Switch** (Uno-style) | 🃏 Card | 2–8 |
| **Trivia Night** | 📱 Party | 2–12 |
| **Family Feud** | 📱 Party | 4–12 |
| **Doodle Guess** (Pictionary/skribbl-style) | 📱 Party | 3–10 |
| **Name That Tune** | 📱 Party | 2–12 |
| **Wildest Answer** (Quiplash-style prompt/vote) | 📱 Party | 4–8 |
| **Category Dash** (Scattergories-style) | 📱 Party | 2–12 |
| **Price Check** (Price Is Right-style) | 📱 Party | 2–12 |
| **Lucky Spin** (Wheel of Fortune-style) | 📱 Party | 2–6 |
| **Word Grid** (Scrabble-style) | 🎲 Board | 2–4 |
| **Color Match** | 📱 Party | 2–12 |
| **Street Snap** (photo-guessing, needs setup — see below) | 📱 Party | 2–8 |
| **Tank Arena** | 📱 Party (real-time) | 2–8 |
| **Paddle Battle** (Pong-style) | 📱 Party (real-time) | 2 |
| **The Game of Life** | 🎲 Board | 2–6 |
| **Monopoly** | 🎲 Board | 2–6 |

**Series Mode**: instead of one game, the host can queue up several in a row
from the lobby (toggle **🏆 Series mode**, click games in the order you want
them). Each game plays with its default settings; when it ends, that game's
own final ranking converts to placement points (1st = 10, 2nd = 7, 3rd = 5,
4th = 3, everyone else = 1) that add onto a running series leaderboard shown
after every game, so wildly different scoring systems (trivia points vs.
Monopoly net worth vs. Tanks kill counts) still combine fairly. The host taps
**▶ Next game in series** to move on; the last game shows final standings and
a **Back to lobby** button. Every game implements `getRanking` for this (see
[How it's built](#how-its-built)); a game that doesn't would fall back to
"winners tied for 1st, everyone else tied for last." Known simplification:
each queued game uses its default options (no per-game options-in-queue
customization yet), and there's no upfront check that every queued game's
player-count range fits the room — if one doesn't, you'll find out (via the
normal error message) when the series reaches it.

**Team picking**: Family Feud (always) and Tank Arena (when its "teams" option
is chosen) get a **Choose teams** panel in the lobby — anyone can click Team
Red or Team Blue to pick their own side, switch anytime before the game
starts, and see who else has picked. Nobody's forced to choose: whoever
hasn't when the game starts gets balanced onto whichever team is smaller, so
it works exactly like before if nobody bothers with it. Series Mode only
shows this when Family Feud is in the queue, since Tanks defaults to solo
there (queued games use default options — see Series Mode above).

**Kicking players**: before a game (or series) starts, the host can remove
anyone from the room — a ✕ next to their name in the lobby's player list.
The removed player gets a clear "the host removed you" message and is
dropped back to the join screen, rather than just silently vanishing from
the roster while still thinking they're in the room. Only available in the
lobby, not mid-game.

**Emotes**: a 😊 button in the header (lobby and in-game) opens a quick
reaction picker — 👍❤️😂🎉👏😮🔥👎 — that floats up and fades on everyone's
screen the moment you send one, the same idea as Google Meet's in-call
reactions. Nothing's saved or logged anywhere; it's purely a live, ephemeral
broadcast to whoever's currently in the room.

**Layout**: the lobby and in-game screens use the full width of the browser
window (up to a generous cap on very wide monitors) instead of a narrow
centered column, with the player list/settings/action rail sticky alongside
the main content instead of stacked below it — so on a normal desktop window
you're not scrolling past a small centered board to reach the controls. It
still collapses to a single stacked column on narrower/mobile screens.
Several individual games with a lot of on-screen content (Family Feud, Lucky
Spin, Word Grid, Monopoly) go a step further with their own internal side
rail for secondary info — round log, team chat, play log — next to the main
board/action area instead of stacked below it, so the wide desktop column
isn't just a tall single strip of stuff to scroll through.

**Sound**: every game that can meaningfully use sound effects has them — card
plays, buzzers, reveals, shots, wins, and so on. There are no audio files to
license or download: every effect is synthesized on the fly with the Web Audio
API (`lib/sound.ts`). A speaker icon in the room header (lobby and in-game) opens
volume/mute controls, saved per-browser via `localStorage`. That same panel has
a **🎵 Lobby music** toggle (off by default) — a slow, generative synthesized
chord pad that only plays while you're actually sitting in a lobby, not
mid-game.

**Avatars**: everyone picks a color when they create or join a room, shown as
a colored initial "chip" everywhere the player list appears. Two players in
the same room can't end up with the same color — if your pick (or a stale
default) is already taken, you're bumped to the next free one from the
10-color palette automatically.

**Series standings get a bit of ceremony**: the interstitial between series
games now medals the top three (🥇🥈🥉), highlights the current leader, and
plays a short chime — a bigger fanfare on the final game — instead of just
being a plain list.

**Host quick-skip**: for the handful of games with a visible per-round
countdown (Trivia Night, Doodle Guess, Family Feud, Name That Tune, Wildest
Answer, Price Check), the host gets a **⏭ Skip round** button in the header
to end a dragging round early instead of waiting out the full timer. Turn-based
games without a clock, and real-time games like Tank Arena, don't show it since
there's no timer for it to mean anything against.

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
same for songs — and doesn't store a song list at all (see below). Category Dash
does the same for its 50 original categories. None of these
reset until their pool is exhausted, and even then
they only start reusing — they never *guarantee* a repeat within a normal night.

**Known simplifications**, called out here rather than hidden:
- **Monopoly** has real trading (propose/accept/decline, cash + properties both
  ways), auctions when a purchase is declined, piece selection, a real square
  board with prices and live rent shown on every tile (GO in the upper-left
  corner), an animated dice roll, and a fullscreen toggle. The board sits in
  its own column with players/roll-or-buy/auction/turn-log in a sticky rail
  next to it, so rolling and buying never requires scrolling past the board
  to reach the button. Still simplified vs. the physical game: house building
  doesn't enforce the "even build" rule, and a player going bankrupt doesn't
  get a grace period to mortgage their way out of it first. The host can also
  force-end the game at any time — the richest player (cash + property
  value) wins — since real Monopoly games can run long at a party.
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
- **Tank Arena** and **Paddle Battle** are the real-time
  games here — everyone else is turn-based. Both run on the server's
  physics tick loop (see [How it's built](#how-its-built)) rather than
  reacting only to discrete moves. Tank Arena is a Wii Play *Tanks!*-style
  maze battle (original map layout, not a copy of any specific commercial
  game's exact grid — see `lib/games/tanks.ts`): WASD to move, aim/shoot
  with the mouse, E to drop a mine, solo free-for-all or 2 teams. It plays
  very differently from a typical twin-stick shooter on purpose: it's one
  hit and you're out (no health bar), you can only have one shell in flight
  at a time (no rapid-fire spam — land or lose your shot before you can
  fire again), and shells ricochet off a solid wall once before detonating,
  so trick shots around corners are a real tactic. Some walls are
  destructible (crack after one hit, break on the second) and mines arm a
  moment after you drop them, detonate on proximity or if a shell hits
  them, and catch anyone nearby — including you, if you wander back onto
  your own. The maze layout was checked with a standalone reachability
  script (every spawn can always reach every other spawn, no wall sits
  inside a spawn's safety zone) rather than eyeballed. **Playable solo**:
  free-for-all supports 1 human plus 0–4 AI bots (a settings option); if a
  lone player doesn't add any, one gets added automatically so "1 player"
  never just means driving around an empty maze. Bots wander the maze,
  aim at whichever tank (human or bot) is nearest with a clear shot, and
  fire on their own — same one-shell-at-a-time rule as everyone else. Bots
  aren't available in Teams mode (team-balancing a mix of humans and bots
  adds complexity not worth it here), and a match a bot "wins" (highest
  kills) doesn't award anyone a session win in the lobby, since bots aren't
  real room players. Paddle Battle: a two-player
  Pong-style paddle-and-ball game, W/S or ↑/↓ to move, first to the target
  score wins — ball speed ramps up with each rally and the bounce angle
  depends on where it hits your paddle.
- **Wildest Answer** is an original Quiplash-style prompt-and-vote game (the
  prompts are written fresh for this app, not pulled from any commercial
  game — same approach as Family Feud's question bank). Each round, players
  are randomly paired up (a group of 3 if the player count is odd) and each
  pair gets a shared silly prompt to answer separately and privately;
  everyone *not* in that pair then votes anonymously on which answer is
  funnier. Points come from votes received plus a bonus for winning your
  group outright. Needs at least 4 players so every group always has
  someone outside it left to vote.
- **Price Check** shows a real product (name, brand, photo) with its price
  hidden and everyone guesses a number — closest guess (by absolute
  difference) wins the round. Products come from
  [dummyjson.com](https://dummyjson.com) — a free, keyless mock e-commerce
  API with real product names/brands/photos and plausible prices, refreshed
  as a live pool the same way the music games pull from iTunes. There's no
  free/keyless Amazon (or similar real-retailer) product API, and scraping a
  retailer's site would violate its Terms of Service, so this is the closest
  "real product data, no API key, no ToS risk" option available — prices are
  dummyjson's own catalog, not scraped or live-market prices.
- **Lucky Spin** is an original Wheel-of-Fortune-style letter-guessing game
  (original name/content, not affiliated with or copied from any TV show;
  same "written fresh" approach as Family Feud and Wildest Answer's content).
  Spin for a dollar value, guess a consonant — right guesses reveal it and
  let you spin again, a miss passes your turn. Buy a vowel for $250 any time
  it's your turn, or solve the puzzle outright; whoever solves banks that
  round's earnings. A real wedge-by-wedge wheel (16 wedges vs. the real
  show's ~24, same flavor — mostly cash, occasional Bankrupt/Lose a Turn
  traps) spins and rotates to land exactly on the wedge the server actually
  picked, rather than just a plain spinning circle showing the resulting
  amount. The puzzle board is a navy game-show board (styled like Family
  Feud's) with letter tiles that wrap onto new rows at word boundaries
  instead of needing to scroll a single long line sideways.
- **Category Dash** is an original Scattergories-style word race (original
  category list, same "written fresh" approach as the other party games).
  Each round gets a random letter and 10 categories; everyone races to write
  one word/phrase per category starting with that letter before the timer
  runs out. There's no dictionary check — validity is entirely peer-judged,
  same as playing at a table: unique answers score 2, answers two or more
  players both wrote score 1 each, anything not starting with the round's
  letter auto-scores 0, and anyone can **challenge** an answer they think
  doesn't actually fit — if more than half the *other* players agree, it
  scores 0. Skips the letters Q/U/X/Y/Z since they make most categories
  nearly unplayable.
- **Word Grid** is a Scrabble-style crossword tile game — an original board
  layout and tile point values, not a copy of any specific commercial game's
  exact grid (see `lib/games/wordGridBoard.ts`). Take turns laying tiles
  from your 7-letter rack across the shared 15x15 board to spell words
  crossword-style — **drag a tile onto the board, or tap one then tap a
  square** — double/triple letter and word squares multiply your score,
  using your whole rack in one turn earns a 50-point bonus, and the first
  play must cover the center square. Each tile is tinted with the color of
  whoever played it (the same avatar color shown everywhere else), the
  board has a wood-grain frame and wooden rack tiles instead of a flat
  navy grid, and placing a tile plays a short "clack" sound. **Click any
  already-played letter** to see the word(s) it's part of and look up a
  real definition (via the free, keyless
  [dictionaryapi.dev](https://api.dictionaryapi.dev)). While it's your
  turn, opponents see a live, letter-free hint of *where* you're about to
  place tiles (an outline on the empty squares, never what's actually on
  them) via a small ephemeral relay — never stored, purely a "something's
  happening" courtesy so the board doesn't look frozen mid-turn. Each turn
  has a **2-minute clock**; running out auto-passes that turn (any
  connected client can report the deadline passing, not just the current
  player's own, so a dropped connection can't stall the game — the host
  also has a manual **⏭ Skip round** override in the header). Word validity
  is checked against a bundled public-domain word list (the ENABLE word
  list — see `lib/games/data/wordlist.LICENSE.txt`) rather than a live API,
  so a round never depends on an external dictionary service staying up;
  it's loaded via a dynamic import server-side only, so the ~1.6MB word
  list never gets shipped to anyone's browser. The game ends when someone
  empties their rack with an empty bag, or everyone passes in a row —
  either way, everyone's leftover rack value counts against their score
  (and, if someone went out, gets added to theirs). Known simplification:
  no separate "challenge a played word" step after the fact — only the
  placement is validated, live, before it's accepted.
- **Color Match** is an original color-memory game (not affiliated with
  dialed.gg or any other commercial game): a target color flashes on
  screen, then hides — everyone dials in R/G/B sliders from memory to
  recreate it, and scores 0-10 (10 = perfect) once revealed. The score
  isn't raw RGB distance — it's converted to [CIELAB](https://en.wikipedia.org/wiki/CIELAB_color_space)
  first (`lib/games/colorMatch.ts`) and scored by *perceptual* closeness,
  since RGB distance alone judges some very-different-looking colors as
  deceptively "close." Colors are randomized in HSL space (not raw RGB) so
  rounds land on distinguishable colors instead of muddy near-greys.
- **Street Snap** is a GeoGuessr-style *photo* game — everyone lands at the
  same starting point in a real, random city, explores on foot for a few
  minutes using the real Google Street View panorama viewer (the Maps
  JavaScript API's `StreetViewPanorama`), and each player "takes" exactly
  one photo before everyone votes on their favorite. An earlier version of
  this game used Mapillary's free crowd-sourced imagery instead, to avoid
  needing a billed API key — that held up fine in engine testing but broke
  down in real use: coverage/image quality was too inconsistent for a good
  photo-taking game (crowd-sourced images occasionally lack the processing
  Street View's own uniformly-captured imagery always has), so it was
  switched to Google Street View, same as real GeoGuessr uses.
  **Important design detail, unrelated to which provider**: a "photo" here
  is never an actual captured/downloaded image — it's the *camera state*
  (which panorama, which heading/pitch/zoom you'd framed) at the moment you
  hit the shutter, saved and then replayed live through a fresh, read-only
  viewer at voting time. Two real constraints drove that: browsers block
  `canvas.toDataURL()` on imagery tiles served without permissive CORS
  headers (true of Street View's tiles), and extracting/storing imagery
  outside a provider's own viewer risks violating its terms of use.
  Replaying a saved camera state sidesteps both, since nothing is ever
  exported — Google's own viewer is what's always doing the actual
  rendering, live, for both the photographer and the voters, exactly like
  normal Street View embedding anywhere else on the web. The two phases use
  different rendering for cost/reliability reasons, though: **exploring**
  uses the real interactive Maps JavaScript API panorama (`clickToGo`,
  drag-to-look-around, walking between panoramas), since that's the part
  that's actually supposed to be interactive; **voting** uses a plain
  static image (Street View Static API, matching the saved
  pano/heading/pitch/zoom) instead of another live interactive viewer,
  since nobody needs to walk around a photo someone else already framed —
  that also avoids the biggest driver of API usage, which would otherwise
  be every player loading a full interactive panorama for every *other*
  player's photo each round (players × (players-1) live loads, just for
  voting). Voting shows every submitted photo together in a grid (not a
  one-at-a-time carousel), including your own for context, with **live
  vote attribution** — not just a count, but who specifically has picked
  each photo so far, updating in real time as votes come in during voting
  itself rather than only being revealed once everyone's done. The same
  grid is reused, read-only, for the round-end results screen. There's also
  a **camera-viewfinder mode**: *hold* right-click on the street view to
  arm it (a crosshair overlay appears and normal click-to-walk navigation
  is suspended so a click can't do both at once) — left-click while still
  holding it to snap, or release right-click (or hit Escape) to cancel
  without taking anything. It's a genuine hold, not a toggle: left-click
  does nothing special unless right-click is actively held down. Snapping
  plays a synthesized camera shutter sound. Purely additive — the always-
  visible shutter button still works the normal way too. After snapping, there's a
  **review step** before it's actually submitted: pick from a handful of
  filter presets (grayscale, sepia, vintage, cool, warm, vivid, noir — CSS
  filters, not canvas pixel manipulation) and drag-to-reposition/zoom-to-
  crop the shot, or retake it entirely. Both are deliberately never baked
  into an exported image file — they're stored as a few small numbers/an id
  alongside the camera state and applied live via CSS every time the photo
  is displayed (review, voting, results), keeping the same "never extract
  the imagery" principle as the rest of the game, even though Google's
  static images do have permissive-enough CORS headers that canvas-based
  editing would have been technically possible. A curated list of
  ~25 major cities (`lib/games/streetSnapCities.ts`) is used instead of a
  uniformly random point on Earth, and a round that can't find coverage
  near its first pick quietly retries a different spot/city — though
  Street View's own coverage in cities is dense enough that this is a much
  smaller concern than it was with crowd-sourced imagery. **Needs setup**:
  a Google Cloud API key with the Maps JavaScript API and Street View
  Static API enabled (see below) — without one, the game fails to start
  with a clear message instead of a crash, and every other game keeps
  working normally.

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

### Optional: enabling Street Snap

Every other game here works with zero setup — no accounts, no API keys.
**Street Snap** is the one exception: it needs a Google Maps API key with
billing enabled (Google requires a card on file for the Maps Platform, but
usage for a casual party app comfortably stays within the free monthly
allowance — metadata lookups specifically, which is most of what the
server itself does, aren't billed at all).

1. Create/select a project at [console.cloud.google.com](https://console.cloud.google.com),
   enable **Maps JavaScript API** and **Street View Static API** for it,
   set up a billing account, then create an API key under
   **APIs & Services → Credentials**.
2. For production use, restrict the key (HTTP referrer restriction to your
   domain) rather than leaving it unrestricted — it's sent to the browser,
   same as any Maps JS API key on any website.
3. Create a `.env.local` file in the project root:
   ```
   GOOGLE_MAPS_API_KEY=your-key-here
   ```
4. Restart the dev server (`npm run dev`). Street Snap will now appear as a
   playable option; without a key it still shows up in the game list but
   fails to start with a clear explanation instead of crashing the room.

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

If you want Street Snap to work in production too, set `GOOGLE_MAPS_API_KEY` as
an environment variable in your host's dashboard (Render/Railway/Fly all have
one) — same key from the setup section above. If you restricted the key by
HTTP referrer, make sure your production domain is on that allow-list too.

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
  Tank Arena and Paddle Battle both use this — everything else
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
- **Series Mode**: `lib/rooms.ts` holds `seriesQueue`/`seriesIndex`/
  `seriesActive`/`seriesPoints` on the room; `startSeries`/`nextSeriesGame`
  reuse the same internal `startGameInternal` helper regular `startGame`
  does. When a queued game ends, the room manager calls the game's optional
  `getRanking(state): PlayerId[]` (best to worst) and converts finish
  position into placement points added onto `seriesPoints` — see the
  `GameDefinition` interface and each game's `getRanking` implementation.
- **Team picking**: the lobby's team choices live in `room.teamAssignments`
  (generic `"1"`/`"2"`, since they're set before any specific game's state
  exists). `startGameInternal` smuggles them through as a reserved `__teams`
  field on `options` — outside the declared `meta.options` schema, so
  `resolveOptions` doesn't strip it — and `lib/games/teamAssign.ts`'s
  `assignTeams()` (used by `familyFeud.ts`/`tanks.ts`) reads it, balancing
  anyone who didn't pick onto the smaller team.
- **Kicking**: `roomManager.kickPlayer` removes the player server-side;
  `server/index.ts` separately finds their live socket (if connected), emits
  a dedicated `room:kicked` event, and evicts them from the room's socket.IO
  channel so they stop receiving further broadcasts.
- **Emotes**: `room:emote` is a pure relay — the server checks the emoji
  against an allowed set and re-broadcasts to everyone in the room; nothing
  is ever written into room state, so there's no history/log of them.

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
