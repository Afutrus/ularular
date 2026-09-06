// Hand-drawn SVG vault door emblem — zero-asset, matches the abyss gold/mint theme.
export default function VaultMark({ size = 84 }) {
  const bolts = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2
    return { x: 50 + 40 * Math.cos(a), y: 50 + 40 * Math.sin(a) }
  })
  const spokes = [0, 60, 120].map((deg) => `rotate(${deg} 50 50)`)
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="vault-mark" aria-label="vault">
      <defs>
        <radialGradient id="vm-face" cx="42%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#2a3440" />
          <stop offset="55%" stopColor="#121a21" />
          <stop offset="100%" stopColor="#05080b" />
        </radialGradient>
        <linearGradient id="vm-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="45%" stopColor="#ffc53d" />
          <stop offset="100%" stopColor="#8a5a00" />
        </linearGradient>
        <filter id="vm-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="50" cy="50" r="47" fill="#04070a" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="url(#vm-gold)" strokeWidth="2.5" filter="url(#vm-glow)" />
      <circle cx="50" cy="50" r="34" fill="url(#vm-face)" stroke="rgba(255,197,61,0.35)" strokeWidth="1" />
      {bolts.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y} r="3.4" fill="#0b1116" stroke="url(#vm-gold)" strokeWidth="1.4" />
          <circle cx={b.x - 1} cy={b.y - 1} r="0.9" fill="rgba(255,243,196,0.8)" />
        </g>
      ))}
      {spokes.map((t, i) => (
        <rect key={i} x="47" y="18" width="6" height="64" rx="3" fill="#1c2630" stroke="rgba(255,197,61,0.5)" strokeWidth="1" transform={t} />
      ))}
      <circle cx="50" cy="50" r="13" fill="#0b1116" stroke="url(#vm-gold)" strokeWidth="2" filter="url(#vm-glow)" />
      <circle cx="50" cy="50" r="13" fill="none" stroke="rgba(0,255,163,0.55)" strokeWidth="1" strokeDasharray="3 4" />
      <path d="M50 43 L55 50 L50 57 L45 50 Z" fill="#00ffa3" opacity="0.9" />
    </svg>
  )
}
