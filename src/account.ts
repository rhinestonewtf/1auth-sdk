import {
  bytesToString,
  hexToString,
  isHex,
  type Address,
  type LocalAccount,
  type SignableMessage,
  type TypedData,
  type TypedDataDefinition,
} from "viem";
import { toAccount } from "viem/accounts";
import { OneAuthClient } from "./client";
import type { EIP712Domain, EIP712Types } from "./types";
import { encodeWebAuthnSignature } from "./walletClient/utils";

export type PasskeyAccount = LocalAccount<"1auth"> & {
  username: string;
};

export function createPasskeyAccount(
  client: OneAuthClient,
  params: { address: Address; username: string }
): PasskeyAccount {
  const { address, username } = params;

  const normalizeMessage = (message: SignableMessage): string => {
    if (typeof message === "string") return message;
    const raw = message.raw;
    if (isHex(raw)) {
      try {
        return hexToString(raw);
      } catch {
        return raw;
      }
    }
    return bytesToString(raw);
  };

  const account = toAccount({
    address,
    signMessage: async ({ message }: { message: SignableMessage }) => {
      const result = await client.signMessage({
        username,
        message: normalizeMessage(message),
      });
      if (!result.success || !result.signature) {
        throw new Error(result.error?.message || "Signing failed");
      }
      return encodeWebAuthnSignature(result.signature);
    },
    signTransaction: async () => {
      throw new Error("signTransaction not supported; use sendIntent");
    },
    signTypedData: async <
      const typedData extends TypedData | Record<string, unknown>,
      primaryType extends keyof typedData | "EIP712Domain" = keyof typedData
    >(
      typedData: TypedDataDefinition<typedData, primaryType>
    ) => {
      if (!typedData.domain || !typedData.types || !typedData.primaryType) {
        throw new Error("Invalid typed data");
      }
      const domainInput = typedData.domain as Partial<EIP712Domain>;
      if (!domainInput.name || !domainInput.version) {
        throw new Error("Typed data domain must include name and version");
      }
      const domain: EIP712Domain = {
        name: domainInput.name,
        version: domainInput.version,
        chainId:
          typeof domainInput.chainId === "bigint"
            ? Number(domainInput.chainId)
            : domainInput.chainId,
        verifyingContract: domainInput.verifyingContract,
        salt: domainInput.salt,
      };
      const rawTypes =
        typedData.types as Record<string, readonly { name: string; type: string }[]>;
      const normalizedTypes = Object.fromEntries(
        Object.entries(rawTypes).map(([key, fields]) => [
          key,
          fields.map((field) => ({ name: field.name, type: field.type })),
        ])
      ) as EIP712Types;
      const result = await client.signTypedData({
        username,
        domain,
        types: normalizedTypes,
        primaryType: typedData.primaryType as string,
        message: typedData.message as Record<string, unknown>,
      });
      if (!result.success || !result.signature) {
        throw new Error(result.error?.message || "Signing failed");
      }
      return encodeWebAuthnSignature(result.signature);
    },
  });

  return {
    ...(account as LocalAccount<"1auth">),
    username,
  };
}
