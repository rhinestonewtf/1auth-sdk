import { useState, useEffect } from 'react'
import { createOneAuthProvider, OneAuthClient } from '@rhinestone/1auth'
import { parseUnits, encodeFunctionData, erc20Abi, type Address } from 'viem'

// Configuration for 1auth provider
// For local development, use http://localhost:3001
// For production, use https://passkey.1auth.box
const PROVIDER_URL = 'http://localhost:3001'
const CHAIN_ID = 84532 // Base Sepolia testnet
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const

function App() {
  // Track the connected wallet address
  const [address, setAddress] = useState<Address | null>(null)
  // Store the 1auth provider instance
  const [provider, setProvider] = useState<ReturnType<typeof createOneAuthProvider> | null>(null)
  // Track pending transaction state
  const [isPending, setIsPending] = useState(false)

  // Initialize the 1auth provider on mount
  // No clientId = Tier 3 (unregistered origin with trust confirmation)
  useEffect(() => {
    const client = new OneAuthClient({ providerUrl: PROVIDER_URL })
    const p = createOneAuthProvider({ client, chainId: CHAIN_ID })
    setProvider(p)
  }, [])

  // Request wallet connection via passkey authentication
  const connect = async () => {
    if (!provider) return
    const accounts = await provider.request({ method: 'eth_requestAccounts' }) as Address[]
    setAddress(accounts[0])
  }

  // Disconnect the wallet
  const disconnect = async () => {
    if (!provider) return
    await provider.disconnect()
    setAddress(null)
  }

  // Send a small USDC transfer to self (demonstrates ERC20 transaction)
  const sendUSDC = async () => {
    if (!provider || !address) return
    setIsPending(true)
    try {
      // Encode the ERC20 transfer call data using viem
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [address, parseUnits('0.01', 6)], // USDC has 6 decimals
      })
      // Send the transaction via the 1auth provider
      await provider.request({
        method: 'eth_sendTransaction',
        params: [{ to: USDC_ADDRESS, data }],
      })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div>
      <h1>1auth Viem Example</h1>
      {address ? (
        <>
          <p>Connected: {address}</p>
          <button onClick={sendUSDC} disabled={isPending}>
            {isPending ? 'Sending...' : 'Send 0.01 USDC to Self'}
          </button>
          <button onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <button onClick={connect}>Sign In with Passkey</button>
      )}
    </div>
  )
}

export default App
