// Procedural WebAudio SFX — zero assets, zero deps. Lazy AudioContext (autoplay-safe).
// Usage: sfx.unlock() on first user gesture, then sfx.pop(gold) / warn() / boom() / die() / click() / start().

let ctx = null
let master = null
const MUTE_KEY = 'ss_mute'

function ac() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.1, vol = 0.15, delay = 0, curve = 'exp' }) {
  const c = ac()
  if (!c || muted) return
  const t0 = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008)
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  else g.gain.linearRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(master)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
}

function noise({ dur = 0.4, vol = 0.25, from = 1200, to = 100, delay = 0 }) {
  const c = ac()
  if (!c || muted) return
  const t0 = c.currentTime + delay
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(from, t0)
  f.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t0)
}

let muted = false
try { muted = localStorage.getItem(MUTE_KEY) === '1' } catch {}

export const sfx = {
  get muted() { return muted },
  unlock() { ac() }, // call inside a user gesture (PLAY click)
  toggle() {
    muted = !muted
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch {}
    return muted
  },
  // bubble eaten — pitch rises slightly with combo so streaks feel rewarding
  pop(gold = false, combo = 0) {
    if (gold) {
      tone({ freq: 880, type: 'triangle', dur: 0.12, vol: 0.16 })
      tone({ freq: 1318, type: 'triangle', dur: 0.2, vol: 0.16, delay: 0.07 })
      tone({ freq: 1760, type: 'sine', dur: 0.24, vol: 0.08, delay: 0.14 })
    } else {
      const base = 520 + Math.random() * 200 + Math.min(combo, 12) * 18
      tone({ freq: base, freqEnd: base * 1.5, type: 'triangle', dur: 0.09, vol: 0.14 })
    }
  },
  // bomb appeared — quiet double blip warning
  warn() {
    tone({ freq: 233, type: 'square', dur: 0.06, vol: 0.045 })
    tone({ freq: 233, type: 'square', dur: 0.06, vol: 0.045, delay: 0.09 })
  },
  // bomb exploded / death by bomb
  boom() {
    noise({ dur: 0.5, vol: 0.3, from: 1400, to: 80 })
    tone({ freq: 160, freqEnd: 38, type: 'sine', dur: 0.5, vol: 0.28 })
  },
  // run over (any cause) — descending saw
  die() {
    tone({ freq: 320, freqEnd: 55, type: 'sawtooth', dur: 0.55, vol: 0.1 })
    noise({ dur: 0.3, vol: 0.06, from: 900, to: 150, delay: 0.05 })
  },
  click() {
    tone({ freq: 700, type: 'square', dur: 0.04, vol: 0.05 })
  },
  start() {
    tone({ freq: 440, type: 'triangle', dur: 0.09, vol: 0.12 })
    tone({ freq: 660, type: 'triangle', dur: 0.09, vol: 0.12, delay: 0.08 })
    tone({ freq: 880, type: 'triangle', dur: 0.16, vol: 0.14, delay: 0.16 })
  },
}
