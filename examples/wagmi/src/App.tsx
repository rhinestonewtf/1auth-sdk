/**
 * 1auth Wagmi Example App
 *
 * Demonstrates:
 * - Passkey authentication via 1auth
 * - Reading account state with wagmi hooks
 * - Sending ERC-20 token transactions
 */

import { useAccount, useConnect, useDisconnect, useSendTransaction } from 'wagmi'
import { parseUnits, encodeFunctionData, erc20Abi } from 'viem'
import { USDC_BASE_SEPOLIA } from './config'

function App() {
  // Get current account state
  const { address, isConnected } = useAccount()

  // Connection hooks
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  // Transaction hook for sending USDC
  const { sendTransaction, isPending, error } = useSendTransaction({
    mutation: {
      onSuccess: (data) => console.log('Transaction success:', data),
      onError: (error) => console.error('Transaction error:', error),
    },
  })

  /**
   * Send 0.01 USDC to self
   * This demonstrates encoding an ERC-20 transfer call
   */
  const handleSendUSDC = () => {
    if (!address) return

    // Encode the ERC-20 transfer function call
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [address, parseUnits('0.01', 6)], // USDC has 6 decimals
    })

    // Send the transaction via the 1auth smart account
    sendTransaction({ to: USDC_BASE_SEPOLIA, data })
  }

  return (
    <div>
      <h1>1auth Wagmi Example</h1>

      {isConnected ? (
        <>
          <p>Connected: {address}</p>

          {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}

          <button onClick={handleSendUSDC} disabled={isPending}>
            {isPending ? 'Sending...' : 'Send 0.01 USDC to Self'}
          </button>

          <button onClick={() => disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <button onClick={() => connect({ connector: connectors[0] })}>
          Sign In with Passkey
        </button>
      )}
    </div>
  )
}

export default App
