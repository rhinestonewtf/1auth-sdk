import {
  hexToString,
  isHex,
  numberToHex,
  type Address,
  type Hex,
} from "viem";
import { OneAuthClient } from "./client";
import { getSupportedChainIds } from "./registry";
import type { IntentCall, IntentSigner } from "./types";
import { encodeWebAuthnSignature } from "./walletClient/utils";

type ProviderRequest = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

type Listener = (...args: unknown[]) => void;

type StoredUser = {
  username: string;
  address: Address;
};

export type OneAuthProvider = {
  request: (args: ProviderRequest) => Promise<unknown>;
  on: (event: string, listener: Listener) => void;
  removeListener: (event: string, listener: Listener) => void;
  disconnect: () => Promise<void>;
};

/** @deprecated Use OneAuthProvider instead */
export type PasskeyProvider = OneAuthProvider;

export type OneAuthProviderOptions = {
  client: OneAuthClient;
  chainId: number;
  storageKey?: string;
  waitForHash?: boolean;
  hashTimeoutMs?: number;
  hashIntervalMs?: number;
  signIntent?: IntentSigner;
};

/** @deprecated Use OneAuthProviderOptions instead */
export type PasskeyProviderOptions = OneAuthProviderOptions;

const DEFAULT_STORAGE_KEY = "1auth-user";

export function createOneAuthProvider(
  options: OneAuthProviderOptions
): OneAuthProvider {
  const { client } = options;
  let chainId = options.chainId;
  const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;

  const listeners = new Map<string, Set<Listener>>();

  const emit = (event: string, ...args: unknown[]) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const listener of set) listener(...args);
  };

  const getStoredUser = (): StoredUser | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredUser;
      if (!parsed?.username || !parsed?.address) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const setStoredUser = (user: StoredUser) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(user));
  };

  const clearStoredUser = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(storageKey);
  };

  const resolveAccountAddress = async (username: string): Promise<Address> => {
    const response = await fetch(
      `${client.getProviderUrl()}/api/users/${encodeURIComponent(username)}/account`,
      {
        headers: {
          "x-client-id": client.getClientId(),
        },
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Failed to resolve account address");
    }

    const data = await response.json();
    return data.address as Address;
  };

  const connect = async (): Promise<Address[]> => {
    const stored = getStoredUser();
    if (stored) {
      return [stored.address];
    }

    // First try the lightweight connect modal
    const connectResult = await client.connectWithModal();

    let username: string | undefined;

    if (connectResult.success && connectResult.username) {
      // Connection successful (user confirmed or auto-connected)
      username = connectResult.username;
    } else if (connectResult.action === "switch") {
      // User wants to switch account or no previous user - show auth modal
      const authResult = await client.authWithModal();
      if (!authResult.success || !authResult.username) {
        throw new Error(authResult.error?.message || "Authentication failed");
      }
      username = authResult.username;
    } else {
      // Connection was cancelled
      throw new Error(connectResult.error?.message || "Connection cancelled");
    }

    const address = await resolveAccountAddress(username);
    setStoredUser({ username, address });
    emit("accountsChanged", [address]);
    emit("connect", { chainId: numberToHex(chainId) });
    return [address];
  };

  const disconnect = async () => {
    clearStoredUser();
    emit("accountsChanged", []);
    emit("disconnect");
  };

  const ensureUser = async (): Promise<StoredUser> => {
    const stored = getStoredUser();
    if (stored) return stored;
    const [address] = await connect();
    const username = getStoredUser()?.username;
    if (!username || !address) {
      throw new Error("Failed to resolve user session");
    }
    return { username, address };
  };

  const parseChainId = (value: unknown): number | undefined => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      if (value.startsWith("0x")) return Number.parseInt(value, 16);
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };

  const normalizeValue = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number") return Math.trunc(value).toString();
    if (typeof value === "string") {
      if (value.startsWith("0x")) {
        try {
          return BigInt(value).toString();
        } catch {
          return "0";
        }
      }
      return value;
    }
    return undefined;
  };

  const normalizeCalls = (calls: unknown[]): IntentCall[] => {
    return calls.map((call) => {
      const c = call as Record<string, unknown>;
      return {
        to: c.to as Address,
        data: (c.data as Hex | undefined) || "0x",
        value: normalizeValue(c.value) || "0",
        label: c.label as string | undefined,
        sublabel: c.sublabel as string | undefined,
      };
    });
  };

  const decodeMessage = (value: string) => {
    if (!isHex(value)) return value;
    try {
      return hexToString(value as Hex);
    } catch {
      return value;
    }
  };

  const signMessage = async (message: string) => {
    const { username } = await ensureUser();
    const result = await client.signMessage({
      username,
      message,
    });
    if (!result.success || !result.signature) {
      throw new Error(result.error?.message || "Signing failed");
    }
    return encodeWebAuthnSignature(result.signature);
  };

  const signTypedData = async (typedData: unknown) => {
    const { username } = await ensureUser();
    const data =
      typeof typedData === "string" ? JSON.parse(typedData) : typedData;
    const result = await client.signTypedData({
      username,
      domain: (data as any).domain,
      types: (data as any).types,
      primaryType: (data as any).primaryType,
      message: (data as any).message,
    });
    if (!result.success || !result.signature) {
      throw new Error(result.error?.message || "Signing failed");
    }
    return encodeWebAuthnSignature(result.signature);
  };

  const resolveIntentPayload = async (payload: {
    username: string;
    accountAddress: Address;
    targetChain: number;
    calls: IntentCall[];
  }) => {
    if (!options.signIntent) {
      return {
        username: payload.username,
        targetChain: payload.targetChain,
        calls: payload.calls,
      };
    }
    const signedIntent = await options.signIntent({
      username: payload.username,
      accountAddress: payload.accountAddress,
      targetChain: payload.targetChain,
      calls: payload.calls,
    });
    return { signedIntent };
  };

  const sendIntent = async (payload: {
    username: string;
    accountAddress: Address;
    targetChain: number;
    calls: IntentCall[];
  }) => {
    const closeOn = (options.waitForHash ?? true)
      ? "completed"
      : "preconfirmed";
    const intentPayload = await resolveIntentPayload(payload);
    const result = await client.sendIntent({
      ...intentPayload,
      closeOn,
      waitForHash: options.waitForHash ?? true,
      hashTimeoutMs: options.hashTimeoutMs,
      hashIntervalMs: options.hashIntervalMs,
    });

    if (!result.success) {
      throw new Error(result.error?.message || "Transaction failed");
    }

    // Return intentId as callsId for EIP-5792 compatibility
    return result.intentId;
  };

  const request = async ({ method, params }: ProviderRequest) => {
    switch (method) {
      case "eth_chainId":
        return numberToHex(chainId);
      case "eth_accounts": {
        const stored = getStoredUser();
        return stored ? [stored.address] : [];
      }
      case "eth_requestAccounts":
        return connect();
      case "wallet_connect":
        return connect();
      case "wallet_disconnect":
        await disconnect();
        return true;
      case "wallet_switchEthereumChain": {
        const [param] = (params as any[]) || [];
        const next = parseChainId(param?.chainId ?? param);
        if (!next) {
          throw new Error("Invalid chainId");
        }
        chainId = next;
        emit("chainChanged", numberToHex(chainId));
        return null;
      }
      case "personal_sign": {
        const paramList = Array.isArray(params) ? params : [];
        const first = paramList[0];
        const second = paramList[1];
        const message =
          typeof first === "string" && first.startsWith("0x") && second
            ? typeof second === "string" && !second.startsWith("0x")
              ? second
              : decodeMessage(first)
            : typeof first === "string"
              ? decodeMessage(first)
              : typeof second === "string"
                ? decodeMessage(second)
                : "";
        if (!message) throw new Error("Invalid personal_sign payload");
        return signMessage(message);
      }
      case "eth_sign": {
        const paramList = Array.isArray(params) ? params : [];
        const message = typeof paramList[1] === "string" ? paramList[1] : "";
        if (!message) throw new Error("Invalid eth_sign payload");
        return signMessage(decodeMessage(message));
      }
      case "eth_signTypedData":
      case "eth_signTypedData_v4": {
        const paramList = Array.isArray(params) ? params : [];
        const typedData = paramList[1] ?? paramList[0];
        return signTypedData(typedData);
      }
      case "eth_sendTransaction": {
        const paramList = Array.isArray(params) ? params : [];
        const tx = (paramList[0] || {}) as Record<string, unknown>;
        const user = await ensureUser();
        const targetChain = parseChainId(tx.chainId) ?? chainId;
        const calls = normalizeCalls([tx]);
        return sendIntent({
          username: user.username,
          accountAddress: user.address,
          targetChain,
          calls,
        });
      }
      case "wallet_sendCalls": {
        const paramList = Array.isArray(params) ? params : [];
        const payload = (paramList[0] || {}) as Record<string, unknown>;
        const user = await ensureUser();
        const targetChain = parseChainId(payload.chainId) ?? chainId;
        const calls = normalizeCalls((payload.calls as unknown[]) || []);
        if (!calls.length) throw new Error("No calls provided");
        return sendIntent({
          username: user.username,
          accountAddress: user.address,
          targetChain,
          calls,
        });
      }
      case "wallet_getCapabilities": {
        const paramList = Array.isArray(params) ? params : [];
        // walletAddress is params[0] - we ignore since all accounts have same capabilities
        const requestedChains = paramList[1] as `0x${string}`[] | undefined;

        const chainIds = getSupportedChainIds();
        const capabilities: Record<`0x${string}`, Record<string, unknown>> = {};

        for (const chainId of chainIds) {
          const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;

          // Filter if specific chains requested
          if (requestedChains && !requestedChains.includes(hexChainId)) {
            continue;
          }

          capabilities[hexChainId] = {
            atomic: { status: "supported" },
            paymasterService: { supported: true },
            auxiliaryFunds: { supported: true },
          };
        }

        return capabilities;
      }
      case "wallet_getAssets": {
        const { username } = await ensureUser();
        const response = await fetch(
          `${client.getProviderUrl()}/api/users/${encodeURIComponent(username)}/portfolio`,
          {
            headers: {
              "x-client-id": client.getClientId(),
            },
          }
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to get assets");
        }
        return response.json();
      }
      case "wallet_getCallsStatus": {
        const paramList = Array.isArray(params) ? params : [];
        const callsId = paramList[0] as string;
        if (!callsId) {
          throw new Error("callsId is required");
        }
        const response = await fetch(
          `${client.getProviderUrl()}/api/intent/status/${encodeURIComponent(callsId)}`,
          {
            headers: {
              "x-client-id": client.getClientId(),
            },
          }
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to get calls status");
        }
        const data = await response.json();
        // Map intent status to EIP-5792 format
        const statusMap: Record<string, string> = {
          pending: "PENDING",
          preconfirmed: "PENDING",
          completed: "CONFIRMED",
          failed: "CONFIRMED",
          expired: "CONFIRMED",
        };
        return {
          status: statusMap[data.status] || "PENDING",
          receipts: data.transactionHash
            ? [
                {
                  logs: [],
                  status: data.status === "completed" ? "0x1" : "0x0",
                  blockHash: data.blockHash,
                  blockNumber: data.blockNumber,
                  transactionHash: data.transactionHash,
                },
              ]
            : [],
        };
      }
      case "wallet_getCallsHistory": {
        const paramList = Array.isArray(params) ? params : [];
        const options = (paramList[0] || {}) as {
          limit?: number;
          offset?: number;
          status?: string;
          from?: string;
          to?: string;
        };

        const queryParams = new URLSearchParams();
        if (options.limit) queryParams.set("limit", String(options.limit));
        if (options.offset) queryParams.set("offset", String(options.offset));
        if (options.status) queryParams.set("status", options.status);
        if (options.from) queryParams.set("from", options.from);
        if (options.to) queryParams.set("to", options.to);

        const url = `${client.getProviderUrl()}/api/intent/history${
          queryParams.toString() ? `?${queryParams}` : ""
        }`;

        const response = await fetch(url, {
          headers: {
            "x-client-id": client.getClientId(),
          },
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to get calls history");
        }

        const data = await response.json();

        // Map intent status to EIP-5792 format
        const statusMap: Record<string, string> = {
          pending: "PENDING",
          preconfirmed: "PENDING",
          completed: "CONFIRMED",
          failed: "CONFIRMED",
          expired: "CONFIRMED",
        };

        // intentId IS the orchestrator's ID (used as callsId in EIP-5792)
        return {
          calls: data.intents.map(
            (intent: {
              intentId: string;
              status: string;
              transactionHash?: string;
              targetChain: number;
            }) => ({
              callsId: intent.intentId, // intentId is the orchestrator's ID
              status: statusMap[intent.status] || "PENDING",
              receipts: intent.transactionHash
                ? [{ transactionHash: intent.transactionHash }]
                : [],
              chainId: `0x${intent.targetChain.toString(16)}`,
            })
          ),
          total: data.total,
          hasMore: data.hasMore,
        };
      }
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  };

  return {
    request,
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener(event, listener) {
      const set = listeners.get(event);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) listeners.delete(event);
    },
    disconnect,
  };
}

/** @deprecated Use createOneAuthProvider instead */
export const createPasskeyProvider = createOneAuthProvider;
