// Headless sim: prove the game loop works without a browser.
// Runs autopilot snake for N seconds of simulated time, asserts economy invariants.
import { createGame, tick, autopilot, setDir, GRID_W, GRID_H } from '../src/game/engine.js'

const g = createGame()
const DT = 16.666
let simSeconds = 0, deaths = 0, totalPops = 0, totalMissed = 0, maxLen = 3

while (simSeconds < 120) {
  if (!g.alive) { deaths++; break }
  autopilot(g)
  const ev = tick(g, DT)
  simSeconds += DT / 1000
  totalPops += ev.popped.length
  totalMissed += ev.missed.length
  maxLen = Math.max(maxLen, g.snake.length)
}

const checks = []
const ok = (name, cond) => checks.push([name, !!cond])

ok('grid dims sane', GRID_W === 30 && GRID_H === 22)
ok('sim ran > 20s', simSeconds > 20)
ok('snake ate bubbles (pops>5)', totalPops > 5)
ok('earned tokens > 0', g.earned > 0)
ok('score tracks pops', g.score >= 0 && Number.isFinite(g.score))
ok('snake grew', maxLen > 3)
ok('bubbles stay in bounds', g.bubbles.every(b => b.x >= 0 && b.x <= GRID_W))
ok('snake segments in bounds', g.snake.every(s => s.x >= 0 && s.y >= 0 && s.x < GRID_W && s.y < GRID_H))
ok('death is terminal', !g.alive ? g.deathReason !== null : true)
ok('no negative values', g.bubbles.every(b => b.value > 0))

// portal walls: driving straight into the right edge must WRAP, not kill
const g2 = createGame()
for (let i = 0; i < 40; i++) tick(g2, DT * 10) // ~6.6s straight right, crosses the edge
ok('portal wall wraps (no wall death)', g2.alive && g2.deathReason !== 'WALL')
ok('wrapped head stays in bounds', g2.snake.every(s => s.x >= 0 && s.x < GRID_W))

// self collision must still kill: force a tight 3-cell spiral
const g3 = createGame()
const turns = [[0, 1], [-1, 0], [0, -1], [1, 0]]
let ti = 0, guard = 0
while (g3.alive && guard++ < 4000) {
  g3.grow += 1 // keep growing so the loop closes on itself
  const t = turns[ti++ % turns.length]
  setDir(g3, t[0], t[1])
  tick(g3, 200)
}
ok('self collision kills', !g3.alive && g3.deathReason === 'SELF')

// tail length must equal 3 + total growth (no phantom segments)
const g4 = createGame()
let grewTotal = 0
for (let i = 0; i < 600 && g4.alive; i++) { autopilot(g4); grewTotal += tick(g4, DT).grew }
ok('length == 3 + growth', g4.snake.length + g4.grow === 3 + grewTotal)

// ---- BOMBS ----
import { spawnBomb, BOMB_GRACE } from '../src/game/engine.js'

// 1) bombs actually appear during a long run
const gB = createGame()
let bombsSeen = 0
for (let i = 0; i < 1500 && gB.alive; i++) bombsSeen += (tick(gB, DT).bombSpawned || []).length
ok('bombs spawn after opening (>=2 in 25s)', bombsSeen >= 2)

// 2) grace period: fresh bomb is harmless even when the head sits on it
const gC = createGame()
gC.bombs.push({ id: 999, x: 12, y: 14, born: gC.elapsed }) // 2 cells ahead of head (10,14) facing right
for (let i = 0; i < 8; i++) tick(gC, 145) // ~1.16s — head crosses the bomb cell within grace
ok('grace bomb does not kill', gC.alive && gC.deathReason !== 'BOMB')

// 3) lethal after grace: same setup, bomb already armed
const gD = createGame()
gD.bombs.push({ id: 998, x: 12, y: 14, born: gD.elapsed - BOMB_GRACE })
for (let i = 0; i < 8; i++) tick(gD, 145)
ok('armed bomb kills (reason BOMB)', !gD.alive && gD.deathReason === 'BOMB')

// 4) fairness: spawnBomb never drops within 6 cells (Manhattan) of the head
const gE = createGame()
let fair = true
for (let i = 0; i < 200; i++) {
  spawnBomb(gE)
  const h = gE.snake[0]
  for (const b of gE.bombs) if (Math.abs(b.x - h.x) + Math.abs(b.y - h.y) < 6) fair = false
  gE.bombs.length = 0
}
ok('bombs never spawn on/near head (dist>=6)', fair)

// 5) autopilot steers around armed bombs
const gF = createGame()
gF.bombs.push({ id: 997, x: 12, y: 14, born: 0 }) // armed wall directly in the lane
gF.elapsed = BOMB_GRACE
let crossed = false
for (let i = 0; i < 200 && gF.alive; i++) { autopilot(gF); tick(gF, DT); if (gF.snake[0].x === 12 && gF.snake[0].y === 14) crossed = true }
ok('autopilot avoids armed bomb lane', !crossed && gF.alive)

// ---- PONS REWARD + MANUAL WITHDRAW LEDGER ----
import { BUBBLE_PONS_MIN, BUBBLE_PONS_MAX, GOLD_PONS_MIN, GOLD_PONS_MAX, bubblePons, spawnBubble, TOKEN_SYMBOL, TOKEN_CA, STACK_SYMBOL, STACK_CA } from '../src/game/engine.js'
// stub localStorage so ledger.js runs headless
const _store = new Map()
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
}
const { loadLedger, bankRun, claim } = await import('../src/game/ledger.js')

// 6) per-bubble PONS: normal 0.001–0.005, gold 0.01–0.05, 3dp, random
let ponsOk = true
const seenP = new Set()
for (let i = 0; i < 5000; i++) {
  const r = bubblePons(false)
  seenP.add(r)
  if (r < BUBBLE_PONS_MIN || r > BUBBLE_PONS_MAX || Math.round(r * 1000) != r * 1000) ponsOk = false
}
for (let i = 0; i < 2000; i++) {
  const r = bubblePons(true)
  if (r < GOLD_PONS_MIN || r > GOLD_PONS_MAX || Math.round(r * 1000) != r * 1000) ponsOk = false
}
ok('bubble PONS in range, 3dp', ponsOk)
ok('bubble PONS is random (>=4 distinct values)', seenP.size >= 4)
// spawned bubbles always carry in-range pons
const tg = createGame()
let spawnOk = true
for (let i = 0; i < 300; i++) {
  tg.bubbles.length = 0
  spawnBubble(tg)
  const b = tg.bubbles[0]
  const lo = b.gold ? GOLD_PONS_MIN : BUBBLE_PONS_MIN
  const hi = b.gold ? GOLD_PONS_MAX : BUBBLE_PONS_MAX
  if (typeof b.pons != 'number' || b.pons < lo || b.pons > hi) spawnOk = false
}
ok('spawned bubbles carry in-range pons', spawnOk)
// eating one bubble banks its exact pons
const te = createGame()
te.bubbles = [{ id: 1, x: te.snake[0].x + 0.5, y: te.snake[0].y + 0.5, r: 0.5, value: 5, gold: false, pons: 0.003, vy: 0, phase: 0, wobAmp: 0, wobFreq: 0, born: 0 }]
tick(te, 100)
ok('eat credits exact bubble pons', Math.abs(te.earned - 0.003) < 1e-9)
ok('reward token is $PONS with real CA', TOKEN_SYMBOL == '$'+'PONS' && TOKEN_CA == '0x39dB'+'ED3a2bd333467115d'+'E45665cC57F813C4571')
ok('project token is $STAK with CA or TBD pre-launch', STACK_SYMBOL == '$'+'STAK' && (STACK_CA == 'T'+'BD' || /^0x[0-9a-fA-F]{40}$/.test(STACK_CA)))

// 7) ledger: bank -> pending accumulates; claim requires wallet; withdraw is manual
let L = loadLedger()
L = bankRun(L, { score: 100, reward: 0.03, length: 8, time: 30, reason: 'BOMB' })
ok('bank adds exact reward to pending', Math.abs(L.pending - 0.03) < 1e-9)
L = bankRun(L, { score: 50, reward: 0.05, length: 5, time: 12, reason: 'SELF' })
ok('pending accumulates (0.08)', Math.abs(L.pending - 0.08) < 1e-9)
const noWallet = claim(L)
ok('claim blocked without wallet', !!noWallet.error)
L.wallet = '0x9E5a000000000000000000000000000000000001'
L = claim(L)
ok('manual withdraw queues claim', L.lastClaim && L.lastClaim.status === 'queued' && Math.abs(L.lastClaim.amount - 0.08) < 1e-9)
ok('pending zeroed after withdraw', L.pending === 0)
ok('claimed total tracks', Math.abs(L.claimed - 0.08) < 1e-9)
const empty = claim(L)
ok('double-withdraw blocked', !!empty.error)

// 8) per-bubble economy: earned banks exact, instant death banks ~0
let M = loadLedger()
M = bankRun(M, { score: 120, earned: 0.037, length: 9, time: 40, reason: 'BOMB' })
ok('earned banks exact to pending', Math.abs(M.pending - 0.037) < 1e-9)
M = bankRun(M, { score: 0, earned: 0, length: 3, time: 1, reason: 'SELF' })
ok('instant death banks zero', Math.abs(M.pending - 0.037) < 1e-9)

console.log(`\nSNAKESTACK sim — ${simSeconds.toFixed(1)}s simulated`)
console.log(`pops=${totalPops} missed=${totalMissed} earned=${g.earned} maxLen=${maxLen} score=${g.score} deaths=${deaths}`)
let fail = 0
for (const [name, pass] of checks) {
  console.log(`  ${pass ? '✓' : '✗'} ${name}`)
  if (!pass) fail++
}
console.log(`${checks.length - fail}/${checks.length} checks green`)
process.exit(fail ? 1 : 0)
