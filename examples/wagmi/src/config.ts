/**
 * 1auth Wagmi Configuration
 *
 * This file sets up the wagmi config with the 1auth connector.
 * The oneAuth connector enables passkey-based authentication
 * and smart account transactions.
 */

import { baseSepolia } from 'viem/chains'
import { OneAuthClient } from '@rhinestone/1auth'
import { oneAuth } from '@rhinestone/1auth/wagmi'
import { http, createConfig } from 'wagmi'

// 1auth provider configuration
// For local development, use http://localhost:3001
// For production, use https://passkey.1auth.box
export const PROVIDER_URL = 'https://passkey.1auth.box'

// USDC token address on Base Sepolia (6 decimals)
export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

// Initialize the 1auth client (no clientId = Tier 3, unsigned intents with trust confirmation)
export const client = new OneAuthClient({
  providerUrl: PROVIDER_URL,
})

// Create wagmi config with 1auth connector
export const config = createConfig({
  chains: [baseSepolia],
  connectors: [oneAuth({ client, chainId: baseSepolia.id })],
  transports: { [baseSepolia.id]: http() },
})
