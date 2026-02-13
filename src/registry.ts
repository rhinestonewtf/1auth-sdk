import type { Address, Chain } from "viem";
import { isAddress } from "viem";
import * as viemChains from "viem/chains";
import {
  getAllSupportedChainsAndTokens as getAllSupportedChainsAndTokensRaw,
  getSupportedTokens as getSupportedTokensRaw,
  getTokenAddress,
  getTokenDecimals,
} from "@rhinestone/sdk";

export type TokenConfig = {
  symbol: string;
  address: Address;
  decimals: number;
  supportsMultichain?: boolean;
  [key: string]: unknown;
};

export type ChainFilterOptions = {
  includeTestnets?: boolean;
  chainIds?: number[];
};

const env: Record<string, string | undefined> =
  typeof process !== "undefined" ? process.env : {};

const ALL_VIEM_CHAINS = (Object.values(viemChains) as unknown[]).filter(
  (value): value is Chain =>
    typeof value === "object" && value !== null && "id" in value && "name" in value
);
const VIEM_CHAIN_BY_ID = new Map<number, Chain>(
  ALL_VIEM_CHAINS.map((chain) => [chain.id, chain])
);
const SUPPORTED_CHAIN_IDS = new Set(
  getAllSupportedChainsAndTokensRaw().map((entry) => entry.chainId)
);

function parseBool(value?: string): boolean | undefined {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function resolveIncludeTestnets(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  const envValue =
    parseBool(env.NEXT_PUBLIC_ORCHESTRATOR_USE_TESTNETS) ??
    parseBool(env.ORCHESTRATOR_USE_TESTNETS);
  return envValue ?? false;
}

function applyChainFilters(chainIds: number[], options?: ChainFilterOptions): number[] {
  const includeTestnets = resolveIncludeTestnets(options?.includeTestnets);
  const allowlist = options?.chainIds;
  let filtered = chainIds;

  if (!includeTestnets) {
    filtered = filtered.filter((chainId) => !isTestnet(chainId));
  }

  if (allowlist && allowlist.length > 0) {
    const allowed = new Set(allowlist);
    filtered = filtered.filter((chainId) => allowed.has(chainId));
  }

  return filtered;
}

export function getSupportedChainIds(options?: ChainFilterOptions): number[] {
  return applyChainFilters(Array.from(SUPPORTED_CHAIN_IDS), options);
}

export function getSupportedChains(options?: ChainFilterOptions): Chain[] {
  return getSupportedChainIds(options)
    .map((chainId) => VIEM_CHAIN_BY_ID.get(chainId))
    .filter((chain): chain is Chain => Boolean(chain));
}

export function getAllSupportedChainsAndTokens(options?: ChainFilterOptions): Array<{
  chainId: number;
  tokens: TokenConfig[];
}> {
  const allowed = new Set(getSupportedChainIds(options));
  return getAllSupportedChainsAndTokensRaw()
    .filter((entry) => allowed.has(entry.chainId))
    .map((entry) => ({
      chainId: entry.chainId,
      tokens: entry.tokens as TokenConfig[],
    }));
}

export function getChainById(chainId: number): Chain {
  if (!SUPPORTED_CHAIN_IDS.has(chainId)) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  const chain = VIEM_CHAIN_BY_ID.get(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return chain;
}

export function getChainName(chainId: number): string {
  try {
    return getChainById(chainId).name;
  } catch {
    return `Chain ${chainId}`;
  }
}

export function getChainExplorerUrl(chainId: number): string | undefined {
  try {
    return getChainById(chainId).blockExplorers?.default?.url;
  } catch {
    return undefined;
  }
}

export function getChainRpcUrl(chainId: number): string | undefined {
  try {
    const chain = getChainById(chainId);
    return chain.rpcUrls?.default?.http?.[0] || chain.rpcUrls?.public?.http?.[0];
  } catch {
    return undefined;
  }
}

export function getSupportedTokens(chainId: number): TokenConfig[] {
  return getSupportedTokensRaw(chainId) as TokenConfig[];
}

export function getSupportedTokenSymbols(chainId: number): string[] {
  return getSupportedTokens(chainId).map((token) => token.symbol);
}

export function resolveTokenAddress(token: string, chainId: number): Address {
  if (isAddress(token)) {
    return token;
  }
  // Case-insensitive lookup: find canonical symbol from registry, then resolve
  const match = getSupportedTokens(chainId).find(
    (t) => t.symbol.toUpperCase() === token.toUpperCase()
  );
  if (!match) {
    return getTokenAddress(token as never, chainId);
  }
  return match.address;
}

export function isTestnet(chainId: number): boolean {
  try {
    return getChainById(chainId).testnet ?? false;
  } catch {
    return false;
  }
}

export function getTokenSymbol(tokenAddress: Address, chainId: number): string {
  const token = getSupportedTokens(chainId).find(
    (entry) => entry.address.toLowerCase() === tokenAddress.toLowerCase()
  );
  if (!token) {
    throw new Error(`Unsupported token: ${tokenAddress} on chain ${chainId}`);
  }
  return token.symbol;
}

export function isTokenAddressSupported(tokenAddress: Address, chainId: number): boolean {
  try {
    return getSupportedTokens(chainId).some(
      (entry) => entry.address.toLowerCase() === tokenAddress.toLowerCase()
    );
  } catch {
    return false;
  }
}

export { getTokenAddress, getTokenDecimals };
