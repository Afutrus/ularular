// SNAKESTACK game engine — PURE logic, no DOM. Testable headless in Node.
// Snake eats rising token-bubbles, grows, earns $PONS (play-money ledger).

export const GRID_W = 30
export const GRID_H = 22

// Reward token: $PONS — official token of ponslaunchpad. Paid for every banked run.
export const TOKEN_SYMBOL = '$PONS'
export const TOKEN_NAME = 'Pons'
export const TOKEN_CA = '0x39dBED3a2bd333467115dE45665cC57F813C4571'
// Official token of SnakeStack ($STAK) — project token.
export const STACK_SYMBOL = '$STAK'
export const STACK_NAME = 'Stak'
export const STACK_CA = '0x863dc527a5fb06c423a802bc32567257cd3f4c03'
export const TOKEN_DECIMALS = 3

// Per-bubble PONS: normal 0.001–0.005, gold 10x (0.01–0.05). 3 decimals.
// Long runs earn more; instant-death runs bank ~0.
export const BUBBLE_PONS_MIN = 0.001
export const BUBBLE_PONS_MAX = 0.005
export const GOLD_PONS_MIN = 0.01
export const GOLD_PONS_MAX = 0.05
export const round3 = (n) => Math.round(n * 1000) / 1000
export function bubblePons(gold, rng = Math.random) {
  const lo = gold ? GOLD_PONS_MIN : BUBBLE_PONS_MIN
  const hi = gold ? GOLD_PONS_MAX : BUBBLE_PONS_MAX
  return round3(lo + rng() * (hi - lo))
}

// bombs: static hazards. grace period (harmless + blinking) then lethal until expiry.
export const BOMB_GRACE = 1200   // ms before a bomb becomes lethal
export const BOMB_LIFE = 14000   // ms a bomb stays on the field
export const MAX_BOMBS = 3
export const BOMB_FIRST_AT = 7000 // no bombs in the opening seconds

let _id = 1

export function createGame(opts = {}) {
  const rng = opts.rng || Math.random
  const g = {
    rng,
    w: GRID_W,
    h: GRID_H,
    snake: [
      { x: 10, y: 14 },
      { x: 9, y: 14 },
      { x: 8, y: 14 },
    ],
    dir: { x: 1, y: 0 },
    dirQueue: [],
    grow: 0, // pending segments to add (tail not popped while > 0)
    moveInterval: 145, // ms per cell
    moveTimer: 0,
    bubbles: [],
    bombs: [],
    bombTimer: 0,
    nextBombGap: BOMB_FIRST_AT,
    spawnTimer: 0,
    spawnInterval: 850,
    elapsed: 0,
    score: 0,
    earned: 0, // tokens collected this run (play-money)
    pops: 0,
    alive: true,
    deathReason: null,
    interp: 0, // 0..1 between grid steps (for smooth render)
  }
  // seed a few bubbles so the field isn't empty
  for (let i = 0; i < 5; i++) spawnBubble(g, rng() * g.h)
  return g
}

export function spawnBubble(g, yOverride) {
  if (g.bubbles.length > 16) return
  const gold = g.rng() < 0.09
  const r = gold ? 0.42 + g.rng() * 0.1 : 0.5 + g.rng() * 0.4
  const value = gold
    ? 25 + Math.floor(g.rng() * 76) // 25..100
    : 1 + Math.floor(g.rng() * 9) //  1..9
  g.bubbles.push({
    id: _id++,
    x: 1 + g.rng() * (g.w - 2), // float cell coords
    y: yOverride !== undefined ? yOverride : g.h + 1,
    vy: (gold ? 2.6 + g.rng() * 1.0 : 1.1 + g.rng() * 1.2), // cells/sec upward
    wobAmp: 0.3 + g.rng() * 0.5,
    wobFreq: 1 + g.rng() * 2,
    phase: g.rng() * Math.PI * 2,
    r,
    value,
    gold,
    pons: bubblePons(gold, g.rng),
    born: g.elapsed,
  })
}

export function spawnBomb(g) {
  if (g.bombs.length >= MAX_BOMBS) return
  const h = headCell(g)
  for (let tries = 0; tries < 40; tries++) {
    const x = Math.floor(g.rng() * g.w)
    const y = Math.floor(g.rng() * g.h)
    // fairness: never drop on/next to the snake, never near bubbles (don't block food), never stack bombs
    const headDist = Math.abs(x - h.x) + Math.abs(y - h.y)
    if (headDist < 6) continue
    let bad = false
    for (const s of g.snake) if (s.x === x && s.y === y) { bad = true; break }
    if (!bad) for (const b of g.bombs) if (b.x === x && b.y === y) { bad = true; break }
    if (!bad) for (const b of g.bubbles) if (Math.abs(b.x - 0.5 - x) < 1.5 && Math.abs(b.y - 0.5 - y) < 1.5) { bad = true; break }
    if (bad) continue
    g.bombs.push({ id: _id++, x, y, born: g.elapsed })
    return
  }
}

export function setDir(g, dx, dy) {
  const last = g.dirQueue.length ? g.dirQueue[g.dirQueue.length - 1] : g.dir
  if (last.x === -dx && last.y === -dy) return // no 180
  if (last.x === dx && last.y === dy) return
  if (g.dirQueue.length < 2) g.dirQueue.push({ x: dx, y: dy })
}

function headCell(g) {
  return g.snake[0]
}

function stepSnake(g) {
  if (g.dirQueue.length) g.dir = g.dirQueue.shift()
  const h = headCell(g)
  let nx = h.x + g.dir.x
  let ny = h.y + g.dir.y
  // PORTAL WALLS — wrap around edges instead of dying (keeps runs alive, tension = your own tail)
  g.wrapped = false
  if (nx < 0) { nx = g.w - 1; g.wrapped = true }
  else if (nx >= g.w) { nx = 0; g.wrapped = true }
  if (ny < 0) { ny = g.h - 1; g.wrapped = true }
  else if (ny >= g.h) { ny = 0; g.wrapped = true }
  // self collision — tail cell frees up this step unless we're growing
  const skip = g.grow > 0 ? 0 : 1
  for (let i = 0; i < g.snake.length - skip; i++) {
    if (g.snake[i].x === nx && g.snake[i].y === ny) {
      g.alive = false
      g.deathReason = 'SELF'
      return false
    }
  }
  g.snake.unshift({ x: nx, y: ny })
  if (g.grow > 0) g.grow--
  else g.snake.pop()
  return true
}

// main tick. dt in ms. Returns events for the renderer.
export function tick(g, dt) {
  const ev = { popped: [], missed: [], died: null, grew: 0, bombSpawned: [], bombGone: [] }
  if (!g.alive) return ev
  const dts = dt / 1000
  g.elapsed += dt

  // --- snake grid stepping ---
  g.moveTimer += dt
  while (g.moveTimer >= g.moveInterval && g.alive) {
    g.moveTimer -= g.moveInterval
    stepSnake(g)
  }
  g.interp = g.moveInterval ? Math.min(g.moveTimer / g.moveInterval, 1) : 0

  // speed up with length
  g.moveInterval = Math.max(62, 145 - (g.snake.length - 3) * 1.6)

  // --- bombs: lifecycle + head collision (head cell exact match, lethal after grace) ---
  g.bombTimer += dt
  if (g.elapsed >= BOMB_FIRST_AT && g.bombTimer >= g.nextBombGap) {
    g.bombTimer = 0
    g.nextBombGap = 5000 + g.rng() * 5000 // every 5-10s
    const before = g.bombs.length
    spawnBomb(g)
    if (g.bombs.length > before) ev.bombSpawned.push(g.bombs[g.bombs.length - 1])
  }
  for (let i = g.bombs.length - 1; i >= 0; i--) {
    const b = g.bombs[i]
    if (g.elapsed - b.born > BOMB_LIFE) {
      g.bombs.splice(i, 1)
      ev.bombGone.push(b)
      continue
    }
    if (g.elapsed - b.born >= BOMB_GRACE && g.alive) {
      const h = headCell(g)
      if (h.x === b.x && h.y === b.y) {
        g.alive = false
        g.deathReason = 'BOMB'
        ev.boom = b
      }
    }
  }

  // --- bubbles rise ---
  for (let i = g.bubbles.length - 1; i >= 0; i--) {
    const b = g.bubbles[i]
    b.y -= b.vy * dts
    b.x += Math.sin((g.elapsed / 1000) * b.wobFreq + b.phase) * b.wobAmp * dts
    if (b.x < 0.5) b.x = 0.5
    if (b.x > g.w - 0.5) b.x = g.w - 0.5
    if (b.y < -1.2) {
      g.bubbles.splice(i, 1)
      ev.missed.push(b)
    }
  }

  // --- spawn ---
  g.spawnTimer += dt
  g.spawnInterval = Math.max(430, 850 - g.elapsed / 100)
  if (g.spawnTimer >= g.spawnInterval) {
    g.spawnTimer = 0
    spawnBubble(g)
  }

  // --- collisions head vs bubbles (check head cell + a bit of body) ---
  const check = g.snake.slice(0, Math.min(g.snake.length, 6))
  for (let i = g.bubbles.length - 1; i >= 0; i--) {
    const b = g.bubbles[i]
    for (let s = 0; s < check.length; s++) {
      const seg = check[s]
      const dx = seg.x + 0.5 - b.x
      const dy = seg.y + 0.5 - b.y
      const hitR = b.r + (s === 0 ? 0.55 : 0.35)
      if (dx * dx + dy * dy < hitR * hitR) {
        g.bubbles.splice(i, 1)
        g.pops++
        g.score += Math.max(1, Math.round(b.value * (s == 0 ? 1 : 0.5)))
        g.earned = round3(g.earned + (typeof b.pons == 'number' ? b.pons : bubblePons(b.gold, g.rng)))
        const growBy = b.gold ? 3 : 1
        g.grow += growBy
        ev.popped.push(b)
        ev.grew += growBy
        break
      }
    }
  }

  if (!g.alive) ev.died = g.deathReason
  return ev
}

// --- helpers for safe steering (used by autopilot + could drive a bot player) ---
const wrapX = (g, x) => ((x % g.w) + g.w) % g.w
const wrapY = (g, y) => ((y % g.h) + g.h) % g.h

function occupied(g, x, y, ignoreTail = true) {
  const n = g.snake.length - (ignoreTail && g.grow === 0 ? 1 : 0)
  for (let i = 0; i < n; i++) if (g.snake[i].x === x && g.snake[i].y === y) return true
  return false
}

function bombAt(g, x, y) {
  for (const b of g.bombs) if (b.x === x && b.y === y) return true
  return false
}

function safeDir(g, dx, dy) {
  const h = headCell(g)
  const nx = wrapX(g, h.x + dx), ny = wrapY(g, h.y + dy)
  if (occupied(g, nx, ny)) return false
  if (bombAt(g, nx, ny)) return false // bombs kill after grace — steer clear entirely
  // 1-step lookahead: don't enter a cell with zero exits
  let exits = 0
  for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (ax === -dx && ay === -dy) continue
    const ex = wrapX(g, nx + ax), ey = wrapY(g, ny + ay)
    if (!occupied(g, ex, ey) && !bombAt(g, ex, ey)) exits++
  }
  return exits > 0
}

// simple autopilot for headless sim: steer toward nearest bubble, never into itself
export function autopilot(g) {
  if (!g.alive) return
  const h = headCell(g)
  let best = null, bd = 1e9
  for (const b of g.bubbles) {
    const d = Math.abs(b.x - h.x) + Math.abs(b.y - h.y)
    if (d < bd) { bd = d; best = b }
  }
  const cands = []
  if (best) {
    const dx = Math.sign(Math.round(best.x - 0.5) - h.x)
    const dy = Math.sign(Math.round(best.y - 0.5) - h.y)
    // prefer the axis with the larger gap first
    if (Math.abs(best.y - h.y) >= Math.abs(best.x - h.x)) {
      if (dy) cands.push([0, dy]); if (dx) cands.push([dx, 0])
    } else {
      if (dx) cands.push([dx, 0]); if (dy) cands.push([0, dy])
    }
  }
  // fallbacks: keep going, then any safe turn
  cands.push([g.dir.x, g.dir.y], [0, -1], [1, 0], [0, 1], [-1, 0])
  for (const [dx, dy] of cands) {
    if (dx === -g.dir.x && dy === -g.dir.y) continue
    if (safeDir(g, dx, dy)) { setDir(g, dx, dy); return }
  }
}
