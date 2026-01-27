import type { Chain, Transport, Address, Hex, Hash } from 'viem';
import type { IntentSigner } from '../types';

/**
 * Configuration for creating a passkey-enabled WalletClient
 */
export interface PasskeyWalletClientConfig {
  /** User's smart account address */
  accountAddress: Address;

  /** Username for the passkey provider */
  username: string;

  /** Base URL of the auth API (defaults to https://passkey.1auth.box) */
  providerUrl?: string;

  /** Client identifier for this application */
  clientId: string;

  /** Optional URL of the dialog UI */
  dialogUrl?: string;

  /** Optional signer for developer-protected intents */
  signIntent?: IntentSigner;

  /** Chain configuration */
  chain: Chain;

  /** Transport (e.g., http(), webSocket()) */
  transport: Transport;

  /** Wait for a transaction hash before resolving send calls. */
  waitForHash?: boolean;
  /** Maximum time to wait for a transaction hash in ms. */
  hashTimeoutMs?: number;
  /** Poll interval for transaction hash in ms. */
  hashIntervalMs?: number;
}

/**
 * A single call in a batch transaction
 */
export interface TransactionCall {
  /** Target contract address */
  to: Address;

  /** Calldata to send */
  data?: Hex;

  /** Value in wei to send */
  value?: bigint;

  /** Optional label for the transaction review UI (e.g., "Swap ETH for USDC") */
  label?: string;

  /** Optional sublabel for additional context (e.g., "1 ETH → 2,500 USDC") */
  sublabel?: string;
}

/**
 * Parameters for sendCalls (batched transactions)
 */
export interface SendCallsParams {
  /** Array of calls to execute */
  calls: TransactionCall[];

  /** Optional chain id override */
  chainId?: number;
}

/**
 * Result of a sendCalls operation
 */
export interface SendCallsResult {
  /** Transaction hash (or batch identifier) */
  hash: Hash;

  /** The calls that were signed */
  calls: TransactionCall[];
}
