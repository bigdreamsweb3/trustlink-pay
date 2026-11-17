"use client";

/**
 * TSN Private View Component
 * 
 * A privacy-preserving component for displaying settlement receipts.
 * 
 * This component:
 * - Uses the TSN Private View SDK for decryption
 * - Never stores private data in React state beyond rendering
 * - Automatically clears decrypted data after display
 * - Shows loading, locked, or error states appropriately
 * 
 * CRITICAL: Applications must NEVER extract or store the decrypted receipt.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import type { PrivateViewState, PrivateReceipt } from "@/src/lib/tsn-private-view/types";

/**
 * Props for TsnPrivateView component
 */
export interface TsnPrivateViewProps {
  /** Session ID for authorization */
  sessionId: string;
  /** Receipt ID to view */
  receiptId: string;
  /** Callback when user wants to view details */
  onRequestView?: () => void;
  /** Children render function receiving the receipt or state */
  children: (state: PrivateViewState) => React.ReactNode;
  /** Time in ms before auto-clearing decrypted data (default: 30000) */
  autoClearMs?: number;
  /** Show loading state while fetching receipt */
  showLoading?: boolean;
  /** Loading component */
  loadingComponent?: React.ReactNode;
}

/**
 * Locked state component
 */
function LockedState({ onRequest }: { onRequest?: () => void }) {
  return (
    <div className="tsn-private-view locked">
      <div className="tsn-private-view-icon">🔒</div>
      <div className="tsn-private-view-title">Private View Locked</div>
      <div className="tsn-private-view-description">
        Authorization required to view settlement details.
      </div>
      {onRequest && (
        <button onClick={onRequest} className="tsn-private-view-button">
          Authorize
        </button>
      )}
    </div>
  );
}

/**
 * Error state component
 */
function ErrorState({ error }: { error: string }) {
  return (
    <div className="tsn-private-view error">
      <div className="tsn-private-view-icon">⚠️</div>
      <div className="tsn-private-view-title">View Unavailable</div>
      <div className="tsn-private-view-description">{error}</div>
    </div>
  );
}

/**
 * TSN Private View Component
 * 
 * Provides secure access to private settlement receipts.
 */
export function TsnPrivateView({
  sessionId,
  receiptId,
  onRequestView,
  children,
  autoClearMs = 30000,
  showLoading = true,
  loadingComponent,
}: TsnPrivateViewProps) {
  const [state, setState] = useState<PrivateViewState>({ status: "locked" });
  const [isLoading, setIsLoading] = useState(false);
  const receiptRef = useRef<PrivateReceipt | null>(null);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear decrypted receipt after timeout
  const clearReceipt = useCallback(() => {
    if (receiptRef.current) {
      receiptRef.current = null;
      setState((prev) => {
        // If we had an available state, go back to authorized
        if (prev.status === "available") {
          return { status: "authorized", sessionId };
        }
        return prev;
      });
    }
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, [sessionId]);

  // Request private view
  const requestView = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Call TSN Private View API to get encrypted receipt
      // const encryptedReceipt = await fetchEncryptedReceipt(receiptId, sessionId);
      
      // TODO: Decrypt using TSN Private View SDK
      // const privateViewSDK = new TSNPrivateViewSDK(config);
      // const viewState = await privateViewSDK.openPrivateView({
      //   receiptId,
      //   encryptedReceipt,
      //   session,
      // });
      
      // Placeholder for now
      setState({ status: "locked" });
    } catch (error) {
      setState({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to open private view",
      });
    } finally {
      setIsLoading(false);
    }
  }, [receiptId, sessionId]);

  // Set up auto-clear timer when receipt is available
  useEffect(() => {
    if (state.status === "available" && receiptRef.current) {
      clearTimerRef.current = setTimeout(clearReceipt, autoClearMs);
    }
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, [state.status, autoClearMs, clearReceipt]);

  // Clear on unmount
  useEffect(() => {
    return () => {
      clearReceipt();
    };
  }, [clearReceipt]);

  // Show loading state
  if (isLoading && showLoading) {
    return loadingComponent ? (
      <>{loadingComponent}</>
    ) : (
      <div className="tsn-private-view loading">
        <div className="tsn-private-view-spinner" />
        <div className="tsn-private-view-title">Opening private view...</div>
      </div>
    );
  }

  // Show locked state
  if (state.status === "locked") {
    return <LockedState onRequest={onRequestView ?? requestView} />;
  }

  // Show error state
  if (state.status === "error") {
    return <ErrorState error={state.error} />;
  }

  // Show expired state
  if (state.status === "expired") {
    return (
      <div className="tsn-private-view expired">
        <div className="tsn-private-view-icon">⏱️</div>
        <div className="tsn-private-view-title">Session Expired</div>
        <div className="tsn-private-view-description">
          Your private view session has expired. Please re-authorize.
        </div>
        <button onClick={requestView} className="tsn-private-view-button">
          Re-authorize
        </button>
      </div>
    );
  }

  // Show authorized state
  if (state.status === "authorized") {
    return (
      <div className="tsn-private-view authorized">
        <div className="tsn-private-view-icon">🔑</div>
        <div className="tsn-private-view-title">Ready to View</div>
        <button onClick={requestView} className="tsn-private-view-button">
          View Settlement Details
        </button>
      </div>
    );
  }

  // Pass state to children render function
  return <>{children(state)}</>;
}

/**
 * Private receipt display component
 * 
 * CRITICAL: This component should NEVER be extracted or stored.
 * It should only be used for immediate display and cleared after.
 */
export interface TsnPrivateReceiptProps {
  receipt: PrivateReceipt;
  onClose?: () => void;
}

export function TsnPrivateReceipt({ receipt, onClose }: TsnPrivateReceiptProps) {
  return (
    <div className="tsn-private-receipt">
      <div className="tsn-private-receipt-header">
        <div className="tsn-private-receipt-title">Settlement Receipt</div>
        {onClose && (
          <button onClick={onClose} className="tsn-private-receipt-close">
            ✕
          </button>
        )}
      </div>
      
      <div className="tsn-private-receipt-body">
        <div className="tsn-private-receipt-row">
          <span className="tsn-private-receipt-label">Amount</span>
          <span className="tsn-private-receipt-value">
            {receipt.amount} {receipt.tokenSymbol}
          </span>
        </div>
        
        <div className="tsn-private-receipt-row">
          <span className="tsn-private-receipt-label">Status</span>
          <span className="tsn-private-receipt-value">
            {receipt.settlementStatus}
          </span>
        </div>
        
        {receipt.counterpartyDisplayName && (
          <div className="tsn-private-receipt-row">
            <span className="tsn-private-receipt-label">From/To</span>
            <span className="tsn-private-receipt-value">
              {receipt.counterpartyDisplayName}
            </span>
          </div>
        )}
        
        {receipt.counterpartyTin && (
          <div className="tsn-private-receipt-row">
            <span className="tsn-private-receipt-label">TIN</span>
            <span className="tsn-private-receipt-value">
              {receipt.counterpartyTin}
            </span>
          </div>
        )}
        
        {receipt.transactionNote && (
          <div className="tsn-private-receipt-row">
            <span className="tsn-private-receipt-label">Note</span>
            <span className="tsn-private-receipt-value">
              {receipt.transactionNote}
            </span>
          </div>
        )}
        
        {receipt.settledAt && (
          <div className="tsn-private-receipt-row">
            <span className="tsn-private-receipt-label">Settled</span>
            <span className="tsn-private-receipt-value">
              {new Date(receipt.settledAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>
      
      <div className="tsn-private-receipt-footer">
        <div className="tsn-private-receipt-warning">
          ⚠️ This information is sensitive. Do not share or screenshot.
        </div>
      </div>
    </div>
  );
}
