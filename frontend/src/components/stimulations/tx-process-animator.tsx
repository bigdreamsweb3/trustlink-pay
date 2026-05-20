"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  Timer,
  Zap,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

interface Step {
  id: number;
  label: string;
  duration: number; // in milliseconds
  statusText: string;
}

const steps: Step[] = [
  {
    id: 1,
    label: "Alice enters Bob's identity",
    duration: 500,
    statusText: "Resolving bob.phone index...",
  },
  {
    id: 2,
    label: "Intent enters TSN Mempool",
    duration: 450,
    statusText: "Mempool state registered.",
  },
  {
    id: 3,
    label: "Cranker submits on-chain",
    duration: 550,
    statusText: "Submitting proof payload...",
  },
  {
    id: 4,
    label: "Escrow locks the funds",
    duration: 450,
    statusText: "Escrow contract secured...",
  },
  {
    id: 5,
    label: "Private claim routes payload",
    duration: 500,
    statusText: "Mapping payout address...",
  },
  {
    id: 6,
    label: "Proof settles at epoch",
    duration: 550,
    statusText: "On-chain state finalized.",
  },
];

export function TxProcessAnimator() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  // Smooth millisecond live timer
  useEffect(() => {
    if (isCompleted) return;

    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 16); // 60fps refresh rate

    return () => clearInterval(interval);
  }, [loopCount, isCompleted]);

  // Manage sequence state changes
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (isCompleted) {
      // Show completion state, then restart cycle after 3.5 seconds
      timer = setTimeout(() => {
        setIsCompleted(false);
        setCurrentStepIndex(0);
        setElapsed(0);
        setLoopCount((prev) => prev + 1);
      }, 3500);
      return () => clearTimeout(timer);
    }

    const activeStep = steps[currentStepIndex];
    timer = setTimeout(() => {
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      } else {
        setIsCompleted(true);
      }
    }, activeStep.duration);

    return () => clearTimeout(timer);
  }, [currentStepIndex, isCompleted, loopCount]);

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {/* Animated Top Header Status Bar */}
      <div className="flex items-center justify-between px-0.5 select-none">
        <div className="flex items-center gap-1.5">
          <Timer className="h-3 w-3 text-primary-accent shrink-0" />
          <span className="text-[0.6rem] font-mono uppercase tracking-[0.12em] text-slate-400 font-bold">
            Settlement Clock: <span className="text-primary-accent font-mono font-black">{elapsed.toFixed(2)}s</span>
          </span>
        </div>
        <span className="text-[0.58rem] font-mono text-slate-500 font-bold">
          CYCLE #{loopCount + 1}
        </span>
      </div>

      {/* Grid containing steps to fit perfectly and save massive height space */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3.5 gap-x-3.5 relative">
        {steps.map((step, index) => {
          // If sequence is completely finished, mark all steps as complete
          const isStepCompleted = isCompleted || index < currentStepIndex;
          const isStepActive = !isCompleted && index === currentStepIndex;
          const isStepPending = !isCompleted && index > currentStepIndex;

          let itemBg = "bg-[#111114]/30 border-white/5";
          let textColor = "text-slate-500 font-medium";
          let numColor = "text-slate-600 bg-white/5";

          if (isStepActive) {
            itemBg = "bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]";
            textColor = "text-white font-bold";
            numColor = "text-black bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]";
          } else if (isStepCompleted) {
            itemBg = "bg-emerald-500/5 border-emerald-500/10";
            textColor = "text-slate-300 font-semibold";
            numColor = "text-accent bg-emerald-500/10";
          }

          // Decide connector rendering for responsive layouts:
          // Desktop (3 cols): Row 1 is 0,1,2. Row 2 is 3,4,5.
          // - Right Arrow on desktop: 0->1, 1->2, 3->4, 4->5
          // - Down Arrow on desktop: 2->3
          const showDesktopRightArrow = index === 0 || index === 1 || index === 3 || index === 4;
          const showDesktopDownArrow = index === 2;

          // Mobile (2 cols): Row 1 is 0,1. Row 2 is 2,3. Row 3 is 4,5.
          // - Right Arrow on mobile: 0->1, 2->3, 4->5
          // - Down Arrow on mobile: 1->2 (at index 1), 3->4 (at index 3)
          const showMobileRightArrow = index === 0 || index === 2 || index === 4;
          const showMobileDownArrow = index === 1 || index === 3;

          return (
            <div key={step.id} className="relative select-none">
              <motion.div
                initial={false}
                animate={{
                  scale: isStepActive ? 1.02 : 1.0,
                }}
                className={`relative flex flex-col justify-between rounded-xl border p-2.5 transition-all duration-300 ${itemBg} min-h-[66px] h-full`}
              >
                {/* Header Row: ID Circle / Status Indicator */}
                <div className="flex items-center justify-between">
                  <span className={`text-[0.58rem] font-mono font-black h-4.5 w-4.5 rounded-md flex items-center justify-center transition-colors duration-300 ${numColor}`}>
                    0{step.id}
                  </span>

                  <div className="flex items-center justify-center">
                    {isStepCompleted && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/10"
                      >
                        <Check className="h-2.5 w-2.5 text-accent stroke-[3px]" />
                      </motion.div>
                    )}

                    {isStepActive && (
                      <Loader2 className="h-3 w-3 text-primary-accent animate-spin" />
                    )}

                    {isStepPending && (
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                    )}
                  </div>
                </div>

                {/* Step Text */}
                <span className={`text-[0.7rem] leading-tight mt-1 px-0.5 line-clamp-2 transition-colors duration-300 ${textColor}`}>
                  {step.label}
                </span>
              </motion.div>

              {/* Connection Indicators (Desktop & Tablet: 3-column / Mobile: 2-column) */}

              {/* Desktop Connectors */}
              {showDesktopRightArrow && (
                <div className="hidden sm:flex absolute top-1/2 -right-2.5 -translate-y-1/2 z-20">
                  <ChevronRight className={`h-4 w-4 transition-colors duration-300 ${isStepCompleted ? "text-emerald-500/60 animate-pulse" : isStepActive ? "text-primary-accent animate-pulse" : "text-slate-800"
                    }`} />
                </div>
              )}
              {showDesktopDownArrow && (
                <div className="hidden sm:flex absolute -bottom-3.5 left-1/2 -translate-x-1/2 z-20">
                  <ChevronDown className={`h-4 w-4 transition-colors duration-300 ${isStepCompleted ? "text-emerald-500/60 animate-pulse" : isStepActive ? "text-primary-accent animate-pulse" : "text-slate-800"
                    }`} />
                </div>
              )}

              {/* Mobile Connectors */}
              {showMobileRightArrow && (
                <div className="flex sm:hidden absolute top-1/2 -right-2.5 -translate-y-1/2 z-20">
                  <ChevronRight className={`h-3.5 w-3.5 transition-colors duration-300 ${isStepCompleted ? "text-emerald-500/60 animate-pulse" : isStepActive ? "text-primary-accent animate-pulse" : "text-slate-800"
                    }`} />
                </div>
              )}
              {showMobileDownArrow && (
                <div className="flex sm:hidden absolute -bottom-3 left-1/2 -translate-x-1/2 z-20">
                  <ChevronDown className={`h-3.5 w-3.5 transition-colors duration-300 ${isStepCompleted ? "text-emerald-500/60 animate-pulse" : isStepActive ? "text-primary-accent animate-pulse" : "text-slate-800"
                    }`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dynamic Summary/Handoff Banner */}
      <AnimatePresence mode="wait">
        {isCompleted ? (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.98 }}
            className="rounded-[10px] border border-emerald-500/20 bg-gradient-to-r from-emerald-950/20 to-emerald-900/10 p-2 flex items-center justify-between text-[#e2e8f0] shadow-[0_4px_20px_rgba(16,185,129,0.08)] select-none shrink-0"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/30 shrink-0">
                <Zap className="h-3 w-3 text-accent fill-accent/30" />
              </div>
              <div>
                <span className="block text-[0.58rem] font-mono text-accent uppercase font-black tracking-widest leading-none">
                  Settlement Verified
                </span>
                <span className="block text-[0.66rem] font-semibold text-slate-300 mt-1 leading-none">
                  Epoch records verified perfectly on Solana
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="block text-[0.5rem] font-mono uppercase tracking-wider text-slate-500 leading-none">
                Total Time
              </span>
              <strong className="block text-[0.85rem] font-display font-black text-accent mt-0.5 whitespace-nowrap">
                {elapsed.toFixed(2)}s
              </strong>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-[10px] border border-white/5 bg-[#111114]/10 p-2 flex items-center justify-between text-slate-400 select-none shrink-0"
          >
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 text-primary-accent animate-spin shrink-0" />
              <span className="text-[0.62rem] font-mono leading-none tracking-wide text-slate-400">
                Active Protocol Pipeline: <span className="text-primary-accent font-bold">{steps[currentStepIndex].statusText}</span>
              </span>
            </div>
            <span className="text-[0.55rem] font-mono text-slate-500 uppercase tracking-widest animate-pulse shrink-0">
              Active
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
