import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";

// A Price Is Right-style guessing game: a real product (name, brand, photo)
// is shown without its price, everyone submits a numeric guess, and closest
// guess wins the round. Products come from dummyjson.com — a free, keyless
// mock e-commerce API with real product names/brands/photos and plausible
// prices. There's no free/keyless Amazon (or similar) product API, and
// scraping a retailer's site would violate its Terms of Service, so this is
// the closest "real product data, no API key, no ToS risk" option available.

const CATEGORY_CHOICES: { value: string; label: string }[] = [
  { value: "all", label: "Any category" },
  { value: "smartphones", label: "Smartphones" },
  { value: "laptops", label: "Laptops" },
  { value: "fragrances", label: "Fragrances" },
  { value: "skin-care", label: "Skin Care" },
  { value: "groceries", label: "Groceries" },
  { value: "home-decoration", label: "Home Decoration" },
  { value: "furniture", label: "Furniture" },
  { value: "womens-dresses", label: "Women's Dresses" },
  { value: "womens-shoes", label: "Women's Shoes" },
  { value: "mens-shirts", label: "Men's Shirts" },
  { value: "mens-shoes", label: "Men's Shoes" },
  { value: "sunglasses", label: "Sunglasses" },
  { value: "sports-accessories", label: "Sports Accessories" },
  { value: "vehicle", label: "Vehicles" },
];

const ROUND_MS = 30_000;
const DEFAULT_ROUNDS = 8;

// Tracks products already used, across games, for the lifetime of this
// server process — mirroring the freshness pattern used elsewhere.
const usedProductIds = new Set<number>();

interface DummyProduct {
  id: number;
  title: string;
  brand?: string;
  category: string;
  price: number;
  thumbnail?: string;
  description?: string;
}

export interface ProductInfo {
  id: number;
  title: string;
  brand: string;
  category: string;
  price: number;
  thumbnail: string | null;
}

async function fetchProducts(category: string): Promise<ProductInfo[]> {
  const url =
    category === "all"
      ? "https://dummyjson.com/products?limit=194&select=id,title,brand,category,price,thumbnail"
      : `https://dummyjson.com/products/category/${encodeURIComponent(category)}?limit=100&select=id,title,brand,category,price,thumbnail`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { products?: DummyProduct[] };
    return (data.products ?? [])
      .filter((p) => p.title && typeof p.price === "number" && p.price > 0)
      .map((p) => ({ id: p.id, title: p.title, brand: p.brand ?? p.category, category: p.category, price: Math.round(p.price * 100) / 100, thumbnail: p.thumbnail ?? null }));
  } catch {
    return [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function pickNext(pool: ProductInfo[], order: number[], used: number[]): { index: number; product: ProductInfo } | null {
  const remaining = order.filter((i) => !used.includes(i));
  const fresh = remaining.filter((i) => !usedProductIds.has(pool[i]!.id));
  const candidates = fresh.length > 0 ? fresh : remaining;
  if (candidates.length === 0) return null;
  const index = candidates[0]!;
  usedProductIds.add(pool[index]!.id);
  return { index, product: pool[index]! };
}

export type PriceCheckPhase = "guessing" | "roundEnd" | "finished";

interface GuessRecord {
  amount: number;
  at: number;
}

export interface PriceCheckState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  pool: ProductInfo[];
  poolOrder: number[];
  usedIndices: number[];
  roundIndex: number;
  totalRounds: number;
  product: ProductInfo;
  phase: PriceCheckPhase;
  guesses: Record<PlayerId, GuessRecord>;
  roundWinnerIds: PlayerId[];
  roundEndsAt: number | null;
  scores: Record<PlayerId, number>;
}

export interface PriceCheckView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  title: string;
  brand: string;
  category: string;
  thumbnail: string | null;
  phase: PriceCheckPhase;
  yourGuess: number | null;
  guessedCount: number;
  totalPlayers: number;
  revealedPrice: number | null;
  allGuesses: { playerId: PlayerId; amount: number; diff: number }[] | null;
  roundWinnerIds: PlayerId[];
  roundEndsAt: number | null;
  scores: { playerId: PlayerId; score: number }[];
}

export type PriceCheckAction = { type: "guess"; amount: number } | { type: "timeUp" } | { type: "advance" };

export const priceCheck: GameDefinition<PriceCheckState, PriceCheckView, PriceCheckAction> = {
  meta: {
    id: "price-check",
    name: "Price Check",
    tagline: "A real product, no price tag — closest guess wins the round.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 12,
    options: [
      { key: "rounds", label: "Rounds", type: "number", min: 3, max: 15, default: DEFAULT_ROUNDS },
      { key: "category", label: "Category", type: "select", choices: CATEGORY_CHOICES, default: "all" },
    ],
  },
  async createInitialState(players, options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const category = String(options.category ?? "all");

    let pool = await fetchProducts(category);
    if (pool.length < 5) pool = await fetchProducts("all");
    if (pool.length < 3) throw new Error("Couldn't load products right now. Try again in a bit.");

    const poolOrder = shuffle(pool.map((_, i) => i));
    const totalRounds = Math.min(Number(options.rounds) || DEFAULT_ROUNDS, pool.length);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;

    const first = pickNext(pool, poolOrder, []);
    if (!first) throw new Error("Couldn't load products right now. Try again in a bit.");

    return {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      pool,
      poolOrder,
      usedIndices: [first.index],
      roundIndex: 0,
      totalRounds,
      product: first.product,
      phase: "guessing",
      guesses: {},
      roundWinnerIds: [],
      roundEndsAt: Date.now() + ROUND_MS,
      scores,
    };
  },
  async applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "guess") {
      if (state.phase !== "guessing") throw new GameActionError("Not accepting guesses right now.");
      if (state.guesses[playerId]) throw new GameActionError("You already guessed.");
      if (!Number.isFinite(action.amount) || action.amount < 0) throw new GameActionError("Enter a valid price.");
      const guesses = { ...state.guesses, [playerId]: { amount: Math.round(action.amount * 100) / 100, at: Date.now() } };
      const allGuessed = state.playerIds.every((pid) => guesses[pid]);
      let next: PriceCheckState = { ...state, guesses };
      if (allGuessed) next = resolveRound(next);
      return next;
    }

    if (action.type === "timeUp") {
      if (state.phase !== "guessing") throw new GameActionError("Round already ended.");
      return resolveRound(state);
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextRoundIndex = state.roundIndex + 1;
      if (nextRoundIndex >= state.totalRounds) return { ...state, phase: "finished" };
      const next = pickNext(state.pool, state.poolOrder, state.usedIndices);
      if (!next) return { ...state, phase: "finished" };
      return {
        ...state,
        roundIndex: nextRoundIndex,
        usedIndices: [...state.usedIndices, next.index],
        product: next.product,
        phase: "guessing",
        guesses: {},
        roundWinnerIds: [],
        roundEndsAt: Date.now() + ROUND_MS,
      };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const revealed = state.phase === "roundEnd" || state.phase === "finished";
    return {
      hostId: state.hostId,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      title: state.product.title,
      brand: state.product.brand,
      category: state.product.category,
      thumbnail: state.product.thumbnail,
      phase: state.phase,
      yourGuess: state.guesses[playerId]?.amount ?? null,
      guessedCount: Object.keys(state.guesses).length,
      totalPlayers: state.playerIds.length,
      revealedPrice: revealed ? state.product.price : null,
      allGuesses: revealed
        ? state.playerIds
            .filter((pid) => state.guesses[pid])
            .map((pid) => ({ playerId: pid, amount: state.guesses[pid]!.amount, diff: Math.abs(state.guesses[pid]!.amount - state.product.price) }))
            .sort((a, b) => a.diff - b.diff)
        : null,
      roundWinnerIds: state.roundWinnerIds,
      roundEndsAt: state.roundEndsAt,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0 })),
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

// Resolves the round once everyone's guessed (or time's up): closest guess
// (by absolute difference, ties split) wins 3 points; unguessed players are
// simply excluded from contention, not penalized.
function resolveRound(state: PriceCheckState): PriceCheckState {
  const entries = state.playerIds.filter((pid) => state.guesses[pid]).map((pid) => ({ pid, diff: Math.abs(state.guesses[pid]!.amount - state.product.price) }));
  if (entries.length === 0) {
    return { ...state, phase: "roundEnd", roundWinnerIds: [], roundEndsAt: null };
  }
  const minDiff = Math.min(...entries.map((e) => e.diff));
  const winners = entries.filter((e) => e.diff === minDiff).map((e) => e.pid);
  const scores = { ...state.scores };
  for (const pid of winners) scores[pid] = (scores[pid] ?? 0) + 3;
  return { ...state, scores, phase: "roundEnd", roundWinnerIds: winners, roundEndsAt: null };
}
