import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { substituteNames } from "@/lib/games/logNames";
import { CITIES, CityDef } from "@/lib/games/streetSnapCities";

// A GeoGuessr-style "take a photo" party game, built on Mapillary's free
// crowd-sourced street-level imagery (https://www.mapillary.com) rather
// than Google Street View — Mapillary requires only a free access token
// (no billing account), and its imagery is contributor-licensed for this
// kind of interactive display use.
//
// Everyone lands at the same starting point in a random city and freely
// explores (via the mapillary-js viewer, client-side) for a few minutes.
// Each player "takes" exactly one photo by locking in their current framing
// — but critically, a "photo" here is just the *camera state* (which image,
// which direction/zoom they were looking), not an extracted/downloaded
// image file. At voting time, everyone's photo is re-rendered live by
// pointing a fresh viewer at that saved state. This sidesteps two real
// problems with literally screenshotting the imagery: browsers block
// `canvas.toDataURL()` on cross-origin tiles served without permissive CORS
// headers (which is the common case), and extracting/storing imagery
// outside the provider's own viewer risks violating their terms of use —
// replaying a saved camera state avoids both, since nothing is ever
// exported, only redisplayed through Mapillary's own viewer.
//
// Requires a MAPILLARY_TOKEN environment variable (a free client access
// token from https://www.mapillary.com/dashboard/developers) — without
// one, the game fails to start with a clear error rather than a crash.

const EXPLORE_MS_DEFAULT = 180_000; // 3 minutes
const VOTE_MS_DEFAULT = 45_000;
const DEFAULT_ROUNDS = 3;
const BBOX_HALF_DEGREES = 0.004; // keeps the query bbox comfortably under Mapillary's 0.01deg-square limit
const MIN_IMAGES_FOR_A_GOOD_START = 3;
const MAX_CITY_ATTEMPTS = 8;

export interface CameraState {
  imageId: string;
  center: [number, number]; // mapillary-js "basic" image coordinates, [0,1] range
  zoom: number;
}

interface RoundStart {
  city: CityDef;
  imageId: string;
}

// Queries Mapillary's Graph API for images inside a small bounding box
// around a jittered point within a random city, retrying with a different
// city/point if that spot turns out to have no coverage. Exported (rather
// than inlined in createInitialState) so it's independently testable by
// injecting a stub `fetchImpl` — this is the one piece of this game that
// depends on a live network call to a service we don't control.
export async function findRoundStart(
  token: string,
  fetchImpl: typeof fetch = fetch,
  citiesPool: CityDef[] = CITIES
): Promise<RoundStart | null> {
  for (let attempt = 0; attempt < MAX_CITY_ATTEMPTS; attempt++) {
    const city = citiesPool[Math.floor(Math.random() * citiesPool.length)]!;
    const lat = city.lat + (Math.random() - 0.5) * city.spread;
    const lng = city.lng + (Math.random() - 0.5) * city.spread;
    const bbox = [lng - BBOX_HALF_DEGREES, lat - BBOX_HALF_DEGREES, lng + BBOX_HALF_DEGREES, lat + BBOX_HALF_DEGREES].join(",");
    try {
      const res = await fetchImpl(`https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id&bbox=${bbox}&limit=20`);
      if (!res.ok) continue;
      const data = (await res.json()) as { data?: { id: string }[] };
      const images = data.data ?? [];
      if (images.length >= MIN_IMAGES_FOR_A_GOOD_START) {
        const pick = images[Math.floor(Math.random() * images.length)]!;
        return { city, imageId: pick.id };
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
  voteMs: number;
  roundIndex: number;
  city: { name: string; country: string };
  startImageId: string;
  phase: StreetSnapPhase;
  exploreEndsAt: number | null;
  voteEndsAt: number | null;
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
}

export interface StreetSnapView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  city: { name: string; country: string };
  startImageId: string;
  accessToken: string;
  phase: StreetSnapPhase;
  exploreEndsAt: number | null;
  voteEndsAt: number | null;
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
  return { ...state, phase: "roundEnd", voteEndsAt: null, scores, lastRoundGains, log };
}

async function startRound(state: StreetSnapState, roundIndex: number, token: string): Promise<StreetSnapState> {
  const start = await findRoundStart(token);
  if (!start) throw new Error("Couldn't find a Street Snap starting point with imagery right now — try again in a bit.");
  const photos: Record<PlayerId, CameraState | null> = {};
  for (const id of state.playerIds) photos[id] = null;
  return {
    ...state,
    roundIndex,
    city: { name: start.city.name, country: start.city.country },
    startImageId: start.imageId,
    phase: "exploring",
    exploreEndsAt: Date.now() + state.exploreMs,
    voteEndsAt: null,
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
    const token = process.env.MAPILLARY_TOKEN;
    if (!token) {
      throw new Error(
        "Street Snap needs a free Mapillary access token to load street imagery. Set the MAPILLARY_TOKEN environment variable (get one at mapillary.com/dashboard/developers) and restart the server."
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
      voteMs: VOTE_MS_DEFAULT,
      roundIndex: 0,
      city: { name: "", country: "" },
      startImageId: "",
      phase: "exploring",
      exploreEndsAt: null,
      voteEndsAt: null,
      photos: {},
      votes: {},
      scores,
      lastRoundGains: {},
      log: [],
    };
    return startRound(base, 0, token);
  },
  async applyAction(state, playerId, action) {
    const token = process.env.MAPILLARY_TOKEN ?? "";

    if (action.type === "timeUp") {
      if (state.phase === "exploring") {
        return { ...state, phase: "voting", exploreEndsAt: null, voteEndsAt: Date.now() + state.voteMs };
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
      if (allIn) next = { ...next, phase: "voting", exploreEndsAt: null, voteEndsAt: Date.now() + state.voteMs };
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
      return startRound(state, nextRoundIndex, token);
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
      startImageId: state.startImageId,
      accessToken: process.env.MAPILLARY_TOKEN ?? "",
      phase: state.phase,
      exploreEndsAt: state.exploreEndsAt,
      voteEndsAt: state.voteEndsAt,
      yourPhotoSubmitted: Boolean(state.photos[playerId]),
      submittedCount: Object.values(state.photos).filter(Boolean).length,
      totalPlayers: state.playerIds.length,
      photos: revealed
        ? state.playerIds.filter((pid) => state.photos[pid]).map((pid) => ({ playerId: pid, camera: state.photos[pid] ?? null, votes: counts?.[pid] ?? 0 }))
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
