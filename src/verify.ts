import { keccak256, toBytes } from "viem";

/**
 * The EIP-191 prefix used for personal message signing.
 * This is the standard Ethereum message prefix for `personal_sign`.
 */
export const ETHEREUM_MESSAGE_PREFIX = "\x19Ethereum Signed Message:\n";

/**
 * @deprecated Use ETHEREUM_MESSAGE_PREFIX instead. Kept for backwards compatibility.
 */
export const PASSKEY_MESSAGE_PREFIX = ETHEREUM_MESSAGE_PREFIX;

/**
 * Hash a message with the EIP-191 Ethereum prefix.
 *
 * This is the same hashing function used by the passkey sign dialog.
 * Use this to verify that the `signedHash` returned from `signMessage()`
 * matches your original message.
 *
 * Format: keccak256("\x19Ethereum Signed Message:\n" + len + message)
 *
 * @example
 * ```typescript
 * const message = "Sign in to MyApp\nTimestamp: 1234567890";
 * const result = await client.signMessage({ username: 'alice', message });
 *
 * // Verify the hash matches
 * const expectedHash = hashMessage(message);
 * if (result.signedHash === expectedHash) {
 *   console.log('Hash matches - signature is for this message');
 * }
 * ```
 */
export function hashMessage(message: string): `0x${string}` {
  const prefixed = ETHEREUM_MESSAGE_PREFIX + message.length.toString() + message;
  return keccak256(toBytes(prefixed));
}

/**
 * Verify that a signedHash matches the expected message.
 *
 * This is a convenience wrapper around `hashMessage()` that returns
 * a boolean. For full cryptographic verification of the P256 signature,
 * use on-chain verification via the WebAuthn.sol contract.
 *
 * @example
 * ```typescript
 * const result = await client.signMessage({ username: 'alice', message });
 *
 * if (result.success && verifyMessageHash(message, result.signedHash)) {
 *   // The signature is for this exact message
 *   // For full verification, verify the P256 signature on-chain or server-side
 * }
 * ```
 */
export function verifyMessageHash(
  message: string,
  signedHash: string | undefined
): boolean {
  if (!signedHash) return false;
  const expectedHash = hashMessage(message);
  return expectedHash.toLowerCase() === signedHash.toLowerCase();
}
