import React, { useEffect, useRef, useState, useCallback } from 'react'
const AbyssBackground = React.lazy(() => import('./components/AbyssBackground.jsx'))
import GameCanvas from './components/GameCanvas.jsx'
import bgAbyss from './assets/bg-abyss.jpg'
import logoViper from './assets/logo-viper.jpg'
import { loadLedger, saveLedger, bankRun, claimChained, fmt, isAddress } from './game/ledger.js'
import { TOKEN_SYMBOL, TOKEN_CA, STACK_SYMBOL, STACK_NAME, STACK_CA, BUBBLE_PONS_MIN, BUBBLE_PONS_MAX, GOLD_PONS_MIN, GOLD_PONS_MAX } from './game/engine.js'
import { getProvider, connectWallet, switchToRobinhood, RH_CHAIN } from './game/wallet.js'
import { sfx } from './game/sound.js'
import { getVaultInfo, claimOnChain } from './game/claim.js'
import DocsPage from './components/DocsPage.jsx'
import VaultMark from './components/VaultMark.jsx'

const BrandMark = () => (
  <img className="brand-mark" src={logoViper} alt="SnakeStack viper logo" width="32" height="32" />
)

export default function App() {
  const [screen, setScreen] = useState(() => (typeof window !== 'undefined' && window.location.hash === '#/docs' ? 'docs' : 'menu')) // menu | play | dead | docs
  const goDocs = useCallback(() => { try { window.location.hash = '#/docs' } catch {}; setScreen('docs') }, [])
  const goMenu = useCallback(() => { try { window.history.replaceState(null, '', window.location.pathname + window.location.search) } catch {}; setScreen('menu') }, [])
  useEffect(() => {
    const onHash = () => { if (window.location.hash === '#/docs') setScreen('docs') }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [ledger, setLedger] = useState(() => loadLedger())
  const [stats, setStats] = useState({ score: 0, earned: 0, length: 3, speed: 0, time: 0 })
  const [lastRun, setLastRun] = useState(null)
  const [runId, setRunId] = useState(0)
  const [toast, setToast] = useState(null)
  const [conn, setConn] = useState(null) // {account, chainId, onRobinhood}
  const [connecting, setConnecting] = useState(false)
  const [muted, setMuted] = useState(sfx.muted)
  const toggleMute = () => { sfx.unlock(); setMuted(sfx.toggle()) }
  const [claiming, setClaiming] = useState(false)
  const [vault, setVault] = useState({ balance: null, maxClaim: null, paused: null })
  const [showVault, setShowVault] = useState(false)
  const toggleVault = () => { sfx.click(); setShowVault((v) => !v) }
  const refreshVault = useCallback(() => {
    getVaultInfo().then(setVault).catch(() => {})
  }, [])
  useEffect(() => { refreshVault() }, [refreshVault])
  const statsRef = useRef(stats)
  statsRef.current = stats
  const toastTimer = useRef(null)

  const showToast = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // ---- wallet provider listeners ----
  useEffect(() => {
    const p = getProvider()
    if (!p) return
    const onAccounts = (acc) => {
      setConn((c) => {
        if (!acc || acc.length === 0) return null
        return c ? { ...c, account: acc[0] } : null
      })
    }
    const onChain = async (cid) => {
      setConn((c) => (c ? { ...c, chainId: typeof cid === 'string' ? cid : RH_CHAIN.chainId, onRobinhood: (typeof cid === 'string' ? cid : '').toLowerCase() === RH_CHAIN.chainId } : c))
    }
    p.on?.('accountsChanged', onAccounts)
    p.on?.('chainChanged', onChain)
    return () => { p.removeListener?.('accountsChanged', onAccounts); p.removeListener?.('chainChanged', onChain) }
  }, [])

  const doConnect = async () => {
    setConnecting(true)
    try {
      const r = await connectWallet()
      setConn(r)
      if (r.account) {
        const l = loadLedger()
        l.wallet = r.account
        setLedger(saveLedger(l))
      }
      showToast(r.onRobinhood ? `connected · ${RH_CHAIN.chainName}` : 'connected — wrong network, hit SWITCH')
    } catch (e) {
      showToast(e?.message === 'no-wallet' ? 'no wallet found — install MetaMask / Rabby' : e?.message || 'connect failed', 'err')
    } finally {
      setConnecting(false)
    }
  }
  const doSwitch = async () => {
    try {
      await switchToRobinhood()
      setConn((c) => (c ? { ...c, chainId: RH_CHAIN.chainId, onRobinhood: true } : c))
      showToast(`switched to ${RH_CHAIN.chainName} ✓`)
    } catch (e) {
      showToast(e?.message || 'switch rejected', 'err')
    }
  }
  const disconnect = () => { setConn(null) }

  // ---- run lifecycle ----
  const startRun = () => {
    sfx.unlock(); sfx.start()
    setStats({ score: 0, earned: 0, length: 3, speed: 0, time: 0 })
    setLastRun(null)
    setRunId((r) => r + 1)
    setScreen('play')
  }
  const bankCurrent = useCallback(() => {
    const s = statsRef.current
    if (s.earned > 0 || s.score > 0) {
      const l = bankRun(loadLedger(), { score: s.score, reward: s.earned || 0, length: s.length, time: s.time, reason: 'QUIT' })
      setLedger(saveLedger(l))
    }
  }, [])
  const onEnd = useCallback((run) => {
    const full = { ...run, reward: run.earned || 0 }
    setLastRun(full)
    const l = bankRun(loadLedger(), full)
    setLedger(saveLedger(l))
    setScreen('dead')
  }, [])
  const quitToMenu = () => { bankCurrent(); setScreen('menu') }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && screen === 'play') { e.preventDefault(); quitToMenu() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen])

  const doClaim = async () => {
    if (!conn?.account) { showToast('connect a wallet first', 'err'); return }
    if (!conn.onRobinhood) { showToast('switch to Robinhood Chain first', 'err'); return }
    const l0 = loadLedger()
    if (l0.pending < 0.01) { showToast('nothing to withdraw (min 0.01)', 'err'); return }
    setClaiming(true)
    try {
      const r = await claimOnChain(getProvider(), conn.account, l0.pending.toFixed(3), (m) => showToast(m))
      setLedger(claimChained(loadLedger(), { amount: r.amount, txHash: r.txHash, wallet: conn.account }))
      showToast(`claimed ${fmt(Number(r.amount))} ${TOKEN_SYMBOL} on-chain ✓`)
      refreshVault()
    } catch (e) {
      showToast(e?.message || 'claim failed', 'err')
    } finally {
      setClaiming(false)
    }
  }

  const stackLive = isAddress(STACK_CA)
  const copyCA = async () => {
    try { await navigator.clipboard.writeText(TOKEN_CA); showToast(`${TOKEN_SYMBOL} contract address copied ✓`) }
    catch { showToast(TOKEN_CA) }
  }
  const copyStackCA = async () => {
    if (!stackLive) { showToast('contract address dropping soon'); return }
    try { await navigator.clipboard.writeText(STACK_CA); showToast(`${STACK_SYMBOL} contract address copied ✓`) }
    catch { showToast(STACK_CA) }
  }

  const pending = ledger.pending
  const inGame = screen === 'play' || screen === 'dead'

  return (
    <>
      <div className="bg-photo" style={{ backgroundImage: `url(${bgAbyss})` }} />
      <div className="bg-mesh" />
      <React.Suspense fallback={null}>
        <AbyssBackground />
      </React.Suspense>
      <div className="bg-vig" />
      <div className="bg-scan" />
      <div className="bg-noise" />

      <div className="shell">
        <header className="top rise">
          <div className="brand"><BrandMark /><span className="b1">SNAKE</span><span className="b2">STACK</span></div>
          <div className="top-right">
            <button className="chip" onClick={toggleMute} title={muted ? 'unmute sound' : 'mute sound'}>{muted ? '🔇 muted' : '🔊 sound'}</button>
            <button className="chip" onClick={goDocs} title="buyback flywheel docs">📄 DOCS</button>
            <button className="chip ca-chip" onClick={copyCA} title={`copy ${TOKEN_SYMBOL} contract address`}>{TOKEN_SYMBOL} · {TOKEN_CA.slice(0, 6)}…{TOKEN_CA.slice(-4)} ⧉</button>
            {conn?.account && <span className={`chip ${conn.onRobinhood ? 'gold' : 'red'}`}>{conn.account.slice(0, 6)}…{conn.account.slice(-4)}</span>}
          </div>
        </header>

        {screen === 'menu' && (
          <main className="menu">
            <section className="hero">
              <img className="hero-logo rise d1" src={logoViper} alt="SnakeStack viper mascot" />
              <h1 className="wordmark rise d2">SNAKE<em>STACK</em></h1>
              <p className="tag rise d3"><b className="tag-lead">Eat the bubbles. Dodge the bombs.</b>Every bubble holds <b>{fmt(BUBBLE_PONS_MIN)}–{fmt(BUBBLE_PONS_MAX)} {TOKEN_SYMBOL}</b> (gold {fmt(GOLD_PONS_MIN)}–{fmt(GOLD_PONS_MAX)}) — survive longer, stack more.</p>
              <div className="hero-cta rise d4">
                <button className="btn primary big play-cta" onClick={startRun}>▶ PLAY</button>
                {pending > 0 && <span className="chip gold">PENDING +{fmt(pending)} {TOKEN_SYMBOL}</span>}
                {ledger.runs === 0 && <span className="nudge">no runs yet — play once to set your first score</span>}
              </div>
              <div className="hero-stats rise d5">
                <div className="tile"><label>BEST SCORE</label><b>{fmt(ledger.best)}</b></div>
                <div className="tile"><label>BANKED</label><b className="amber">{fmt(ledger.lifetime)} {TOKEN_SYMBOL}</b></div>
                <div className="tile"><label>RUNS</label><b>{ledger.runs}</b></div>
                <div className="tile"><label>WITHDRAWN</label><b className="mint">{fmt(ledger.claimed)} {TOKEN_SYMBOL}</b></div>
              </div>
              <div className="bezel demo rise d5" style={{ width: '100%' }}>
                <div className="core">
                  <div className="panel-label">PREVIEW <span className="tag">autopilot · not your stats</span></div>
                  <GameCanvas demo />
                </div>
              </div>
            </section>

            <aside className="rail">
              <div className="bezel rise d3">
                <div className="core vault-core">
                  <div className="panel-label">VAULT</div>
                  <div className="pending"><b>{fmt(pending)}</b><span>{TOKEN_SYMBOL} PENDING</span></div>
                  <div className="vault-actions">
                    {conn?.account ? (
                      <div className="conn-line">
                        <div className="conn-box">
                          <span className={`dot ${conn.onRobinhood ? 'on' : 'off'}`} />
                          <span className="addr">{conn.account.slice(0, 8)}…{conn.account.slice(-4)}</span>
                          <span className={`net ${conn.onRobinhood ? 'ok' : 'bad'}`}>{conn.onRobinhood ? 'ROBINHOOD ✓' : 'WRONG NET'}</span>
                        </div>
                        {!conn.onRobinhood && <button className="btn gold" onClick={doSwitch}>⚡ SWITCH</button>}
                        <button className="btn ghost" onClick={disconnect} title="disconnect (local only)">✕</button>
                      </div>
                    ) : (
                      <button className="btn secondary" onClick={doConnect} disabled={connecting}>
                        {connecting ? '…' : '🔗 CONNECT WALLET'}
                      </button>
                    )}
                    <button className="btn gold" onClick={doClaim} disabled={pending <= 0 || claiming}>⇩ {claiming ? 'CLAIMING…' : `WITHDRAW ${pending > 0 ? fmt(pending) : ''} ${TOKEN_SYMBOL}`}</button>
                  </div>
                  <div className="vault-card" onClick={toggleVault} title={showVault ? 'hide vault balance' : 'reveal vault balance'}>
                    <VaultMark size={76} />
                    <div className="vault-meta">
                      <b className="vault-name">VAULT</b>
                      {showVault
                        ? <span className="vault-bal">holds <b className="amber">{vault.balance == null ? '…' : fmt(vault.balance)} {TOKEN_SYMBOL}</b>{vault.paused ? ' · PAUSED' : ''}</span>
                        : <span className="nudge">tap to reveal balance</span>}
                    </div>
                  </div>
                  <div className="vault-note">You pay your own gas, {TOKEN_SYMBOL} lands straight in your wallet.</div>
                  {ledger.claims.length > 0 && (
                    <div className="claim-list">
                      {ledger.claims.slice(-3).reverse().map((c, i) => (
                        <div key={i} className="claim-row">
                          <span>{new Date(c.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>{fmt(c.amount)} {TOKEN_SYMBOL}</span>
                          <span className="st">{c.status}{c.txHash ? (<> · <a href={`${RH_CHAIN.blockExplorerUrls[0]}/tx/${c.txHash}`} target="_blank" rel="noreferrer">◉ TX</a></>) : null}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bezel rise d4">
                <div className="core token-core">
                  <div className="panel-label">TOKEN <span className="tag">{stackLive ? 'DEPLOYED' : 'SOON'}</span></div>
                  <div className="token-head">
                    <b>{STACK_SYMBOL}</b><span>{STACK_NAME} · OFFICIAL</span>
                  </div>
                  {stackLive ? (
                    <>
                      <button className="token-ca" onClick={copyStackCA} title="click to copy contract address">
                        <span className="token-ca-addr">{STACK_CA}</span>
                        <span className="token-copy">⧉ COPY</span>
                      </button>
                      <div className="token-links">
                        <a href={`${RH_CHAIN.blockExplorerUrls[0]}/address/${STACK_CA}`} target="_blank" rel="noreferrer">◉ EXPLORER</a>
                        <button className="linklike" onClick={copyStackCA}>⧉ COPY CA</button>
                      </div>
                    </>
                  ) : (
                    <div className="token-soon">CONTRACT DROPPING SOON</div>
                  )}
                  <div className="vault-note">The official token of SnakeStack.{stackLive ? '' : ' Contract address appears here at launch.'}</div>
                </div>
              </div>

              <div className="bezel rise d4">
                <div className="core">
                  <div className="panel-label">HOW TO PLAY</div>
                  <ul className="timeline">
                    <li><b>MOVE</b><span>WASD / arrows / swipe — edges are portals</span></li>
                    <li><b>EAT</b><span>Bubbles grow you and boost your score</span></li>
                    <li className="gold"><b>GOLD</b><span>Rare coins pay 25–100 and rise fast</span></li>
                    <li className="red"><b>BOMB</b><span>Mines arm after a blink — touch = boom</span></li>
                    <li className="gold"><b>WITHDRAW</b><span>Every banked run pays {TOKEN_SYMBOL} — claim on-chain, you pay gas</span></li>
                    <li><b>SOUND</b><span>Toggle 🔊 in the header — pops, gold chimes, booms</span></li>
                  </ul>
                </div>
              </div>

              <div className="bezel rise d5">
                <div className="core">
                  <div className="panel-label">ECONOMY <span className="tag">{TOKEN_SYMBOL} payout</span></div>
                  <ul className="how">
                    <li><b className="mint">BUBBLE</b> every bubble → <b className="gold">{fmt(BUBBLE_PONS_MIN)}–{fmt(BUBBLE_PONS_MAX)} {TOKEN_SYMBOL}</b> (gold {fmt(GOLD_PONS_MIN)}–{fmt(GOLD_PONS_MAX)}) — earnings grow while you survive</li>
                    <li><b>SCORE</b> common 1–9 pts · gold 25–100 pts — chases best score, {TOKEN_SYMBOL} is the payout</li>
                    <li><b className="red">BOMB</b> death banks what you ate — short runs pay dust</li>
                    <li><b>WD</b> WITHDRAW = on-chain claim from the vault, you pay gas</li>
                  </ul>
                </div>
              </div>

              <div className="bezel rise d5">
                <div className="core">
                  <div className="panel-label">FLYWHEEL <span className="tag">trade fees → {TOKEN_SYMBOL} → vault</span></div>
                  <ul className="timeline">
                    <li className={stackLive ? '' : 'gold'}><b>TRADE</b><span>{STACK_SYMBOL} trading collects protocol fees{stackLive ? '' : ' — starts at token launch'}</span></li>
                    <li className="gold"><b>BUYBACK</b><span>Fees buy {TOKEN_SYMBOL} on the market — operator-run first, auto later</span></li>
                    <li><b className="mint">VAULT</b><span>Bought {TOKEN_SYMBOL} funds the claim vault — holds <b className="amber">{vault.balance == null ? '…' : fmt(vault.balance)} {TOKEN_SYMBOL}</b> now</span></li>
                    <li><b>PLAY</b><span>Your runs are paid from the vault — every trade refills it</span></li>
                  </ul>
                </div>
              </div>

              <div className="bezel rise d5">
                <div className="core">
                  <div className="panel-label">ROADMAP</div>
                  <ul className="how">
                    <li><b className="mint">v1 ✓</b> arcade + local {TOKEN_SYMBOL} ledger</li>
                    <li><b className="mint">v2 ✓</b> on-chain vault claims — you pay gas</li>
                    <li><b className="gold">v3</b> {STACK_SYMBOL} launch + trade fees → {TOKEN_SYMBOL} buyback</li>
                    <li><b>v4</b> daily leaderboard + server-attested scores</li>
                  </ul>
                </div>
              </div>
            </aside>
          </main>
        )}

        {screen === 'docs' && (
          <main className="menu">
            <DocsPage onBack={goMenu} />
          </main>
        )}

        {inGame && (
          <main className="play">
            <div className="cabinet bezel rise">
              <div className="core" style={{ padding: 10 }}>
                <GameCanvas key={runId} onStats={setStats} onEnd={onEnd} />
                <div className="hud">
                  <div><label>SCORE</label><b>{fmt(stats.score)}</b></div>
                  <div><label>PENDING {TOKEN_SYMBOL}</label><b className="amber">{fmt(pending)}</b></div>
                  <div><label>LENGTH</label><b className="mint">{stats.length}</b></div>
                  <div><label>EARNED</label><b className="amber">+{fmt(stats.earned)}</b></div>
                  <div className="hud-time"><label>TIME</label><b>{stats.time}s</b></div>
                </div>
                <div className="hint">WASD / arrows / swipe · edges = portals · ESC banks &amp; exits</div>
              </div>
              {screen === 'dead' && lastRun && (
                <div className="dead-overlay">
                  <div className="dead-panel">
                    <div className="core">
                      <h2 className="dead-title">GAME OVER<span className="cursor">_</span></h2>
                      <div className="dead-reason">{lastRun.reason === 'SELF' ? 'you ate your own tail' : lastRun.reason === 'BOMB' ? 'you ran into a bomb 💥' : 'run ended'}</div>
                      <div className="stat-row">
                        <div><label>SCORE</label><b>{fmt(lastRun.score)}</b></div>
                        <div><label>RUN REWARD</label><b className="amber">+{fmt(lastRun.reward)} {TOKEN_SYMBOL}</b></div>
                        <div><label>LENGTH</label><b>{lastRun.length}</b></div>
                        <div><label>TIME</label><b>{lastRun.time}s</b></div>
                      </div>
                      <div className="dead-actions">
                        <button className="btn primary" onClick={startRun}>↻ RETRY</button>
                        <button className="btn ghost" onClick={() => setScreen('menu')}>VAULT</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <aside className="play-rail">
              <div className="bezel rise d1">
                <div className="core">
                  <div className="panel-label">LIVE</div>
                  <div style={{ padding: '6px 0' }}>
                    <div className="live-stat">PENDING<b className="amber">{fmt(pending)} {TOKEN_SYMBOL}</b></div>
                    <div className="live-stat">BEST<b>{fmt(ledger.best)}</b></div>
                    <div className="live-stat">RUNS<b>{ledger.runs}</b></div>
                  </div>
                </div>
              </div>
              <div className="bezel rise d2">
                <div className="core">
                  <div className="panel-label">HAZARDS</div>
                  <ul className="how">
                    <li><b className="red">BOMB</b> blinks harmless 1.2s, then lethal</li>
                    <li><b>TAIL</b> your own body still kills</li>
                    <li><b>PORTAL</b> walls are safe — they wrap</li>
                  </ul>
                </div>
              </div>
              <button className="btn ghost" onClick={quitToMenu}>⏹ BANK &amp; EXIT</button>
            </aside>
          </main>
        )}

        <footer className="foot">SNAKESTACK · rewards in {TOKEN_SYMBOL} · on-chain claims</footer>
      </div>

      {toast && <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  )
}
