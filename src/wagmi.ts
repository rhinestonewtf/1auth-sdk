import { createConnector, type Connector } from "@wagmi/core";
import {
  numberToHex,
  type Address,
  type Chain,
  type ProviderConnectInfo,
} from "viem";
import { createPasskeyProvider, type PasskeyProvider } from "./provider";
import type { OneAuthClient } from "./client";
import type { IntentSigner } from "./types";

export type OneAuthConnectorOptions = {
  client: OneAuthClient;
  chainId?: number;
  storageKey?: string;
  waitForHash?: boolean;
  hashTimeoutMs?: number;
  hashIntervalMs?: number;
  signIntent?: IntentSigner;
};

export function oneAuth(options: OneAuthConnectorOptions) {
  type Provider = PasskeyProvider;

  return createConnector<Provider>((wagmiConfig) => {
    const chains = (wagmiConfig.chains ?? []) as readonly [Chain, ...Chain[]];
    const initialChainId = options.chainId ?? chains[0]?.id;

    let provider: Provider | null = null;
    let accountsChanged: Connector["onAccountsChanged"] | undefined;
    let chainChanged: Connector["onChainChanged"] | undefined;
    let connect: Connector["onConnect"] | undefined;
    let disconnect: Connector["onDisconnect"] | undefined;

    return {
      id: "1auth",
      name: "1auth Passkey",
      type: "wallet",
      async connect<withCapabilities extends boolean = false>(
        { chainId, isReconnecting, withCapabilities }:
          | {
              chainId?: number;
              isReconnecting?: boolean;
              withCapabilities?: withCapabilities | boolean;
            }
          | undefined = {}
      ): Promise<{
        accounts: withCapabilities extends true
          ? readonly { address: Address; capabilities: Record<string, unknown> }[]
          : readonly Address[];
        chainId: number;
      }> {
        if (!initialChainId) {
          throw new Error("No chain configured for 1auth connector");
        }

        const provider = await this.getProvider({ chainId });
        let accounts: readonly Address[] = [];
        let currentChainId = await this.getChainId();

        if (isReconnecting) {
          accounts = await this.getAccounts().catch(() => []);
        }

        if (!accounts.length) {
          accounts = (await provider.request({
            method: "wallet_connect",
          })) as Address[];
          currentChainId = await this.getChainId();
        }

        if (chainId && currentChainId !== chainId) {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: numberToHex(chainId) }],
          });
          currentChainId = await this.getChainId();
        }

        if (connect) {
          provider.removeListener("connect", connect as never);
          connect = undefined;
        }
        if (!accountsChanged) {
          accountsChanged = this.onAccountsChanged.bind(this);
          provider.on("accountsChanged", accountsChanged as never);
        }
        if (!chainChanged) {
          chainChanged = this.onChainChanged.bind(this);
          provider.on("chainChanged", chainChanged as never);
        }
        if (!disconnect) {
          disconnect = this.onDisconnect.bind(this);
          provider.on("disconnect", disconnect as never);
        }

        const response = withCapabilities
          ? {
              accounts: accounts.map((account) => ({
                address: account,
                capabilities: {},
              })),
              chainId: currentChainId,
            }
          : {
              accounts,
              chainId: currentChainId,
            };

        return response as unknown as {
          accounts: withCapabilities extends true
            ? readonly { address: Address; capabilities: Record<string, unknown> }[]
            : readonly Address[];
          chainId: number;
        };
      },
      async disconnect() {
        const provider = await this.getProvider();
        await provider.disconnect();
        if (chainChanged) {
          provider.removeListener("chainChanged", chainChanged as never);
          chainChanged = undefined;
        }
        if (disconnect) {
          provider.removeListener("disconnect", disconnect as never);
          disconnect = undefined;
        }
      },
      async getAccounts() {
        const provider = await this.getProvider();
        return (await provider.request({
          method: "eth_accounts",
        })) as Address[];
      },
      async getChainId() {
        const provider = await this.getProvider();
        const hexChainId = (await provider.request({
          method: "eth_chainId",
        })) as string;
        return Number.parseInt(hexChainId, 16);
      },
      async getProvider({ chainId } = {}) {
        if (!provider) {
          if (!initialChainId) {
            throw new Error("No chain configured for 1auth connector");
          }
          provider = createPasskeyProvider({
            client: options.client,
            chainId: initialChainId,
            storageKey: options.storageKey,
            waitForHash: options.waitForHash,
            hashTimeoutMs: options.hashTimeoutMs,
            hashIntervalMs: options.hashIntervalMs,
            signIntent: options.signIntent,
          });
        }
        if (chainId) {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: numberToHex(chainId) }],
          });
        }
        return provider;
      },
      async setup() {
        const provider = await this.getProvider();
        if (!connect) {
          const onConnect = this.onConnect?.bind(this);
          if (onConnect) {
            connect = onConnect;
            provider.on("connect", connect as never);
          }
        }
      },
      async isAuthorized() {
        try {
          const accounts = await this.getAccounts();
          return accounts.length > 0;
        } catch {
          return false;
        }
      },
      async switchChain({ chainId }) {
        const chain = chains.find((chain) => chain.id === chainId);
        if (!chain) {
          throw new Error("Chain not configured");
        }
        const provider = await this.getProvider();
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: numberToHex(chainId) }],
        });
        return chain;
      },
      async onConnect(connectInfo: ProviderConnectInfo) {
        const accounts = await this.getAccounts();
        if (!accounts.length) return;
        const chainId = Number(connectInfo.chainId);
        wagmiConfig.emitter.emit("connect", { accounts, chainId });
      },
      onAccountsChanged(accounts: string[]) {
        wagmiConfig.emitter.emit("change", {
          accounts: accounts as Address[],
        });
      },
      onChainChanged(chainId: string) {
        wagmiConfig.emitter.emit("change", {
          chainId: Number(chainId),
        });
      },
      onDisconnect(_error?: Error) {
        wagmiConfig.emitter.emit("disconnect");
      },
    };
  });
}
