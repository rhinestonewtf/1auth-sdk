import { parseUnits, hashTypedData, type TypedDataDefinition, type Address } from "viem";
import type {
  PasskeyProviderConfig,
  SigningRequestOptions,
  SigningResult,
  CreateSigningRequestResponse,
  SigningRequestStatus,
  SigningErrorCode,
  EmbedOptions,
  UserPasskeysResponse,
  PasskeyCredential,
  RegisterResult,
  LoginResult,
  ConnectResult,
  AuthenticateOptions,
  AuthenticateResult,
  SendIntentOptions,
  SendIntentResult,
  PrepareIntentResponse,
  ExecuteIntentResponse,
  WebAuthnSignature,
  SendSwapOptions,
  SendSwapResult,
  ThemeConfig,
  SignMessageOptions,
  SignMessageResult,
  SignTypedDataOptions,
  SignTypedDataResult,
  IntentHistoryOptions,
  IntentHistoryResult,
  IntentTokenRequest,
  SendBatchIntentOptions,
  SendBatchIntentResult,
  PrepareBatchIntentResponse,
  BatchIntentItemResult,
} from "./types";
import {
  getChainById,
  getTokenDecimals,
  getTokenSymbol,
  isTokenAddressSupported,
  resolveTokenAddress,
} from "./registry";

const POPUP_WIDTH = 450;
const POPUP_HEIGHT = 600;
const DEFAULT_EMBED_WIDTH = "400px";
const DEFAULT_EMBED_HEIGHT = "500px";
const MODAL_WIDTH = 360;
const DEFAULT_PROVIDER_URL = "https://passkey.1auth.box";

type NormalizedPasskeyProviderConfig = PasskeyProviderConfig & {
  providerUrl: string;
  dialogUrl: string;
};

export class OneAuthClient {
  private config: NormalizedPasskeyProviderConfig;
  private theme: ThemeConfig;

  constructor(config: PasskeyProviderConfig) {
    const providerUrl = config.providerUrl || DEFAULT_PROVIDER_URL;
    const dialogUrl = config.dialogUrl || providerUrl;
    this.config = { ...config, providerUrl, dialogUrl };
    this.theme = this.config.theme || {};
  }

  /**
   * Update the theme configuration at runtime
   */
  setTheme(theme: ThemeConfig): void {
    this.theme = theme;
  }

  /**
   * Build theme URL parameters
   */
  private getThemeParams(overrideTheme?: ThemeConfig): string {
    const theme = { ...this.theme, ...overrideTheme };
    const params = new URLSearchParams();

    if (theme.mode) {
      params.set('theme', theme.mode);
    }
    if (theme.accent) {
      params.set('accent', theme.accent);
    }

    return params.toString();
  }

  /**
   * Get the dialog URL (Vite app URL)
   * Defaults to providerUrl if dialogUrl is not set
   */
  private getDialogUrl(): string {
    return this.config.dialogUrl || this.config.providerUrl;
  }

  /**
   * Get the origin for message validation
   * Uses dialogUrl origin if set, otherwise providerUrl origin
   */
  private getDialogOrigin(): string {
    const dialogUrl = this.getDialogUrl();
    try {
      return new URL(dialogUrl).origin;
    } catch {
      return dialogUrl;
    }
  }

  /**
   * Get the base provider URL
   */
  getProviderUrl(): string {
    return this.config.providerUrl;
  }

  /**
   * Get the configured client ID
   */
  getClientId(): string | undefined {
    return this.config.clientId;
  }

  private async waitForTransactionHash(
    intentId: string,
    options: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<string | undefined> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const intervalMs = options.intervalMs ?? 2_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const response = await fetch(
          `${this.config.providerUrl}/api/intent/status/${intentId}`,
          {
            headers: this.config.clientId
              ? { "x-client-id": this.config.clientId }
              : {},
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.transactionHash) {
            return data.transactionHash as string;
          }
          if (data.status === "failed" || data.status === "expired") {
            return undefined;
          }
        }
      } catch {
        // Keep polling until timeout.
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return undefined;
  }

  /**
   * Open the auth dialog (sign in + sign up).
   */
  async authWithModal(options?: {
    username?: string;
    theme?: ThemeConfig;
    oauthEnabled?: boolean;
  }): Promise<LoginResult | RegisterResult> {
    const dialogUrl = this.getDialogUrl();
    const params = new URLSearchParams({
      mode: 'iframe',
    });
    if (this.config.clientId) {
      params.set('clientId', this.config.clientId);
    }
    if (options?.username) {
      params.set('username', options.username);
    }
    if (options?.oauthEnabled === false) {
      params.set('oauth', '0');
    }

    // Add theme params
    const themeParams = this.getThemeParams(options?.theme);
    if (themeParams) {
      const themeParsed = new URLSearchParams(themeParams);
      themeParsed.forEach((value, key) => params.set(key, value));
    }

    const url = `${dialogUrl}/dialog/auth?${params.toString()}`;

    const { dialog, iframe, cleanup } = this.createModalDialog(url);

    return this.waitForModalAuthResponse(dialog, iframe, cleanup);
  }

  /**
   * Open the connect dialog (lightweight connection without passkey auth).
   *
   * This method shows a simple connection confirmation dialog that doesn't
   * require a passkey signature. Users can optionally enable "auto-connect"
   * to skip this dialog in the future.
   *
   * If the user has never connected before, this will return action: "switch"
   * to indicate that the full auth modal should be opened instead.
   *
   * @example
   * ```typescript
   * const result = await client.connectWithModal();
   *
   * if (result.success) {
   *   console.log('Connected as:', result.username);
   * } else if (result.action === 'switch') {
   *   // User needs to sign in first
   *   const authResult = await client.authWithModal();
   * }
   * ```
   */
  async connectWithModal(options?: {
    theme?: ThemeConfig;
  }): Promise<ConnectResult> {
    const dialogUrl = this.getDialogUrl();
    const params = new URLSearchParams({
      mode: 'iframe',
    });
    if (this.config.clientId) {
      params.set('clientId', this.config.clientId);
    }

    // Add theme params
    const themeParams = this.getThemeParams(options?.theme);
    if (themeParams) {
      const themeParsed = new URLSearchParams(themeParams);
      themeParsed.forEach((value, key) => params.set(key, value));
    }

    const url = `${dialogUrl}/dialog/connect?${params.toString()}`;

    const { dialog, iframe, cleanup } = this.createModalDialog(url);

    const ready = await this.waitForDialogReady(dialog, iframe, cleanup, {
      mode: "iframe",
    });
    if (!ready) {
      return {
        success: false,
        action: "cancel",
        error: { code: "USER_CANCELLED", message: "Connection was cancelled" },
      };
    }

    return this.waitForConnectResponse(dialog, iframe, cleanup);
  }

  /**
   * Authenticate a user with an optional challenge to sign.
   *
   * This method combines authentication (sign in / sign up) with optional
   * challenge signing, enabling off-chain login without on-chain transactions.
   *
   * When a challenge is provided:
   * 1. User authenticates (sign in or sign up)
   * 2. The challenge is hashed with a domain separator
   * 3. User signs the hash with their passkey
   * 4. Returns user info + signature for server-side verification
   *
   * The domain separator ("\x19Passkey Signed Message:\n") ensures the signature
   * cannot be reused for transaction signing, preventing phishing attacks.
   *
   * @example
   * ```typescript
   * // Authenticate with a login challenge
   * const result = await client.authenticate({
   *   challenge: `Login to MyApp\nTimestamp: ${Date.now()}\nNonce: ${crypto.randomUUID()}`
   * });
   *
   * if (result.success && result.signature) {
   *   // Verify signature server-side
   *   const isValid = await verifyOnServer(
   *     result.username,
   *     result.signature,
   *     result.signedHash
   *   );
   * }
   * ```
   */
  async authenticate(options?: AuthenticateOptions & { theme?: ThemeConfig }): Promise<AuthenticateResult> {
    const dialogUrl = this.getDialogUrl();
    const params = new URLSearchParams({
      mode: 'iframe',
    });
    if (this.config.clientId) {
      params.set('clientId', this.config.clientId);
    }

    if (options?.challenge) {
      params.set('challenge', options.challenge);
    }

    // Add theme params
    const themeParams = this.getThemeParams(options?.theme);
    if (themeParams) {
      const themeParsed = new URLSearchParams(themeParams);
      themeParsed.forEach((value, key) => params.set(key, value));
    }

    const url = `${dialogUrl}/dialog/authenticate?${params.toString()}`;

    const { dialog, iframe, cleanup } = this.createModalDialog(url);

    return this.waitForAuthenticateResponse(dialog, iframe, cleanup);
  }

  /**
   * Show signing in a modal overlay (iframe dialog)
   */
  async signWithModal(options: SigningRequestOptions & { theme?: ThemeConfig }): Promise<SigningResult> {
    const dialogUrl = this.getDialogUrl();
    const themeParams = this.getThemeParams(options?.theme);
    const signingUrl = `${dialogUrl}/dialog/sign?mode=iframe${themeParams ? `&${themeParams}` : ''}`;

    const { dialog, iframe, cleanup } = this.createModalDialog(signingUrl);

    const ready = await this.waitForDialogReady(dialog, iframe, cleanup, {
      mode: "iframe",
      challenge: options.challenge,
      username: options.username,
      description: options.description,
      transaction: options.transaction,
      metadata: options.metadata,
    });
    if (!ready) {
      return {
        success: false,
        error: {
          code: "USER_REJECTED" as SigningErrorCode,
          message: "User closed the dialog",
        },
      };
    }

    return this.waitForSigningResponse(dialog, iframe, cleanup);
  }

  /**
   * Send an intent to the Rhinestone orchestrator
   *
   * This is the high-level method for cross-chain transactions:
   * 1. Prepares the intent (gets quote from orchestrator)
   * 2. Shows the signing modal with real fees
   * 3. Submits the signed intent for execution
   * 4. Returns the transaction hash
   *
   * @example
   * ```typescript
   * const result = await client.sendIntent({
   *   username: 'alice',
   *   targetChain: 8453, // Base
   *   calls: [
   *     {
   *       to: '0x...',
   *       data: '0x...',
   *       label: 'Swap ETH for USDC',
   *       sublabel: '0.1 ETH → ~250 USDC',
   *     },
   *   ],
   * });
   *
   * if (result.success) {
   *   console.log('Transaction hash:', result.transactionHash);
   * }
   * ```
   */
  async sendIntent(options: SendIntentOptions): Promise<SendIntentResult> {
    // Determine username, targetChain, and calls from either signedIntent or direct options
    const signedIntent = options.signedIntent
      ? {
        ...options.signedIntent,
        merchantId:
          options.signedIntent.merchantId || options.signedIntent.developerId,
      }
      : undefined;
    const username = signedIntent?.username || options.username;
    const targetChain = signedIntent?.targetChain || options.targetChain;
    const calls = signedIntent?.calls || options.calls;

    if (signedIntent && !signedIntent.merchantId) {
      return {
        success: false,
        intentId: "",
        status: "failed",
        error: {
          code: "INVALID_OPTIONS",
          message: "Signed intent requires developerId (clientId)",
        },
      };
    }

    // Validate we have required fields
    if (!username && !signedIntent?.accountAddress) {
      return {
        success: false,
        intentId: "",
        status: "failed",
        error: {
          code: "INVALID_OPTIONS",
          message: "Either username, accountAddress, or signedIntent with user identifier is required",
        },
      };
    }

    if (!targetChain || !calls?.length) {
      return {
        success: false,
        intentId: "",
        status: "failed",
        error: {
          code: "INVALID_OPTIONS",
          message: "targetChain and calls are required (either directly or via signedIntent)",
        },
      };
    }

    // 1. Prepare intent (get quote from orchestrator)
    // If signedIntent is provided, send it directly for signature verification
    // Otherwise, send unsigned request (only works for first-party apps in ALLOWED_ORIGINS)
    // Convert bigint amounts to strings for API serialization
    const serializedTokenRequests = options.tokenRequests?.map((r) => ({
      token: r.token,
      amount: r.amount.toString(),
    }));
    let prepareResponse: PrepareIntentResponse;
    // Define requestBody outside try block so it's accessible for quote refresh
    const requestBody = signedIntent || {
      username: options.username,
      targetChain: options.targetChain,
      calls: options.calls,
      tokenRequests: serializedTokenRequests,
      sourceAssets: options.sourceAssets,
      sourceChainId: options.sourceChainId,
      ...(this.config.clientId && { clientId: this.config.clientId }),
    };

    try {
      const response = await fetch(`${this.config.providerUrl}/api/intent/prepare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || "Failed to prepare intent";

        // If user not found, clear stored user to force re-authentication
        if (errorMessage.includes("User not found")) {
          localStorage.removeItem("1auth-user");
        }

        return {
          success: false,
          intentId: "",
          status: "failed",
          error: {
            code: errorMessage.includes("User not found") ? "USER_NOT_FOUND" : "PREPARE_FAILED",
            message: errorMessage,
          },
        };
      }

      prepareResponse = await response.json();
    } catch (error) {
      return {
        success: false,
        intentId: "",
        status: "failed",
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Network error",
        },
      };
    }

    // 2. Show signing modal (no DB storage - data sent via postMessage)
    const dialogUrl = this.getDialogUrl();
    const themeParams = this.getThemeParams();
    const signingUrl = `${dialogUrl}/dialog/sign?mode=iframe${themeParams ? `&${themeParams}` : ''}`;
    const { dialog, iframe, cleanup } = this.createModalDialog(signingUrl);

    // 3. Wait for dialog to signal ready, then send signing data
    const dialogOrigin = this.getDialogOrigin();
    const ready = await this.waitForDialogReady(dialog, iframe, cleanup, {
      mode: "iframe",
      calls,
      chainId: targetChain,
      transaction: prepareResponse.transaction,
      challenge: prepareResponse.challenge,
      username,
      accountAddress: prepareResponse.accountAddress,
      originMessages: prepareResponse.originMessages,
      tokenRequests: serializedTokenRequests,
      expiresAt: prepareResponse.expiresAt,
      userId: prepareResponse.userId,
      intentOp: prepareResponse.intentOp,
    });
    if (!ready) {
      return {
        success: false,
        intentId: "",
        status: "failed" as const,
        error: { code: "USER_CANCELLED", message: "User closed the dialog" },
      };
    }

    // 4. Wait for signing result with auto-refresh support
    // This custom handler handles both signing results AND quote refresh requests
    const signingResult = await this.waitForSigningWithRefresh(
      dialog,
      iframe,
      cleanup,
      dialogOrigin,
      // Refresh callback - called when dialog requests a quote refresh
      async () => {
        console.log("[SDK] Dialog requested quote refresh, re-preparing intent");
        try {
          const refreshResponse = await fetch(`${this.config.providerUrl}/api/intent/prepare`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            credentials: "include",
          });

          if (!refreshResponse.ok) {
            console.error("[SDK] Quote refresh failed:", await refreshResponse.text());
            return null;
          }

          const refreshedData = await refreshResponse.json();
          // Update prepareResponse with refreshed data for execute step
          prepareResponse = refreshedData;
          return {
            intentOp: refreshedData.intentOp,
            expiresAt: refreshedData.expiresAt,
            challenge: refreshedData.challenge,
            originMessages: refreshedData.originMessages,
            transaction: refreshedData.transaction,
          };
        } catch (error) {
          console.error("[SDK] Quote refresh error:", error);
          return null;
        }
      }
    );

    if (!signingResult.success) {
      // cleanup already called if user rejected via X button
      return {
        success: false,
        intentId: "", // No intentId yet - signing was cancelled before execute
        status: "failed",
        error: signingResult.error,
      };
    }

    // Check if dialog already executed the intent (new secure flow)
    // In this case, signingResult contains intentId instead of signature
    const dialogExecutedIntent = "intentId" in signingResult && signingResult.intentId;

    // 5. Execute intent with signature (skip if dialog already executed)
    let executeResponse: ExecuteIntentResponse;

    if (dialogExecutedIntent) {
      // Dialog already executed - use the returned intentId
      executeResponse = {
        success: true,
        intentId: signingResult.intentId as string,
        status: "pending",
      };
    } else {
      // Legacy flow - execute with signature from dialog
      try {
        const response = await fetch(`${this.config.providerUrl}/api/intent/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // Data from prepare response (no intentId yet - created on execute)
            intentOp: prepareResponse.intentOp,
            userId: prepareResponse.userId,
            targetChain: prepareResponse.targetChain,
            calls: prepareResponse.calls,
            expiresAt: prepareResponse.expiresAt,
            // Signature from dialog
            signature: signingResult.signature,
            passkey: signingResult.passkey, // Include passkey info for signature encoding
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // Send failure status to dialog
          this.sendTransactionStatus(iframe, "failed");
          // Wait for dialog to close
          await this.waitForDialogClose(dialog, cleanup);
          return {
            success: false,
            intentId: "", // No intentId - execute failed before creation
            status: "failed",
            error: {
              code: "EXECUTE_FAILED",
              message: errorData.error || "Failed to execute intent",
            },
          };
        }

        executeResponse = await response.json();
      } catch (error) {
        // Send failure status to dialog
        this.sendTransactionStatus(iframe, "failed");
        // Wait for dialog to close
        await this.waitForDialogClose(dialog, cleanup);
        return {
          success: false,
          intentId: "", // No intentId - network error before creation
          status: "failed",
          error: {
            code: "NETWORK_ERROR",
            message: error instanceof Error ? error.message : "Network error",
          },
        };
      }
    }

    // 6. Poll for completion with status updates to dialog
    let finalStatus = executeResponse.status;
    let finalTxHash = executeResponse.transactionHash;

    if (finalStatus === "pending") {
      // Send initial pending status to dialog
      this.sendTransactionStatus(iframe, "pending");

      // Poll status endpoint for updates
      const maxAttempts = 120; // 3 minutes at 1.5s intervals
      const pollIntervalMs = 1500;
      let lastStatus = "pending";

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const statusResponse = await fetch(
            `${this.config.providerUrl}/api/intent/status/${executeResponse.intentId}`,
            {
              method: "GET",
              headers: this.config.clientId
                ? { "x-client-id": this.config.clientId }
                : {},
            }
          );

          if (statusResponse.ok) {
            const statusResult = await statusResponse.json();
            finalStatus = statusResult.status;
            finalTxHash = statusResult.transactionHash;

            // Send status update to dialog if changed
            if (finalStatus !== lastStatus) {
              this.sendTransactionStatus(iframe, finalStatus, finalTxHash);
              lastStatus = finalStatus;
            }

            // Exit if terminal status reached
            // closeOn determines when to consider the intent successful (default: preconfirmed)
            const closeOn = options.closeOn || "preconfirmed";
            const successStatuses: Record<string, string[]> = {
              claimed: ["claimed", "preconfirmed", "filled", "completed"],
              preconfirmed: ["preconfirmed", "filled", "completed"],
              filled: ["filled", "completed"],
              completed: ["completed"],
            };
            const isTerminal = finalStatus === "failed" || finalStatus === "expired";
            const isSuccess = successStatuses[closeOn]?.includes(finalStatus) ?? false;
            if (isTerminal || isSuccess) {
              break;
            }
          }
        } catch (pollError) {
          console.error("Failed to poll intent status:", pollError);
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    // 7. Send final status to dialog
    // Map successful statuses to "confirmed" based on closeOn setting
    const closeOn = options.closeOn || "preconfirmed";
    const successStatuses: Record<string, string[]> = {
      claimed: ["claimed", "preconfirmed", "filled", "completed"],
      preconfirmed: ["preconfirmed", "filled", "completed"],
      filled: ["filled", "completed"],
      completed: ["completed"],
    };
    const isSuccessStatus = successStatuses[closeOn]?.includes(finalStatus) ?? false;
    const displayStatus = isSuccessStatus ? "confirmed" : finalStatus;
    this.sendTransactionStatus(iframe, displayStatus, finalTxHash);

    // Wait for dialog to be closed by user
    await this.waitForDialogClose(dialog, cleanup);

    if (options.waitForHash && !finalTxHash) {
      const hash = await this.waitForTransactionHash(executeResponse.intentId, {
        timeoutMs: options.hashTimeoutMs,
        intervalMs: options.hashIntervalMs,
      });
      if (hash) {
        finalTxHash = hash;
        finalStatus = "completed";
      } else {
        finalStatus = "failed";
        return {
          success: false,
          intentId: executeResponse.intentId,
          status: finalStatus,
          transactionHash: finalTxHash,
          operationId: executeResponse.operationId,
          error: {
            code: "HASH_TIMEOUT",
            message: "Timed out waiting for transaction hash",
          },
        };
      }
    }

    return {
      success: isSuccessStatus,
      intentId: executeResponse.intentId,
      status: finalStatus,
      transactionHash: finalTxHash,
      operationId: executeResponse.operationId,
      error: executeResponse.error,
    };
  }

  /**
   * Send a batch of intents for multi-chain execution with a single passkey tap.
   *
   * This method prepares multiple intents, shows a paginated review,
   * and signs all intents with a single passkey tap via a shared merkle tree.
   *
   * @example
   * ```typescript
   * const result = await client.sendBatchIntent({
   *   username: 'alice',
   *   intents: [
   *     {
   *       targetChain: 8453, // Base
   *       calls: [{ to: '0x...', data: '0x...', label: 'Swap on Base' }],
   *     },
   *     {
   *       targetChain: 42161, // Arbitrum
   *       calls: [{ to: '0x...', data: '0x...', label: 'Mint on Arbitrum' }],
   *     },
   *   ],
   * });
   *
   * if (result.success) {
   *   console.log(`${result.successCount} intents submitted`);
   * }
   * ```
   */
  async sendBatchIntent(options: SendBatchIntentOptions): Promise<SendBatchIntentResult> {
    if (!options.username) {
      return {
        success: false,
        results: [],
        successCount: 0,
        failureCount: 0,
      };
    }

    if (!options.intents?.length) {
      return {
        success: false,
        results: [],
        successCount: 0,
        failureCount: 0,
      };
    }

    // Serialize token request amounts to strings for API
    const serializedIntents = options.intents.map((intent) => ({
      targetChain: intent.targetChain,
      calls: intent.calls,
      tokenRequests: intent.tokenRequests?.map((r) => ({
        token: r.token,
        amount: r.amount.toString(),
      })),
      sourceAssets: intent.sourceAssets,
      sourceChainId: intent.sourceChainId,
    }));

    const requestBody = {
      username: options.username,
      intents: serializedIntents,
      ...(this.config.clientId && { clientId: this.config.clientId }),
    };

    // 1. Prepare batch (get quotes for all intents, compute shared merkle root)
    let prepareResponse: PrepareBatchIntentResponse;
    try {
      const response = await fetch(`${this.config.providerUrl}/api/intent/batch-prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || "Failed to prepare batch intent";

        if (errorMessage.includes("User not found")) {
          localStorage.removeItem("1auth-user");
        }

        return {
          success: false,
          results: [],
          successCount: 0,
          failureCount: 0,
        };
      }

      prepareResponse = await response.json();
    } catch {
      return {
        success: false,
        results: [],
        successCount: 0,
        failureCount: 0,
      };
    }

    // 2. Open signing dialog
    const dialogUrl = this.getDialogUrl();
    const themeParams = this.getThemeParams();
    const signingUrl = `${dialogUrl}/dialog/sign?mode=iframe${themeParams ? `&${themeParams}` : ''}`;
    const { dialog, iframe, cleanup } = this.createModalDialog(signingUrl);

    // 3. Wait for dialog ready, send batch data via PASSKEY_INIT
    const dialogOrigin = this.getDialogOrigin();
    const ready = await this.waitForDialogReady(dialog, iframe, cleanup, {
      mode: "iframe",
      batchMode: true,
      batchIntents: prepareResponse.intents,
      challenge: prepareResponse.challenge,
      username: options.username,
      accountAddress: prepareResponse.accountAddress,
      userId: prepareResponse.userId,
      expiresAt: prepareResponse.expiresAt,
    });
    if (!ready) {
      return {
        success: false,
        results: [],
        successCount: 0,
        failureCount: 0,
      };
    }

    // 4. Wait for batch signing result with auto-refresh support
    const batchResult = await new Promise<SendBatchIntentResult>((resolve) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;

        const message = event.data;

        // Handle quote refresh request
        if (message?.type === "PASSKEY_REFRESH_QUOTE") {
          console.log("[SDK] Batch dialog requested quote refresh, re-preparing all intents");
          try {
            const refreshResponse = await fetch(`${this.config.providerUrl}/api/intent/batch-prepare`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            });

            if (refreshResponse.ok) {
              const refreshed: PrepareBatchIntentResponse = await refreshResponse.json();
              prepareResponse = refreshed;
              iframe.contentWindow?.postMessage({
                type: "PASSKEY_REFRESH_COMPLETE",
                batchIntents: refreshed.intents,
                challenge: refreshed.challenge,
                expiresAt: refreshed.expiresAt,
              }, dialogOrigin);
            } else {
              iframe.contentWindow?.postMessage({
                type: "PASSKEY_REFRESH_ERROR",
                error: "Failed to refresh batch quotes",
              }, dialogOrigin);
            }
          } catch {
            iframe.contentWindow?.postMessage({
              type: "PASSKEY_REFRESH_ERROR",
              error: "Failed to refresh batch quotes",
            }, dialogOrigin);
          }
          return;
        }

        // Handle signing result with batch results
        if (message?.type === "PASSKEY_SIGNING_RESULT") {
          window.removeEventListener("message", handleMessage);

          if (message.success && message.data?.batchResults) {
            const rawResults: Array<{
              index: number;
              operationId?: string;
              intentId?: string;
              status: string;
              error?: string;
              success?: boolean;
            }> = message.data.batchResults;

            const results: BatchIntentItemResult[] = rawResults.map((r) => ({
              index: r.index,
              success: r.success ?? r.status !== "FAILED",
              intentId: r.intentId || r.operationId || "",
              status: r.status === "FAILED" ? "failed" : "pending",
              error: r.error ? { code: "EXECUTE_FAILED", message: r.error } : undefined,
            }));

            const successCount = results.filter((r) => r.success).length;

            // Wait for user to close dialog
            await this.waitForDialogClose(dialog, cleanup);

            resolve({
              success: successCount === results.length,
              results,
              successCount,
              failureCount: results.length - successCount,
            });
          } else {
            // Signing failed or was cancelled
            cleanup();
            resolve({
              success: false,
              results: [],
              successCount: 0,
              failureCount: 0,
            });
          }
        }

        // Handle dialog close
        if (message?.type === "PASSKEY_CLOSE") {
          window.removeEventListener("message", handleMessage);
          cleanup();
          resolve({
            success: false,
            results: [],
            successCount: 0,
            failureCount: 0,
          });
        }
      };

      window.addEventListener("message", handleMessage);
    });

    return batchResult;
  }

  /**
   * Send transaction status to the dialog iframe
   */
  private sendTransactionStatus(
    iframe: HTMLIFrameElement,
    status: string,
    transactionHash?: string
  ): void {
    const dialogOrigin = this.getDialogOrigin();
    iframe.contentWindow?.postMessage(
      {
        type: "TRANSACTION_STATUS",
        status,
        transactionHash,
      },
      dialogOrigin
    );
  }

  /**
   * Wait for the signing result without closing the modal
   */
  private waitForIntentSigningResponse(
    requestId: string,
    dialog: HTMLDialogElement,
    _iframe: HTMLIFrameElement,
    cleanup: () => void
  ): Promise<SigningResult> {
    const dialogOrigin = this.getDialogOrigin();

    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;

        const message = event.data;
        const payload = message?.data as { requestId?: string; signature?: WebAuthnSignature; passkey?: { credentialId: string; publicKeyX: string; publicKeyY: string } } | undefined;

        if (message?.type === "PASSKEY_SIGNING_RESULT" && payload?.requestId === requestId) {
          window.removeEventListener("message", handleMessage);

          if (message.success && payload.signature) {
            resolve({
              success: true,
              requestId,
              signature: payload.signature,
              passkey: payload.passkey, // Include passkey info for signature encoding
            });
          } else {
            resolve({
              success: false,
              error: message.error || {
                code: "SIGNING_FAILED" as SigningErrorCode,
                message: "Signing failed",
              },
            });
          }
        } else if (message?.type === "PASSKEY_CLOSE") {
          // User clicked X button to close/reject
          window.removeEventListener("message", handleMessage);
          cleanup();
          resolve({
            success: false,
            error: {
              code: "USER_REJECTED" as SigningErrorCode,
              message: "User closed the dialog",
            },
          });
        }
      };

      window.addEventListener("message", handleMessage);
      dialog.showModal();
    });
  }

  /**
   * Wait for signing result (simplified - no requestId matching)
   */
  private waitForSigningResponse(
    dialog: HTMLDialogElement,
    _iframe: HTMLIFrameElement,
    cleanup: () => void
  ): Promise<SigningResult & { signedHash?: string }> {
    const dialogOrigin = this.getDialogOrigin();
    console.log("[SDK] waitForSigningResponse, expecting origin:", dialogOrigin);

    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        console.log("[SDK] Received message:", event.origin, event.data?.type);
        if (event.origin !== dialogOrigin) {
          console.log("[SDK] Origin mismatch, ignoring. Expected:", dialogOrigin, "Got:", event.origin);
          return;
        }

        const message = event.data;
        const payload = message?.data as { signature?: WebAuthnSignature; passkey?: { credentialId: string; publicKeyX: string; publicKeyY: string }; signedHash?: string; intentId?: string } | undefined;

        if (message?.type === "PASSKEY_SIGNING_RESULT") {
          window.removeEventListener("message", handleMessage);

          // Check if dialog already executed the intent (new secure flow)
          if (message.success && payload?.intentId) {
            resolve({
              success: true,
              intentId: payload.intentId,
            } as SigningResult & { signedHash?: string; intentId?: string });
          } else if (message.success && payload?.signature) {
            // Legacy flow - dialog returns signature for SDK to execute
            resolve({
              success: true,
              signature: payload.signature,
              passkey: payload.passkey,
              signedHash: payload.signedHash,
            });
          } else {
            resolve({
              success: false,
              error: message.error || {
                code: "SIGNING_FAILED" as SigningErrorCode,
                message: "Signing failed",
              },
            });
          }
        } else if (message?.type === "PASSKEY_CLOSE") {
          window.removeEventListener("message", handleMessage);
          cleanup();
          resolve({
            success: false,
            error: {
              code: "USER_REJECTED" as SigningErrorCode,
              message: "User closed the dialog",
            },
          });
        }
      };

      window.addEventListener("message", handleMessage);
    });
  }

  /**
   * Wait for signing result with auto-refresh support
   * This method handles both signing results and quote refresh requests from the dialog
   */
  private waitForSigningWithRefresh(
    dialog: HTMLDialogElement,
    iframe: HTMLIFrameElement,
    cleanup: () => void,
    dialogOrigin: string,
    onRefresh: () => Promise<{
      intentOp: string;
      expiresAt: string;
      challenge: string;
      originMessages?: Array<{ chainId: number; hash: string }>;
      transaction?: unknown;
    } | null>
  ): Promise<SigningResult & { signedHash?: string }> {
    console.log("[SDK] waitForSigningWithRefresh, expecting origin:", dialogOrigin);

    return new Promise((resolve) => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;

        const message = event.data;

        // Handle quote refresh request from dialog
        if (message?.type === "PASSKEY_REFRESH_QUOTE") {
          console.log("[SDK] Received quote refresh request from dialog");
          const refreshedData = await onRefresh();

          if (refreshedData) {
            // Send refreshed quote data to dialog
            iframe.contentWindow?.postMessage({
              type: "PASSKEY_REFRESH_COMPLETE",
              ...refreshedData,
            }, dialogOrigin);
          } else {
            // Send error if refresh failed
            iframe.contentWindow?.postMessage({
              type: "PASSKEY_REFRESH_ERROR",
              error: "Failed to refresh quote",
            }, dialogOrigin);
          }
          return;
        }

        const payload = message?.data as {
          signature?: WebAuthnSignature;
          passkey?: { credentialId: string; publicKeyX: string; publicKeyY: string };
          signedHash?: string;
          intentId?: string;
        } | undefined;

        if (message?.type === "PASSKEY_SIGNING_RESULT") {
          window.removeEventListener("message", handleMessage);

          // Check if dialog already executed the intent (new secure flow)
          if (message.success && payload?.intentId) {
            resolve({
              success: true,
              intentId: payload.intentId,
            } as SigningResult & { signedHash?: string; intentId?: string });
          } else if (message.success && payload?.signature) {
            // Legacy flow - dialog returns signature for SDK to execute
            resolve({
              success: true,
              signature: payload.signature,
              passkey: payload.passkey,
              signedHash: payload.signedHash,
            });
          } else {
            resolve({
              success: false,
              error: message.error || {
                code: "SIGNING_FAILED" as SigningErrorCode,
                message: "Signing failed",
              },
            });
          }
        } else if (message?.type === "PASSKEY_CLOSE") {
          window.removeEventListener("message", handleMessage);
          cleanup();
          resolve({
            success: false,
            error: {
              code: "USER_REJECTED" as SigningErrorCode,
              message: "User closed the dialog",
            },
          });
        }
      };

      window.addEventListener("message", handleMessage);
    });
  }

  /**
   * Wait for the dialog to be closed
   */
  private waitForDialogClose(
    dialog: HTMLDialogElement,
    cleanup: () => void
  ): Promise<void> {
    const dialogOrigin = this.getDialogOrigin();

    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;

        if (event.data?.type === "PASSKEY_CLOSE") {
          window.removeEventListener("message", handleMessage);
          cleanup();
          resolve();
        }
      };

      // Also handle dialog close via escape key or clicking outside
      const handleClose = () => {
        window.removeEventListener("message", handleMessage);
        dialog.removeEventListener("close", handleClose);
        cleanup();
        resolve();
      };

      window.addEventListener("message", handleMessage);
      dialog.addEventListener("close", handleClose);
    });
  }

  /**
   * Poll for intent status
   *
   * Use this to check on the status of a submitted intent
   * that hasn't completed yet.
   */
  async getIntentStatus(intentId: string): Promise<SendIntentResult> {
    try {
      const response = await fetch(
        `${this.config.providerUrl}/api/intent/status/${intentId}`,
        {
          headers: this.config.clientId
            ? { "x-client-id": this.config.clientId }
            : {},
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          intentId,
          status: "failed",
          error: {
            code: "STATUS_FAILED",
            message: errorData.error || "Failed to get intent status",
          },
        };
      }

      const data = await response.json();
      return {
        success: data.status === "completed",
        intentId,
        status: data.status,
        transactionHash: data.transactionHash,
        operationId: data.operationId,
      };
    } catch (error) {
      return {
        success: false,
        intentId,
        status: "failed",
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Network error",
        },
      };
    }
  }

  /**
   * Get the history of intents for the authenticated user.
   *
   * Requires an active session (user must be logged in).
   *
   * @example
   * ```typescript
   * // Get recent intents
   * const history = await client.getIntentHistory({ limit: 10 });
   *
   * // Filter by status
   * const pending = await client.getIntentHistory({ status: 'pending' });
   *
   * // Filter by date range
   * const lastWeek = await client.getIntentHistory({
   *   from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
   * });
   * ```
   */
  async getIntentHistory(
    options?: IntentHistoryOptions
  ): Promise<IntentHistoryResult> {
    const queryParams = new URLSearchParams();
    if (options?.limit) queryParams.set("limit", String(options.limit));
    if (options?.offset) queryParams.set("offset", String(options.offset));
    if (options?.status) queryParams.set("status", options.status);
    if (options?.from) queryParams.set("from", options.from);
    if (options?.to) queryParams.set("to", options.to);

    const url = `${this.config.providerUrl}/api/intent/history${
      queryParams.toString() ? `?${queryParams}` : ""
    }`;

    const response = await fetch(url, {
      headers: this.config.clientId
        ? { "x-client-id": this.config.clientId }
        : {},
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to get intent history");
    }

    return response.json();
  }

  /**
   * Send a swap intent through the Rhinestone orchestrator
   *
   * This is a high-level abstraction for token swaps (including cross-chain):
   * 1. Resolves token symbols to addresses
   * 2. Builds the swap intent with tokenRequests (output-first model)
   * 3. The orchestrator's solver network finds the best route
   * 4. Executes via the standard intent flow
   *
   * NOTE: The `amount` parameter specifies the OUTPUT amount (what the user wants to receive),
   * not the input amount. The orchestrator will calculate the required input from sourceAssets.
   *
   * @example
   * ```typescript
   * // Buy 100 USDC using ETH on Base
   * const result = await client.sendSwap({
   *   username: 'alice',
   *   targetChain: 8453,
   *   fromToken: 'ETH',
   *   toToken: 'USDC',
   *   amount: '100', // Receive 100 USDC
   * });
   *
   * // Cross-chain: Buy 50 USDC on Base, paying with ETH from any chain
   * const result = await client.sendSwap({
   *   username: 'alice',
   *   targetChain: 8453, // Base
   *   fromToken: 'ETH',
   *   toToken: 'USDC',
   *   amount: '50', // Receive 50 USDC
   * });
   * ```
   */
  async sendSwap(options: SendSwapOptions): Promise<SendSwapResult> {
    try {
      getChainById(options.targetChain);
    } catch {
      return {
        success: false,
        intentId: "",
        status: "failed",
        error: {
          code: "INVALID_CHAIN",
          message: `Unsupported chain: ${options.targetChain}`,
        },
      };
    }

    const resolveToken = (token: string, label: "fromToken" | "toToken") => {
      try {
        const address = resolveTokenAddress(token, options.targetChain);
        if (!isTokenAddressSupported(address, options.targetChain)) {
          return {
            error: `Unsupported ${label}: ${token} on chain ${options.targetChain}`,
          };
        }
        return { address };
      } catch (error) {
        return {
          error: error instanceof Error
            ? error.message
            : `Unsupported ${label}: ${token} on chain ${options.targetChain}`,
        };
      }
    };

    const fromTokenResult = resolveToken(options.fromToken, "fromToken");
    if (!fromTokenResult.address) {
      return {
        success: false,
        intentId: "",
        status: "failed",
        error: {
          code: "INVALID_TOKEN",
          message: fromTokenResult.error || `Unknown fromToken: ${options.fromToken}`,
        },
      };
    }

    const toTokenResult = resolveToken(options.toToken, "toToken");
    if (!toTokenResult.address) {
      return {
        success: false,
        intentId: "",
        status: "failed",
        error: {
          code: "INVALID_TOKEN",
          message: toTokenResult.error || `Unknown toToken: ${options.toToken}`,
        },
      };
    }

    const fromTokenAddress = fromTokenResult.address;
    const toTokenAddress = toTokenResult.address;

    // Debug: log token resolution
    console.log("[SDK sendSwap] Token resolution:", {
      fromToken: options.fromToken,
      fromTokenAddress,
      toToken: options.toToken,
      toTokenAddress,
      targetChain: options.targetChain,
    });

    const formatTokenLabel = (token: string, fallback: string): string => {
      if (!token.startsWith("0x")) {
        return token.toUpperCase();
      }
      try {
        return getTokenSymbol(token as Address, options.targetChain);
      } catch {
        return fallback;
      }
    };

    const fromSymbol = formatTokenLabel(
      options.fromToken,
      `${options.fromToken.slice(0, 6)}...${options.fromToken.slice(-4)}`
    );
    const toSymbol = formatTokenLabel(
      options.toToken,
      `${options.toToken.slice(0, 6)}...${options.toToken.slice(-4)}`
    );

    // Check if swapping from/to native ETH
    const isFromNativeEth =
      fromTokenAddress === "0x0000000000000000000000000000000000000000";
    const isToNativeEth =
      toTokenAddress === "0x0000000000000000000000000000000000000000";

    // Get decimals for the tokens to convert human-readable amounts to base units
    // Use known decimals for common tokens as fallback
    const KNOWN_DECIMALS: Record<string, number> = {
      ETH: 18,
      WETH: 18,
      USDC: 6,
      USDT: 6,
      USDT0: 6,
    };
    const getDecimals = (symbol: string, chainId: number): number => {
      const upperSymbol = symbol.toUpperCase();
      try {
        const decimals = getTokenDecimals(upperSymbol as never, chainId);
        console.log(`[SDK] getTokenDecimals(${upperSymbol}, ${chainId}) = ${decimals}`);
        return decimals;
      } catch (e) {
        console.warn(`[SDK] getTokenDecimals failed for ${upperSymbol}, using fallback`, e);
        return KNOWN_DECIMALS[upperSymbol] ?? 18;
      }
    };
    const fromDecimals = getDecimals(options.fromToken, options.targetChain);
    const toDecimals = getDecimals(options.toToken, options.targetChain);

    // Check if this is a bridge (same token) or swap (different tokens)
    const isBridge = options.fromToken.toUpperCase() === options.toToken.toUpperCase();

    // Build tokenRequests - tells orchestrator what output token/amount we want
    // The amount parameter now represents OUTPUT (what user wants to receive)
    // Always specify tokenRequests so the orchestrator knows the desired output and we can show "Buying" in UI
    const tokenRequests: IntentTokenRequest[] = [{
      token: toTokenAddress,
      amount: parseUnits(options.amount, toDecimals),
    }];

    console.log("[SDK sendSwap] Building intent:", {
      isBridge,
      isFromNativeEth,
      isToNativeEth,
      fromDecimals,
      toDecimals,
      tokenRequests,
    });

    // Build the intent
    // The orchestrator will handle finding the best swap/bridge route
    // For swaps/bridges, we use tokenRequests to specify output
    // We need at least one call (SDK requirement), so we use a minimal placeholder
    // The label/sublabel tell the dialog what to display (instead of "Send" with unknown address)
    const result = await this.sendIntent({
      username: options.username,
      targetChain: options.targetChain,
      calls: [
        {
          // Minimal call - just signals to orchestrator we want the tokenRequests delivered
          to: toTokenAddress,
          value: "0",
          // SDK provides labels so dialog shows "Buy ETH" not "Send ETH / To: 0x000..."
          label: `Buy ${toSymbol}`,
          sublabel: `${options.amount} ${toSymbol}`,
        },
      ],
      // Request specific output tokens - this is what actually matters for swaps
      tokenRequests,
      // Constrain orchestrator to use only the fromToken as input
      // This ensures the swap uses the correct source token
      // Pass the symbol (not address) so orchestrator can resolve per-chain
      sourceAssets: options.sourceAssets || [options.fromToken.toUpperCase()],
      // Pass source chain ID so orchestrator knows which chain to look for tokens on
      sourceChainId: options.sourceChainId,
      closeOn: options.closeOn || "preconfirmed",
      waitForHash: options.waitForHash,
      hashTimeoutMs: options.hashTimeoutMs,
      hashIntervalMs: options.hashIntervalMs,
    });

    // Return with swap-specific data
    return {
      ...result,
      quote: result.success
        ? {
          fromToken: fromTokenAddress,
          toToken: toTokenAddress,
          amountIn: options.amount,
          amountOut: "", // Filled by orchestrator quote
          rate: "",
        }
        : undefined,
    };
  }

  /**
   * Sign an arbitrary message with the user's passkey
   *
   * This is for off-chain message signing (e.g., authentication challenges,
   * terms acceptance, login signatures), NOT for transaction signing.
   * The message is displayed to the user and signed with their passkey.
   *
   * @example
   * ```typescript
   * // Sign a login challenge
   * const result = await client.signMessage({
   *   username: 'alice',
   *   message: `Sign in to MyApp\nTimestamp: ${Date.now()}\nNonce: ${crypto.randomUUID()}`,
   *   description: 'Verify your identity to continue',
   * });
   *
   * if (result.success) {
   *   // Send signature to your backend for verification
   *   await fetch('/api/verify', {
   *     method: 'POST',
   *     body: JSON.stringify({
   *       signature: result.signature,
   *       message: result.signedMessage,
   *     }),
   *   });
   * }
   * ```
   */
  async signMessage(options: SignMessageOptions): Promise<SignMessageResult> {
    const dialogUrl = this.getDialogUrl();
    const themeParams = this.getThemeParams(options?.theme);
    const signingUrl = `${dialogUrl}/dialog/sign?mode=iframe${themeParams ? `&${themeParams}` : ''}`;

    const { dialog, iframe, cleanup } = this.createModalDialog(signingUrl);

    const ready = await this.waitForDialogReady(dialog, iframe, cleanup, {
      mode: "iframe",
      message: options.message,
      challenge: options.challenge || options.message,
      username: options.username,
      description: options.description,
      metadata: options.metadata,
    });
    if (!ready) {
      return {
        success: false,
        error: {
          code: "USER_REJECTED" as SigningErrorCode,
          message: "User closed the dialog",
        },
      };
    }

    const signingResult = await this.waitForSigningResponse(dialog, iframe, cleanup);

    cleanup();

    if (signingResult.success) {
      return {
        success: true,
        signature: signingResult.signature,
        signedMessage: options.message,
        signedHash: signingResult.signedHash as `0x${string}` | undefined,
        passkey: signingResult.passkey,
      };
    }

    return {
      success: false,
      error: signingResult.error,
    };
  }

  /**
   * Sign EIP-712 typed data with the user's passkey
   *
   * This method allows signing structured data following the EIP-712 standard.
   * The typed data is displayed to the user in a human-readable format before signing.
   *
   * @example
   * ```typescript
   * // Sign an ERC-2612 Permit
   * const result = await client.signTypedData({
   *   username: 'alice',
   *   domain: {
   *     name: 'Dai Stablecoin',
   *     version: '1',
   *     chainId: 1,
   *     verifyingContract: '0x6B175474E89094C44Da98b954EecdeCB5BE3830F',
   *   },
   *   types: {
   *     Permit: [
   *       { name: 'owner', type: 'address' },
   *       { name: 'spender', type: 'address' },
   *       { name: 'value', type: 'uint256' },
   *       { name: 'nonce', type: 'uint256' },
   *       { name: 'deadline', type: 'uint256' },
   *     ],
   *   },
   *   primaryType: 'Permit',
   *   message: {
   *     owner: '0xabc...',
   *     spender: '0xdef...',
   *     value: 1000000000000000000n,
   *     nonce: 0n,
   *     deadline: 1735689600n,
   *   },
   * });
   *
   * if (result.success) {
   *   console.log('Signed hash:', result.signedHash);
   * }
   * ```
   */
  async signTypedData(options: SignTypedDataOptions): Promise<SignTypedDataResult> {
    // Compute the EIP-712 hash using viem
    // Use unknown cast to work around viem's strict template literal type requirements
    const signedHash = hashTypedData({
      domain: options.domain,
      types: options.types,
      primaryType: options.primaryType,
      message: options.message,
    } as unknown as TypedDataDefinition);

    const dialogUrl = this.getDialogUrl();
    const themeParams = this.getThemeParams(options?.theme);
    const signingUrl = `${dialogUrl}/dialog/sign?mode=iframe${themeParams ? `&${themeParams}` : ''}`;

    const { dialog, iframe, cleanup } = this.createModalDialog(signingUrl);

    const ready = await this.waitForDialogReady(dialog, iframe, cleanup, {
      mode: "iframe",
      signingMode: "typedData",
      typedData: {
        domain: options.domain,
        types: options.types,
        primaryType: options.primaryType,
        message: options.message,
      },
      challenge: signedHash,
      username: options.username,
      description: options.description,
    });
    if (!ready) {
      return {
        success: false,
        error: {
          code: "USER_REJECTED" as SigningErrorCode,
          message: "User closed the dialog",
        },
      };
    }

    const signingResult = await this.waitForSigningResponse(dialog, iframe, cleanup);

    cleanup();

    if (signingResult.success) {
      return {
        success: true,
        signature: signingResult.signature,
        signedHash,
        passkey: signingResult.passkey,
      };
    }

    return {
      success: false,
      error: signingResult.error,
    };
  }

  async signWithPopup(options: SigningRequestOptions): Promise<SigningResult> {
    const request = await this.createSigningRequest(options, "popup");

    // Use dialogUrl to construct the signing URL (override server's URL)
    const dialogUrl = this.getDialogUrl();
    const signingUrl = `${dialogUrl}/dialog/sign/${request.requestId}?mode=popup`;

    const popup = this.openPopup(signingUrl);
    if (!popup) {
      return {
        success: false,
        error: {
          code: "POPUP_BLOCKED",
          message:
            "Popup was blocked by the browser. Please allow popups for this site.",
        },
      };
    }

    return this.waitForPopupResponse(request.requestId, popup);
  }

  async signWithRedirect(
    options: SigningRequestOptions,
    redirectUrl?: string
  ): Promise<void> {
    const finalRedirectUrl = redirectUrl || this.config.redirectUrl;
    if (!finalRedirectUrl) {
      throw new Error(
        "redirectUrl is required for redirect flow. Pass it to signWithRedirect() or set it in the constructor."
      );
    }

    const request = await this.createSigningRequest(
      options,
      "redirect",
      finalRedirectUrl
    );

    // Use dialogUrl to construct the signing URL (override server's URL)
    const dialogUrl = this.getDialogUrl();
    const signingUrl = `${dialogUrl}/dialog/sign/${request.requestId}?mode=redirect&redirectUrl=${encodeURIComponent(finalRedirectUrl)}`;

    window.location.href = signingUrl;
  }

  async signWithEmbed(
    options: SigningRequestOptions,
    embedOptions: EmbedOptions
  ): Promise<SigningResult> {
    const request = await this.createSigningRequest(options, "embed");

    const iframe = this.createEmbed(request.requestId, embedOptions);

    return this.waitForEmbedResponse(request.requestId, iframe, embedOptions);
  }

  private createEmbed(
    requestId: string,
    options: EmbedOptions
  ): HTMLIFrameElement {
    const dialogUrl = this.getDialogUrl();
    const iframe = document.createElement("iframe");
    iframe.src = `${dialogUrl}/dialog/sign/${requestId}?mode=iframe`;
    iframe.style.width = options.width || DEFAULT_EMBED_WIDTH;
    iframe.style.height = options.height || DEFAULT_EMBED_HEIGHT;
    iframe.style.border = "none";
    iframe.style.borderRadius = "12px";
    iframe.style.boxShadow = "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
    iframe.id = `passkey-embed-${requestId}`;
    iframe.allow = "publickey-credentials-get *; publickey-credentials-create *";

    iframe.onload = () => {
      options.onReady?.();
    };

    options.container.appendChild(iframe);

    return iframe;
  }

  private waitForEmbedResponse(
    requestId: string,
    iframe: HTMLIFrameElement,
    embedOptions: EmbedOptions
  ): Promise<SigningResult> {
    const dialogOrigin = this.getDialogOrigin();
    return new Promise((resolve) => {
      const cleanup = () => {
        window.removeEventListener("message", handleMessage);
        iframe.remove();
        embedOptions.onClose?.();
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) {
          return;
        }

        const message = event.data;
        // The Messenger sends: { type, success, data: { requestId, signature }, error }
        const payload = message?.data as { requestId?: string; signature?: WebAuthnSignature } | undefined;

        if (
          message?.type === "PASSKEY_SIGNING_RESULT" &&
          payload?.requestId === requestId
        ) {
          cleanup();

          if (message.success && payload.signature) {
            resolve({
              success: true,
              requestId,
              signature: payload.signature,
            });
          } else {
            resolve({
              success: false,
              requestId,
              error: message.error,
            });
          }
        }
      };

      window.addEventListener("message", handleMessage);
    });
  }

  removeEmbed(requestId: string): void {
    const iframe = document.getElementById(`passkey-embed-${requestId}`);
    if (iframe) {
      iframe.remove();
    }
  }

  async handleRedirectCallback(): Promise<SigningResult> {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get("request_id");
    const status = params.get("status");
    const error = params.get("error");
    const errorMessage = params.get("error_message");

    if (error) {
      return {
        success: false,
        requestId: requestId || undefined,
        error: {
          code: error as SigningResult extends { success: false }
            ? SigningResult["error"]["code"]
            : never,
          message: errorMessage || "Unknown error",
        },
      };
    }

    if (!requestId) {
      return {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "No request_id found in callback URL",
        },
      };
    }

    if (status !== "completed") {
      return {
        success: false,
        requestId,
        error: {
          code: "UNKNOWN",
          message: `Unexpected status: ${status}`,
        },
      };
    }

    return this.fetchSigningResult(requestId);
  }

  /**
   * Fetch passkeys for a user from the auth provider
   */
  async getPasskeys(username: string): Promise<PasskeyCredential[]> {
    const response = await fetch(
      `${this.config.providerUrl}/api/users/${encodeURIComponent(username)}/passkeys`,
      {
        headers: this.config.clientId
          ? { "x-client-id": this.config.clientId }
          : {},
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || "Failed to fetch passkeys");
    }

    const data: UserPasskeysResponse = await response.json();
    return data.passkeys;
  }

  private async createSigningRequest(
    options: SigningRequestOptions,
    mode: "popup" | "redirect" | "embed",
    redirectUrl?: string
  ): Promise<CreateSigningRequestResponse> {
    const response = await fetch(
      `${this.config.providerUrl}/api/sign/request`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(this.config.clientId && { clientId: this.config.clientId }),
          username: options.username,
          challenge: options.challenge,
          description: options.description,
          metadata: options.metadata,
          transaction: options.transaction,
          mode,
          redirectUrl,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || "Failed to create signing request");
    }

    return response.json();
  }

  private openPopup(url: string): Window | null {
    const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
    const top = window.screenY + 50; // Near top of window

    return window.open(
      url,
      "passkey-signing",
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},popup=true`
    );
  }

  /**
   * Wait for the dialog iframe to signal ready, then send init data.
   * Also handles early close (X button, escape, backdrop) during the ready phase.
   * Returns true if dialog is ready, false if it was closed before becoming ready.
   */
  private waitForDialogReady(
    dialog: HTMLDialogElement,
    iframe: HTMLIFrameElement,
    cleanup: () => void,
    initMessage: Record<string, unknown>,
  ): Promise<boolean> {
    const dialogOrigin = this.getDialogOrigin();
    return new Promise((resolve) => {
      let settled = false;

      const teardown = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", handleMessage);
        dialog.removeEventListener("close", handleClose);
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;
        if (event.data?.type === "PASSKEY_READY") {
          teardown();
          iframe.contentWindow?.postMessage({
            type: "PASSKEY_INIT",
            ...initMessage,
          }, dialogOrigin);
          resolve(true);
        } else if (event.data?.type === "PASSKEY_CLOSE") {
          teardown();
          cleanup();
          resolve(false);
        }
      };

      // Handle escape key / backdrop click which call cleanup() -> dialog.close()
      const handleClose = () => {
        teardown();
        resolve(false);
      };

      window.addEventListener("message", handleMessage);
      dialog.addEventListener("close", handleClose);
    });
  }

  /**
   * Create a modal dialog with an iframe inside.
   */
  private createModalDialog(url: string): {
    dialog: HTMLDialogElement;
    iframe: HTMLIFrameElement;
    cleanup: () => void;
  } {
    const dialogUrl = this.getDialogUrl();
    const hostUrl = new URL(dialogUrl);

    const dialog = document.createElement("dialog");
    dialog.dataset.passkey = "";
    document.body.appendChild(dialog);

    const style = document.createElement("style");
    style.textContent = `
      dialog[data-passkey] {
        padding: 0;
        border: none;
        background: transparent;
        max-width: none;
        max-height: none;
        margin: 0;
        position: fixed;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        outline: none;
      }

      dialog[data-passkey]::backdrop {
        background-color: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      dialog[data-passkey] iframe {
        background-color: transparent;
        border-radius: 14px;
        border: none;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
        transition: width 0.2s ease-out, height 0.15s ease-out;
      }

      @media (min-width: 769px) {
        dialog[data-passkey] iframe {
          animation: passkey_zoomIn 0.2s cubic-bezier(0.32, 0.72, 0, 1);
        }
      }

      @media (max-width: 768px) {
        dialog[data-passkey] {
          width: 100vw !important;
          height: auto !important;
          max-height: 90vh !important;
          max-height: 90dvh !important;
          top: auto !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          transform: none !important;
          margin: 0 !important;
        }

        dialog[data-passkey] iframe {
          animation: passkey_slideFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1);
          border-bottom-left-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
          width: 100% !important;
          max-height: 90vh !important;
          max-height: 90dvh !important;
          box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.15) !important;
        }
      }

      @keyframes passkey_zoomIn {
        from {
          opacity: 0;
          transform: scale(0.96) translateY(8px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      @keyframes passkey_slideFromBottom {
        from { transform: translate3d(0, 100%, 0); }
        to { transform: translate3d(0, 0, 0); }
      }

      @keyframes passkey_shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-4px); }
        40% { transform: translateX(4px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
      }
    `;
    dialog.appendChild(style);

    // Create iframe
    const iframe = document.createElement("iframe");
    iframe.setAttribute(
      "allow",
      "publickey-credentials-get *; publickey-credentials-create *; clipboard-write"
    );
    iframe.setAttribute("aria-label", "Passkey Authentication");
    iframe.setAttribute("tabindex", "0");
    iframe.setAttribute(
      "sandbox",
      "allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    );
    iframe.setAttribute("src", url);
    iframe.setAttribute("title", "Passkey");
    iframe.style.border = "none";
    iframe.style.height = "400px"; // Initial height, will be resized
    iframe.style.width = `${MODAL_WIDTH}px`; // Initial width, can be resized

    dialog.appendChild(iframe);

    // Handle resize and disconnect messages from iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== hostUrl.origin) return;
      if (event.data?.type === "PASSKEY_RESIZE") {
        iframe.style.height = `${event.data.height}px`;
        if (event.data.width) {
          iframe.style.width = `${event.data.width}px`;
        }
      } else if (event.data?.type === "PASSKEY_DISCONNECT") {
        // Clear stored user from parent's localStorage
        localStorage.removeItem("1auth-user");
      }
    };
    window.addEventListener("message", handleMessage);

    // Handle escape key
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cleanup();
      }
    };
    document.addEventListener("keydown", handleEscape);

    // Handle backdrop click
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        cleanup();
      }
    });

    // Show modal
    dialog.showModal();

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("keydown", handleEscape);
      dialog.close();
      dialog.remove();
    };

    return { dialog, iframe, cleanup };
  }

  private waitForModalAuthResponse(
    _dialog: HTMLDialogElement,
    iframe: HTMLIFrameElement,
    cleanup: () => void
  ): Promise<LoginResult | RegisterResult> {
    const dialogOrigin = this.getDialogOrigin();
    return new Promise((resolve) => {
      // Track whether the dialog has signaled ready
      // This prevents stale PASSKEY_CLOSE messages from previous dialogs
      let dialogReady = false;

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;

        const data = event.data;

        // Wait for dialog to signal ready before processing other messages
        if (data?.type === "PASSKEY_READY") {
          dialogReady = true;
          // Send init message to the auth dialog
          iframe.contentWindow?.postMessage({
            type: "PASSKEY_INIT",
            mode: "iframe",
          }, dialogOrigin);
          return;
        }

        // Ignore messages until dialog is ready (prevents stale CLOSE from previous dialogs)
        if (!dialogReady && data?.type === "PASSKEY_CLOSE") {
          return;
        }

        if (data?.type === "PASSKEY_LOGIN_RESULT") {
          window.removeEventListener("message", handleMessage);
          cleanup();

          if (data.success) {
            resolve({
              success: true,
              username: data.data?.username,
              user: data.data?.user,
            });
          } else {
            resolve({
              success: false,
              error: data.error,
            });
          }
        } else if (data?.type === "PASSKEY_REGISTER_RESULT") {
          window.removeEventListener("message", handleMessage);
          cleanup();

          if (data.success) {
            resolve({
              success: true,
              username: data.data?.username,
            });
          } else {
            resolve({
              success: false,
              error: data.error,
            });
          }
        } else if (data?.type === "PASSKEY_RETRY_POPUP") {
          // Password manager (e.g. Bitwarden) interfered with WebAuthn in iframe
          // Retry in popup mode where WebAuthn works without cross-origin restrictions
          window.removeEventListener("message", handleMessage);
          cleanup();

          // Get the current dialog URL and switch to popup mode
          const popupUrl = data.data?.url?.replace("mode=iframe", "mode=popup")
            || `${this.getDialogUrl()}/dialog/auth?mode=popup${this.config.clientId ? `&clientId=${this.config.clientId}` : ''}`;

          // Open popup and wait for result
          this.waitForPopupAuthResponse(popupUrl).then(resolve);
        } else if (data?.type === "PASSKEY_CLOSE") {
          window.removeEventListener("message", handleMessage);
          cleanup();
          resolve({
            success: false,
            error: {
              code: "USER_CANCELLED",
              message: "Authentication was cancelled",
            },
          });
        }
      };

      window.addEventListener("message", handleMessage);
    });
  }

  /**
   * Open a popup for auth and wait for the result.
   * Used when iframe mode fails (e.g., due to password manager interference).
   */
  private waitForPopupAuthResponse(url: string): Promise<LoginResult | RegisterResult> {
    const dialogOrigin = this.getDialogOrigin();
    const popup = this.openPopup(url);

    return new Promise((resolve) => {
      // Poll to check if popup was closed
      const pollTimer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener("message", handleMessage);
          resolve({
            success: false,
            error: {
              code: "USER_CANCELLED",
              message: "Authentication was cancelled",
            },
          });
        }
      }, 500);

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;

        const data = event.data;
        if (data?.type === "PASSKEY_LOGIN_RESULT") {
          clearInterval(pollTimer);
          window.removeEventListener("message", handleMessage);
          popup?.close();

          if (data.success) {
            resolve({
              success: true,
              username: data.data?.username,
              user: data.data?.user,
            });
          } else {
            resolve({
              success: false,
              error: data.error,
            });
          }
        } else if (data?.type === "PASSKEY_REGISTER_RESULT") {
          clearInterval(pollTimer);
          window.removeEventListener("message", handleMessage);
          popup?.close();

          if (data.success) {
            resolve({
              success: true,
              username: data.data?.username,
            });
          } else {
            resolve({
              success: false,
              error: data.error,
            });
          }
        } else if (data?.type === "PASSKEY_CLOSE") {
          clearInterval(pollTimer);
          window.removeEventListener("message", handleMessage);
          popup?.close();
          resolve({
            success: false,
            error: {
              code: "USER_CANCELLED",
              message: "Authentication was cancelled",
            },
          });
        }
      };

      window.addEventListener("message", handleMessage);
    });
  }

  private waitForAuthenticateResponse(
    _dialog: HTMLDialogElement,
    _iframe: HTMLIFrameElement,
    cleanup: () => void
  ): Promise<AuthenticateResult> {
    const dialogOrigin = this.getDialogOrigin();
    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;

        const data = event.data;
        if (data?.type === "PASSKEY_AUTHENTICATE_RESULT") {
          window.removeEventListener("message", handleMessage);
          cleanup();

          if (data.success) {
            resolve({
              success: true,
              username: data.data?.username,
              user: data.data?.user,
              accountAddress: data.data?.accountAddress,
              signature: data.data?.signature,
              signedHash: data.data?.signedHash,
            });
          } else {
            resolve({
              success: false,
              error: data.error,
            });
          }
        } else if (data?.type === "PASSKEY_CLOSE") {
          window.removeEventListener("message", handleMessage);
          cleanup();
          resolve({
            success: false,
            error: {
              code: "USER_CANCELLED",
              message: "Authentication was cancelled",
            },
          });
        }
      };

      window.addEventListener("message", handleMessage);
    });
  }

  private waitForConnectResponse(
    _dialog: HTMLDialogElement,
    _iframe: HTMLIFrameElement,
    cleanup: () => void
  ): Promise<ConnectResult> {
    const dialogOrigin = this.getDialogOrigin();
    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;

        const data = event.data;
        if (data?.type === "PASSKEY_CONNECT_RESULT") {
          window.removeEventListener("message", handleMessage);
          cleanup();

          if (data.success) {
            resolve({
              success: true,
              username: data.data?.username,
              autoConnected: data.data?.autoConnected,
            });
          } else {
            resolve({
              success: false,
              action: data.data?.action,
              error: data.error,
            });
          }
        } else if (data?.type === "PASSKEY_CLOSE") {
          window.removeEventListener("message", handleMessage);
          cleanup();
          resolve({
            success: false,
            action: "cancel",
            error: {
              code: "USER_CANCELLED",
              message: "Connection was cancelled",
            },
          });
        }
      };

      window.addEventListener("message", handleMessage);
    });
  }

  private waitForModalSigningResponse(
    requestId: string,
    _dialog: HTMLDialogElement,
    _iframe: HTMLIFrameElement,
    cleanup: () => void
  ): Promise<SigningResult> {
    const dialogOrigin = this.getDialogOrigin();
    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) return;

        const message = event.data;
        // The Messenger sends: { type, success, data: { requestId, signature }, error }
        // So we need to check message.data.requestId, not message.requestId
        const payload = message?.data as { requestId?: string; signature?: WebAuthnSignature } | undefined;

        if (message?.type === "PASSKEY_SIGNING_RESULT" && payload?.requestId === requestId) {
          window.removeEventListener("message", handleMessage);
          cleanup();

          if (message.success && payload.signature) {
            resolve({
              success: true,
              requestId,
              signature: payload.signature,
            });
          } else {
            resolve({
              success: false,
              requestId,
              error: message.error,
            });
          }
        } else if (message?.type === "PASSKEY_CLOSE") {
          window.removeEventListener("message", handleMessage);
          cleanup();
          resolve({
            success: false,
            requestId,
            error: {
              code: "USER_REJECTED",
              message: "Signing was cancelled",
            },
          });
        }
      };

      window.addEventListener("message", handleMessage);
    });
  }

  private waitForPopupResponse(
    requestId: string,
    popup: Window
  ): Promise<SigningResult> {
    const dialogOrigin = this.getDialogOrigin();
    return new Promise((resolve) => {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handleMessage);
          resolve({
            success: false,
            requestId,
            error: {
              code: "USER_REJECTED",
              message: "Popup was closed without completing",
            },
          });
        }
      }, 500);

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== dialogOrigin) {
          return;
        }

        const message = event.data;
        // The Messenger sends: { type, success, data: { requestId, signature }, error }
        const payload = message?.data as { requestId?: string; signature?: WebAuthnSignature } | undefined;

        if (
          message?.type === "PASSKEY_SIGNING_RESULT" &&
          payload?.requestId === requestId
        ) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handleMessage);
          popup.close();

          if (message.success && payload.signature) {
            resolve({
              success: true,
              requestId,
              signature: payload.signature,
            });
          } else {
            resolve({
              success: false,
              requestId,
              error: message.error,
            });
          }
        }
      };

      window.addEventListener("message", handleMessage);
    });
  }

  private async fetchSigningResult(requestId: string): Promise<SigningResult> {
    const response = await fetch(
      `${this.config.providerUrl}/api/sign/request/${requestId}`,
      {
        headers: this.config.clientId
          ? { "x-client-id": this.config.clientId }
          : {},
      }
    );

    if (!response.ok) {
      return {
        success: false,
        requestId,
        error: {
          code: "NETWORK_ERROR",
          message: "Failed to fetch signing result",
        },
      };
    }

    const data: SigningRequestStatus = await response.json();

    if (data.status === "COMPLETED" && data.signature) {
      return {
        success: true,
        requestId,
        signature: data.signature,
      };
    }

    const errorCode: SigningErrorCode = data.error?.code || "UNKNOWN";
    return {
      success: false,
      requestId,
      error: {
        code: errorCode,
        message: data.error?.message || `Request status: ${data.status}`,
      },
    };
  }
}

export { OneAuthClient as PasskeyProviderClient };
