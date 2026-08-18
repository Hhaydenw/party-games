import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { substituteNames } from "@/lib/games/logNames";
import { CITIES, CityDef } from "@/lib/games/streetSnapCities";

// A GeoGuessr-style "take a photo" party game, built on the Google Maps
// JavaScript API's Street View panorama viewer.
//
// Everyone lands at the same starting point in a random city and freely
// explores (via `google.maps.StreetViewPanorama`, client-side) for a few
// minutes. Each player "takes" exactly one photo by locking in their
// current framing — but critically, a "photo" here is just the *camera
// state* (which panorama, which heading/pitch/zoom they were looking at),
// not an extracted/downloaded image file. At voting time, everyone's photo
// is re-rendered live by pointing a fresh, read-only panorama viewer at
// that saved state. This sidesteps two real problems with literally
// screenshotting the imagery: browsers block `canvas.toDataURL()` on
// cross-origin tiles served without permissive CORS headers (true of
// Street View's tiles), and extracting/storing imagery outside the
// provider's own viewer risks violating Google's terms of use — replaying
// a saved camera state avoids both, since nothing is ever exported, only
// redisplayed through Google's own viewer, exactly like normal Street View
// embedding.
//
// Requires a GOOGLE_MAPS_API_KEY environment variable — a Google Cloud API
// key with the "Maps JavaScript API" and "Street View Static API" enabled
// (needs a billing account, but comfortably within free monthly usage for
// a party app; metadata lookups specifically are not billed at all). Without
// a key, the game fails to start with a clear error rather than a crash.

const EXPLORE_MS_DEFAULT = 180_000; // 3 minutes
const DEFAULT_ROUNDS = 3;
const SEARCH_RADIUS_METERS = 500; // how far from the jittered point to look for a real panorama
const MAX_CITY_ATTEMPTS = 8;

export interface CameraState {
  pano: string;
  heading: number;
  pitch: number;
  zoom: number;
  // Post-capture editing — a CSS filter preset id (see FILTER_PRESETS in
  // the view component), fine-tune adjustments layered on top of it, and a
  // pan/zoom "crop" window (percentages/scale applied at display time).
  // All of this is pure presentation — nothing is ever exported/rendered
  // to a static file; the same live Street View image is just re-framed
  // and filtered via CSS wherever it's shown, same as the rest of this
  // game's "never extract the imagery" approach.
  filter?: string;
  brightness?: number; // 0-200, 100 = unchanged
  contrast?: number; // 0-200, 100 = unchanged
  saturation?: number; // 0-200, 100 = unchanged
  bw?: number; // 0-100 — continuous black & white intensity, independent of the filter preset
  blur?: number; // 0-8 (px) — soft-focus blur
  tilt?: number; // -30 to 30 (degrees) — rotates the framed shot
  vignette?: number; // 0-100 — darkened-edge intensity
  cropX?: number; // 0-100
  cropY?: number; // 0-100
  cropScale?: number; // >= 1
}

interface RoundStart {
  city: CityDef;
  pano: string;
}

// Checks Street View coverage near a jittered point within a random city,
// retrying with a different city/point if that spot turns out to have none
// — Google's own coverage is dense in cities, so this rarely needs more
// than a try or two, unlike a crowd-sourced imagery source. Exported
// (rather than inlined in createInitialState) so it's independently
// testable by injecting a stub `fetchImpl`.
export async function findRoundStart(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  citiesPool: CityDef[] = CITIES
): Promise<RoundStart | null> {
  for (let attempt = 0; attempt < MAX_CITY_ATTEMPTS; attempt++) {
    const city = citiesPool[Math.floor(Math.random() * citiesPool.length)]!;
    const lat = city.lat + (Math.random() - 0.5) * city.spread;
    const lng = city.lng + (Math.random() - 0.5) * city.spread;
    try {
      const res = await fetchImpl(
        `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=${SEARCH_RADIUS_METERS}&source=outdoor&key=${encodeURIComponent(apiKey)}`
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { status: string; pano_id?: string };
      if (data.status === "OK" && data.pano_id) {
        return { city, pano: data.pano_id };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export type StreetSnapPhase = "exploring" | "voting" | "roundEnd" | "finished";

export interface StreetSnapState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  totalRounds: number;
  exploreMs: number;
  roundIndex: number;
  city: { name: string; country: string };
  startPano: string;
  phase: StreetSnapPhase;
  // Voting has no deadline/auto-timeout — unlike exploring, which is timed,
  // voting ends only once everyone's voted or the host manually skips it
  // (via the generic "timeUp" action). A round is "done" once the photos
  // are taken; there's no reason to keep a clock running against the
  // players while they're just picking a favorite.
  exploreEndsAt: number | null;
  photos: Record<PlayerId, CameraState | null>;
  votes: Record<PlayerId, PlayerId>; // voterId -> votedForPlayerId
  scores: Record<PlayerId, number>;
  lastRoundGains: Record<PlayerId, number>;
  log: string[];
}

interface PhotoView {
  playerId: PlayerId;
  camera: CameraState | null;
  votes: number; // only meaningful once revealed
  voters: PlayerId[]; // who has voted for this photo so far — live during voting, not just after
}

export interface StreetSnapView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  city: { name: string; country: string };
  startPano: string;
  mapsApiKey: string;
  phase: StreetSnapPhase;
  exploreEndsAt: number | null;
  yourPhotoSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  photos: PhotoView[] | null; // populated once voting starts
  yourVote: PlayerId | null;
  scores: { playerId: PlayerId; score: number; roundGain: number }[];
  log: string[];
}

export type StreetSnapAction = { type: "submitPhoto"; camera: CameraState } | { type: "vote"; votedForPlayerId: PlayerId } | { type: "timeUp" } | { type: "advance" };

function tallyVotes(state: StreetSnapState): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = {};
  for (const pid of state.playerIds) counts[pid] = 0;
  for (const target of Object.values(state.votes)) counts[target] = (counts[target] ?? 0) + 1;
  return counts;
}

function endVoting(state: StreetSnapState): StreetSnapState {
  const counts = tallyVotes(state);
  const scores = { ...state.scores };
  const lastRoundGains: Record<PlayerId, number> = {};
  for (const pid of state.playerIds) {
    const gain = counts[pid] ?? 0;
    lastRoundGains[pid] = gain;
    scores[pid] = (scores[pid] ?? 0) + gain;
  }
  const max = Math.max(0, ...Object.values(counts));
  const winners = state.playerIds.filter((pid) => counts[pid] === max && max > 0);
  const log = [
    ...state.log,
    winners.length > 0 ? `${winners.join(", ")} won the round's vote with ${max} vote${max === 1 ? "" : "s"}!` : "Nobody got a vote this round.",
  ].slice(-20);
  return { ...state, phase: "roundEnd", scores, lastRoundGains, log };
}

async function startRound(state: StreetSnapState, roundIndex: number, apiKey: string): Promise<StreetSnapState> {
  const start = await findRoundStart(apiKey);
  if (!start) throw new Error("Couldn't find a Street Snap starting point with imagery right now — try again in a bit.");
  const photos: Record<PlayerId, CameraState | null> = {};
  for (const id of state.playerIds) photos[id] = null;
  return {
    ...state,
    roundIndex,
    city: { name: start.city.name, country: start.city.country },
    startPano: start.pano,
    phase: "exploring",
    exploreEndsAt: Date.now() + state.exploreMs,
    photos,
    votes: {},
    lastRoundGains: {},
    log: [...state.log, `Round ${roundIndex + 1} of ${state.totalRounds} — you've landed in ${start.city.name}, ${start.city.country}!`].slice(-20),
  };
}

export const streetSnap: GameDefinition<StreetSnapState, StreetSnapView, StreetSnapAction> = {
  meta: {
    id: "street-snap",
    name: "Street Snap",
    tagline: "Land somewhere in a real city, explore on foot, and take one photo. Vote for your favorite.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 8,
    options: [
      { key: "rounds", label: "Rounds", type: "number", min: 1, max: 6, default: DEFAULT_ROUNDS },
      { key: "exploreMinutes", label: "Minutes to explore", type: "number", min: 1, max: 6, default: EXPLORE_MS_DEFAULT / 60_000 },
    ],
  },
  async createInitialState(players, options: GameOptions) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Street Snap needs a Google Maps API key to load street imagery. Set the GOOGLE_MAPS_API_KEY environment variable (create one at console.cloud.google.com with the Maps JavaScript API and Street View Static API enabled) and restart the server."
      );
    }
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const totalRounds = Math.min(Math.max(Number(options.rounds) || DEFAULT_ROUNDS, 1), 6);
    const exploreMs = Math.min(Math.max((Number(options.exploreMinutes) || EXPLORE_MS_DEFAULT / 60_000) * 60_000, 60_000), 360_000);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;
    const base: StreetSnapState = {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      totalRounds,
      exploreMs,
      roundIndex: 0,
      city: { name: "", country: "" },
      startPano: "",
      phase: "exploring",
      exploreEndsAt: null,
      photos: {},
      votes: {},
      scores,
      lastRoundGains: {},
      log: [],
    };
    return startRound(base, 0, apiKey);
  },
  async applyAction(state, playerId, action) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";

    if (action.type === "timeUp") {
      if (state.phase === "exploring") {
        // The client-side auto-submit (a setTimeout keyed to exploreEndsAt)
        // is the primary way a non-responding player still gets a photo in
        // at the buzzer, but it's not bulletproof — a backgrounded mobile
        // tab can have its timers throttled enough to miss the window
        // entirely. Rather than let anyone who didn't manage to submit
        // simply vanish from the voting round with no photo, fall back to
        // a plain shot of wherever the round started for anyone still
        // missing one once time's actually up.
        const photos = { ...state.photos };
        for (const pid of state.playerIds) {
          if (!photos[pid]) photos[pid] = { pano: state.startPano, heading: 0, pitch: 0, zoom: 1 };
        }
        return { ...state, photos, phase: "voting", exploreEndsAt: null };
      }
      if (state.phase === "voting") {
        return endVoting(state);
      }
      throw new GameActionError("Nothing to advance.");
    }

    if (action.type === "submitPhoto") {
      if (state.phase !== "exploring") throw new GameActionError("Not taking photos right now.");
      if (state.photos[playerId]) throw new GameActionError("You already took your photo this round.");
      const photos = { ...state.photos, [playerId]: action.camera };
      let next: StreetSnapState = { ...state, photos };
      const allIn = state.playerIds.every((pid) => photos[pid]);
      if (allIn) next = { ...next, phase: "voting", exploreEndsAt: null };
      return next;
    }

    if (action.type === "vote") {
      if (state.phase !== "voting") throw new GameActionError("Not voting right now.");
      if (state.votes[playerId]) throw new GameActionError("You already voted.");
      if (action.votedForPlayerId === playerId) throw new GameActionError("You can't vote for your own photo.");
      if (!state.photos[action.votedForPlayerId]) throw new GameActionError("That player didn't submit a photo.");
      const votes = { ...state.votes, [playerId]: action.votedForPlayerId };
      let next: StreetSnapState = { ...state, votes };
      // Everyone in the room votes, even someone who didn't manage to
      // submit their own photo in time.
      const allVoted = state.playerIds.every((pid) => Boolean(votes[pid]));
      if (allVoted) next = endVoting(next);
      return next;
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextRoundIndex = state.roundIndex + 1;
      if (nextRoundIndex >= state.totalRounds) return { ...state, phase: "finished" };
      return startRound(state, nextRoundIndex, apiKey);
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId, players) {
    const revealed = state.phase === "voting" || state.phase === "roundEnd" || state.phase === "finished";
    const counts = revealed ? tallyVotes(state) : null;
    return {
      hostId: state.hostId,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      city: state.city,
      startPano: state.startPano,
      mapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
      phase: state.phase,
      exploreEndsAt: state.exploreEndsAt,
      yourPhotoSubmitted: Boolean(state.photos[playerId]),
      submittedCount: Object.values(state.photos).filter(Boolean).length,
      totalPlayers: state.playerIds.length,
      photos: revealed
        ? state.playerIds
            .filter((pid) => state.photos[pid])
            .map((pid) => ({
              playerId: pid,
              camera: state.photos[pid] ?? null,
              votes: counts?.[pid] ?? 0,
              voters: Object.entries(state.votes)
                .filter(([, votedFor]) => votedFor === pid)
                .map(([voterId]) => voterId),
            }))
        : null,
      yourVote: state.votes[playerId] ?? null,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0, roundGain: state.lastRoundGains[pid] ?? 0 })),
      log: substituteNames(state.log.slice(-8), state.playerIds, players),
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    const max = Math.max(...Object.values(state.scores));
    return Object.entries(state.scores)
      .filter(([, v]) => v === max)
      .map(([k]) => k);
  },
  getRanking(state) {
    return [...state.playerIds].sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  },
};
