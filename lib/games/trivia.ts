import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";

// A real multiple-choice trivia game, powered live by the free, keyless
// Open Trivia Database (opentdb.com) — thousands of questions across
// categories/difficulties, so games stay fresh instead of replaying a fixed
// bank. Each game requests a fresh session token (opentdb's own mechanism
// for "don't repeat a question for this session"), and on top of that we
// track question text we've already served across games on this server
// process, so replaying the game doesn't repeat itself either.

const CATEGORY_CHOICES = [
  { value: "any", label: "Any category" },
  { value: "9", label: "General Knowledge" },
  { value: "11", label: "Film" },
  { value: "12", label: "Music" },
  { value: "15", label: "Video Games" },
  { value: "17", label: "Science & Nature" },
  { value: "21", label: "Sports" },
  { value: "22", label: "Geography" },
  { value: "23", label: "History" },
  { value: "27", label: "Animals" },
];

const DIFFICULTY_CHOICES = [
  { value: "any", label: "Any difficulty" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const ROUND_MS = 15_000;
const DEFAULT_ROUNDS = 10;

// Questions already served, tracked across games for as long as this server
// process stays up, so replaying the game doesn't repeat the same ones.
const usedQuestions = new Set<string>();

const ENTITY_MAP: Record<string, string> = {
  quot: '"',
  "#039": "'",
  amp: "&",
  lt: "<",
  gt: ">",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  eacute: "é",
  egrave: "è",
  uacute: "ú",
  ntilde: "ñ",
  ouml: "ö",
  auml: "ä",
  uuml: "ü",
  nbsp: " ",
};

function decodeHtml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-zA-Z#0-9]+);/g, (m, name) => ENTITY_MAP[name] ?? m);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

interface RawTriviaResult {
  category: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

interface TriviaQuestion {
  category: string;
  difficulty: string;
  question: string;
  options: string[];
  correctIndex: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchQuestions(amount: number, category: string, difficulty: string): Promise<TriviaQuestion[]> {
  const params = new URLSearchParams({ amount: String(amount), type: "multiple" });
  if (category !== "any") params.set("category", category);
  if (difficulty !== "any") params.set("difficulty", difficulty);
  try {
    const res = await fetch(`https://opentdb.com/api.php?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { response_code: number; results?: RawTriviaResult[] };
    if (!data.results) return [];
    return data.results.map((r) => {
      const options = shuffle([decodeHtml(r.correct_answer), ...r.incorrect_answers.map(decodeHtml)]);
      return {
        category: decodeHtml(r.category),
        difficulty: r.difficulty,
        question: decodeHtml(r.question),
        options,
        correctIndex: options.indexOf(decodeHtml(r.correct_answer)),
      };
    });
  } catch {
    return [];
  }
}

// No longer requests a session token first — that was a second network call
// purely to get OpenTDB's own "don't repeat within this session" tracking,
// which our own `usedQuestions` Set already provides, and it counts against
// the same per-IP rate limit as the actual question fetch. Dropping it
// halves the requests made per game start, which matters most exactly when
// it used to bite: clicking "Play again" soon after finishing a game.
// A transient rate-limit response (or any other empty result) gets one
// short retry before giving up, rather than failing on the first hiccup.
async function pickQuestions(totalRounds: number, category: string, difficulty: string): Promise<TriviaQuestion[]> {
  // Ask for extra so we can filter out ones we've already served elsewhere.
  const amount = Math.min(50, totalRounds + 15);
  let fetched = await fetchQuestions(amount, category, difficulty);
  if (fetched.length === 0) {
    await wait(1200);
    fetched = await fetchQuestions(amount, category, difficulty);
  }
  const fresh = fetched.filter((q) => !usedQuestions.has(q.question));
  const pool = fresh.length >= totalRounds ? fresh : fetched; // fall back to repeats if the fresh pool is too small
  const chosen = pool.slice(0, totalRounds);
  for (const q of chosen) usedQuestions.add(q.question);
  return chosen;
}

export type TriviaPhase = "question" | "reveal" | "finished";

interface AnswerRecord {
  optionIndex: number;
  at: number;
}

export interface TriviaState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  questions: TriviaQuestion[];
  roundIndex: number;
  totalRounds: number;
  phase: TriviaPhase;
  answers: Record<PlayerId, AnswerRecord>;
  correctOrder: PlayerId[]; // order in which players answered correctly this round
  roundEndsAt: number | null;
  scores: Record<PlayerId, number>;
}

export interface TriviaView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  category: string;
  difficulty: string;
  question: string;
  options: string[];
  correctIndex: number | null; // revealed only during/after reveal
  phase: TriviaPhase;
  yourAnswerIndex: number | null;
  answeredCount: number;
  totalPlayers: number;
  roundEndsAt: number | null;
  scores: { playerId: PlayerId; score: number }[];
  // Who picked what, revealed once the round ends — null (not just missing)
  // for anyone who never answered in time.
  allAnswers: { playerId: PlayerId; optionIndex: number | null }[] | null;
}

export type TriviaAction = { type: "answer"; optionIndex: number } | { type: "timeUp" } | { type: "advance" };

export const trivia: GameDefinition<TriviaState, TriviaView, TriviaAction> = {
  meta: {
    id: "trivia",
    name: "Trivia Night",
    tagline: "Real multiple-choice trivia, fresh questions every game.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 12,
    options: [
      { key: "rounds", label: "Rounds", type: "number", min: 3, max: 20, default: DEFAULT_ROUNDS },
      { key: "category", label: "Category", type: "select", choices: CATEGORY_CHOICES, default: "any" },
      { key: "difficulty", label: "Difficulty", type: "select", choices: DIFFICULTY_CHOICES, default: "any" },
    ],
  },
  async createInitialState(players, options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const totalRounds = Math.min(Number(options.rounds) || DEFAULT_ROUNDS, 20);
    const category = String(options.category ?? "any");
    const difficulty = String(options.difficulty ?? "any");
    const questions = await pickQuestions(totalRounds, category, difficulty);
    if (questions.length === 0) throw new Error("Couldn't load trivia questions right now. Try again in a bit.");

    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;

    return {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      questions,
      roundIndex: 0,
      totalRounds: questions.length,
      phase: "question",
      answers: {},
      correctOrder: [],
      roundEndsAt: Date.now() + ROUND_MS,
      scores,
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "answer") {
      if (state.phase !== "question") throw new GameActionError("Not accepting answers right now.");
      if (state.answers[playerId]) throw new GameActionError("You already answered.");
      const question = state.questions[state.roundIndex]!;
      if (action.optionIndex < 0 || action.optionIndex >= question.options.length) throw new GameActionError("Invalid option.");
      const answers = { ...state.answers, [playerId]: { optionIndex: action.optionIndex, at: Date.now() } };
      const correct = action.optionIndex === question.correctIndex;
      const correctOrder = correct ? [...state.correctOrder, playerId] : state.correctOrder;
      let scores = state.scores;
      if (correct) {
        const position = state.correctOrder.length;
        const points = position === 0 ? 3 : position === 1 ? 2 : 1;
        scores = { ...scores, [playerId]: (scores[playerId] ?? 0) + points };
      }
      const allAnswered = state.playerIds.every((pid) => answers[pid]);
      return { ...state, answers, correctOrder, scores, phase: allAnswered ? "reveal" : state.phase };
    }

    if (action.type === "timeUp") {
      if (state.phase !== "question") throw new GameActionError("Round already ended.");
      return { ...state, phase: "reveal" };
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase !== "reveal") throw new GameActionError("Nothing to advance.");
      const nextRoundIndex = state.roundIndex + 1;
      if (nextRoundIndex >= state.totalRounds) {
        return { ...state, phase: "finished" };
      }
      return {
        ...state,
        roundIndex: nextRoundIndex,
        phase: "question",
        answers: {},
        correctOrder: [],
        roundEndsAt: Date.now() + ROUND_MS,
      };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const question = state.questions[state.roundIndex]!;
    const revealed = state.phase === "reveal" || state.phase === "finished";
    return {
      hostId: state.hostId,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      category: question.category,
      difficulty: question.difficulty,
      question: question.question,
      options: question.options,
      correctIndex: revealed ? question.correctIndex : null,
      phase: state.phase,
      yourAnswerIndex: state.answers[playerId]?.optionIndex ?? null,
      answeredCount: Object.keys(state.answers).length,
      totalPlayers: state.playerIds.length,
      roundEndsAt: state.roundEndsAt,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0 })),
      allAnswers: revealed
        ? state.playerIds.map((pid) => ({ playerId: pid, optionIndex: state.answers[pid]?.optionIndex ?? null }))
        : null,
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
