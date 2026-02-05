import { useState } from 'react'
import { OneAuthClient } from '@rhinestone/1auth'
import { PayButton } from '@rhinestone/1auth/react'
import { parseUnits, encodeFunctionData, erc20Abi } from 'viem'

// Configuration for the 1auth provider
// For local development, use http://localhost:3001
// For production, use https://passkey.1auth.box
const PROVIDER_URL = 'http://localhost:3001'

// Base Sepolia testnet
const CHAIN_ID = 84532

// USDC contract on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

// Initialize the 1auth client
// No clientId = Tier 3 (unregistered origin with trust confirmation)
const client = new OneAuthClient({
  providerUrl: PROVIDER_URL,
})

function App() {
  // Track the connected user's address
  const [address, setAddress] = useState<string | null>(null)

  // Handle sign in with passkey
  const handleSignIn = async () => {
    const result = await client.authWithModal()
    if (result.success && result.username) {
      // After successful auth, get the stored address from localStorage
      const stored = localStorage.getItem('1auth-user')
      if (stored) {
        const { address } = JSON.parse(stored)
        setAddress(address)
      }
    }
  }

  // Encode USDC transfer call data (send 0.01 USDC to self)
  // Only encode if we have an address to send to
  const usdcTransferData = address
    ? encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [address as `0x${string}`, parseUnits('0.01', 6)],
      })
    : undefined

  return (
    <div style={containerStyles}>
      <h1 style={headingStyles}>1auth React Example</h1>

      {address ? (
        // Connected state - show address and PayButton
        <>
          <p style={addressStyles}>Connected: {address}</p>
          <PayButton
            client={client}
            intent={{
              targetChain: CHAIN_ID,
              calls: [
                {
                  to: USDC_ADDRESS,
                  data: usdcTransferData,
                  value: '0',
                  label: 'Send USDC',
                  sublabel: '0.01 USDC to self',
                },
              ],
            }}
            onSuccess={(result) => console.log('Success:', result)}
            onError={(error) => console.error('Error:', error)}
          >
            Send 0.01 USDC to Self
          </PayButton>
        </>
      ) : (
        // Disconnected state - show sign in button
        <button onClick={handleSignIn} style={buttonStyles}>
          Sign In with Passkey
        </button>
      )}
    </div>
  )
}

// Inline styles for the demo
const containerStyles: React.CSSProperties = {
  maxWidth: '400px',
  width: '100%',
  padding: '32px',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  textAlign: 'center',
}

const headingStyles: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 600,
  marginBottom: '24px',
  color: '#18181b',
}

const addressStyles: React.CSSProperties = {
  fontSize: '14px',
  color: '#71717a',
  marginBottom: '16px',
  wordBreak: 'break-all',
}

const buttonStyles: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px 32px',
  fontSize: '16px',
  fontWeight: 500,
  color: '#ffffff',
  backgroundColor: '#18181b',
  border: 'none',
  borderRadius: '9999px',
  cursor: 'pointer',
  width: '100%',
}

export default App
