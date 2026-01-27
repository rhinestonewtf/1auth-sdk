import * as React from "react";
import { useBatchQueue, getChainName } from "./BatchQueueContext";

// Inject animation styles into document head
const ANIMATION_STYLES = `
@keyframes batch-bounce-in {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes batch-item-bounce {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  const styleId = "batch-queue-widget-styles";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = ANIMATION_STYLES;
  document.head.appendChild(style);
}

// Inline styles
const widgetStyles: React.CSSProperties = {
  position: "fixed",
  bottom: "16px",
  right: "16px",
  zIndex: 50,
  backgroundColor: "#18181b",
  color: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  minWidth: "240px",
  maxWidth: "360px",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "14px",
  overflow: "hidden",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  cursor: "pointer",
  userSelect: "none",
};

const headerLeftStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const counterBadgeStyles: React.CSSProperties = {
  backgroundColor: "#ffffff",
  color: "#18181b",
  borderRadius: "9999px",
  padding: "2px 8px",
  fontSize: "12px",
  fontWeight: 600,
};

const chainBadgeStyles: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.15)",
  color: "#a1a1aa",
  borderRadius: "4px",
  padding: "2px 6px",
  fontSize: "11px",
};

const signAllButtonStyles: React.CSSProperties = {
  backgroundColor: "#ffffff",
  color: "#18181b",
  border: "none",
  borderRadius: "6px",
  padding: "6px 12px",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background-color 0.15s",
};

const signAllButtonHoverStyles: React.CSSProperties = {
  backgroundColor: "#e4e4e7",
};

const signAllButtonDisabledStyles: React.CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};

const listContainerStyles: React.CSSProperties = {
  maxHeight: "300px",
  overflowY: "auto",
  borderTop: "1px solid #27272a",
};

const callItemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  padding: "10px 16px",
  borderBottom: "1px solid #27272a",
  position: "relative",
};

const callItemLastStyles: React.CSSProperties = {
  borderBottom: "none",
};

const callContentStyles: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const callLabelStyles: React.CSSProperties = {
  fontWeight: 500,
  marginBottom: "2px",
};

const callSublabelStyles: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: "12px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const removeButtonStyles: React.CSSProperties = {
  position: "absolute",
  left: "8px",
  top: "50%",
  transform: "translateY(-50%)",
  backgroundColor: "#dc2626",
  color: "#ffffff",
  border: "none",
  borderRadius: "4px",
  width: "20px",
  height: "20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: "14px",
  opacity: 0,
  transition: "opacity 0.15s",
};

const removeButtonVisibleStyles: React.CSSProperties = {
  opacity: 1,
};

const clearButtonStyles: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 16px",
  backgroundColor: "transparent",
  color: "#a1a1aa",
  border: "none",
  borderTop: "1px solid #27272a",
  fontSize: "12px",
  cursor: "pointer",
  textAlign: "center",
  transition: "color 0.15s",
};

const clearButtonHoverStyles: React.CSSProperties = {
  color: "#ffffff",
};

// Chevron icon
function ChevronIcon({ down }: { down: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: "transform 0.2s",
        transform: down ? "rotate(0deg)" : "rotate(-90deg)",
      }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export interface BatchQueueWidgetProps {
  /** Callback when "Sign All" is clicked - should provide username */
  onSignAll: () => void;
}

/**
 * Floating widget showing the batch queue
 */
export function BatchQueueWidget({ onSignAll }: BatchQueueWidgetProps) {
  const {
    queue,
    batchChainId,
    removeFromBatch,
    clearBatch,
    isExpanded,
    setExpanded,
    isSigning,
    animationTrigger,
  } = useBatchQueue();

  const [hoveredItemId, setHoveredItemId] = React.useState<string | null>(null);
  const [isSignAllHovered, setIsSignAllHovered] = React.useState(false);
  const [isClearHovered, setIsClearHovered] = React.useState(false);
  const [shouldAnimate, setShouldAnimate] = React.useState(false);

  // Inject CSS animations on mount
  React.useEffect(() => {
    injectStyles();
  }, []);

  // Trigger bounce animation when item is added
  React.useEffect(() => {
    if (animationTrigger > 0) {
      setShouldAnimate(true);
      const timer = setTimeout(() => setShouldAnimate(false), 300);
      return () => clearTimeout(timer);
    }
  }, [animationTrigger]);

  // Don't render if queue is empty
  if (queue.length === 0) {
    return null;
  }

  const handleHeaderClick = () => {
    setExpanded(!isExpanded);
  };

  const handleSignAllClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't toggle expand
    if (!isSigning) {
      onSignAll();
    }
  };

  const animatedWidgetStyles: React.CSSProperties = {
    ...widgetStyles,
    animation: shouldAnimate ? "batch-bounce-in 0.3s ease-out" : undefined,
  };

  const currentSignAllStyles: React.CSSProperties = {
    ...signAllButtonStyles,
    ...(isSignAllHovered && !isSigning ? signAllButtonHoverStyles : {}),
    ...(isSigning ? signAllButtonDisabledStyles : {}),
  };

  return (
    <div style={animatedWidgetStyles}>
      {/* Header - always visible */}
      <div style={headerStyles} onClick={handleHeaderClick}>
        <div style={headerLeftStyles}>
          <ChevronIcon down={isExpanded} />
          <span style={counterBadgeStyles}>{queue.length}</span>
          <span>call{queue.length !== 1 ? "s" : ""} queued</span>
          {batchChainId && (
            <span style={chainBadgeStyles}>{getChainName(batchChainId)}</span>
          )}
        </div>
        <button
          style={currentSignAllStyles}
          onClick={handleSignAllClick}
          onMouseEnter={() => setIsSignAllHovered(true)}
          onMouseLeave={() => setIsSignAllHovered(false)}
          disabled={isSigning}
        >
          {isSigning ? "Signing..." : "Sign All"}
        </button>
      </div>

      {/* Expanded list of calls */}
      {isExpanded && (
        <>
          <div style={listContainerStyles}>
            {queue.map((item, index) => {
              const isHovered = hoveredItemId === item.id;
              const isLast = index === queue.length - 1;

              return (
                <div
                  key={item.id}
                  style={{
                    ...callItemStyles,
                    ...(isLast ? callItemLastStyles : {}),
                    paddingLeft: isHovered ? "36px" : "16px",
                    transition: "padding-left 0.15s",
                  }}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                >
                  <button
                    style={{
                      ...removeButtonStyles,
                      ...(isHovered ? removeButtonVisibleStyles : {}),
                    }}
                    onClick={() => removeFromBatch(item.id)}
                    title="Remove from batch"
                  >
                    &times;
                  </button>
                  <div style={callContentStyles}>
                    <div style={callLabelStyles}>
                      {item.call.label || "Contract Call"}
                    </div>
                    {item.call.sublabel && (
                      <div style={callSublabelStyles}>{item.call.sublabel}</div>
                    )}
                    {!item.call.sublabel && item.call.to && (
                      <div style={callSublabelStyles}>
                        To: {item.call.to.slice(0, 6)}...{item.call.to.slice(-4)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Clear batch button */}
          <button
            style={{
              ...clearButtonStyles,
              ...(isClearHovered ? clearButtonHoverStyles : {}),
            }}
            onClick={clearBatch}
            onMouseEnter={() => setIsClearHovered(true)}
            onMouseLeave={() => setIsClearHovered(false)}
          >
            Clear batch
          </button>
        </>
      )}
    </div>
  );
}
