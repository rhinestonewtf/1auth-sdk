/**
 * 1auth Wagmi Example - Entry Point
 *
 * Sets up the required providers:
 * - WagmiProvider: Provides wagmi hooks and state
 * - QueryClientProvider: Required by wagmi for data fetching
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config'
import App from './App'

// Create a React Query client for wagmi's data fetching
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
