// Local P2E ledger — balances in PONS (3 decimals). Claim is ON-CHAIN: user hits
// WITHDRAW, backend signs a voucher, player submits claim() and pays gas.
import { round3, TOKEN_DECIMALS } from './engine.js'

const KEY = 'snakestack_ledger_v2'
const LEGACY_KEY = 'snakestack_ledger_v1'

// format a PONS amount: 0.01 .. 12,345.67
export function fmt(n) {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: TOKEN_DECIMALS,
  })
}

export function loadLedger() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const l = JSON.parse(raw)
      if (!Array.isArray(l.claims)) l.claims = []
      for (const k of ['pending', 'claimed', 'lifetime', 'best', 'runs']) if (typeof l[k] !== 'number') l[k] = 0
      if (l.wallet === undefined) l.wallet = ''
      return l
    }
    // one-time migration from the old integer play-money ledger
    const old = localStorage.getItem(LEGACY_KEY)
    if (old) {
      const o = JSON.parse(old)
      const conv = (n) => Math.round((Number(n) || 0) / 1000 * 100) / 100 // 1000 old units = 1 PONS
      return saveLedger({
        wallet: o.wallet || '',
        pending: conv(o.pending), claimed: conv(o.claimed), lifetime: conv(o.lifetime ?? (o.pending || 0) + (o.claimed || 0)),
        claims: (o.claims || []).map((c) => ({ ...c, amount: conv(c.amount) })),
        best: o.best || o.highScore || 0, runs: o.runs || 0,
      })
    }
  } catch {}
  return { wallet: '', pending: 0, claimed: 0, lifetime: 0, claims: [], best: 0, runs: 0 }
}

export function saveLedger(l) {
  try { localStorage.setItem(KEY, JSON.stringify(l)) } catch {}
  return l
}

// Bank a finished run: payout = PONS eaten bubble-by-bubble this run (run.earned).
// Explicit run.reward still wins when present. Instant-death runs bank ~0.
export function bankRun(l, run) {
  const { score = 0, length = 0, time = 0, reason = '' } = run || {}
  const reward = typeof run?.reward == 'number' ? round3(run.reward) : round3(run?.earned || 0)
  l.pending = round3(l.pending + reward)
  l.lifetime = round3(l.lifetime + reward)
  l.runs += 1
  if (score > l.best) l.best = score
  l.lastRun = { score, reward, length, time, reason, at: Date.now() }
  return saveLedger(l)
}

// Legacy queued withdraw (pre on-chain claims). Kept for ledger compat.
export function claim(l, { minClaim = 0.01 } = {}) {
  if (!l.wallet || !isAddress(l.wallet)) return { ...l, error: 'connect a wallet first' }
  if (l.pending < minClaim) return { ...l, error: 'nothing to withdraw' }
  const c = {
    id: 'clm_' + Date.now().toString(36),
    at: Date.now(),
    amount: round3(l.pending),
    wallet: l.wallet,
    status: 'queued', // legacy queue (pre on-chain claims)
  }
  l.claims.unshift(c)
  l.claims = l.claims.slice(0, 25)
  l.claimed = round3(l.claimed + c.amount)
  l.pending = 0
  l.lastClaim = c
  return saveLedger(l)
}

// On-chain withdraw: moves pending -> claimed after claim() tx confirms.
export function claimChained(l, { amount, txHash, wallet }) {
  const c = {
    id: 'clm_' + Date.now().toString(36),
    at: Date.now(),
    amount: round3(Number(amount) || 0),
    wallet: wallet || l.wallet,
    status: 'onchain',
    txHash: txHash || '',
  }
  l.claims.unshift(c)
  l.claims = l.claims.slice(0, 25)
  l.claimed = round3(l.claimed + c.amount)
  l.pending = round3(Math.max(0, l.pending - c.amount))
  l.lastClaim = c
  return saveLedger(l)
}

export function isAddress(a) {
  return /^0x[0-9a-fA-F]{40}$/.test((a || '').trim())
}
