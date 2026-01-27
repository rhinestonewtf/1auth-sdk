import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPasskeyProvider } from "../src/provider";
import type { OneAuthClient } from "../src/client";

type LocalStorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const createLocalStorage = (): LocalStorageMock => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

describe("createPasskeyProvider", () => {
  const address = "0x1111111111111111111111111111111111111111";
  let storage: LocalStorageMock;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch | undefined;
  let originalWindow: unknown;
  let originalLocalStorage: unknown;

  beforeEach(() => {
    storage = createLocalStorage();
    fetchMock = vi.fn();
    originalFetch = (globalThis as any).fetch;
    originalWindow = (globalThis as any).window;
    originalLocalStorage = (globalThis as any).localStorage;

    (globalThis as any).window = {};
    (globalThis as any).localStorage = storage;
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).window = originalWindow;
    (globalThis as any).localStorage = originalLocalStorage;
    vi.restoreAllMocks();
  });

  test("wallet_connect authenticates and stores user", async () => {
    const authWithModal = vi.fn().mockResolvedValue({
      success: true,
      username: "alice",
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ address }),
    });

    const client = {
      authWithModal,
      getProviderUrl: () => "https://auth.test",
      getClientId: () => "client-id",
    } as unknown as OneAuthClient;

    const provider = createPasskeyProvider({ client, chainId: 8453 });
    const accountsChanged = vi.fn();
    const connected = vi.fn();
    provider.on("accountsChanged", accountsChanged);
    provider.on("connect", connected);

    const accounts = await provider.request({ method: "wallet_connect" });
    expect(accounts).toEqual([address]);
    expect(accountsChanged).toHaveBeenCalledWith([address]);
    expect(connected).toHaveBeenCalledWith({ chainId: "0x2105" });
    expect(storage.getItem("1auth-user")).toBe(
      JSON.stringify({ username: "alice", address })
    );
  });

  test("wallet_sendCalls forwards calls to sendIntent", async () => {
    const sendIntent = vi.fn().mockResolvedValue({
      success: true,
      transactionHash: "0xabc",
    });
    const client = {
      sendIntent,
      authWithModal: vi.fn(),
      getProviderUrl: () => "https://auth.test",
      getClientId: () => "client-id",
    } as unknown as OneAuthClient;

    storage.setItem(
      "1auth-user",
      JSON.stringify({ username: "alice", address })
    );

    const provider = createPasskeyProvider({ client, chainId: 8453 });

    const hash = await provider.request({
      method: "wallet_sendCalls",
      params: [
        {
          chainId: 10,
          calls: [{ to: address, value: 2n }],
        },
      ],
    });

    expect(hash).toBe("0xabc");
    expect(sendIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "alice",
        targetChain: 10,
        calls: [{ to: address, data: "0x", value: "2" }],
        closeOn: "completed",
        waitForHash: true,
      })
    );
  });

  test("wallet_sendCalls uses signIntent when provided", async () => {
    const signedIntent = {
      developerId: "client-id",
      targetChain: 10,
      calls: [{ to: address, data: "0x", value: "2" }],
      username: "alice",
      nonce: "1",
      expiresAt: 123,
      signature: "sig",
    };
    const signIntent = vi.fn().mockResolvedValue(signedIntent);
    const sendIntent = vi.fn().mockResolvedValue({
      success: true,
      transactionHash: "0xabc",
    });
    const client = {
      sendIntent,
      authWithModal: vi.fn(),
      getProviderUrl: () => "https://auth.test",
      getClientId: () => "client-id",
    } as unknown as OneAuthClient;

    storage.setItem(
      "1auth-user",
      JSON.stringify({ username: "alice", address })
    );

    const provider = createPasskeyProvider({
      client,
      chainId: 8453,
      signIntent,
    });

    const hash = await provider.request({
      method: "wallet_sendCalls",
      params: [
        {
          chainId: 10,
          calls: [{ to: address, value: 2n }],
        },
      ],
    });

    expect(hash).toBe("0xabc");
    expect(signIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "alice",
        accountAddress: address,
        targetChain: 10,
        calls: [{ to: address, data: "0x", value: "2" }],
      })
    );
    expect(sendIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        signedIntent,
        closeOn: "completed",
        waitForHash: true,
      })
    );
  });
});
