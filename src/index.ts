export { OneAuthClient, PasskeyProviderClient } from "./client";
export { createOneAuthProvider, createPasskeyProvider } from "./provider";
export type {
  OneAuthProvider,
  OneAuthProviderOptions,
  PasskeyProvider,
  PasskeyProviderOptions,
} from "./provider";
export { createPasskeyAccount } from "./account";
export type { PasskeyAccount } from "./account";
export type {
  PasskeyProviderConfig,
  SigningRequestOptions,
  SigningResult,
  SigningSuccess,
  SigningError,
  SigningErrorCode,
  WebAuthnSignature,
  CreateSigningRequestResponse,
  SigningRequestStatus,
  EmbedOptions,
  PasskeyCredential,
  UserPasskeysResponse,
  RegisterOptions,
  RegisterResult,
  LoginOptions,
  LoginResult,
  // Connect modal types
  ConnectResult,
  // Authentication with challenge signing types
  AuthenticateOptions,
  AuthenticateResult,
  // Message signing types
  SignMessageOptions,
  SignMessageResult,
  // EIP-712 typed data signing types
  SignTypedDataOptions,
  SignTypedDataResult,
  EIP712Domain,
  EIP712Types,
  EIP712TypeField,
  // Transaction review types
  TransactionAction,
  TransactionFees,
  BalanceRequirement,
  TransactionDetails,
  // Intent types for Rhinestone orchestrator
  IntentCall,
  IntentTokenRequest,
  DeveloperSignedIntent,
  MerchantSignedIntent, // Deprecated alias
  IntentSigner,
  SendIntentOptions,
  IntentQuote,
  IntentStatus,
  OrchestratorStatus,
  CloseOnStatus,
  SendIntentResult,
  PrepareIntentResponse,
  ExecuteIntentResponse,
  // Intent history types
  IntentHistoryOptions,
  IntentHistoryItem,
  IntentHistoryResult,
  // Swap types
  SendSwapOptions,
  SendSwapResult,
  SwapQuote,
  // Theme configuration
  ThemeConfig,
} from "./types";

// Viem WalletClient integration
export {
  createPasskeyWalletClient,
  encodeWebAuthnSignature,
  hashCalls,
} from "./walletClient";
export type {
  PasskeyWalletClient,
  PasskeyWalletClientConfig,
  TransactionCall,
  SendCallsParams,
} from "./walletClient";

// Batch queue components
export {
  BatchQueueProvider,
  useBatchQueue,
  BatchQueueWidget,
  getChainName,
} from "./batch";
export type {
  BatchedCall,
  BatchQueueContextValue,
  BatchQueueProviderProps,
  BatchQueueWidgetProps,
} from "./batch";

// Registry helpers for supported chains/tokens (Rhinestone)
export {
  getSupportedChainIds,
  getSupportedChains,
  getAllSupportedChainsAndTokens,
  getSupportedTokens,
  getSupportedTokenSymbols,
  getChainById,
  getChainExplorerUrl,
  getChainRpcUrl,
  resolveTokenAddress,
  isTestnet,
  getTokenAddress,
  getTokenSymbol,
  getTokenDecimals,
  isTokenAddressSupported,
} from "./registry";
export type { TokenConfig, ChainFilterOptions } from "./registry";

// Message signing verification utilities
export {
  hashMessage,
  verifyMessageHash,
  ETHEREUM_MESSAGE_PREFIX,
  PASSKEY_MESSAGE_PREFIX, // Deprecated alias
} from "./verify";
