import { GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { assignTeams } from "./teamAssign";

// A real-time top-down tank battle in a Wii Play "Tanks!"-style maze arena:
// WASD to move, aim/shoot with the mouse, drop mines with E. Unlike every
// other game here this isn't turn-based — the server runs a physics tick
// (`tick`) independent of player actions, moving tanks/bullets/mines and
// resolving hits, while players just stream their current input state.
//
// The defining mechanics borrowed from the original: a maze of walls (some
// breakable), shells that ricochet off a solid wall once before detonating,
// only one shell in flight per tank at a time (no rapid-fire spam — you
// have to land or lose your shot before you can fire again), and one-hit
// kills instead of a health bar.

export type TeamId = "solo" | "red" | "blue";

const ARENA_W = 1000;
const ARENA_H = 600;
const TANK_RADIUS = 20;
const BULLET_RADIUS = 5;
const TANK_SPEED = 220; // units/sec
const BULLET_SPEED = 480; // units/sec
const BULLET_LIFETIME_MS = 4000;
const MAX_BOUNCES = 1; // ricochets off a solid wall once, then detonates on the next hit
const RESPAWN_MS = 2000;
const MAX_MINES = 2;
const MINE_ARM_MS = 700;
const MINE_LIFETIME_MS = 15_000;
const MINE_TRIGGER_RADIUS = 30;
const MINE_BLAST_RADIUS = 70;

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

// ---- Maze walls ----
// Hand-authored (not procedurally generated) so connectivity/spawn-clearance
// can be verified once rather than re-validated at runtime. `RAW_WALLS` is
// just one half; buildWalls() mirrors each rect 180° around the arena
// center so the map is always fair regardless of spawn side. Coordinates
// and destructible/indestructible mix were checked with a standalone
// BFS-reachability + spawn-clearance script (see the game's test suite) —
// every spawn can always reach every other spawn, and no wall sits inside a
// spawn's safety radius.
interface RawWall {
  x: number;
  y: number;
  w: number;
  h: number;
  destructible: boolean;
}
const RAW_WALLS: RawWall[] = [
  { x: 480, y: 250, w: 40, h: 100, destructible: false }, // center pillar (self-mirrors)
  { x: 170, y: 150, w: 110, h: 30, destructible: false },
  { x: 170, y: 210, w: 30, h: 110, destructible: true },
  { x: 420, y: 90, w: 30, h: 130, destructible: false },
  { x: 300, y: 320, w: 150, h: 30, destructible: true },
  { x: 90, y: 400, w: 130, h: 30, destructible: false },
  { x: 620, y: 150, w: 30, h: 110, destructible: true },
];

export interface Wall {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  destructible: boolean;
  hp: number; // only meaningful when destructible
}

function buildWalls(): Wall[] {
  const walls: Wall[] = [];
  const seen = new Set<string>();
  let seq = 0;
  const add = (x: number, y: number, w: number, h: number, destructible: boolean) => {
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`;
    if (seen.has(key)) return;
    seen.add(key);
    seq += 1;
    walls.push({ id: `w${seq}`, x, y, w, h, destructible, hp: destructible ? 2 : Infinity });
  };
  for (const raw of RAW_WALLS) {
    add(raw.x, raw.y, raw.w, raw.h, raw.destructible);
    const mx = ARENA_W - raw.x - raw.w;
    const my = ARENA_H - raw.y - raw.h;
    add(mx, my, raw.w, raw.h, raw.destructible);
  }
  return walls;
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
  alive: boolean;
  kills: number;
  deaths: number;
  respawnAt: number | null;
  minesRemaining: number;
}

interface Bullet {
  id: string;
  ownerId: PlayerId;
  team: TeamId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
  createdAt: number;
}

interface Mine {
  id: string;
  ownerId: PlayerId;
  team: TeamId;
  x: number;
  y: number;
  armAt: number;
  expiresAt: number;
}

export interface TanksState {
  hostId: PlayerId;
  mode: "solo" | "teams";
  order: PlayerId[];
  players: Record<PlayerId, TankPlayer>;
  bullets: Bullet[];
  mines: Mine[];
  walls: Wall[];
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
  mineTriggerRadius: number;
  phase: "playing" | "finished";
  matchEndsAt: number;
  walls: { id: string; x: number; y: number; w: number; h: number; destructible: boolean; hp: number }[];
  players: {
    id: PlayerId;
    team: TeamId;
    x: number;
    y: number;
    angle: number;
    alive: boolean;
    kills: number;
    deaths: number;
    minesRemaining: number;
    hasActiveShell: boolean;
  }[];
  bullets: { id: string; team: TeamId; x: number; y: number }[];
  mines: { id: string; team: TeamId; x: number; y: number; armed: boolean }[];
  log: string[];
}

export type TanksAction =
  | { type: "input"; up: boolean; down: boolean; left: boolean; right: boolean; angle: number }
  | { type: "shoot" }
  | { type: "dropMine" };

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

// Closest point on an axis-aligned rect to a given point — the standard
// building block for circle-vs-rect collision.
function closestPointOnRect(px: number, py: number, wall: Wall): { x: number; y: number } {
  return { x: clamp(px, wall.x, wall.x + wall.w), y: clamp(py, wall.y, wall.y + wall.h) };
}

function circleRectOverlap(px: number, py: number, radius: number, wall: Wall): boolean {
  const c = closestPointOnRect(px, py, wall);
  return distance(px, py, c.x, c.y) < radius;
}

// Slides a tank's attempted move along walls instead of just blocking it
// outright — tries the full move, then x-only, then y-only.
function resolveTankMove(px: number, py: number, nx: number, ny: number, radius: number, walls: Wall[]): { x: number; y: number } {
  const blocked = (x: number, y: number) => walls.some((w) => circleRectOverlap(x, y, radius, w));
  const cx = clamp(nx, radius, ARENA_W - radius);
  const cy = clamp(ny, radius, ARENA_H - radius);
  if (!blocked(cx, cy)) return { x: cx, y: cy };
  const xOnly = clamp(nx, radius, ARENA_W - radius);
  if (!blocked(xOnly, py)) return { x: xOnly, y: py };
  const yOnly = clamp(ny, radius, ARENA_H - radius);
  if (!blocked(px, yOnly)) return { x: px, y: yOnly };
  return { x: px, y: py };
}

export const tanks: GameDefinition<TanksState, TanksView, TanksAction> = {
  meta: {
    id: "tanks",
    name: "Tank Arena",
    tagline: "Wii Play Tanks-style maze battle. WASD to move, mouse to aim/shoot, E to drop a mine.",
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
        alive: true,
        kills: 0,
        deaths: 0,
        respawnAt: null,
        minesRemaining: MAX_MINES,
      };
    });
    const minutes = Math.min(10, Math.max(1, Number(options.minutes) || 3));
    return {
      hostId: host.id,
      mode,
      order,
      players,
      bullets: [],
      mines: [],
      walls: buildWalls(),
      phase: "playing",
      matchEndsAt: Date.now() + minutes * 60_000,
      log: [`Battle begins! ${mode === "teams" ? "Team Red vs Team Blue" : "Free-for-all"}. One shell at a time, one hit kills!`],
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
      const alreadyHasShell = state.bullets.some((b) => b.ownerId === playerId);
      if (alreadyHasShell) return state; // reload — wait for your shell to land or expire
      const bullet: Bullet = {
        id: nextId("b"),
        ownerId: playerId,
        team: player.team,
        x: player.x + Math.cos(player.angle) * (TANK_RADIUS + 4),
        y: player.y + Math.sin(player.angle) * (TANK_RADIUS + 4),
        vx: Math.cos(player.angle) * BULLET_SPEED,
        vy: Math.sin(player.angle) * BULLET_SPEED,
        bounces: 0,
        createdAt: Date.now(),
      };
      return { ...state, bullets: [...state.bullets, bullet] };
    }

    if (action.type === "dropMine") {
      if (!player.alive || player.minesRemaining <= 0) return state;
      const now = Date.now();
      const mine: Mine = {
        id: nextId("m"),
        ownerId: playerId,
        team: player.team,
        x: player.x,
        y: player.y,
        armAt: now + MINE_ARM_MS,
        expiresAt: now + MINE_LIFETIME_MS,
      };
      const players = { ...state.players, [playerId]: { ...player, minesRemaining: player.minesRemaining - 1 } };
      return { ...state, players, mines: [...state.mines, mine] };
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
          players[id] = { ...p, alive: true, x: sx, y: sy, respawnAt: null, minesRemaining: MAX_MINES };
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
      const nx = p.x + dx * TANK_SPEED * dtSec;
      const ny = p.y + dy * TANK_SPEED * dtSec;
      const { x, y } = resolveTankMove(p.x, p.y, nx, ny, TANK_RADIUS, state.walls);
      players[id] = { ...p, x, y };
    }

    let walls = state.walls;
    const log = [...state.log];

    // --- bullets: move, bounce off solid walls, detonate on destructible
    // walls or tanks, expire after their lifetime.
    const movedBullets = state.bullets
      .filter((b) => now - b.createdAt < BULLET_LIFETIME_MS)
      .map((b) => ({ ...b, x: b.x + b.vx * dtSec, y: b.y + b.vy * dtSec }));

    const survivingBullets: Bullet[] = [];
    for (let bullet of movedBullets) {
      // Arena edges act like an indestructible wall for ricochet purposes.
      let bounced = false;
      if (bullet.x < BULLET_RADIUS || bullet.x > ARENA_W - BULLET_RADIUS) {
        if (bullet.bounces < MAX_BOUNCES) {
          bullet = { ...bullet, x: clamp(bullet.x, BULLET_RADIUS, ARENA_W - BULLET_RADIUS), vx: -bullet.vx, bounces: bullet.bounces + 1 };
          bounced = true;
        } else {
          continue; // absorbed by the arena wall
        }
      }
      if (bullet.y < BULLET_RADIUS || bullet.y > ARENA_H - BULLET_RADIUS) {
        if (bullet.bounces < MAX_BOUNCES) {
          bullet = { ...bullet, y: clamp(bullet.y, BULLET_RADIUS, ARENA_H - BULLET_RADIUS), vy: -bullet.vy, bounces: bullet.bounces + 1 };
          bounced = true;
        } else {
          continue;
        }
      }

      // Wall collisions.
      let hitWallId: string | null = null;
      let destroyedByWall = false;
      for (const wall of walls) {
        if (!circleRectOverlap(bullet.x, bullet.y, BULLET_RADIUS, wall)) continue;
        if (wall.destructible) {
          hitWallId = wall.id;
          destroyedByWall = true;
          break;
        }
        // Solid wall: ricochet once, then detonate. closestPointOnRect gives
        // a decent approximate collision normal (vector from the rect's
        // nearest edge/corner to the bullet) — except when a fast shell has
        // tunneled its center fully inside the rect in one tick step, where
        // that vector degenerates to zero; fall back to whichever edge is
        // nearest in that case.
        const closest = closestPointOnRect(bullet.x, bullet.y, wall);
        let nx = bullet.x - closest.x;
        let ny = bullet.y - closest.y;
        if (nx === 0 && ny === 0) {
          const distLeft = bullet.x - wall.x;
          const distRight = wall.x + wall.w - bullet.x;
          const distTop = bullet.y - wall.y;
          const distBottom = wall.y + wall.h - bullet.y;
          const minDist = Math.min(distLeft, distRight, distTop, distBottom);
          if (minDist === distLeft) nx = -1;
          else if (minDist === distRight) nx = 1;
          else if (minDist === distTop) ny = -1;
          else ny = 1;
        }
        if (bullet.bounces < MAX_BOUNCES) {
          const pad = BULLET_RADIUS + 1;
          if (Math.abs(nx) > Math.abs(ny)) {
            bullet = { ...bullet, vx: -bullet.vx, x: closest.x + Math.sign(nx) * pad };
          } else {
            bullet = { ...bullet, vy: -bullet.vy, y: closest.y + Math.sign(ny) * pad };
          }
          bullet = { ...bullet, bounces: bullet.bounces + 1 };
          bounced = true;
        } else {
          destroyedByWall = true;
        }
        break;
      }
      if (destroyedByWall) {
        if (hitWallId) {
          walls = walls.map((w) => (w.id === hitWallId ? { ...w, hp: w.hp - 1 } : w)).filter((w) => !(w.destructible && w.hp <= 0));
        }
        continue;
      }
      if (bounced) {
        // A bounced shell shouldn't also try to hit a tank in the same tick
        // it reflected — push it forward slightly to escape the wall and
        // let the next tick handle tank collisions cleanly.
        survivingBullets.push(bullet);
        continue;
      }

      // Tank collisions.
      let hitTank = false;
      for (const id of state.order) {
        const target = players[id]!;
        if (!target.alive) continue;
        if (target.id === bullet.ownerId) continue;
        if (state.mode === "teams" && target.team === bullet.team) continue;
        if (distance(bullet.x, bullet.y, target.x, target.y) > TANK_RADIUS + BULLET_RADIUS) continue;
        hitTank = true;
        const shooter = players[bullet.ownerId];
        players[id] = { ...target, alive: false, deaths: target.deaths + 1, respawnAt: now + RESPAWN_MS };
        if (shooter) players[bullet.ownerId] = { ...shooter, kills: shooter.kills + 1 };
        log.push(`${bullet.ownerId} eliminated ${id}!`);
        break;
      }
      if (!hitTank) survivingBullets.push(bullet);
    }

    // --- mines: arm after a delay, trigger on tank proximity or being shot,
    // expire after their lifetime.
    const survivingMines: Mine[] = [];
    for (const mine of state.mines) {
      if (now >= mine.expiresAt) continue; // fizzled out
      const armed = now >= mine.armAt;
      let triggeredAt: { x: number; y: number } | null = null;
      if (armed) {
        for (const id of state.order) {
          const target = players[id]!;
          if (!target.alive) continue;
          if (state.mode === "teams" && target.team === mine.team && target.id !== mine.ownerId) continue;
          if (distance(mine.x, mine.y, target.x, target.y) <= MINE_TRIGGER_RADIUS) {
            triggeredAt = { x: mine.x, y: mine.y };
            break;
          }
        }
      }
      // Bullets can also detonate a mine remotely, matching the original.
      if (!triggeredAt) {
        const hitByBullet = survivingBullets.some((b) => distance(b.x, b.y, mine.x, mine.y) <= MINE_TRIGGER_RADIUS);
        if (hitByBullet) triggeredAt = { x: mine.x, y: mine.y };
      }
      if (triggeredAt) {
        for (const id of state.order) {
          const target = players[id]!;
          if (!target.alive) continue;
          if (distance(triggeredAt.x, triggeredAt.y, target.x, target.y) > MINE_BLAST_RADIUS) continue;
          const shooter = players[mine.ownerId];
          players[id] = { ...target, alive: false, deaths: target.deaths + 1, respawnAt: now + RESPAWN_MS };
          if (shooter && id !== mine.ownerId) players[mine.ownerId] = { ...shooter, kills: shooter.kills + 1 };
          log.push(id === mine.ownerId ? `${id} blew themselves up!` : `${mine.ownerId}'s mine got ${id}!`);
        }
        continue; // mine consumed
      }
      survivingMines.push(mine);
    }

    return { ...state, players, bullets: survivingBullets, mines: survivingMines, walls, log: log.slice(-30) };
  },
  getPlayerView(state) {
    return {
      hostId: state.hostId,
      mode: state.mode,
      arena: { width: ARENA_W, height: ARENA_H },
      tankRadius: TANK_RADIUS,
      bulletRadius: BULLET_RADIUS,
      mineTriggerRadius: MINE_TRIGGER_RADIUS,
      phase: state.phase,
      matchEndsAt: state.matchEndsAt,
      walls: state.walls.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, destructible: w.destructible, hp: w.hp })),
      players: state.order.map((id) => {
        const p = state.players[id]!;
        return {
          id: p.id,
          team: p.team,
          x: p.x,
          y: p.y,
          angle: p.angle,
          alive: p.alive,
          kills: p.kills,
          deaths: p.deaths,
          minesRemaining: p.minesRemaining,
          hasActiveShell: state.bullets.some((b) => b.ownerId === id),
        };
      }),
      bullets: state.bullets.map((b) => ({ id: b.id, team: b.team, x: b.x, y: b.y })),
      mines: state.mines.map((m) => ({ id: m.id, team: m.team, x: m.x, y: m.y, armed: Date.now() >= m.armAt })),
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
