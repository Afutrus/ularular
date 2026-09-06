# SNAKESTACK

Snake meets play-to-earn. Steer the snake, eat rising token bubbles, dodge **bombs**, and every
finished run pays a random **0.01–0.05 $PONS** into your vault. Edges are **portals** (you wrap) —
what kills you: your own tail, or an armed bomb.

**Reward token: $PONS** on Robinhood Chain (4663) — CA `0x39dBED3a2bd333467115dE45665cC57F813C4571`.

**Status: PROTOTYPE.** The ledger is play-money in `localStorage` (key `snakestack_ledger_v2`,
balances in PONS with 2 decimals). **Withdrawals are manual**: the user presses WITHDRAW, the claim
is stored with `status: queued`, and the operator pays out from the treasury off-band. Nothing moves
automatically.

## Economy

- **Payout**: every banked run (death or ESC-bailout with score > 0) rolls `rollReward()` →
  uniform random **0.01–0.05 PONS**, 2 decimals. Pons is expensive, so the range is deliberately tight.
- **Bubbles** drive SCORE, not payout: normal 1–9 pts (~91%), gold 25–100 pts (~9%, rises 2× faster).
- **Bombs**: static mines, first at 7 s, then every 5–10 s, max 3 on field. Grace 1.2 s (blinking,
  harmless) → lethal until expiry at 14 s. Never spawn within 6 cells (Manhattan) of the head or on
  bubbles. Death reason `BOMB` still pays the run reward.
- Score counts head hits at full value, body grazes at half. Speed scales with length
  (145 ms → 62 ms per cell). Spawn rate accelerates over run time.

## Stack

- Vite + React 18 (component tree: `App` → `MatrixRain` / `GameCanvas` / panels)
- Canvas 2D renderer with glow bubbles, bomb grace/lethal states, particle bursts, screen shake
- `src/game/engine.js` — **pure logic, zero DOM**: grid, bombs, bubbles, `rollReward()`, autopilot
- `src/game/ledger.js` — PONS balances (2 dp), `bankRun()` (rolls/accepts reward), `claim()`
  (manual withdraw → `queued`), migration from legacy v1 integer ledger (÷1000)
- `src/game/wallet.js` — EIP-1193 connect (MetaMask/Rabby), auto switch + auto add **Robinhood Chain 4663** (`0x1237`, RPC `rpc.mainnet.chain.robinhood.com`, native ETH, explorer `robinhoodchain.blockscout.com`)

## Withdraw flow (manual)

1. User plays; each finished run adds 0.01–0.05 PONS to `pending`
2. Vault panel shows pending; **⇩ WITHDRAW** enabled only when pending > 0
3. Claim blocked without wallet connect / wrong network (must be on RH 4663)
4. Pressing WITHDRAW moves `pending → claimed`, logs `claims[]` entry `status: queued`
5. Operator reviews queued claims and pays PONS from treasury manually

## Run

```bash
npm install
npm run dev      # dev server
npm run sim      # headless invariants (autopilot + bombs + reward/ledger)
npm run build    # -> dist/
npm run preview  # :8095, Cache-Control: no-store
```

## Headless verification

`npm run sim` runs the autopilot snake through simulated time and asserts 29 invariants (growth
accounting, portal wrap, self-collision, bomb grace/lethal/fairness/avoidance, reward range
0.01–0.05 @2dp, manual-withdraw ledger semantics). Last run: **29/29 checks green**.

## On-chain path (not built yet)

1. Server-side score attestation (the current client-side ledger is trivially editable)
2. Queue export for the operator → batch PONS transfers from treasury
3. Signature/merkle claim contract → user claims with the wallet bound in the vault
4. Per-wallet daily caps + rate limits before anything real is funded
