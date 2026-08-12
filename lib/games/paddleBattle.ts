import { GameDefinition, GameOptions, PlayerId } from "@/lib/types";

// A real-time two-player Pong-style game. Like Tank Arena, this runs on the
// server's tick loop (`tick`) rather than reacting only to discrete turns —
// paddles move continuously from streamed input, and the ball's physics
// (bouncing off walls/paddles, scoring) is simulated every tick.

const ARENA_W = 800;
const ARENA_H = 500;
const PADDLE_H = 90;
const PADDLE_W = 14;
const PADDLE_MARGIN = 24; // distance from the paddle's side wall
const PADDLE_SPEED = 420; // units/sec
const BALL_RADIUS = 8;
const BASE_BALL_SPEED = 320; // units/sec
const MAX_BALL_SPEED = 640;
const SPEED_UP_PER_HIT = 18;
const SERVE_DELAY_MS = 900;

interface PaddleInput {
  up: boolean;
  down: boolean;
}

interface Paddle {
  id: PlayerId;
  side: "left" | "right";
  y: number; // paddle center
  input: PaddleInput;
  score: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PaddleBattleState {
  hostId: PlayerId;
  order: PlayerId[]; // exactly 2, [left, right]
  paddles: Record<PlayerId, Paddle>;
  ball: Ball;
  winningScore: number;
  phase: "playing" | "finished";
  servingAt: number | null; // if set, ball is frozen at center until this timestamp
  lastScorerId: PlayerId | null;
  log: string[];
}

export interface PaddleBattleView {
  hostId: PlayerId;
  arena: { width: number; height: number };
  paddleWidth: number;
  paddleHeight: number;
  ballRadius: number;
  winningScore: number;
  phase: "playing" | "finished";
  serving: boolean;
  paddles: { id: PlayerId; side: "left" | "right"; y: number; score: number }[];
  ball: { x: number; y: number };
  log: string[];
}

export type PaddleBattleAction = { type: "input"; up: boolean; down: boolean };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// Serves toward whoever didn't just score (or a random side, on kickoff),
// with a random-ish vertical angle so rallies aren't identical every time.
function serve(towardSide: "left" | "right"): Ball {
  const angle = (Math.random() * 0.6 - 0.3) * Math.PI; // +/- ~54 degrees off horizontal
  const dir = towardSide === "right" ? 1 : -1;
  return {
    x: ARENA_W / 2,
    y: ARENA_H / 2,
    vx: Math.cos(angle) * BASE_BALL_SPEED * dir,
    vy: Math.sin(angle) * BASE_BALL_SPEED,
  };
}

export const paddleBattle: GameDefinition<PaddleBattleState, PaddleBattleView, PaddleBattleAction> = {
  meta: {
    id: "paddle-battle",
    name: "Paddle Battle",
    tagline: "Real-time two-player paddle-and-ball. First to the target score wins.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 2,
    tickIntervalMs: 33,
    options: [{ key: "winningScore", label: "First to", type: "number", min: 3, max: 21, default: 7 }],
  },
  createInitialState(playersIn, options: GameOptions) {
    const host = playersIn.find((p) => p.isHost) ?? playersIn[0]!;
    const order = playersIn.slice(0, 2).map((p) => p.id);
    const winningScore = clamp(Number(options.winningScore) || 7, 3, 21);
    const paddles: Record<PlayerId, Paddle> = {};
    order.forEach((id, i) => {
      const side: "left" | "right" = i === 0 ? "left" : "right";
      paddles[id] = { id, side, y: ARENA_H / 2, input: { up: false, down: false }, score: 0 };
    });
    return {
      hostId: host.id,
      order,
      paddles,
      ball: serve(Math.random() < 0.5 ? "left" : "right"),
      winningScore,
      phase: "playing",
      servingAt: Date.now() + SERVE_DELAY_MS,
      lastScorerId: null,
      log: ["Rally on! First to " + winningScore + " wins."],
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase !== "playing") return state;
    const paddle = state.paddles[playerId];
    if (!paddle) return state;
    if (action.type === "input") {
      const paddles = { ...state.paddles, [playerId]: { ...paddle, input: { up: action.up, down: action.down } } };
      return { ...state, paddles };
    }
    return state;
  },
  tick(state, dtMs) {
    if (state.phase !== "playing") return state;
    const dtSec = dtMs / 1000;
    const now = Date.now();

    const paddles: Record<PlayerId, Paddle> = {};
    for (const id of state.order) {
      const p = state.paddles[id]!;
      let dy = 0;
      if (p.input.up) dy -= 1;
      if (p.input.down) dy += 1;
      const y = clamp(p.y + dy * PADDLE_SPEED * dtSec, PADDLE_H / 2, ARENA_H - PADDLE_H / 2);
      paddles[id] = { ...p, y };
    }

    // Ball stays frozen at center during the serve delay after a point.
    if (state.servingAt !== null) {
      if (now < state.servingAt) {
        return { ...state, paddles, ball: { x: ARENA_W / 2, y: ARENA_H / 2, vx: 0, vy: 0 } };
      }
      const towardSide: "left" | "right" = state.lastScorerId
        ? paddles[state.lastScorerId]!.side === "left"
          ? "right"
          : "left"
        : Math.random() < 0.5
          ? "left"
          : "right";
      return { ...state, paddles, ball: serve(towardSide), servingAt: null };
    }

    let ball = { ...state.ball };
    ball.x += ball.vx * dtSec;
    ball.y += ball.vy * dtSec;

    // Bounce off top/bottom walls.
    if (ball.y - BALL_RADIUS < 0) {
      ball.y = BALL_RADIUS;
      ball.vy = Math.abs(ball.vy);
    } else if (ball.y + BALL_RADIUS > ARENA_H) {
      ball.y = ARENA_H - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy);
    }

    // Paddle collisions.
    for (const id of state.order) {
      const p = paddles[id]!;
      const paddleX = p.side === "left" ? PADDLE_MARGIN : ARENA_W - PADDLE_MARGIN;
      const movingToward = p.side === "left" ? ball.vx < 0 : ball.vx > 0;
      if (!movingToward) continue;
      const withinX = p.side === "left" ? ball.x - BALL_RADIUS <= paddleX + PADDLE_W / 2 && ball.x > paddleX - PADDLE_W : ball.x + BALL_RADIUS >= paddleX - PADDLE_W / 2 && ball.x < paddleX + PADDLE_W;
      if (!withinX) continue;
      const withinY = ball.y > p.y - PADDLE_H / 2 - BALL_RADIUS && ball.y < p.y + PADDLE_H / 2 + BALL_RADIUS;
      if (!withinY) continue;

      const offset = clamp((ball.y - p.y) / (PADDLE_H / 2), -1, 1); // -1 top .. 1 bottom
      const speed = Math.min(MAX_BALL_SPEED, Math.hypot(ball.vx, ball.vy) + SPEED_UP_PER_HIT);
      // A touch of jitter avoids a perfectly periodic (and theoretically
      // endless) rally when both paddles happen to sit dead-center and never
      // move — real players wobble; this keeps a fully idle match honest.
      const jitter = (Math.random() - 0.5) * 0.12;
      const bounceAngle = offset * (Math.PI / 3) + jitter; // up to 60 degrees, +/- a bit
      const dir = p.side === "left" ? 1 : -1;
      ball.vx = Math.cos(bounceAngle) * speed * dir;
      ball.vy = Math.sin(bounceAngle) * speed;
      ball.x = paddleX + (p.side === "left" ? PADDLE_W : -PADDLE_W);
      break;
    }

    // Scoring: ball passes fully off the left or right edge.
    if (ball.x < -BALL_RADIUS * 2) {
      const scorer = state.order.find((id) => paddles[id]!.side === "right")!;
      paddles[scorer] = { ...paddles[scorer]!, score: paddles[scorer]!.score + 1 };
      const won = paddles[scorer]!.score >= state.winningScore;
      return {
        ...state,
        paddles,
        ball,
        phase: won ? "finished" : "playing",
        servingAt: won ? null : now + SERVE_DELAY_MS,
        lastScorerId: scorer,
        log: [...state.log, `Point! ${scorer}${won ? " wins the match!" : ""}`].slice(-30),
      };
    }
    if (ball.x > ARENA_W + BALL_RADIUS * 2) {
      const scorer = state.order.find((id) => paddles[id]!.side === "left")!;
      paddles[scorer] = { ...paddles[scorer]!, score: paddles[scorer]!.score + 1 };
      const won = paddles[scorer]!.score >= state.winningScore;
      return {
        ...state,
        paddles,
        ball,
        phase: won ? "finished" : "playing",
        servingAt: won ? null : now + SERVE_DELAY_MS,
        lastScorerId: scorer,
        log: [...state.log, `Point! ${scorer}${won ? " wins the match!" : ""}`].slice(-30),
      };
    }

    return { ...state, paddles, ball };
  },
  getPlayerView(state) {
    return {
      hostId: state.hostId,
      arena: { width: ARENA_W, height: ARENA_H },
      paddleWidth: PADDLE_W,
      paddleHeight: PADDLE_H,
      ballRadius: BALL_RADIUS,
      winningScore: state.winningScore,
      phase: state.phase,
      serving: state.servingAt !== null,
      paddles: state.order.map((id) => {
        const p = state.paddles[id]!;
        return { id: p.id, side: p.side, y: p.y, score: p.score };
      }),
      ball: { x: state.ball.x, y: state.ball.y },
      log: state.log.slice(-8),
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    const max = Math.max(...state.order.map((id) => state.paddles[id]!.score));
    return state.order.filter((id) => state.paddles[id]!.score === max);
  },
  getRanking(state) {
    return [...state.order].sort((a, b) => state.paddles[b]!.score - state.paddles[a]!.score);
  },
};
