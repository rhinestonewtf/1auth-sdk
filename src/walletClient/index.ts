import {
  createWalletClient,
  hashMessage,
  hashTypedData,
  type WalletClient,
  type Hash,
  type SignableMessage,
  type TypedDataDefinition,
} from 'viem';
import { toAccount } from 'viem/accounts';
import { OneAuthClient } from '../client';
import type { IntentCall } from '../types';
import type {
  PasskeyWalletClientConfig,
  SendCallsParams,
  TransactionCall,
} from './types';
import {
  encodeWebAuthnSignature,
  hashCalls,
  buildTransactionReview,
} from './utils';

export type { PasskeyWalletClientConfig, TransactionCall, SendCallsParams } from './types';
export { encodeWebAuthnSignature, hashCalls } from './utils';

/**
 * Extended WalletClient with passkey signing and batch transaction support
 */
export type PasskeyWalletClient = WalletClient & {
  /**
   * Send multiple calls as a single batched transaction
   * Opens the passkey modal for user approval
   */
  sendCalls: (params: SendCallsParams) => Promise<Hash>;
};

/**
 * Create a viem-compatible WalletClient that uses passkeys for signing
 *
 * @example
 * ```typescript
 * import { createPasskeyWalletClient } from '@rhinestone/1auth';
 * import { baseSepolia } from 'viem/chains';
 * import { http } from 'viem';
 *
 * const walletClient = createPasskeyWalletClient({
 *   accountAddress: '0x...',
 *   username: 'alice',
 *   providerUrl: 'https://passkey.1auth.box',
 *   clientId: 'my-dapp',
 *   chain: baseSepolia,
 *   transport: http(),
 * });
 *
 * // Standard viem API
 * const hash = await walletClient.sendTransaction({
 *   to: '0x...',
 *   data: '0x...',
 *   value: 0n,
 * });
 *
 * // Batched transactions
 * const batchHash = await walletClient.sendCalls({
 *   calls: [
 *     { to: '0x...', data: '0x...' },
 *     { to: '0x...', data: '0x...' },
 *   ],
 * });
 * ```
 */
export function createPasskeyWalletClient(
  config: PasskeyWalletClientConfig
): PasskeyWalletClient {
  const provider = new OneAuthClient({
    providerUrl: config.providerUrl,
    clientId: config.clientId,
    dialogUrl: config.dialogUrl,
  });

  // Helper function to sign a message
  const signMessageImpl = async (message: SignableMessage): Promise<`0x${string}`> => {
    const hash = hashMessage(message);

    const result = await provider.signWithModal({
      challenge: hash,
      username: config.username,
      description: 'Sign message',
      transaction: {
        actions: [
          {
            type: 'custom',
            label: 'Sign Message',
            sublabel:
              typeof message === 'string'
                ? message.slice(0, 50) + (message.length > 50 ? '...' : '')
                : 'Raw message',
          },
        ],
      },
    });

    if (!result.success) {
      throw new Error(result.error?.message || 'Signing failed');
    }

    if (!result.signature) {
      throw new Error('No signature received');
    }

    return encodeWebAuthnSignature(result.signature);
  };

  // Helper function to sign a transaction
  const signTransactionImpl = async (transaction: any): Promise<`0x${string}`> => {
    const calls: TransactionCall[] = [
      {
        to: transaction.to!,
        data: transaction.data,
        value: transaction.value,
      },
    ];

    const hash = hashCalls(calls);

    const result = await provider.signWithModal({
      challenge: hash,
      username: config.username,
      description: 'Sign transaction',
      transaction: buildTransactionReview(calls),
    });

    if (!result.success) {
      throw new Error(result.error?.message || 'Signing failed');
    }

    if (!result.signature) {
      throw new Error('No signature received');
    }

    return encodeWebAuthnSignature(result.signature);
  };

  // Helper function to sign typed data
  const signTypedDataImpl = async (typedData: any): Promise<`0x${string}`> => {
    const hash = hashTypedData(typedData as TypedDataDefinition);

    const result = await provider.signWithModal({
      challenge: hash,
      username: config.username,
      description: 'Sign typed data',
      transaction: {
        actions: [
          {
            type: 'custom',
            label: 'Sign Data',
            sublabel: typedData.primaryType || 'Typed Data',
          },
        ],
      },
    });

    if (!result.success) {
      throw new Error(result.error?.message || 'Signing failed');
    }

    if (!result.signature) {
      throw new Error('No signature received');
    }

    return encodeWebAuthnSignature(result.signature);
  };

  const buildIntentPayload = async (
    calls: TransactionCall[],
    targetChainOverride?: number
  ) => {
    const targetChain = targetChainOverride ?? config.chain.id;
    const intentCalls: IntentCall[] = calls.map((call) => ({
      to: call.to,
      data: call.data || "0x",
      value: call.value !== undefined ? call.value.toString() : "0",
      label: call.label,
      sublabel: call.sublabel,
    }));

    if (config.signIntent) {
      const signedIntent = await config.signIntent({
        username: config.username,
        accountAddress: config.accountAddress,
        targetChain,
        calls: intentCalls,
      });
      return { signedIntent };
    }

    return {
      username: config.username,
      targetChain,
      calls: intentCalls,
    };
  };

  // Create account with type assertion to avoid complex generic issues
  const account = toAccount({
    address: config.accountAddress,
    signMessage: ({ message }) => signMessageImpl(message),
    signTransaction: signTransactionImpl,
    signTypedData: signTypedDataImpl as any,
  });

  // Create the base wallet client
  const client = createWalletClient({
    account,
    chain: config.chain,
    transport: config.transport,
  });

  // Extend with sendCalls for batched transactions
  const extendedClient = Object.assign(client, {
    /**
     * Send a single transaction via intent flow
     */
    async sendTransaction(transaction: any): Promise<Hash> {
      const targetChain =
        typeof transaction.chainId === "number"
          ? transaction.chainId
          : transaction.chain?.id;
      const calls: TransactionCall[] = [
        {
          to: transaction.to!,
          data: transaction.data || "0x",
          value: transaction.value,
        },
      ];
      const closeOn = (config.waitForHash ?? true)
        ? "completed"
        : "preconfirmed";

      const intentPayload = await buildIntentPayload(calls, targetChain);
      const result = await provider.sendIntent({
        ...intentPayload,
        closeOn,
        waitForHash: config.waitForHash ?? true,
        hashTimeoutMs: config.hashTimeoutMs,
        hashIntervalMs: config.hashIntervalMs,
      });

      if (!result.success || !result.transactionHash) {
        throw new Error(result.error?.message || "Transaction failed");
      }

      return result.transactionHash as Hash;
    },
    /**
     * Send multiple calls as a single batched transaction
     */
    async sendCalls(params: SendCallsParams): Promise<Hash> {
      const { calls, chainId: targetChain, tokenRequests } = params;
      const closeOn = (config.waitForHash ?? true)
        ? "completed"
        : "preconfirmed";
      const intentPayload = await buildIntentPayload(calls, targetChain);
      const result = await provider.sendIntent({
        ...intentPayload,
        tokenRequests,
        closeOn,
        waitForHash: config.waitForHash ?? true,
        hashTimeoutMs: config.hashTimeoutMs,
        hashIntervalMs: config.hashIntervalMs,
      });

      if (!result.success || !result.transactionHash) {
        throw new Error(result.error?.message || "Transaction failed");
      }

      return result.transactionHash as Hash;
    },
  });

  return extendedClient as PasskeyWalletClient;
}
