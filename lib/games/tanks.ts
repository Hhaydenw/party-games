import { GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { assignTeams } from "./teamAssign";

// A real-time top-down tank battle: WASD to move, aim and shoot with the
// mouse. Unlike every other game here this isn't turn-based — the server
// runs a physics tick (`tick`) independent of player actions, moving tanks
// and bullets and resolving hits, while players just stream their current
// input state (which keys are held, where the mouse is pointing).

export type TeamId = "solo" | "red" | "blue";

const ARENA_W = 1000;
const ARENA_H = 600;
const TANK_RADIUS = 20;
const BULLET_RADIUS = 5;
const TANK_SPEED = 240; // units/sec
const BULLET_SPEED = 560; // units/sec
const SHOOT_COOLDOWN_MS = 350;
const BULLET_LIFETIME_MS = 2200;
const BULLET_DAMAGE = 25;
const MAX_HEALTH = 100;
const RESPAWN_MS = 2000;

const SPAWN_POINTS: [number, number][] = [
  [80, 80],
  [ARENA_W - 80, ARENA_H - 80],
  [ARENA_W - 80, 80],
  [80, ARENA_H - 80],
  [ARENA_W / 2, 60],
  [ARENA_W / 2, ARENA_H - 60],
  [60, ARENA_H / 2],
  [ARENA_W - 60, ARENA_H / 2],
];

function pickSpawn(index: number): [number, number] {
  return SPAWN_POINTS[index % SPAWN_POINTS.length]!;
}

interface TankInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface TankPlayer {
  id: PlayerId;
  team: TeamId;
  x: number;
  y: number;
  angle: number;
  input: TankInput;
  health: number;
  alive: boolean;
  kills: number;
  deaths: number;
  respawnAt: number | null;
  lastShotAt: number;
}

interface Bullet {
  id: string;
  ownerId: PlayerId;
  team: TeamId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  createdAt: number;
}

export interface TanksState {
  hostId: PlayerId;
  mode: "solo" | "teams";
  order: PlayerId[];
  players: Record<PlayerId, TankPlayer>;
  bullets: Bullet[];
  phase: "playing" | "finished";
  matchEndsAt: number;
  log: string[];
}

export interface TanksView {
  hostId: PlayerId;
  mode: "solo" | "teams";
  arena: { width: number; height: number };
  tankRadius: number;
  bulletRadius: number;
  phase: "playing" | "finished";
  matchEndsAt: number;
  players: {
    id: PlayerId;
    team: TeamId;
    x: number;
    y: number;
    angle: number;
    health: number;
    alive: boolean;
    kills: number;
    deaths: number;
  }[];
  bullets: { id: string; team: TeamId; x: number; y: number }[];
  log: string[];
}

export type TanksAction = { type: "input"; up: boolean; down: boolean; left: boolean; right: boolean; angle: number } | { type: "shoot" };

let bulletSeq = 0;
function nextBulletId(): string {
  bulletSeq += 1;
  return `b${bulletSeq}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

export const tanks: GameDefinition<TanksState, TanksView, TanksAction> = {
  meta: {
    id: "tanks",
    name: "Tank Arena",
    tagline: "Real-time top-down tank battle. WASD to move, mouse to aim and shoot.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 8,
    tickIntervalMs: 50,
    options: [
      { key: "mode", label: "Mode", type: "select", choices: [{ value: "solo", label: "Free-for-all" }, { value: "teams", label: "Teams" }], default: "solo" },
      { key: "minutes", label: "Match length (minutes)", type: "number", min: 1, max: 10, default: 3 },
    ],
  },
  createInitialState(playersIn, options: GameOptions) {
    const host = playersIn.find((p) => p.isHost) ?? playersIn[0]!;
    const mode = options.mode === "teams" ? "teams" : "solo";
    const order = playersIn.map((p) => p.id);
    const teamAssignment = mode === "teams" ? assignTeams(playersIn, options, ["red", "blue"] as const) : {};
    const players: Record<PlayerId, TankPlayer> = {};
    order.forEach((id, i) => {
      const [x, y] = pickSpawn(i);
      const team: TeamId = mode === "teams" ? teamAssignment[id]! : "solo";
      players[id] = {
        id,
        team,
        x,
        y,
        angle: 0,
        input: { up: false, down: false, left: false, right: false },
        health: MAX_HEALTH,
        alive: true,
        kills: 0,
        deaths: 0,
        respawnAt: null,
        lastShotAt: 0,
      };
    });
    const minutes = Math.min(10, Math.max(1, Number(options.minutes) || 3));
    return {
      hostId: host.id,
      mode,
      order,
      players,
      bullets: [],
      phase: "playing",
      matchEndsAt: Date.now() + minutes * 60_000,
      log: [`Battle begins! ${mode === "teams" ? "Team Red vs Team Blue" : "Free-for-all"}.`],
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase !== "playing") return state;
    const player = state.players[playerId];
    if (!player) return state;

    if (action.type === "input") {
      const players = {
        ...state.players,
        [playerId]: { ...player, input: { up: action.up, down: action.down, left: action.left, right: action.right }, angle: action.angle },
      };
      return { ...state, players };
    }

    if (action.type === "shoot") {
      if (!player.alive) return state;
      const now = Date.now();
      if (now - player.lastShotAt < SHOOT_COOLDOWN_MS) return state; // still on cooldown; silently ignore
      const bullet: Bullet = {
        id: nextBulletId(),
        ownerId: playerId,
        team: player.team,
        x: player.x + Math.cos(player.angle) * (TANK_RADIUS + 2),
        y: player.y + Math.sin(player.angle) * (TANK_RADIUS + 2),
        vx: Math.cos(player.angle) * BULLET_SPEED,
        vy: Math.sin(player.angle) * BULLET_SPEED,
        createdAt: now,
      };
      const players = { ...state.players, [playerId]: { ...player, lastShotAt: now } };
      return { ...state, players, bullets: [...state.bullets, bullet] };
    }

    return state;
  },
  tick(state, dtMs) {
    if (state.phase !== "playing") return state;
    const now = Date.now();
    if (now >= state.matchEndsAt) {
      return { ...state, phase: "finished", log: [...state.log, "Time's up!"] };
    }

    const dtSec = dtMs / 1000;
    const players: Record<PlayerId, TankPlayer> = {};
    for (const id of state.order) {
      const p = state.players[id]!;
      if (!p.alive) {
        if (p.respawnAt !== null && now >= p.respawnAt) {
          const spawnIndex = state.order.indexOf(id);
          const [sx, sy] = pickSpawn(spawnIndex);
          players[id] = { ...p, alive: true, health: MAX_HEALTH, x: sx, y: sy, respawnAt: null };
        } else {
          players[id] = p;
        }
        continue;
      }
      let dx = 0;
      let dy = 0;
      if (p.input.up) dy -= 1;
      if (p.input.down) dy += 1;
      if (p.input.left) dx -= 1;
      if (p.input.right) dx += 1;
      if (dx !== 0 && dy !== 0) {
        const len = Math.SQRT1_2;
        dx *= len;
        dy *= len;
      }
      const x = clamp(p.x + dx * TANK_SPEED * dtSec, TANK_RADIUS, ARENA_W - TANK_RADIUS);
      const y = clamp(p.y + dy * TANK_SPEED * dtSec, TANK_RADIUS, ARENA_H - TANK_RADIUS);
      players[id] = { ...p, x, y };
    }

    let bullets = state.bullets
      .map((b) => ({ ...b, x: b.x + b.vx * dtSec, y: b.y + b.vy * dtSec }))
      .filter((b) => now - b.createdAt < BULLET_LIFETIME_MS && b.x > -20 && b.x < ARENA_W + 20 && b.y > -20 && b.y < ARENA_H + 20);

    const log = [...state.log];
    const survivingBullets: Bullet[] = [];
    for (const bullet of bullets) {
      let hit = false;
      for (const id of state.order) {
        const target = players[id]!;
        if (!target.alive) continue;
        if (target.id === bullet.ownerId) continue;
        if (state.mode === "teams" && target.team === bullet.team) continue;
        if (distance(bullet.x, bullet.y, target.x, target.y) > TANK_RADIUS + BULLET_RADIUS) continue;

        hit = true;
        const health = target.health - BULLET_DAMAGE;
        if (health <= 0) {
          const shooter = players[bullet.ownerId];
          players[id] = { ...target, health: 0, alive: false, deaths: target.deaths + 1, respawnAt: now + RESPAWN_MS };
          if (shooter) players[bullet.ownerId] = { ...shooter, kills: shooter.kills + 1 };
          log.push(`${bullet.ownerId} eliminated ${id}!`);
        } else {
          players[id] = { ...target, health };
        }
        break;
      }
      if (!hit) survivingBullets.push(bullet);
    }
    bullets = survivingBullets;

    return { ...state, players, bullets, log: log.slice(-30) };
  },
  getPlayerView(state) {
    return {
      hostId: state.hostId,
      mode: state.mode,
      arena: { width: ARENA_W, height: ARENA_H },
      tankRadius: TANK_RADIUS,
      bulletRadius: BULLET_RADIUS,
      phase: state.phase,
      matchEndsAt: state.matchEndsAt,
      players: state.order.map((id) => {
        const p = state.players[id]!;
        return { id: p.id, team: p.team, x: p.x, y: p.y, angle: p.angle, health: p.health, alive: p.alive, kills: p.kills, deaths: p.deaths };
      }),
      bullets: state.bullets.map((b) => ({ id: b.id, team: b.team, x: b.x, y: b.y })),
      log: state.log.slice(-8),
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    if (state.mode === "solo") {
      const values = state.order.map((id) => [id, state.players[id]!.kills] as const);
      const max = Math.max(...values.map(([, v]) => v));
      return values.filter(([, v]) => v === max).map(([id]) => id);
    }
    const redKills = state.order.filter((id) => state.players[id]!.team === "red").reduce((n, id) => n + state.players[id]!.kills, 0);
    const blueKills = state.order.filter((id) => state.players[id]!.team === "blue").reduce((n, id) => n + state.players[id]!.kills, 0);
    if (redKills === blueKills) return state.order;
    const winningTeam: TeamId = redKills > blueKills ? "red" : "blue";
    return state.order.filter((id) => state.players[id]!.team === winningTeam);
  },
  getRanking(state) {
    if (state.mode === "solo") {
      return [...state.order].sort((a, b) => state.players[b]!.kills - state.players[a]!.kills);
    }
    const teamKills = (team: TeamId) => state.order.filter((id) => state.players[id]!.team === team).reduce((n, id) => n + state.players[id]!.kills, 0);
    const redTotal = teamKills("red");
    const blueTotal = teamKills("blue");
    return [...state.order].sort((a, b) => {
      const aTotal = state.players[a]!.team === "red" ? redTotal : blueTotal;
      const bTotal = state.players[b]!.team === "red" ? redTotal : blueTotal;
      if (aTotal !== bTotal) return bTotal - aTotal;
      return state.players[b]!.kills - state.players[a]!.kills;
    });
  },
};
