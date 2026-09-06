// On-chain claim wiring: voucher (backend signer) -> claim() via player wallet.
// Player pays gas. Node-safe (window access is lazy inside functions).
import { BrowserProvider, Contract, JsonRpcProvider, formatEther } from 'ethers'

export const VAULT_CA = '0x99bc672B3FB912ECB879aaD2E1042BE0835a9f13'
const PONS = '0x39dBED3a2bd333467115dE45665cC57F813C4571'
const RPC = 'https://rpc.mainnet.chain.robinhood.com'

const VAULT_ABI = [
  'function claim(uint256 amount, bytes32 nonce, uint256 deadline, bytes signature)',
  'function vaultBalance() view returns (uint256)',
  'function maxPerClaim() view returns (uint256)',
  'function usedNonce(bytes32) view returns (bool)',
  'function paused() view returns (bool)',
]

export function voucherUrl() {
  // Production: baked at build time (VITE_VOUCHER_URL=https://api.snakestack.lol/voucher).
  // No host/port fallback — nothing infra-related may leak into the bundle.
  const u = import.meta.env?.VITE_VOUCHER_URL
  if (!u) throw new Error('voucher backend not configured')
  return String(u)
}

export async function getVaultInfo() {
  const p = new JsonRpcProvider(RPC)
  const v = new Contract(VAULT_CA, VAULT_ABI, p)
  const [bal, cap, paused] = await Promise.all([v.vaultBalance(), v.maxPerClaim(), v.paused()])
  return { balance: Number(formatEther(bal)), maxClaim: Number(formatEther(cap)), paused }
}

async function requestVoucher(player, amountPons) {
  const r = await fetch(`${voucherUrl()}/voucher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player, amount: String(amountPons) }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'voucher rejected')
  return j // {amountWei, nonce, deadline, signature}
}

/// Full flow: voucher -> wallet tx -> receipt. onStep(msg) for toasts.
export async function claimOnChain(ethProvider, account, amountPons, onStep = () => {}) {
  onStep('requesting voucher…')
  const v = await requestVoucher(account, amountPons)
  onStep('voucher signed — confirm in wallet…')
  const bp = new BrowserProvider(ethProvider)
  const signer = await bp.getSigner()
  const vault = new Contract(VAULT_CA, VAULT_ABI, signer)
  const tx = await vault.claim(v.amountWei, v.nonce, v.deadline, v.signature)
  onStep(`claim sent ${tx.hash.slice(0, 10)}… — waiting…`)
  const rc = await tx.wait()
  if (rc?.status === 0) throw new Error('claim reverted on-chain')
  return { txHash: tx.hash, amount: amountPons }
}

export { PONS }
