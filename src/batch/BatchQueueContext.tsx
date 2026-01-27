import * as React from "react";
import type { OneAuthClient } from "../client";
import type { IntentCall, SendIntentResult } from "../types";
import { getChainName as getRegistryChainName } from "../registry";

/**
 * A batched call in the queue
 */
export interface BatchedCall {
  /** Unique ID for removal */
  id: string;
  /** The actual call data */
  call: IntentCall;
  /** Chain ID for execution */
  targetChain: number;
  /** Timestamp when added */
  addedAt: number;
}

export function getChainName(chainId: number): string {
  return getRegistryChainName(chainId);
}

/**
 * Batch queue context value
 */
export interface BatchQueueContextValue {
  /** Current queue of batched calls */
  queue: BatchedCall[];
  /** Chain ID of the current batch (from first call) */
  batchChainId: number | null;
  /** Add a call to the batch */
  addToBatch: (call: IntentCall, targetChain: number) => { success: boolean; error?: string };
  /** Remove a call from the batch */
  removeFromBatch: (id: string) => void;
  /** Clear all calls from the batch */
  clearBatch: () => void;
  /** Sign and execute all batched calls */
  signAll: (username: string) => Promise<SendIntentResult>;
  /** Whether the widget is expanded */
  isExpanded: boolean;
  /** Set widget expanded state */
  setExpanded: (expanded: boolean) => void;
  /** Whether signing is in progress */
  isSigning: boolean;
  /** Animation trigger for bounce effect */
  animationTrigger: number;
}

const BatchQueueContext = React.createContext<BatchQueueContextValue | null>(null);

/**
 * Hook to access the batch queue context
 */
export function useBatchQueue(): BatchQueueContextValue {
  const context = React.useContext(BatchQueueContext);
  if (!context) {
    throw new Error("useBatchQueue must be used within a BatchQueueProvider");
  }
  return context;
}

/**
 * Generate a unique ID for a batched call
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * localStorage key for persisting the batch queue
 */
function getStorageKey(username?: string): string {
  return username ? `1auth_batch_queue_${username}` : "1auth_batch_queue_anonymous";
}

export interface BatchQueueProviderProps {
  /** The OneAuthClient instance */
  client: OneAuthClient;
  /** Optional username for localStorage persistence key */
  username?: string;
  /** Children to render */
  children: React.ReactNode;
}

/**
 * Provider component for the batch queue
 */
export function BatchQueueProvider({
  client,
  username,
  children,
}: BatchQueueProviderProps) {
  const [queue, setQueue] = React.useState<BatchedCall[]>([]);
  const [isExpanded, setExpanded] = React.useState(false);
  const [isSigning, setIsSigning] = React.useState(false);
  const [animationTrigger, setAnimationTrigger] = React.useState(0);

  // Derive batch chain from first call in queue
  const batchChainId = queue.length > 0 ? queue[0].targetChain : null;

  // Load queue from localStorage on mount
  React.useEffect(() => {
    const storageKey = getStorageKey(username);
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as BatchedCall[];
        // Validate the structure
        if (Array.isArray(parsed) && parsed.every(item =>
          typeof item.id === 'string' &&
          typeof item.call === 'object' &&
          typeof item.targetChain === 'number'
        )) {
          setQueue(parsed);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [username]);

  // Save queue to localStorage when it changes
  React.useEffect(() => {
    const storageKey = getStorageKey(username);
    try {
      if (queue.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(queue));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [queue, username]);

  const addToBatch = React.useCallback((call: IntentCall, targetChain: number): { success: boolean; error?: string } => {
    // Check if trying to add to a batch with a different chain
    if (batchChainId !== null && batchChainId !== targetChain) {
      return {
        success: false,
        error: `Batch is set to ${getChainName(batchChainId)}. Sign current batch first or clear it.`,
      };
    }

    const batchedCall: BatchedCall = {
      id: generateId(),
      call,
      targetChain,
      addedAt: Date.now(),
    };

    setQueue(prev => [...prev, batchedCall]);
    setAnimationTrigger(prev => prev + 1);

    return { success: true };
  }, [batchChainId]);

  const removeFromBatch = React.useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearBatch = React.useCallback(() => {
    setQueue([]);
    setExpanded(false);
  }, []);

  const signAll = React.useCallback(async (username: string): Promise<SendIntentResult> => {
    if (queue.length === 0) {
      return {
        success: false,
        intentId: "",
        status: "failed",
        error: {
          code: "EMPTY_BATCH",
          message: "No calls in batch to sign",
        },
      };
    }

    const targetChain = queue[0].targetChain;
    const calls = queue.map(item => item.call);

    setIsSigning(true);

    try {
      const result = await client.sendIntent({
        username,
        targetChain,
        calls,
      });

      if (result.success) {
        // Clear the batch on success
        clearBatch();
      }

      return result;
    } finally {
      setIsSigning(false);
    }
  }, [queue, client, clearBatch]);

  const value: BatchQueueContextValue = {
    queue,
    batchChainId,
    addToBatch,
    removeFromBatch,
    clearBatch,
    signAll,
    isExpanded,
    setExpanded,
    isSigning,
    animationTrigger,
  };

  return (
    <BatchQueueContext.Provider value={value}>
      {children}
    </BatchQueueContext.Provider>
  );
}
