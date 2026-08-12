import { GameDefinition, GameOptions, PlayerId } from "@/lib/types";

// A real-time cooperative/competitive arcade shooter (Galaga/Space
// Invaders-style): everyone flies their own ship along the bottom of a
// shared arena, moving left/right and shooting up at a descending enemy
// formation. Like Tank Arena and Paddle Battle, this runs on the server's
// tick loop rather than reacting only to discrete turns.

const ARENA_W = 900;
const ARENA_H = 650;
const SHIP_RADIUS = 18;
const SHIP_SPEED = 320; // units/sec
const SHIP_Y = ARENA_H - 40;
const SHOOT_COOLDOWN_MS = 300;
const PLAYER_BULLET_SPEED = 520;
const ENEMY_BULLET_SPEED = 260;
const BULLET_RADIUS = 4;
const ENEMY_RADIUS = 16;
const START_LIVES = 3;
const INVULN_MS = 1200;
const ENEMY_SHOT_INTERVAL_MS = 700; // roughly how often *some* enemy fires

const FORMATION_COLS = 8;
const FORMATION_ROW_GAP = 46;
const FORMATION_COL_GAP = 78;
const FORMATION_TOP = 60;
const FORMATION_H_SPEED = 60; // units/sec, sideways march speed (scales with wave)
const FORMATION_STEP_DOWN = 24;

interface ShipInput {
  left: boolean;
  right: boolean;
}

interface Ship {
  id: PlayerId;
  x: number;
  input: ShipInput;
  lives: number;
  alive: boolean;
  score: number;
  lastShotAt: number;
  invulnUntil: number;
}

interface Enemy {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  alive: boolean;
  points: number;
}

interface Bullet {
  id: string;
  x: number;
  y: number;
  vy: number;
  from: "player" | "enemy";
  ownerId: PlayerId | null;
}

export interface VoidRaidersState {
  hostId: PlayerId;
  order: PlayerId[];
  ships: Record<PlayerId, Ship>;
  enemies: Enemy[];
  bullets: Bullet[];
  wave: number;
  formationDir: 1 | -1;
  lastEnemyShotAt: number;
  phase: "playing" | "finished";
  matchEndsAt: number;
  log: string[];
}

export interface VoidRaidersView {
  hostId: PlayerId;
  arena: { width: number; height: number };
  shipRadius: number;
  enemyRadius: number;
  bulletRadius: number;
  wave: number;
  phase: "playing" | "finished";
  matchEndsAt: number;
  ships: { id: PlayerId; x: number; y: number; lives: number; alive: boolean; score: number; invulnerable: boolean }[];
  enemies: { id: string; x: number; y: number; row: number }[];
  bullets: { id: string; x: number; y: number; from: "player" | "enemy" }[];
  log: string[];
}

export type VoidRaidersAction = { type: "input"; left: boolean; right: boolean } | { type: "shoot" };

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}${idSeq}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

function spawnWave(wave: number): Enemy[] {
  const rows = Math.min(5, 3 + Math.floor(wave / 2));
  const enemies: Enemy[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < FORMATION_COLS; col++) {
      enemies.push({
        id: nextId("e"),
        row,
        col,
        x: 80 + col * FORMATION_COL_GAP,
        y: FORMATION_TOP + row * FORMATION_ROW_GAP,
        alive: true,
        points: (rows - row) * 10,
      });
    }
  }
  return enemies;
}

function shipSpawnX(index: number, count: number): number {
  const usable = ARENA_W - 120;
  return 60 + ((index + 0.5) / Math.max(1, count)) * usable;
}

export const voidRaiders: GameDefinition<VoidRaidersState, VoidRaidersView, VoidRaidersAction> = {
  meta: {
    id: "void-raiders",
    name: "Void Raiders",
    tagline: "Real-time arcade shooter. Move left/right, blast the descending swarm before it reaches you.",
    category: "party",
    minPlayers: 1,
    maxPlayers: 4,
    tickIntervalMs: 40,
    options: [{ key: "minutes", label: "Match length (minutes)", type: "number", min: 1, max: 5, default: 3 }],
  },
  createInitialState(playersIn, options: GameOptions) {
    const host = playersIn.find((p) => p.isHost) ?? playersIn[0]!;
    const order = playersIn.map((p) => p.id);
    const ships: Record<PlayerId, Ship> = {};
    order.forEach((id, i) => {
      ships[id] = {
        id,
        x: shipSpawnX(i, order.length),
        input: { left: false, right: false },
        lives: START_LIVES,
        alive: true,
        score: 0,
        lastShotAt: 0,
        invulnUntil: 0,
      };
    });
    const minutes = clamp(Number(options.minutes) || 3, 1, 5);
    return {
      hostId: host.id,
      order,
      ships,
      enemies: spawnWave(1),
      bullets: [],
      wave: 1,
      formationDir: 1,
      lastEnemyShotAt: 0,
      phase: "playing",
      matchEndsAt: Date.now() + minutes * 60_000,
      log: ["Wave 1 incoming!"],
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase !== "playing") return state;
    const ship = state.ships[playerId];
    if (!ship) return state;

    if (action.type === "input") {
      const ships = { ...state.ships, [playerId]: { ...ship, input: { left: action.left, right: action.right } } };
      return { ...state, ships };
    }

    if (action.type === "shoot") {
      if (!ship.alive) return state;
      const now = Date.now();
      if (now - ship.lastShotAt < SHOOT_COOLDOWN_MS) return state;
      const bullet: Bullet = { id: nextId("pb"), x: ship.x, y: SHIP_Y - SHIP_RADIUS, vy: -PLAYER_BULLET_SPEED, from: "player", ownerId: playerId };
      const ships = { ...state.ships, [playerId]: { ...ship, lastShotAt: now } };
      return { ...state, ships, bullets: [...state.bullets, bullet] };
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

    // Move ships.
    const ships: Record<PlayerId, Ship> = {};
    for (const id of state.order) {
      const s = state.ships[id]!;
      if (!s.alive) {
        ships[id] = s;
        continue;
      }
      let dx = 0;
      if (s.input.left) dx -= 1;
      if (s.input.right) dx += 1;
      const x = clamp(s.x + dx * SHIP_SPEED * dtSec, SHIP_RADIUS, ARENA_W - SHIP_RADIUS);
      ships[id] = { ...s, x };
    }

    // Move the enemy formation as a block: march sideways, step down and
    // reverse when it hits an edge.
    let formationDir = state.formationDir;
    const aliveEnemies = state.enemies.filter((e) => e.alive);
    const speed = FORMATION_H_SPEED * (1 + state.wave * 0.12);
    const minX = aliveEnemies.length ? Math.min(...aliveEnemies.map((e) => e.x)) : ARENA_W / 2;
    const maxX = aliveEnemies.length ? Math.max(...aliveEnemies.map((e) => e.x)) : ARENA_W / 2;
    let stepDown = 0;
    if ((formationDir === 1 && maxX + speed * dtSec > ARENA_W - 40) || (formationDir === -1 && minX + formationDir * speed * dtSec < 40)) {
      formationDir = formationDir === 1 ? -1 : 1;
      stepDown = FORMATION_STEP_DOWN;
    }
    let enemies = state.enemies.map((e) => (e.alive ? { ...e, x: e.x + formationDir * speed * dtSec, y: e.y + stepDown } : e));

    // Enemy reaching the ships' row ends the match early (swarm broke through).
    const breachedLine = enemies.some((e) => e.alive && e.y + ENEMY_RADIUS >= SHIP_Y - SHIP_RADIUS);

    // Occasional random enemy fire.
    let lastEnemyShotAt = state.lastEnemyShotAt;
    let bullets = state.bullets.map((b) => ({ ...b, y: b.y + b.vy * dtSec }));
    if (now - lastEnemyShotAt > ENEMY_SHOT_INTERVAL_MS && aliveEnemies.length > 0) {
      const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]!;
      bullets.push({ id: nextId("eb"), x: shooter.x, y: shooter.y + ENEMY_RADIUS, vy: ENEMY_BULLET_SPEED, from: "enemy", ownerId: null });
      lastEnemyShotAt = now;
    }
    bullets = bullets.filter((b) => b.y > -20 && b.y < ARENA_H + 20);

    const log = [...state.log];

    // Player bullets vs enemies.
    const survivingBullets: Bullet[] = [];
    for (const bullet of bullets) {
      if (bullet.from === "player") {
        let hit = false;
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i]!;
          if (!e.alive) continue;
          if (distance(bullet.x, bullet.y, e.x, e.y) > ENEMY_RADIUS + BULLET_RADIUS) continue;
          enemies[i] = { ...e, alive: false };
          hit = true;
          if (bullet.ownerId && ships[bullet.ownerId]) {
            ships[bullet.ownerId] = { ...ships[bullet.ownerId]!, score: ships[bullet.ownerId]!.score + e.points };
          }
          break;
        }
        if (!hit) survivingBullets.push(bullet);
      } else {
        // Enemy bullet vs ships.
        let hit = false;
        for (const id of state.order) {
          const s = ships[id]!;
          if (!s.alive || now < s.invulnUntil) continue;
          if (distance(bullet.x, bullet.y, s.x, SHIP_Y) > SHIP_RADIUS + BULLET_RADIUS) continue;
          hit = true;
          const lives = s.lives - 1;
          if (lives <= 0) {
            ships[id] = { ...s, lives: 0, alive: false };
            log.push(`${id}'s ship was destroyed!`);
          } else {
            ships[id] = { ...s, lives, invulnUntil: now + INVULN_MS };
          }
          break;
        }
        if (!hit) survivingBullets.push(bullet);
      }
    }
    bullets = survivingBullets;

    // Wave cleared -> spawn a tougher one.
    const wave = enemies.every((e) => !e.alive) ? state.wave + 1 : state.wave;
    if (wave !== state.wave) {
      enemies = spawnWave(wave);
      log.push(`Wave ${wave} incoming!`);
    }

    const allShipsDown = state.order.every((id) => !ships[id]!.alive);
    const phase = breachedLine || allShipsDown ? "finished" : "playing";
    if (phase === "finished" && state.phase === "playing") {
      log.push(breachedLine ? "The swarm broke through!" : "All ships lost!");
    }

    return { ...state, ships, enemies, bullets, wave, formationDir, lastEnemyShotAt, phase, log: log.slice(-30) };
  },
  getPlayerView(state) {
    const now = Date.now();
    return {
      hostId: state.hostId,
      arena: { width: ARENA_W, height: ARENA_H },
      shipRadius: SHIP_RADIUS,
      enemyRadius: ENEMY_RADIUS,
      bulletRadius: BULLET_RADIUS,
      wave: state.wave,
      phase: state.phase,
      matchEndsAt: state.matchEndsAt,
      ships: state.order.map((id) => {
        const s = state.ships[id]!;
        return { id: s.id, x: s.x, y: SHIP_Y, lives: s.lives, alive: s.alive, score: s.score, invulnerable: now < s.invulnUntil };
      }),
      enemies: state.enemies.filter((e) => e.alive).map((e) => ({ id: e.id, x: e.x, y: e.y, row: e.row })),
      bullets: state.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, from: b.from })),
      log: state.log.slice(-8),
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    const max = Math.max(...state.order.map((id) => state.ships[id]!.score));
    return state.order.filter((id) => state.ships[id]!.score === max);
  },
  getRanking(state) {
    return [...state.order].sort((a, b) => state.ships[b]!.score - state.ships[a]!.score);
  },
};
