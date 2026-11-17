"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastItem = {
  id: string;
  message: string;
};

type ToastContextValue = {
  showToast: (message: string) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastCard({
  toast,
  onClose
}: {
  toast: ToastItem;
  onClose: (id: string) => void;
}) {
  const duration = 3600;
  const [remaining, setRemaining] = useState(duration);
  const [startedAt, setStartedAt] = useState(Date.now());
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    timeoutRef.current = window.setTimeout(() => onClose(toast.id), remaining);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [onClose, remaining, toast.id]);

  const pause = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    setRemaining((current) => Math.max(0, current - (Date.now() - startedAt)));
  }, [startedAt]);

  const resume = useCallback(() => {
    setStartedAt(Date.now());
  }, []);

  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="tl-modal pointer-events-auto flex items-start gap-3 rounded-[18px] px-4 py-3 text-sm text-[var(--text)]"
    >
      <div className="mt-[2px] h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-deep)] dark:bg-[var(--accent)]" />
      <div className="min-w-0 flex-1 leading-6 text-[var(--text-soft)]">{toast.message}</div>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        className="tl-text-muted grid h-6 w-6 shrink-0 place-items-center rounded-full transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
        aria-label="Dismiss notification"
      >
        x
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, message }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] mx-auto flex w-full max-w-[420px] flex-col gap-2 px-4 md:right-4 md:left-auto md:mx-0">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
