// EIP-1193 wallet connect — Robinhood Chain (4663), auto switch + auto add network.
export const RH_CHAIN = {
  chainId: '0x1237', // 4663
  chainName: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
  blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
}

export function getProvider() {
  return (typeof window !== 'undefined' && (window.ethereum || window.metaMaskWeb3 || null)) || null
}

export async function getChainId(p) {
  try { return await p.request({ method: 'eth_chainId' }) } catch { return null }
}

export async function switchToRobinhood(p) {
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: RH_CHAIN.chainId }] })
    return true
  } catch (err) {
    // 4902 = chain unknown to wallet -> add it
    if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
      await p.request({ method: 'wallet_addEthereumChain', params: [RH_CHAIN] })
      return true
    }
    return false // user rejected or wallet error
  }
}

export async function connectWallet() {
  const p = getProvider()
  if (!p) throw new Error('no-wallet')
  const accounts = await p.request({ method: 'eth_requestAccounts' })
  let chainId = await getChainId(p)
  let switched = true
  if (chainId !== RH_CHAIN.chainId) {
    switched = await switchToRobinhood(p)
    chainId = await getChainId(p)
  }
  return { account: accounts[0] || null, chainId, onRobinhood: chainId === RH_CHAIN.chainId, switched }
}

export const shortAddr = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '')
