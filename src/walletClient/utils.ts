import { encodeAbiParameters, keccak256 } from 'viem';
import type { Hex } from 'viem';
import type { WebAuthnSignature } from '../types';
import type { TransactionCall } from './types';

/**
 * P-256 curve order (n)
 * Used for signature malleability normalization
 */
const P256_N = BigInt(
  '0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551'
);
const P256_N_DIV_2 = P256_N / 2n;

/**
 * WebAuthnAuth struct type for ABI encoding
 */
const WEBAUTHN_AUTH_TYPE = {
  type: 'tuple',
  components: [
    { type: 'bytes', name: 'authenticatorData' },
    { type: 'string', name: 'clientDataJSON' },
    { type: 'uint256', name: 'challengeIndex' },
    { type: 'uint256', name: 'typeIndex' },
    { type: 'uint256', name: 'r' },
    { type: 'uint256', name: 's' },
  ],
} as const;

/**
 * Encode a WebAuthn signature for ERC-1271 verification on-chain
 *
 * @param sig - The WebAuthn signature from the passkey
 * @returns ABI-encoded signature bytes
 */
export function encodeWebAuthnSignature(sig: WebAuthnSignature): Hex {
  // Normalize s to prevent signature malleability
  let s = BigInt(sig.s);
  if (s > P256_N_DIV_2) {
    s = P256_N - s;
  }

  return encodeAbiParameters([WEBAUTHN_AUTH_TYPE], [
    {
      authenticatorData: sig.authenticatorData as Hex,
      clientDataJSON: sig.clientDataJSON,
      challengeIndex: BigInt(sig.challengeIndex),
      typeIndex: BigInt(sig.typeIndex),
      r: BigInt(sig.r),
      s,
    },
  ]);
}

/**
 * Hash an array of transaction calls for signing
 *
 * @param calls - Array of transaction calls
 * @returns keccak256 hash of the encoded calls
 */
export function hashCalls(calls: TransactionCall[]): Hex {
  const encoded = encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { type: 'address', name: 'to' },
          { type: 'bytes', name: 'data' },
          { type: 'uint256', name: 'value' },
        ],
      },
    ],
    [
      calls.map((c) => ({
        to: c.to,
        data: c.data || '0x',
        value: c.value || 0n,
      })),
    ]
  );
  return keccak256(encoded);
}

/**
 * Build transaction review display data from calls
 *
 * @param calls - Array of transaction calls
 * @returns TransactionDetails for the signing modal
 */
export function buildTransactionReview(calls: TransactionCall[]) {
  return {
    actions: calls.map((call, i) => ({
      type: 'custom' as const,
      label: call.label || `Contract Call ${i + 1}`,
      sublabel: call.sublabel || `To: ${call.to.slice(0, 10)}...${call.to.slice(-8)}`,
      amount: call.value ? `${call.value} wei` : undefined,
    })),
  };
}
