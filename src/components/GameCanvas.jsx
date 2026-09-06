import React, { useEffect, useRef } from 'react'
import { createGame, tick, setDir, autopilot, spawnBomb, bubblePons, GRID_W, GRID_H, TOKEN_SYMBOL, BOMB_GRACE, BOMB_LIFE } from '../game/engine.js'
import { sfx } from '../game/sound.js'

// Owns the engine + rAF render loop. Neon Abyss Arcade renderer.
// demo=true: autopilot plays itself (menu showcase), no input, auto-restart on death.
export default function GameCanvas({ onStats, onEnd, demo = false }) {
  const wrapRef = useRef(null)
  const cvRef = useRef(null)
  const cbRef = useRef({ onStats, onEnd })
  cbRef.current = { onStats, onEnd }

  useEffect(() => {
    const cv = cvRef.current
    const ctx = cv.getContext('2d')
    let g = createGame()
    // demo: fast-forward 15s of autopilot play so the FIRST painted frame is mid-action
    const seedDemo = (game) => {
      while (game.bubbles.length < 16) {
        const gold = Math.random() < 0.12
        game.bubbles.push({
          id: 9000 + game.bubbles.length,
          x: Math.random() * game.w,
          y: Math.random() * game.h,
          r: gold ? 0.85 : 0.5 + Math.random() * 0.3,
          value: gold ? 25 + Math.floor(Math.random() * 76) : 1 + Math.floor(Math.random() * 9),
          gold, pons: bubblePons(gold, Math.random), vy: (gold ? 2 : 1) * (8 + Math.random() * 6), phase: Math.random() * 6.28,
        })
      }
      for (let i = 0; i < 150; i++) { autopilot(game); tick(game, 100) }
      // guarantee armed bombs on screen for the showcase (fair placement via engine rules)
      let guard = 0
      while (game.alive && game.bombs.length < 2 && guard++ < 10) spawnBomb(game)
      for (const b of game.bombs) b.born = game.elapsed - 2000 // arm them for the showcase
      return game
    }
    if (demo) {
      for (let attempt = 0; attempt < 4; attempt++) {
        g = seedDemo(createGame())
        if (g.alive && g.snake.length >= 8) break
      }
    }
    if (typeof window !== 'undefined' && !demo) window.__snake = g // debug handle (QA)
    const particles = []
    const floaters = []
    const rings = []
    let raf, last = performance.now(), statAcc = 0, shake = 0, flash = 0, ended = false, endTimer = null, emberAcc = 0, demoDeadAt = 0

    function fit() {
      const wrap = wrapRef.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const availW = wrap.clientWidth
      const availH = demo ? Infinity : Math.max(240, window.innerHeight - wrap.getBoundingClientRect().top - 150)
      const cell = Math.max(10, Math.floor(Math.min(availW / GRID_W, availH / GRID_H)))
      const cw = cell * GRID_W, ch = cell * GRID_H
      cv.style.width = cw + 'px'
      cv.style.height = ch + 'px'
      cv.width = cw * dpr
      cv.height = ch * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      return cell
    }
    let cell = fit()
    const onResize = () => { cell = fit() }
    window.addEventListener('resize', onResize)

    // ---- input ----
    const KEYS = {      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
      W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
    }
    function onKey(e) {
      const k = KEYS[e.key]
      if (k) { e.preventDefault(); setDir(g, k[0], k[1]) }
    }
    window.addEventListener('keydown', onKey)
    let tS = null
    function onTouchStart(e) { tS = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
    function onTouchEnd(e) {
      if (!tS) return
      const dx = e.changedTouches[0].clientX - tS.x
      const dy = e.changedTouches[0].clientY - tS.y
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return
      if (Math.abs(dx) > Math.abs(dy)) setDir(g, Math.sign(dx), 0)
      else setDir(g, 0, Math.sign(dy))
      tS = null
    }
    cv.addEventListener('touchstart', onTouchStart, { passive: true })
    cv.addEventListener('touchend', onTouchEnd, { passive: true })
    if (demo) {
      window.removeEventListener('keydown', onKey)
      cv.removeEventListener('touchstart', onTouchStart)
      cv.removeEventListener('touchend', onTouchEnd)
    }

    // ---- fx helpers ----
    function burst(b, color) {
      const x = b.x * cell, y = b.y * cell
      rings.push({ x, y, r: cell * 0.4, r1: cell * 1.9, life: 1, color })
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 50 + Math.random() * 150
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 1, size: 2 + Math.random() * 3, color, grav: 420 })
      }
      floaters.push({ x, y, life: 1, text: '+' + b.value, gold: b.gold })
      if (typeof b.pons == 'number') floaters.push({ x, y: y - cell * 0.9, life: 1.2, text: '+' + b.pons.toFixed(3), pons: true })
    }
    function boomFx(bx, by) {
      flash = 1
      rings.push({ x: bx, y: by, r: cell * 0.5, r1: cell * 5, life: 1, color: '#ff6b3d' })
      rings.push({ x: bx, y: by, r: cell * 0.3, r1: cell * 3.2, life: 1.2, color: '#ffd166' })
      for (let i = 0; i < 64; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 70 + Math.random() * 360
        particles.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.3, size: 2 + Math.random() * 4, color: ['#ff3b5c', '#ff6b3d', '#ffd166', '#ffffff'][i % 4], grav: 300 })
      }
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2
        particles.push({ x: bx, y: by, vx: Math.cos(a) * 40, vy: -30 - Math.random() * 60, life: 1.6, size: 5 + Math.random() * 7, color: 'rgba(90,80,75,0.5)', grav: -30 })
      }
    }

    // ---- render ----
    function draw() {
      const W = cv.clientWidth, H = cv.clientHeight
      ctx.save()
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 16)
      ctx.clearRect(-20, -20, W + 40, H + 40)

      // floor
      const floor = ctx.createLinearGradient(0, 0, 0, H)
      floor.addColorStop(0, '#08151d')
      floor.addColorStop(0.55, '#050d13')
      floor.addColorStop(1, '#020609')
      ctx.fillStyle = floor
      ctx.fillRect(0, 0, W, H)

      // grid — minor + major
      ctx.lineWidth = 1
      for (let x = 0; x <= GRID_W; x++) {
        ctx.strokeStyle = x % 5 === 0 ? 'rgba(0,255,163,0.075)' : 'rgba(0,255,163,0.028)'
        ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, H); ctx.stroke()
      }
      for (let y = 0; y <= GRID_H; y++) {
        ctx.strokeStyle = y % 5 === 0 ? 'rgba(0,255,163,0.075)' : 'rgba(0,255,163,0.028)'
        ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(W, y * cell); ctx.stroke()
      }

      // portal edges — animated energy
      const dash = (g.elapsed / 28) % 24
      ctx.save()
      ctx.setLineDash([12, 12])
      ctx.lineDashOffset = -dash
      ctx.strokeStyle = 'rgba(0,255,163,0.34)'
      ctx.lineWidth = 2
      ctx.shadowColor = 'rgba(0,255,163,0.7)'
      ctx.shadowBlur = 10
      ctx.strokeRect(1.5, 1.5, W - 3, H - 3)
      ctx.restore()

      // corner brackets
      ctx.strokeStyle = 'rgba(0,255,163,0.5)'
      ctx.lineWidth = 2.5
      const cb = Math.min(26, cell * 1.6)
      for (const [cx, cy, sx, sy] of [[4, 4, 1, 1], [W - 4, 4, -1, 1], [4, H - 4, 1, -1], [W - 4, H - 4, -1, -1]]) {
        ctx.beginPath()
        ctx.moveTo(cx + sx * cb, cy)
        ctx.lineTo(cx, cy)
        ctx.lineTo(cx, cy + sy * cb)
        ctx.stroke()
      }

      // coins (bubbles)
      for (const b of g.bubbles) {
        const bob = Math.sin(g.elapsed / 340 + b.phase) * cell * 0.05
        const bx = b.x * cell, by = b.y * cell + bob
        const br = b.r * cell * (1 + Math.sin(g.elapsed / 300 + b.phase) * 0.03)
        const grad = ctx.createRadialGradient(bx - br * 0.38, by - br * 0.42, br * 0.12, bx, by, br)
        if (b.gold) {
          grad.addColorStop(0, '#fff7d6')
          grad.addColorStop(0.45, '#ffc53d')
          grad.addColorStop(1, '#8a5a00')
        } else {
          grad.addColorStop(0, '#e6fff5')
          grad.addColorStop(0.45, '#19e3b1')
          grad.addColorStop(1, '#04563d')
        }
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2)
        if (b.gold) { ctx.shadowColor = 'rgba(255,197,61,0.85)'; ctx.shadowBlur = 18 }
        ctx.fillStyle = grad
        ctx.fill()
        ctx.shadowBlur = 0
        // rim + inner ring
        ctx.strokeStyle = b.gold ? '#ffe08a' : '#8effd4'
        ctx.lineWidth = 1.6
        ctx.stroke()
        ctx.beginPath(); ctx.arc(bx, by, br * 0.72, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'
        ctx.lineWidth = br * 0.16
        ctx.stroke()
        // rotating shine
        ctx.save()
        ctx.translate(bx, by); ctx.rotate(g.elapsed / 900 + b.phase)
        ctx.beginPath(); ctx.ellipse(0, -br * 0.45, br * 0.5, br * 0.2, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.fill()
        ctx.restore()
        // value
        ctx.font = `800 ${Math.max(9, br * 0.72)}px "JetBrains Mono", monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = b.gold ? '#4a2e00' : '#02301f'
        ctx.fillText(b.value, bx, by + br * 0.06)
        // gold orbiting sparkles
        if (b.gold) {
          for (let k = 0; k < 3; k++) {
            const a = g.elapsed / 500 + k * 2.1
            const sx = bx + Math.cos(a) * br * 1.35, sy = by + Math.sin(a) * br * 1.35
            ctx.fillStyle = 'rgba(255,240,190,0.9)'
            ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, 7); ctx.fill()
          }
        }
      }

      // bombs
      for (const b of g.bombs) {
        const age = g.elapsed - b.born
        const bx = (b.x + 0.5) * cell, by = (b.y + 0.5) * cell
        if (age < BOMB_GRACE) {
          const blink = Math.sin(age / 70) > -0.2
          ctx.globalAlpha = blink ? 1 : 0.3
          ctx.save()
          ctx.setLineDash([5, 5])
          ctx.beginPath(); ctx.arc(bx, by, cell * 0.66, 0, Math.PI * 2)
          ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 2
          ctx.shadowColor = 'rgba(255,59,92,0.8)'; ctx.shadowBlur = 12
          ctx.stroke()
          ctx.restore()
          ctx.font = `800 ${Math.max(10, cell * 0.6)}px "Chakra Petch", sans-serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillStyle = '#ff3b5c'
          ctx.fillText('!', bx, by + 1)
          ctx.globalAlpha = 1
        } else {
          const left = 1 - age / BOMB_LIFE
          const pulse = 0.5 + 0.5 * Math.sin(g.elapsed / (90 + left * 260))
          const rad = cell * 0.46
          // expanding danger ring
          const cyc = (g.elapsed % 1100) / 1100
          ctx.beginPath(); ctx.arc(bx, by, rad + cyc * cell * 1.1, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(255,59,92,${(1 - cyc) * 0.4})`
          ctx.lineWidth = 1.5
          ctx.stroke()
          // sphere
          const bg2 = ctx.createRadialGradient(bx - rad * 0.4, by - rad * 0.45, rad * 0.15, bx, by, rad)
          bg2.addColorStop(0, '#6b2436')
          bg2.addColorStop(0.5, '#2a0713')
          bg2.addColorStop(1, '#12020a')
          ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2)
          ctx.fillStyle = bg2
          ctx.shadowColor = 'rgba(255,59,92,0.95)'
          ctx.shadowBlur = 16 + pulse * 14
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.strokeStyle = `rgba(255,59,92,${0.75 + pulse * 0.25})`
          ctx.lineWidth = 2
          ctx.stroke()
          // specular
          ctx.beginPath(); ctx.arc(bx - rad * 0.38, by - rad * 0.42, rad * 0.16, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.5)'
          ctx.fill()
          // fuse + spark
          ctx.beginPath()
          ctx.moveTo(bx + rad * 0.35, by - rad * 0.8)
          ctx.quadraticCurveTo(bx + rad * 0.95, by - rad * 1.15, bx + rad * 0.8, by - rad * 1.5)
          ctx.strokeStyle = '#a8846b'; ctx.lineWidth = 2
          ctx.stroke()
          const fx = bx + rad * 0.8, fy = by - rad * 1.5
          ctx.beginPath(); ctx.arc(fx, fy, cell * (0.09 + pulse * 0.07), 0, Math.PI * 2)
          ctx.fillStyle = pulse > 0.5 ? '#ffd166' : '#ff6b3d'
          ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 12
          ctx.fill()
          ctx.shadowBlur = 0
          // ✕ mark
          ctx.font = `700 ${Math.max(9, cell * 0.4)}px "Chakra Petch", sans-serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillStyle = '#ff8fa3'
          ctx.fillText('✕', bx, by + 1)
        }
      }

      // snake — smooth body path, split across portal wraps
      const n = g.snake.length
      const h0 = g.snake[0], h1 = g.snake[1]
      const contiguous = !h1 || (Math.abs(h0.x - h1.x) + Math.abs(h0.y - h1.y)) === 1
      const pts = []
      for (let i = 0; i < n; i++) {
        const s = g.snake[i]
        let px = (s.x + 0.5) * cell, py = (s.y + 0.5) * cell
        if (i === 0 && g.alive && contiguous) { px += g.dir.x * g.interp * cell; py += g.dir.y * g.interp * cell }
        pts.push([px, py])
      }
      const paths = [[]]
      for (let i = pts.length - 1; i >= 0; i--) {
        const cur = paths[paths.length - 1]
        if (cur.length && (Math.abs(cur[cur.length - 1][0] - pts[i][0]) > cell * 1.6 || Math.abs(cur[cur.length - 1][1] - pts[i][1]) > cell * 1.6)) paths.push([])
        paths[paths.length - 1].push(pts[i])
      }
      const stroke = (width, style, blur, blurColor) => {
        for (const p of paths) {
          if (p.length < 2) continue
          ctx.beginPath()
          ctx.moveTo(p[0][0], p[0][1])
          for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1])
          ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
          ctx.strokeStyle = style
          if (blur) { ctx.shadowColor = blurColor; ctx.shadowBlur = blur } else ctx.shadowBlur = 0
          ctx.stroke()
          ctx.shadowBlur = 0
        }
      }
      stroke(cell * 1.08, 'rgba(0, 60, 38, 0.9)', 24, 'rgba(0,255,163,0.6)') // venom glow
      stroke(cell * 0.9, '#07331f')                                          // dark armored hide
      // ---- ARMORED BODY: hex plates + dorsal spikes + tail stinger (top-down) ----
      // per-segment details; portal-wrap jumps are skipped so plates never streak across the arena
      {
        const segLen = cell * 1.6
        const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= segLen
        const tailT = (i) => i / Math.max(1, n - 1) // 0 = neck, 1 = tail tip
        const spikePulse = 0.6 + 0.4 * Math.sin(g.elapsed / 420)
        let spikeN = 0
        for (let i = Math.min(pts.length - 1, n - 1); i >= 1; i--) {
          const p = pts[i], q = pts[i - 1]
          if (!near(p, q)) continue
          const ang = Math.atan2(q[1] - p[1], q[0] - p[0])
          const w = cell * (0.8 - 0.32 * tailT(i)) // taper: thick neck, slim tail
          const l = cell * 0.58
          ctx.save()
          ctx.translate(p[0], p[1])
          ctx.rotate(ang)
          // hex armor plate
          const plate = new Path2D()
          plate.moveTo(-0.55 * l, -0.5 * w)
          plate.lineTo(-0.05 * l, -0.66 * w)
          plate.lineTo(0.5 * l, -0.3 * w)
          plate.lineTo(0.62 * l, 0)
          plate.lineTo(0.5 * l, 0.3 * w)
          plate.lineTo(-0.05 * l, 0.66 * w)
          plate.lineTo(-0.55 * l, 0.5 * w)
          plate.closePath()
          const pg = ctx.createLinearGradient(0, -0.66 * w, 0, 0.66 * w)
          pg.addColorStop(0, '#03271a')
          pg.addColorStop(0.5, '#0e9c67')
          pg.addColorStop(1, '#03271a')
          ctx.fillStyle = pg
          ctx.fill(plate)
          ctx.strokeStyle = 'rgba(140,255,205,0.55)'; ctx.lineWidth = 1.2
          ctx.stroke(plate)
          // center ridge (gold spine)
          ctx.strokeStyle = 'rgba(255,197,61,0.55)'; ctx.lineWidth = Math.max(1, cell * 0.07); ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(-0.42 * l, 0); ctx.lineTo(0.5 * l, 0); ctx.stroke()
          // dorsal spike every 3rd plate, alternating sides
          if (i % 3 === 1) {
            const side = (spikeN++ % 2 === 0) ? 1 : -1
            const bx = -0.05 * l, by = side * 0.6 * w
            const tipX = -0.2 * l, tipY = side * (0.6 * w + cell * 0.52)
            const sg = ctx.createLinearGradient(bx, by, tipX, tipY)
            sg.addColorStop(0, '#0e9c67')
            sg.addColorStop(1, '#ffc53d')
            ctx.shadowColor = `rgba(255,197,61,${0.35 + spikePulse * 0.4})`; ctx.shadowBlur = 8
            ctx.fillStyle = sg
            ctx.beginPath()
            ctx.moveTo(bx + 0.16 * l, by - side * 0.1 * w)
            ctx.lineTo(tipX, tipY)
            ctx.lineTo(bx - 0.16 * l, by + side * 0.1 * w)
            ctx.closePath(); ctx.fill()
            ctx.shadowBlur = 0
          }
          ctx.restore()
        }
        // tail stinger — venom barb at the very tip
        if (n > 2) {
          const tip = pts[n - 1], prev = pts[n - 2]
          if (near(tip, prev)) {
            const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0])
            ctx.save()
            ctx.translate(tip[0], tip[1])
            ctx.rotate(ang)
            ctx.shadowColor = 'rgba(255,197,61,0.8)'; ctx.shadowBlur = 10
            const sting = ctx.createLinearGradient(0, 0, cell * 0.95, 0)
            sting.addColorStop(0, '#0e9c67')
            sting.addColorStop(1, '#ffe08a')
            ctx.fillStyle = sting
            ctx.beginPath()
            ctx.moveTo(0, -cell * 0.16)
            ctx.lineTo(cell * 0.95, 0)
            ctx.lineTo(0, cell * 0.16)
            ctx.closePath(); ctx.fill()
            ctx.shadowBlur = 0
            ctx.restore()
          }
        }
      }
      // head — VIPER: angular skull, red slit eyes, fangs. Rotated to travel dir.
      if (n) {
        const [hx, hy] = pts[0]
        const ang = Math.atan2(g.dir.y, g.dir.x)
        ctx.save()
        ctx.translate(hx, hy)
        ctx.rotate(ang)
        const u = cell // unit
        // skull: broad viper triangle pointing +x
        const skull = new Path2D()
        skull.moveTo(u * 0.95, 0)
        skull.lineTo(u * 0.25, -u * 0.58)
        skull.lineTo(-u * 0.45, -u * 0.5)
        skull.lineTo(-u * 0.7, -u * 0.28)
        skull.lineTo(-u * 0.7, u * 0.28)
        skull.lineTo(-u * 0.45, u * 0.5)
        skull.lineTo(u * 0.25, u * 0.58)
        skull.closePath()
        const hg2 = ctx.createLinearGradient(-u * 0.7, 0, u * 0.95, 0)
        hg2.addColorStop(0, '#04402a')
        hg2.addColorStop(0.55, '#0b8f5c')
        hg2.addColorStop(1, '#b8ffe0')
        ctx.shadowColor = 'rgba(0,255,163,0.9)'; ctx.shadowBlur = 18
        ctx.fillStyle = hg2
        ctx.fill(skull)
        ctx.shadowBlur = 0
        ctx.strokeStyle = 'rgba(0,255,163,0.85)'; ctx.lineWidth = 1.6
        ctx.stroke(skull)
        // brow ridges (angry V)
        ctx.strokeStyle = 'rgba(2,40,26,0.9)'; ctx.lineWidth = u * 0.11; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-u * 0.05, -u * 0.3); ctx.lineTo(u * 0.32, -u * 0.18); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(-u * 0.05, u * 0.3); ctx.lineTo(u * 0.32, u * 0.18); ctx.stroke()
        // eyes: red slanted quads + black vertical slit + glow
        const blink2 = (g.elapsed % 3200) < 130 ? 0.15 : 1
        for (const sgn of [1, -1]) {
          ctx.save()
          ctx.translate(u * 0.12, sgn * u * 0.3)
          ctx.rotate(sgn * -0.22)
          ctx.scale(1, blink2)
          ctx.shadowColor = 'rgba(255,59,92,0.95)'; ctx.shadowBlur = 10
          ctx.fillStyle = '#ff3b5c'
          ctx.beginPath()
          ctx.moveTo(-u * 0.2, -u * 0.1)
          ctx.lineTo(u * 0.2, -u * 0.16)
          ctx.lineTo(u * 0.16, u * 0.12)
          ctx.lineTo(-u * 0.2, u * 0.1)
          ctx.closePath(); ctx.fill()
          ctx.shadowBlur = 0
          // slit pupil
          ctx.fillStyle = '#1a0208'
          ctx.fillRect(-u * 0.025, -u * 0.11, u * 0.05, u * 0.22)
          // hot glint
          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.fillRect(u * 0.06, -u * 0.1, u * 0.035, u * 0.07)
          ctx.restore()
        }
        // nostril slits near snout
        ctx.fillStyle = 'rgba(2,30,20,0.9)'
        ctx.beginPath(); ctx.arc(u * 0.62, -u * 0.12, u * 0.045, 0, 7); ctx.fill()
        ctx.beginPath(); ctx.arc(u * 0.62, u * 0.12, u * 0.045, 0, 7); ctx.fill()
        // fangs (white, jutting forward-down/up past the jaw)
        ctx.fillStyle = '#fff3c4'
        ctx.shadowColor = 'rgba(255,243,196,0.7)'; ctx.shadowBlur = 6
        for (const sgn of [1, -1]) {
          ctx.beginPath()
          ctx.moveTo(u * 0.55, sgn * u * 0.3)
          ctx.lineTo(u * 0.72, sgn * u * 0.3)
          ctx.lineTo(u * 0.6, sgn * u * 0.52)
          ctx.closePath(); ctx.fill()
        }
        ctx.shadowBlur = 0
        // tongue — longer, blood red, flicks often
        const cyc2 = g.elapsed % 1600
        if (g.alive && cyc2 < 380) {
          const ext = Math.sin((cyc2 / 380) * Math.PI) * u * 1.05
          const tx2 = u * (0.9 + ext / u), ty2 = 0
          ctx.strokeStyle = '#ff2244'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'
          ctx.shadowColor = 'rgba(255,34,68,0.8)'; ctx.shadowBlur = 8
          ctx.beginPath(); ctx.moveTo(u * 0.9, 0); ctx.lineTo(tx2, ty2)
          ctx.moveTo(tx2, ty2); ctx.lineTo(tx2 + u * 0.22, -u * 0.14)
          ctx.moveTo(tx2, ty2); ctx.lineTo(tx2 + u * 0.22, u * 0.14)
          ctx.stroke()
          ctx.shadowBlur = 0
        }
        ctx.restore()
      }

      // rings
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]
        ctx.globalAlpha = Math.max(r.life, 0) * 0.8
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
        ctx.strokeStyle = r.color; ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      // particles
      for (const p of particles) {
        ctx.globalAlpha = Math.max(Math.min(p.life, 1), 0)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
        ctx.globalAlpha = 1
      }
      // floaters
      for (const f of floaters) {
        ctx.globalAlpha = Math.max(f.life, 0)
        ctx.font = f.pons ? `800 ${cell * 0.42}px "JetBrains Mono", monospace` : `800 ${cell * 0.6}px "JetBrains Mono", monospace`
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.strokeText(f.text, f.x, f.y)
        ctx.fillStyle = f.pons ? '#ffd166' : (f.gold ? '#ffd166' : '#7dffc4')
        ctx.fillText(f.text, f.x, f.y)
        ctx.globalAlpha = 1
      }
      // death flash
      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 235, 235, ${flash * 0.5})`
        ctx.fillRect(0, 0, W, H)
      }
      ctx.restore()
    }

    function frame(now) {
      raf = requestAnimationFrame(frame)
      let dt = Math.min(now - last, 50)
      last = now
      const ev = tick(demo && g.alive ? (autopilot(g), g) : g, dt)
      // demo: after death, let the boom play out, then restart fresh
      if (demo && ev.died) demoDeadAt = now + 1600
      if (demo && demoDeadAt && now > demoDeadAt) {
        g = seedDemo(createGame()); demoDeadAt = 0
        particles.length = 0; floaters.length = 0; rings.length = 0
      }

      for (const b of ev.popped) { burst(b); if (!demo) sfx.pop(b.gold, g.pops) }
      for (const b of ev.bombGone || []) rings.push({ x: (b.x + 0.5) * cell, y: (b.y + 0.5) * cell, r: cell * 0.3, r1: cell * 1.4, life: 0.8, color: '#5a6b62' })
      if (ev.bombSpawned?.length && !demo) sfx.warn()
      if (ev.boom) { boomFx((ev.boom.x + 0.5) * cell, (ev.boom.y + 0.5) * cell); if (!demo) sfx.boom() }
      if (ev.died) {
        shake = Math.max(shake, 1)
        if (!demo) sfx.die()
        if (!ended && !demo) {
          ended = true
          endTimer = setTimeout(() => cbRef.current.onEnd({ score: g.score, earned: g.earned, length: g.snake.length, time: Math.round(g.elapsed / 1000), reason: ev.died }), 750)
        }
      }
      // bomb ember rain
      emberAcc += dt
      if (emberAcc > 90) {
        emberAcc = 0
        for (const b of g.bombs) {
          const age = g.elapsed - b.born
          if (age < BOMB_GRACE || age > BOMB_LIFE) continue
          const rad = cell * 0.46
          particles.push({ x: (b.x + 0.5) * cell + rad * 0.8 + (Math.random() - 0.5) * 4, y: (b.y + 0.5) * cell - rad * 1.5, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 40, life: 0.7, size: 2, color: '#ffb347', grav: 160 })
        }
      }
      // fx physics
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000
        p.vy += (p.grav || 260) * dt / 1000
        p.life -= dt / 620
        if (p.life <= 0) particles.splice(i, 1)
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]
        r.r += (r.r1 - r.r) * Math.min(1, dt / 90)
        r.life -= dt / 380
        if (r.life <= 0) rings.splice(i, 1)
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i]
        f.y -= 52 * dt / 1000
        f.life -= dt / 900
        if (f.life <= 0) floaters.splice(i, 1)
      }
      shake = Math.max(0, shake - dt / 320)
      flash = Math.max(0, flash - dt / 260)

      draw()

      statAcc += dt
      if (statAcc > 120 && !demo) {
        statAcc = 0
        cbRef.current.onStats({ score: g.score, earned: g.earned, length: g.snake.length, speed: Math.round((145 - g.moveInterval) / 0.83), time: Math.round(g.elapsed / 1000) })
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(endTimer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      cv.removeEventListener('touchstart', onTouchStart)
      cv.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas ref={cvRef} className="game" />
    </div>
  )
}
