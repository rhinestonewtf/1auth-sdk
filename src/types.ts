/**
 * Theme configuration for the dialog UI
 */
export interface ThemeConfig {
  /** Color mode: 'light', 'dark', or 'system' (follows user's OS preference) */
  mode?: 'light' | 'dark' | 'system';
  /** Primary accent color (hex). Used for buttons and interactive elements */
  accent?: string;
}

export interface PasskeyProviderConfig {
  /** Base URL of the auth API. Defaults to https://passkey.1auth.box */
  providerUrl?: string;
  /** Client identifier for this application */
  clientId: string;
  /** Optional redirect URL for redirect flow */
  redirectUrl?: string;
  /** Optional URL of the dialog UI. Defaults to providerUrl */
  dialogUrl?: string;
  /** Optional theme configuration for the dialog */
  theme?: ThemeConfig;
}

export interface LoginOptions {
  username: string;
}

export interface LoginResult {
  success: boolean;
  username?: string;
  user?: {
    id: string;
    username: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface RegisterOptions {
  username: string;
}

export interface RegisterResult {
  success: boolean;
  username?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Result of the connect modal (lightweight connection without passkey auth)
 */
export interface ConnectResult {
  success: boolean;
  /** Username of the connected account */
  username?: string;
  /** Whether this was auto-connected (user had auto-connect enabled) */
  autoConnected?: boolean;
  /** Action to take when connection was not successful */
  action?: "switch" | "cancel";
  error?: {
    code: string;
    message: string;
  };
}

// Authentication with challenge signing types

/**
 * Options for the authenticate() method
 */
export interface AuthenticateOptions {
  /**
   * Human-readable challenge message for the user to sign.
   * The provider will hash this with a domain separator to prevent
   * the signature from being reused for transaction signing.
   */
  challenge?: string;
}

/**
 * Result of the authenticate() method
 */
export interface AuthenticateResult {
  success: boolean;
  username?: string;
  user?: {
    id: string;
    username: string;
  };
  /**
   * The user's smart account address (derived from their passkey).
   */
  accountAddress?: `0x${string}`;
  /**
   * Signature of the hashed challenge.
   * Only present if a challenge was provided in the options.
   */
  signature?: WebAuthnSignature;
  /**
   * The hash that was actually signed (so apps can verify server-side).
   * Computed as: keccak256("\x19Ethereum Signed Message:\n" + len + challenge) (EIP-191)
   */
  signedHash?: `0x${string}`;
  error?: {
    code: string;
    message: string;
  };
}

// Message signing types (arbitrary message signing, not transactions)

/**
 * Options for signMessage
 */
export interface SignMessageOptions {
  /** Username of the signer */
  username: string;
  /** Human-readable message to sign */
  message: string;
  /** Optional custom challenge (defaults to message hash) */
  challenge?: string;
  /** Description shown to user in the dialog */
  description?: string;
  /** Optional metadata to display to the user */
  metadata?: Record<string, unknown>;
  /** Theme configuration */
  theme?: ThemeConfig;
}

/**
 * Result of signMessage
 */
export interface SignMessageResult {
  success: boolean;
  /** WebAuthn signature if successful */
  signature?: WebAuthnSignature;
  /** The message that was signed */
  signedMessage?: string;
  /**
   * The hash that was actually signed (EIP-191 format).
   * Computed as: keccak256("\x19Ethereum Signed Message:\n" + len + message)
   * Use hashMessage() from the SDK to verify this matches your original message.
   */
  signedHash?: `0x${string}`;
  /** Passkey credentials used for signing */
  passkey?: PasskeyCredentials;
  /** Error details if failed */
  error?: {
    code: SigningErrorCode;
    message: string;
  };
}

// Transaction review types
export interface TransactionAction {
  type: 'send' | 'receive' | 'approve' | 'swap' | 'mint' | 'custom';
  label: string;
  sublabel?: string;
  amount?: string;
  icon?: string;
}

export interface TransactionFees {
  estimated: string;
  network: {
    name: string;
    icon?: string;
  };
}

export interface BalanceRequirement {
  token: string;
  amount: string;
  faucetUrl?: string;
}

export interface TransactionDetails {
  actions: TransactionAction[];
  fees?: TransactionFees;
  requiredBalance?: BalanceRequirement;
  account?: {
    address: string;
    label?: string;  // e.g., "Account" or "From"
  };
}

export interface SigningRequestOptions {
  challenge: string;
  username: string;
  description?: string;
  metadata?: Record<string, unknown>;
  transaction?: TransactionDetails;
}

export interface PasskeyCredential {
  id: string;
  deviceName: string | null;
  publicKeyX: string;
  publicKeyY: string;
}

export interface UserPasskeysResponse {
  passkeys: PasskeyCredential[];
}

export interface WebAuthnSignature {
  authenticatorData: string;
  clientDataJSON: string;
  challengeIndex: number;
  typeIndex: number;
  r: string;
  s: string;
  topOrigin: string | null;
}

export interface PasskeyCredentials {
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
}

export interface SigningSuccess {
  success: true;
  requestId?: string; // Optional - not used when data is passed via postMessage
  /** WebAuthn signature - present for message/typedData signing */
  signature?: WebAuthnSignature;
  /** Array of signatures for multi-origin cross-chain intents (one per source chain) */
  originSignatures?: WebAuthnSignature[];
  /** Credentials of the passkey used for signing - present for message/typedData signing */
  passkey?: PasskeyCredentials;
  /** Intent ID - present for intent signing (after execute in dialog) */
  intentId?: string;
}

export type SigningErrorCode =
  | "USER_REJECTED"
  | "EXPIRED"
  | "INVALID_REQUEST"
  | "NETWORK_ERROR"
  | "POPUP_BLOCKED"
  | "SIGNING_FAILED"
  | "UNKNOWN";

export interface EmbedOptions {
  container: HTMLElement;
  width?: string;
  height?: string;
  onReady?: () => void;
  onClose?: () => void;
}

export interface SigningError {
  success: false;
  requestId?: string;
  error: {
    code: SigningErrorCode;
    message: string;
  };
}

export type SigningResult = SigningSuccess | SigningError;

export interface CreateSigningRequestResponse {
  requestId: string;
  nonce: string;
  signingUrl: string;
  expiresAt: string;
}

export interface SigningRequestStatus {
  id: string;
  status: "PENDING" | "COMPLETED" | "REJECTED" | "EXPIRED" | "FAILED";
  signature?: WebAuthnSignature;
  error?: {
    code: SigningErrorCode;
    message: string;
  };
}

// Intent types for Rhinestone orchestrator integration

/**
 * A call to execute on the target chain
 */
export interface IntentCall {
  /** Target contract address */
  to: string;
  /** Calldata to send */
  data?: string;
  /** Value in wei (as string for serialization) */
  value?: string;
  /** Optional label for the transaction review UI */
  label?: string;
  /** Optional sublabel for additional context */
  sublabel?: string;
}

/**
 * Token request for the intent
 */
export interface IntentTokenRequest {
  /** Token contract address */
  token: string;
  /** Amount in base units (use parseUnits for decimals) */
  amount: bigint;
}

/**
 * A signed intent request from a backend.
 * This provides XSS protection by ensuring calls were constructed server-side.
 */
export interface DeveloperSignedIntent {
  /** Developer ID (clientId). Mapped to merchantId for the API. */
  developerId?: string;
  /** Wire field used by the API (same value as developerId) */
  merchantId?: string;
  /** Target chain ID */
  targetChain: number;
  /** Calls to execute (signed by developer) */
  calls: IntentCall[];
  /** Username of the signer */
  username?: string;
  /** Alternative to username: account address */
  accountAddress?: string;
  /** Unique nonce for replay protection */
  nonce: string;
  /** Expiry timestamp (Unix ms) */
  expiresAt: number;
  /** Ed25519 signature over the canonical message (base64) */
  signature: string;
  /** Optional client ID */
  clientId?: string;
  /** Optional token requests */
  tokenRequests?: IntentTokenRequest[];
}

/** @deprecated Use DeveloperSignedIntent instead */
export type MerchantSignedIntent = DeveloperSignedIntent;

export type IntentSigner = (params: {
  username: string;
  accountAddress?: string;
  targetChain: number;
  calls: IntentCall[];
  tokenRequests?: IntentTokenRequest[];
  sourceAssets?: string[];
}) => Promise<DeveloperSignedIntent>;

/**
 * Options for sendIntent
 */
export interface SendIntentOptions {
  /** Username of the signer (for unsigned requests) */
  username?: string;
  /** Target chain ID (for unsigned requests) */
  targetChain?: number;
  /** Calls to execute on the target chain (for unsigned requests) */
  calls?: IntentCall[];
  /** Optional token requests (for unsigned requests) */
  tokenRequests?: IntentTokenRequest[];
  /**
   * Constrain which tokens can be used as input/payment.
   * If not specified, orchestrator picks from all available balances.
   * Example: ['USDC'] or ['0x...'] to only use USDC as input.
   */
  sourceAssets?: string[];
  /** When to close the dialog and return success. Defaults to "preconfirmed" */
  closeOn?: CloseOnStatus;
  /**
   * Pre-signed intent from developer backend (XSS protected)
   * If provided, username/targetChain/calls/tokenRequests are ignored
   */
  signedIntent?: DeveloperSignedIntent;
  /**
   * Wait for a transaction hash before resolving.
   * Defaults to false to preserve existing behavior.
   */
  waitForHash?: boolean;
  /** Maximum time to wait for a transaction hash in ms. */
  hashTimeoutMs?: number;
  /** Poll interval for transaction hash in ms. */
  hashIntervalMs?: number;
}

/**
 * Quote from the Rhinestone orchestrator
 */
export interface IntentQuote {
  /** Total cost in input tokens */
  cost: {
    total: string;
    breakdown?: {
      gas?: string;
      bridge?: string;
      swap?: string;
    };
  };
  /** Token requirements to fulfill the intent */
  tokenRequirements: Array<{
    token: string;
    amount: string;
    chainId: number;
  }>;
}

/**
 * Status of an intent (local states)
 */
export type IntentStatus =
  | "pending"
  | "quoted"
  | "signed"
  | "submitted"
  | "completed"
  | "failed"
  | "expired"
  | "unknown";

/**
 * Orchestrator status (from Rhinestone)
 * These are the statuses we can receive when polling
 */
export type OrchestratorStatus =
  | "PENDING"
  | "CLAIMED"
  | "PRECONFIRMED"
  | "FILLED"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

/**
 * When to consider the transaction complete and close the dialog
 * - "claimed" - Close when a solver has claimed the intent (fastest)
 * - "preconfirmed" - Close on pre-confirmation (recommended)
 * - "filled" - Close when the transaction is filled
 * - "completed" - Wait for full completion (slowest, most certain)
 */
export type CloseOnStatus = "claimed" | "preconfirmed" | "filled" | "completed";

/**
 * Result of sendIntent
 */
export interface SendIntentResult {
  /** Whether the intent was successfully submitted */
  success: boolean;
  /** Intent ID for tracking */
  intentId: string;
  /** Current status */
  status: IntentStatus;
  /** Transaction hash if completed */
  transactionHash?: string;
  /** Operation ID from orchestrator */
  operationId?: string;
  /** Error details if failed */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Prepare intent response from auth service
 */
export interface PrepareIntentResponse {
  quote: IntentQuote;
  transaction: TransactionDetails;
  challenge: string;
  expiresAt: string;
  /** Account address for the sign dialog to detect self-transfer vs external send */
  accountAddress?: string;
  /** Serialized PreparedTransactionData from orchestrator - needed for execute */
  intentOp: string;
  /** User ID for creating intent record on execute */
  userId: string;
  /** Target chain ID */
  targetChain: number;
  /** JSON stringified calls */
  calls: string;
  /** Origin message hashes for multi-source cross-chain intents */
  originMessages?: Array<{ chainId: number; messageHash: string }>;
}

/**
 * Execute intent response from auth service
 */
export interface ExecuteIntentResponse {
  success: boolean;
  intentId: string;
  operationId?: string;
  status: IntentStatus;
  transactionHash?: string;
  /** Transaction result data needed for waiting via POST /api/intent/wait */
  transactionResult?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

// Swap types

/**
 * Options for sendSwap - high-level swap abstraction
 */
export interface SendSwapOptions {
  /** Username of the signer */
  username: string;
  /** Target chain ID where swap executes */
  targetChain: number;
  /** Token to swap from (address or supported symbol like 'ETH', 'USDC') */
  fromToken: string;
  /** Token to swap to (address or supported symbol) */
  toToken: string;
  /** Amount to swap in human-readable format (e.g., "0.1") */
  amount: string;
  /** Maximum slippage in basis points (1 bp = 0.01%). Default: 50 (0.5%) */
  slippageBps?: number;
  /**
   * Override source assets for the swap. If not specified, defaults to [fromToken].
   * This constrains which tokens the orchestrator can use as input.
   */
  sourceAssets?: string[];
  /** When to close the dialog. Defaults to "preconfirmed" */
  closeOn?: CloseOnStatus;
  /** Wait for a transaction hash before resolving. */
  waitForHash?: boolean;
  /** Maximum time to wait for a transaction hash in ms. */
  hashTimeoutMs?: number;
  /** Poll interval for transaction hash in ms. */
  hashIntervalMs?: number;
}

/**
 * Quote information from DEX aggregator
 */
export interface SwapQuote {
  /** Token being sold */
  fromToken: string;
  /** Token being bought */
  toToken: string;
  /** Amount of fromToken being sold */
  amountIn: string;
  /** Amount of toToken being received */
  amountOut: string;
  /** Exchange rate (amountOut / amountIn) */
  rate: string;
  /** Price impact percentage (if available) */
  priceImpact?: string;
}

/**
 * Result of sendSwap - extends SendIntentResult with swap-specific data
 */
export interface SendSwapResult extends SendIntentResult {
  /** The swap quote that was executed */
  quote?: SwapQuote;
}

// EIP-712 Typed Data types

/**
 * EIP-712 Domain parameters
 */
export interface EIP712Domain {
  /** Name of the signing domain (e.g., "Dai Stablecoin") */
  name: string;
  /** Version of the signing domain (e.g., "1") */
  version: string;
  /** Chain ID (optional) */
  chainId?: number;
  /** Verifying contract address (optional) */
  verifyingContract?: `0x${string}`;
  /** Salt for disambiguation (optional) */
  salt?: `0x${string}`;
}

/**
 * EIP-712 Type field definition
 */
export interface EIP712TypeField {
  /** Field name */
  name: string;
  /** Solidity type (e.g., "address", "uint256", "bytes32") */
  type: string;
}

/**
 * EIP-712 Types map - maps type names to their field definitions
 */
export type EIP712Types = {
  [typeName: string]: EIP712TypeField[];
};

/**
 * Options for signTypedData
 */
export interface SignTypedDataOptions {
  /** Username of the signer */
  username: string;
  /** EIP-712 domain parameters */
  domain: EIP712Domain;
  /** Type definitions for all types used in the message */
  types: EIP712Types;
  /** Primary type being signed (must be a key in types) */
  primaryType: string;
  /** Message values matching the primaryType structure */
  message: Record<string, unknown>;
  /** Optional description shown in the dialog */
  description?: string;
  /** Theme configuration */
  theme?: ThemeConfig;
}

/**
 * Result of signTypedData
 */
export interface SignTypedDataResult {
  success: boolean;
  /** WebAuthn signature if successful */
  signature?: WebAuthnSignature;
  /** The EIP-712 hash that was signed */
  signedHash?: `0x${string}`;
  /** Passkey credentials used for signing */
  passkey?: PasskeyCredentials;
  /** Error details if failed */
  error?: {
    code: SigningErrorCode;
    message: string;
  };
}

// Intent history types

/**
 * Options for querying intent history
 */
export interface IntentHistoryOptions {
  /** Maximum number of intents to return (default: 50, max: 100) */
  limit?: number;
  /** Number of intents to skip for pagination */
  offset?: number;
  /** Filter by intent status */
  status?: IntentStatus;
  /** Filter by creation date (ISO string) - intents created on or after this date */
  from?: string;
  /** Filter by creation date (ISO string) - intents created on or before this date */
  to?: string;
}

/**
 * Single intent item in history response
 */
export interface IntentHistoryItem {
  /** Intent identifier (orchestrator's ID, used as primary key) */
  intentId: string;
  /** Current status of the intent */
  status: IntentStatus;
  /** Transaction hash (if completed) */
  transactionHash?: string;
  /** Target chain ID */
  targetChain: number;
  /** Calls that were executed */
  calls: IntentCall[];
  /** When the intent was created (ISO string) */
  createdAt: string;
  /** When the intent was last updated (ISO string) */
  updatedAt: string;
}

/**
 * Result of getIntentHistory
 */
export interface IntentHistoryResult {
  /** List of intents */
  intents: IntentHistoryItem[];
  /** Total count of matching intents */
  total: number;
  /** Whether there are more intents beyond this page */
  hasMore: boolean;
}
