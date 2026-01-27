import { sign } from "crypto";

export interface DeveloperConfig {
  /** Developer/app ID (clientId from the dashboard) */
  developerId?: string;
  /** Deprecated alias for developerId */
  merchantId?: string;
  /** Ed25519 private key (base64 encoded) */
  privateKey: string;
  /** Intent expiry time in ms (default: 5 minutes) */
  expiryMs?: number;
}

export type MerchantConfig = DeveloperConfig;

export interface IntentCall {
  to: string;
  data?: string;
  value?: string;
  label?: string;
  sublabel?: string;
}

export interface SignIntentParams {
  username?: string;
  accountAddress?: string;
  targetChain: number;
  calls: IntentCall[];
  tokenRequests?: Array<{ token: string; amount: string }>;
}

export interface SignedIntent {
  merchantId: string;
  developerId?: string;
  targetChain: number;
  calls: IntentCall[];
  username?: string;
  accountAddress?: string;
  nonce: string;
  expiresAt: number;
  signature: string;
  tokenRequests?: Array<{ token: string; amount: string }>;
}

/**
 * Create canonical message for signing.
 */
function createCanonicalMessage(data: {
  merchantId: string;
  targetChain: number;
  calls: IntentCall[];
  username?: string;
  accountAddress?: string;
  nonce: string;
  expiresAt: number;
}): string {
  return JSON.stringify({
    merchantId: data.merchantId,
    targetChain: data.targetChain,
    calls: data.calls.map((c) => ({
      to: c.to.toLowerCase(),
      data: (c.data || "0x").toLowerCase(),
      value: c.value || "0",
      label: c.label || "",
      sublabel: c.sublabel || "",
    })),
    username: data.username,
    accountAddress: data.accountAddress?.toLowerCase(),
    nonce: data.nonce,
    expiresAt: data.expiresAt,
  });
}

function signMessage(message: string, privateKeyBase64: string): string {
  const privateKeyBuffer = Buffer.from(privateKeyBase64, "base64");
  const signature = sign(null, Buffer.from(message), {
    key: privateKeyBuffer,
    format: "der",
    type: "pkcs8",
  });
  return signature.toString("base64");
}

export function signIntent(
  params: SignIntentParams,
  config: DeveloperConfig
): SignedIntent {
  const { username, accountAddress, targetChain, calls, tokenRequests } = params;
  const { privateKey, expiryMs = 5 * 60 * 1000 } = config;
  const developerId = config.developerId || config.merchantId;

  if (!developerId || !privateKey) {
    throw new Error("Missing developerId (clientId) or privateKey in config");
  }

  if (!username && !accountAddress) {
    throw new Error("Either username or accountAddress is required");
  }

  if (!targetChain || !calls?.length) {
    throw new Error("targetChain and calls are required");
  }

  // Generate nonce and expiry
  const nonce = crypto.randomUUID();
  const expiresAt = Date.now() + expiryMs;

  // Create intent data
  const intentData = {
    merchantId: developerId,
    targetChain,
    calls,
    username,
    accountAddress,
    nonce,
    expiresAt,
  };

  // Create canonical message and sign
  const message = createCanonicalMessage(intentData);
  const signature = signMessage(message, privateKey);

  return {
    ...intentData,
    signature,
    developerId,
    tokenRequests,
  };
}

export function createSignIntentHandler(config: DeveloperConfig) {
  return async function handler(request: Request): Promise<Response> {
    const developerId = config.developerId || config.merchantId;
    if (!developerId || !config.privateKey) {
      console.error("Missing DEVELOPER_ID (clientId) or DEVELOPER_PRIVATE_KEY");
      return Response.json(
        { error: "Server misconfiguration: missing developer credentials" },
        { status: 500 }
      );
    }

    try {
      const body = await request.json();

      // Validate required fields
      const { targetChain, calls, username, accountAddress, tokenRequests } = body;

      if (!targetChain || typeof targetChain !== "number") {
        return Response.json(
          { error: "targetChain is required and must be a number" },
          { status: 400 }
        );
      }

      if (!calls || !Array.isArray(calls) || calls.length === 0) {
        return Response.json(
          { error: "calls is required and must be a non-empty array" },
          { status: 400 }
        );
      }

      if (!username && !accountAddress) {
        return Response.json(
          { error: "Either username or accountAddress is required" },
          { status: 400 }
        );
      }

      // Validate each call has a valid address
      for (const call of calls) {
        if (!call.to || !/^0x[a-fA-F0-9]{40}$/.test(call.to)) {
          return Response.json(
            { error: "Each call must have a valid 'to' address" },
            { status: 400 }
          );
        }
      }

      // Sign the intent
      const signedIntent = signIntent(
        { username, accountAddress, targetChain, calls, tokenRequests },
        { ...config, developerId }
      );

      return Response.json(signedIntent);
    } catch (error) {
      console.error("Error signing intent:", error);
      return Response.json(
        { error: "Failed to sign intent" },
        { status: 500 }
      );
    }
  };
}
