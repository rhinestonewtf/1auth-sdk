# @rhinestone/1auth

Passkey-based authentication SDK for Web3 applications. Build seamless, secure authentication flows using passkeys (WebAuthn) for smart accounts.

## Installation

```bash
npm install @rhinestone/1auth
# or
pnpm add @rhinestone/1auth
# or
yarn add @rhinestone/1auth
```

### Peer Dependencies

```bash
npm install viem @wagmi/core
# React (optional, for PayButton component)
npm install react
```

## Entry Points

The SDK provides multiple entry points for different use cases:

| Entry Point | Import | Use Case |
|-------------|--------|----------|
| Default | `@rhinestone/1auth` | Core client, provider, types |
| React | `@rhinestone/1auth/react` | PayButton component |
| Server | `@rhinestone/1auth/server` | Server-side intent signing |
| Wagmi | `@rhinestone/1auth/wagmi` | Wagmi connector integration |

## Quick Start

### Basic Setup

```typescript
import { OneAuthClient, createOneAuthProvider } from '@rhinestone/1auth';

// Create the client
const client = new OneAuthClient({
  passkeyServerUrl: 'https://passkey.1auth.box',
});

// Create an EIP-1193 compatible provider
const provider = createOneAuthProvider(client);
```

### React Integration

```tsx
import { PayButton } from '@rhinestone/1auth/react';

function CheckoutPage() {
  return (
    <PayButton
      intent={intent}
      onSuccess={(result) => console.log('Payment successful', result)}
      onError={(error) => console.error('Payment failed', error)}
    />
  );
}
```

### Wagmi Connector

```typescript
import { oneAuth } from '@rhinestone/1auth/wagmi';
import { createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';

const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    oneAuth({
      passkeyServerUrl: 'https://passkey.1auth.box',
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});
```

### Server-Side Intent Signing

```typescript
import { signIntent, createSignIntentHandler } from '@rhinestone/1auth/server';

// Sign an intent with Ed25519
const signedIntent = await signIntent(intent, privateKey);

// Or create a request handler
const handler = createSignIntentHandler({
  privateKey: process.env.SIGNING_KEY,
});
```

## Core Exports

### `@rhinestone/1auth`

- `OneAuthClient` - Main client for passkey operations
- `createOneAuthProvider()` - EIP-1193 compatible provider factory
- `createPasskeyWalletClient()` - viem WalletClient with passkey support
- `getSupportedChains()` - Get list of supported chains
- `getSupportedTokens()` - Get list of supported tokens
- Type exports for intents, accounts, and more

### `@rhinestone/1auth/react`

- `PayButton` - Pre-built payment/intent button component
- `BatchQueueProvider` - Context provider for batch operations
- `BatchQueueWidget` - UI widget for batch queue management
- `useBatchQueue` - Hook for batch queue operations

### `@rhinestone/1auth/server`

- `signIntent()` - Server-side intent signing with Ed25519
- `createSignIntentHandler()` - Express/fetch handler for intent signing

### `@rhinestone/1auth/wagmi`

- `oneAuth()` - Wagmi connector factory

## License

MIT
