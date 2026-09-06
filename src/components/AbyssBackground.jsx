import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

// AbyssBackground — premium GPU replacement for the old glyph rain.
// Layer 1: fullscreen animated fog shader (mint side-mist + gold horizon band, dark top for UI).
// Layer 2: rising ember particles (mint/gold, twinkle, sway) — motion goes UP, never drips.
// Budget: 2 draw calls, 0 textures, 0 post passes, DPR capped at 1.5, paused when tab hidden.
const FOG_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FOG_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uMouse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
  vec2 m = uMouse * 0.06; // parallax drift
  float t = uTime * 0.05;
  float n = fbm(vec2(p.x * 1.6 + m.x, p.y * 1.2 - t)
              + fbm(vec2(p.x * 2.2 - t * 0.6, p.y * 2.0 + m.y)) * 0.6);

  // side mist: stronger at left/right edges, low half of screen
  float side = smoothstep(0.05, 0.85, abs(p.x));
  float low = smoothstep(0.55, -0.15, p.y);
  float mist = side * low * smoothstep(0.35, 0.75, n);

  // gold horizon band (matches the abyss photo seam)
  float band = exp(-pow((p.y + 0.22) * 6.0, 2.0)) * (0.4 + 0.6 * n);

  // keep top-center dark so UI stays readable
  float keepDark = smoothstep(0.5, -0.3, p.y) * 0.85 + 0.15;

  vec3 mint = vec3(0.0, 1.0, 0.64);
  vec3 gold = vec3(1.0, 0.77, 0.24);
  vec3 col = mist * mint * 0.5 * keepDark
           + band * gold * 0.55 * smoothstep(0.9, 0.2, abs(p.x));

  float vig = smoothstep(1.25, 0.25, length(p * vec2(0.8, 1.0)));
  col *= mix(0.4, 1.0, vig);

  float alpha = clamp(mist * 0.75 + band * 0.6, 0.0, 0.85);
  gl_FragColor = vec4(col, alpha);
}
`

const EMBER_VERT = /* glsl */`
attribute vec4 aSeed; // speed, phase, size, colorMix
uniform float uTime;
uniform vec2 uMouse;
uniform float uPR;
varying float vTw;
varying float vMix;
void main() {
  float y = fract(position.y + uTime * (0.02 + aSeed.x * 0.05) + aSeed.y);
  float x = position.x + sin(uTime * (0.3 + aSeed.x) + aSeed.y * 6.28) * 0.08;
  vec2 pos = vec2(x + uMouse.x * 0.05 * (0.3 + aSeed.x), y * 2.0 - 1.0);
  vTw = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed.x * 2.0) + aSeed.y * 40.0);
  vMix = aSeed.w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 0.0, 1.0);
  gl_PointSize = (1.5 + aSeed.z * 3.0) * uPR * (0.6 + 0.4 * vTw);
}
`

const EMBER_FRAG = /* glsl */`
precision highp float;
varying float vTw;
varying float vMix;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * (0.25 + 0.75 * vTw);
  vec3 mint = vec3(0.0, 1.0, 0.64);
  vec3 gold = vec3(1.0, 0.77, 0.24);
  vec3 col = mix(mint, gold, step(0.82, vMix)) * (0.7 + 0.6 * vTw);
  gl_FragColor = vec4(col * a, a);
}
`

export default function AbyssBackground() {
  const ref = useRef(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
    } catch {
      host.style.display = 'none' // no WebGL: photo layer below still carries the scene
      return undefined
    }
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const fogUniforms = {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0, 0) },
    }
    const fog = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: FOG_VERT, fragmentShader: FOG_FRAG,
        uniforms: fogUniforms, transparent: true, depthWrite: false, depthTest: false,
      })
    )
    fog.frustumCulled = false
    scene.add(fog)

    const COUNT = window.innerWidth < 768 ? 120 : 220
    const pos = new Float32Array(COUNT * 3)
    const seed = new Float32Array(COUNT * 4)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 1.8
      pos[i * 3 + 1] = Math.random()
      pos[i * 3 + 2] = 0
      seed[i * 4] = Math.random()
      seed[i * 4 + 1] = Math.random()
      seed[i * 4 + 2] = Math.random()
      seed[i * 4 + 3] = Math.random()
    }
    const emberGeo = new THREE.BufferGeometry()
    emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    emberGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    const emberUniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uPR: { value: 1 },
    }
    const embers = new THREE.Points(
      emberGeo,
      new THREE.ShaderMaterial({
        vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG,
        uniforms: emberUniforms, transparent: true,
        depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      })
    )
    embers.frustumCulled = false
    scene.add(embers)

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }
    const onMouse = (e) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1
      mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('mousemove', onMouse, { passive: true })

    const resize = () => {
      const pr = Math.min(window.devicePixelRatio || 1, 1.5)
      renderer.setPixelRatio(pr)
      renderer.setSize(window.innerWidth, window.innerHeight)
      fogUniforms.uRes.value.set(window.innerWidth, window.innerHeight)
      emberUniforms.uPR.value = pr
    }
    resize()
    window.addEventListener('resize', resize)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const t0 = performance.now()
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const t = (now - t0) / 1000
      mouse.x += (mouse.tx - mouse.x) * 0.04
      mouse.y += (mouse.ty - mouse.y) * 0.04
      fogUniforms.uTime.value = t
      emberUniforms.uTime.value = t
      fogUniforms.uMouse.value.set(mouse.x, mouse.y)
      emberUniforms.uMouse.value.set(mouse.x, mouse.y)
      renderer.render(scene, camera)
    }
    if (reduced) {
      renderer.render(scene, camera) // one static frame, no motion
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('resize', resize)
      fog.geometry.dispose()
      fog.material.dispose()
      emberGeo.dispose()
      embers.material.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={ref} className="abyss" aria-hidden="true" />
}
