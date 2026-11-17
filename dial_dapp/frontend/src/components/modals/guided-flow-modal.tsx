"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function GuidedFlowModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="fixed inset-0 z-999 grid place-items-end bg-black/72 px-4 backdrop-blur-md md:place-items-center"
          onClick={() => dismissible && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            className="w-full max-w-[430px] rounded-[30px] border border-white/10 bg-pop-bg px-5 pb-5 pt-5 shadow-softbox"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5">
              <h2 className="text-[1.35rem] font-semibold tracking-[-0.05em] text-text">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-text/60">{description}</p>
            </div>

            {children ? <div>{children}</div> : null}
            {footer ? <div className="mt-5">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
