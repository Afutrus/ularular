# SnakeStack Buyback Flywheel — fee → $PONS → vault

Status: **test build**. Vault claims are LIVE, trade fees + buyback are DESIGNED (not deployed).

## The loop

```
$STAK trading ──fees──▶ BUYBACK ──$PONS──▶ VAULT ──claims──▶ PLAYERS ──play──▶ (volume ─▶ fees…)
  (SOON)                (DESIGN)              (LIVE)             (LIVE)
```

1. **TRADE** — $STAK (official token, SOON) trading collects a protocol fee.
2. **BUYBACK** — collected fees buy $PONS on the open market.
3. **VAULT** — bought $PONS is funded into `SnakeStackClaim`, the claim vault.
4. **PLAY** — players earn $PONS bubble-by-bubble and claim from the vault (paying their own gas).
5. Player activity drives $STAK volume → more fees → more buyback. Loop closes.

## Token roles (locked)

| Token | Role | Address (RH 4663) | Status |
|---|---|---|---|
| $PONS | reward token — what players earn & claim | `0x39dBED3a2bd333467115dE45665cC57F813C4571` | LIVE |
| $STAK | official project token — future fee source | TBD | SOON |

Never mix them: fees are collected in/around $STAK trading, payouts are always $PONS.

## Contract inventory

| Contract | Address | Status |
|---|---|---|
| PONS (ERC20, 18 dec) | `0x39dBED3a2bd333467115dE45665cC57F813C4571` | LIVE |
| SnakeStackClaim (vault, EIP-712) | deployed on Robinhood Chain (address undisclosed) | LIVE (trial setup) |
| $STAK token | — | TODO |
| Fee collector + buyback executor | — | TODO (see phases) |

Vault parameters (live): `maxPerClaim = 10 PONS`, voucher deadline 15 min,
signer rate-limit 60s/player (server-side), min withdraw 0.01 PONS (frontend).

## Buyback phases

**Phase 1 — operator-run (recommended to start).** Operator collects trade fees
periodically, market-buys $PONS, then funds the vault: `approve(VAULT, amount)`
followed by `fund(amount)` (or a plain `transfer(VAULT, amount)` — anything the
vault holds becomes claimable). No new contract needed. Run it on a schedule
(daily/weekly) and publish each funding tx.

**Phase 2 — automated.** Deploy a fee-collector contract that receives fees and
either (a) market-buys PONS via a DEX router and forwards to the vault, or
(b) holds fees for a keeper bot to execute the swap. Phase 2 needs: $STAK live
with fee routing, a liquid PONS market (so buys don't move price violently),
and a cap per buyback transaction.

## Operator runbook

- **Fund vault:** `PONS.transfer(VAULT, amount)` from treasury. Start small; scale with claim volume.
- **Monitor:** `vaultBalance()` vs daily `totalClaimed` growth. Fund before it hits ~20% of weekly payout.
- **Rotate signer:** `setSigner(new)` (owner only) if the hot key leaks; vouchers from the old key stop working immediately.
- **Pause:** `pause()` freezes all claims; `unpause()` resumes. Use on exploit suspicion.
- **Sweep:** `withdrawTreasury(to, amount)` (owner only) pulls leftover PONS any time — no lock.
- **Ownership:** trial uses one wallet for owner+signer. Production: owner = cold wallet/multisig, signer = backend hot key, nothing else.

## Security notes

- Vault never mints — it only pays out PONS it holds. Worst case loss = vault balance.
- `maxPerClaim` bounds signer-key damage. Nonce + deadline kill replays.
- Test gaps (close before production): voucher server trusts frontend-reported earnings (needs server-side ledger + anti-cheat), voucher endpoint must sit behind an HTTPS reverse proxy + firewall.

## Claim flow

1. Player hits WITHDRAW — the backend signs a short-lived voucher for their earned $PONS.
2. Player submits `claim()` from their own wallet and pays their own gas.
3. Vault verifies the signature on-chain and sends $PONS straight to the player.
4. No vouchers, no payout: vouchers expire in 15 minutes and die on use.
