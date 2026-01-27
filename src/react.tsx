import * as React from "react";
import { OneAuthClient } from "./client";
import type { SendIntentOptions, SendIntentResult, CloseOnStatus, DeveloperSignedIntent } from "./types";

// Fingerprint icon SVG
const FingerprintIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 16h.01" />
    <path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </svg>
);

// Default styles
const defaultStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "16px 32px",
  fontSize: "16px",
  fontWeight: 500,
  color: "#ffffff",
  backgroundColor: "#18181b",
  border: "none",
  borderRadius: "9999px",
  cursor: "pointer",
  transition: "background-color 0.2s",
  width: "100%",
};

const defaultDisabledStyles: React.CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};

const defaultHoverStyles: React.CSSProperties = {
  backgroundColor: "#27272a",
};

const defaultSuccessStyles: React.CSSProperties = {
  backgroundColor: "#16a34a",
  cursor: "default",
};

// Checkmark icon SVG
const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export interface PayButtonProps {
  /** The OneAuthClient instance */
  client: OneAuthClient;
  /** Intent parameters (calls, targetChain, etc.) - username will be filled automatically */
  intent: Omit<SendIntentOptions, "username" | "closeOn" | "signedIntent">;
  /** Called when payment succeeds */
  onSuccess?: (result: SendIntentResult) => void;
  /** Called when payment fails */
  onError?: (error: Error) => void;
  /** When to close the dialog and return success. Defaults to "preconfirmed" */
  closeOn?: CloseOnStatus;
  /**
   * Optional callback to get a signed intent from your backend.
   * Provides XSS protection by ensuring calls are constructed server-side.
   * If provided, this will be called with the intent and username before sending.
   * The returned signed intent will be used instead of the raw intent.
   */
  getSignedIntent?: (params: {
    username: string;
    targetChain: number;
    calls: SendIntentOptions["calls"];
    tokenRequests?: SendIntentOptions["tokenRequests"];
  }) => Promise<DeveloperSignedIntent>;
  /** Button text - defaults to "Pay with 1auth" */
  children?: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** Custom inline styles (merged with defaults) */
  style?: React.CSSProperties;
  /** Disabled state */
  disabled?: boolean;
  /** Hide the fingerprint icon */
  hideIcon?: boolean;
}

export function PayButton({
  client,
  intent,
  onSuccess,
  onError,
  closeOn = "preconfirmed",
  getSignedIntent,
  children = "Pay with 1auth",
  className,
  style,
  disabled,
  hideIcon,
}: PayButtonProps) {
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  const handleClick = async () => {
    if (disabled || isProcessing || isSuccess) return;

    setIsProcessing(true);

    try {
      await executePayment();
    } catch (err) {
      if (err instanceof Error && !err.message.includes("rejected")) {
        onError?.(err);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const executePayment = async (forceReauth = false) => {
    // Try to get existing user from localStorage
    let username: string | null = null;
    if (!forceReauth) {
      const savedUser = localStorage.getItem("1auth-user");
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          username = parsed.username;
        } catch {
          localStorage.removeItem("1auth-user");
        }
      }
    }

    // If no user (or forced reauth), authenticate first
    if (!username) {
      const authResult = await client.authWithModal();
      if (authResult.success && authResult.username) {
        username = authResult.username;
        localStorage.setItem(
          "1auth-user",
          JSON.stringify({ username })
        );
      } else {
        // Auth cancelled or failed
        return;
      }
    }

    // Send the intent
    // If getSignedIntent is provided, use signed intent flow (XSS protected)
    // Otherwise, use the raw intent (only works for first-party apps)
    let result: SendIntentResult;
    try {
      if (getSignedIntent) {
        const signedIntent = await getSignedIntent({
          username,
          targetChain: intent.targetChain!,
          calls: intent.calls,
          tokenRequests: intent.tokenRequests,
        });
        result = await client.sendIntent({
          signedIntent,
          closeOn,
        });
      } else {
        result = await client.sendIntent({
          ...intent,
          username,
          closeOn,
        });
      }
    } catch (err) {
      // If user not found, clear localStorage and force re-authentication
      if (err instanceof Error && err.message.includes("User not found")) {
        localStorage.removeItem("1auth-user");
        return executePayment(true);
      }
      throw err;
    }

    if (result.success) {
      setIsSuccess(true);
      onSuccess?.(result);
    } else {
      // If user not found error in result, clear localStorage and retry
      if (result.error?.message?.includes("User not found")) {
        localStorage.removeItem("1auth-user");
        return executePayment(true);
      }
      onError?.(new Error(result.error?.message || "Payment failed"));
    }
  };

  const combinedStyles: React.CSSProperties = {
    ...defaultStyles,
    ...(isSuccess ? defaultSuccessStyles : {}),
    ...(isHovered && !disabled && !isProcessing && !isSuccess ? defaultHoverStyles : {}),
    ...(disabled || isProcessing ? defaultDisabledStyles : {}),
    ...style,
  };

  return (
    <button
      type="button"
      className={className}
      style={combinedStyles}
      onClick={handleClick}
      disabled={disabled || isProcessing || isSuccess}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isSuccess ? (
        <>
          <CheckIcon className="pay-button-icon" />
          Paid
        </>
      ) : isProcessing ? (
        "Processing..."
      ) : (
        <>
          {!hideIcon && <FingerprintIcon className="pay-button-icon" />}
          {children}
        </>
      )}
    </button>
  );
}

// Re-export types for convenience
export type { SendIntentOptions, SendIntentResult, CloseOnStatus } from "./types";
