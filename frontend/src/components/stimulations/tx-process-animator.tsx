"use client";

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  Timer,
  Zap,
  ArrowUpRight,
} from "lucide-react";

interface Step {
  id: number;
  label: string;
  duration: number;
  statusText: string;
}

const BASE_STEPS = [
  { id: 1, label: "Alice enters Bob's identity", statusText: "Resolving bob.phone index..." },
  { id: 2, label: "Intent enters Mempool", statusText: "Mempool state registered." },
  { id: 3, label: "Cranker submits on-chain", statusText: "Submitting proof payload..." },
  { id: 4, label: "Escrow locks the funds", statusText: "Escrow contract secured..." },
  { id: 5, label: "Private claim pays Bob", statusText: "Mapping payout address..." },
  { id: 6, label: "Proof settles at epoch", statusText: "On-chain state finalized." },
];

const generateRandomizedSteps = (): Step[] => {
  return BASE_STEPS.map((step) => ({
    ...step,
    duration: Math.floor(Math.random() * 110 + 280),
  }));
};

interface HeaderProps {
  elapsed: number;
  loopCount: number;
}

const Header = memo(function Header({ elapsed, loopCount }: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-0.5 select-none min-h-[20px]">
      <div className="flex items-center gap-1.5 min-w-0">
        <Timer className="h-3 w-3 text-primary-accent shrink-0" />
        <span className="text-[0.6rem] font-mono uppercase tracking-[0.12em] text-slate-400 font-bold">
          Settlement Clock:
        </span>
        <span className="text-primary-accent font-mono font-black inline-block min-w-[54px] text-right tabular-nums text-[0.68rem]">
          {elapsed.toFixed(2)}s
        </span>
      </div>
      <span className="text-[0.58rem] font-mono text-slate-500 font-bold shrink-0">
        CYCLE #{loopCount + 1}
      </span>
    </div>
  );
});

interface ConnectorPathData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  angle: number;
  pathD: string;
}

interface ProcessGridProps {
  currentStepIndex: number;
  isCompleted: boolean;
  stepProgress: number;
  steps: Step[];
}

const ProcessGrid = memo(function ProcessGrid({
  currentStepIndex,
  isCompleted,
  stepProgress,
  steps,
}: ProcessGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [coords, setCoords] = useState<ConnectorPathData[]>([]);

  const mapConnections = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newCoords: ConnectorPathData[] = [];

    for (let i = 0; i < steps.length - 1; i++) {
      const cardA = cardRefs.current[i];
      const cardB = cardRefs.current[i + 1];

      if (cardA && cardB) {
        const rectA = cardA.getBoundingClientRect();
        const rectB = cardB.getBoundingClientRect();

        const fromX = rectA.right - containerRect.left;
        const fromY = rectA.top + rectA.height / 2 - containerRect.top;
        const toX = rectB.left - containerRect.left;
        const toY = rectB.top + rectB.height / 2 - containerRect.top;

        const isHorizontal = Math.abs(rectA.top - rectB.top) < 30;

        let pathD = "";
        let adjustFromX = fromX;
        let adjustFromY = fromY;
        let adjustToX = toX;
        let adjustToY = toY;

        if (isHorizontal) {
          pathD = `M ${fromX} ${fromY} Q ${(fromX + toX) / 2} ${fromY}, ${toX} ${toY}`;
        } else {
          const outX = rectA.left + rectA.width / 2 - containerRect.left;
          const outY = rectA.bottom - containerRect.top;
          const inX = rectB.left + rectB.width / 2 - containerRect.left;
          const inY = rectB.top - containerRect.top;

          adjustFromX = outX;
          adjustFromY = outY;
          adjustToX = inX;
          adjustToY = inY;

          pathD = `M ${outX} ${outY} C ${outX} ${outY + 28}, ${inX} ${inY - 28}, ${inX} ${inY}`;
        }

        const angle = Math.atan2(adjustToY - adjustFromY, adjustToX - adjustFromX) * (180 / Math.PI);

        newCoords.push({ fromX: adjustFromX, fromY: adjustFromY, toX: adjustToX, toY: adjustToY, angle, pathD });
      }
    }
    setCoords(newCoords);
  }, [steps]);

  useEffect(() => {
    mapConnections();
    window.addEventListener("resize", mapConnections);
    const interval = setInterval(mapConnections, 400);

    return () => {
      window.removeEventListener("resize", mapConnections);
      clearInterval(interval);
    };
  }, [steps, currentStepIndex, mapConnections]);

  return (
    <div className="select-none relative w-full min-w-0 overflow-hidden">
      <div ref={containerRef} className="relative w-full min-w-0 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-20">
          <defs>
            <filter id="neon-glow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {coords.map((c, index) => {
            const isActive = !isCompleted && index === currentStepIndex;
            const isPassed = isCompleted || index < currentStepIndex;

            let strokeColor = "#2D3139";
            let strokeWidth = "1.5";
            let strokeDasharray = "5 4";

            if (isActive) {
              strokeColor = "#22D3EE";
              strokeWidth = "2.5";
              strokeDasharray = "none";
            } else if (isPassed) {
              strokeColor = "#10B981";
              strokeWidth = "1.75";
              strokeDasharray = "3 2";
            }

            return (
              <g key={`track-${index}`}>
                <path
                  d={c.pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={strokeDasharray}
                  className="transition-all duration-300"
                  style={{
                    filter: isActive ? "drop-shadow(0 0 4px rgba(34,211,238,0.4))" : "none",
                  }}
                />

                {isActive && (
                  <motion.path
                    d={c.pathD}
                    fill="none"
                    stroke="rgba(34,211,238,0.85)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    initial={{ strokeDasharray: "6 6", strokeDashoffset: 0 }}
                    animate={{ strokeDashoffset: -24 }}
                    transition={{ ease: "linear", duration: 0.6, repeat: Infinity }}
                    style={{ filter: "url(#neon-glow)" }}
                  />
                )}

                {isActive && stepProgress > 10 && (
                  <circle r="3.2" fill="#22D3EE" filter="url(#neon-glow)">
                    <animateMotion dur="0.8s" repeatCount="indefinite" path={c.pathD} />
                  </circle>
                )}
                {isActive && stepProgress > 40 && (
                  <circle r="1.8" fill="#FFF" filter="url(#neon-glow)">
                    <animateMotion dur="0.4s" repeatCount="indefinite" path={c.pathD} />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {coords.map((c, index) => {
          const isSourceActive = !isCompleted && index === currentStepIndex;
          const isSourceCompleted = isCompleted || index < currentStepIndex;

          let compassRotation = c.angle;
          let indicatorBorderColorClass = "border-slate-800 text-slate-600 bg-slate-950";

          if (isSourceActive) {
            indicatorBorderColorClass = "border-[#22D3EE]/50 text-[#22D3EE] bg-[#0c1626] shadow-[0_0_8px_rgba(34,211,238,0.2)]";
          } else if (isSourceCompleted) {
            indicatorBorderColorClass = "border-[#10B981]/30 text-[#10B981] bg-[#10B981]/5";
          }

          return (
            <div
              key={`compass-${index}`}
              style={{
                position: "absolute",
                left: c.fromX,
                top: c.fromY,
                transform: "translate(-50%, -50%)",
              }}
              className="z-30 pointer-events-none transition-all duration-300"
            >
              <div className={`relative flex items-center justify-center rounded-full h-6 w-6 border text-center transition-all duration-300 ${indicatorBorderColorClass}`}>
                {isSourceActive && (
                  <div className="absolute inset-0 rounded-full bg-cyan-500/10 animate-ping opacity-60 pointer-events-none" />
                )}

                <motion.div
                  style={{ rotate: isSourceActive ? 0 : compassRotation }}
                  className="flex items-center justify-center w-full h-full"
                >
                  {isSourceActive ? (
                    <Loader2 className="h-3.5 w-3.5 text-[#22D3EE] animate-spin" />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.2]" />
                  )}
                </motion.div>
              </div>
            </div>
          );
        })}

        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 gap-y-5 gap-x-3 sm:gap-y-7 sm:gap-x-6 px-0.5 relative w-full min-w-0 z-10 leading-none">
          {steps.map((step, idx) => {
            const nodeCompleted = isCompleted || idx < currentStepIndex;
            const nodeActive = !isCompleted && idx === currentStepIndex;
            const nodePending = !isCompleted && idx > currentStepIndex;

            let cardBgClass = "bg-[#151619]/60 border-[#2D3139] opacity-35";
            let titleColorClass = "text-slate-400";
            let numMarkerBg = "text-slate-500 bg-slate-800/40 border-slate-700/30";

            if (nodeActive) {
              cardBgClass = "bg-[#151619]/90 border-[#22D3EE] shadow-[0_0_12px_rgba(34,211,238,0.12)] opacity-100";
              titleColorClass = "text-[#22D3EE] font-bold font-sans";
              numMarkerBg = "text-slate-950 bg-[#22D3EE] font-black";
            } else if (nodeCompleted) {
              cardBgClass = "bg-[#151619]/90 border-[#10B981] opacity-100";
              titleColorClass = "text-[#10B981] font-semibold font-sans";
              numMarkerBg = "text-[#10B981] bg-[#10B981]/15 border-[#10B981]/25";
            }

            return (
              <div
                key={step.id}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
                className="relative min-w-0 rounded-xl pointer-events-auto transition-all duration-300"
              >
                {nodeActive && (
                  <div className="absolute -inset-[1.5px] bg-gradient-to-r from-[#22D3EE]/25 to-transparent rounded-xl blur-[1.5px]" />
                )}

                <div className={`relative flex min-w-0 flex-col justify-between rounded-xl border p-3 h-[78px] transition-all duration-300 backdrop-blur-sm ${cardBgClass}`}>
                  {nodeActive && (
                    <motion.div
                      className="absolute bottom-0 left-0 bg-gradient-to-r from-[#22D3EE]/30 to-transparent h-[1.5px]"
                      initial={{ width: "0%" }}
                      animate={{ width: `${stepProgress}%` }}
                      transition={{ duration: 0.08 }}
                    />
                  )}

                  <div className="flex items-center justify-between">
                    <span className={`text-[0.6rem] font-mono rounded px-1.5 py-[1px] flex items-center justify-center border ${numMarkerBg}`}>
                      0{step.id}
                    </span>

                    <div className="flex h-4 w-4 items-center justify-center rounded-full shrink-0">
                      {nodeCompleted && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 350, damping: 14 }}
                          className="flex h-3.5 w-3.5 bg-[#10B981]/15 border border-[#10B981]/30 rounded-full items-center justify-center text-[#10B981]"
                        >
                          <Check className="h-1.8 w-1.8 stroke-[3.5]" />
                        </motion.div>
                      )}

                      {nodeActive && <Loader2 className="h-3 w-3 text-[#22D3EE] animate-spin" />}
                      {nodePending && <div className="h-1 w-1 rounded-full bg-slate-700" />}
                    </div>
                  </div>

                  <span className={` ${nodeCompleted ? "text-[0.82rem]" : "text-[0.62rem] truncate"} leading-tight select-text tracking-wide mt-1 ${titleColorClass} `}>
                    {step.label}
                  </span>

                  <span className="text-[0.55rem] font-mono text-slate-500 leading-none truncate select-text">
                    {nodeActive ? `${stepProgress.toFixed(0)}% • ${step.statusText}` : nodeCompleted ? null : "Awaiting step"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

interface StatusBannerProps {
  isCompleted: boolean;
  currentStepIndex: number;
  elapsed: number;
  steps: Step[];
}

const StatusBanner = memo(function StatusBanner({
  isCompleted,
  currentStepIndex,
  elapsed,
  steps,
}: StatusBannerProps) {
  const activeStep = steps[currentStepIndex] || steps[steps.length - 1];

  return (
    <div className="relative w-full shrink-0 min-h-[56px] overflow-hidden bg-bg">
      <AnimatePresence mode="wait">
        {isCompleted ? (
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0  border-t border-[#10B981]/25 bg-gradient-to-r from-[#10B981]/10 to-[#10B981]/5 px-3 py-2 flex items-center justify-between text-[#e2e8f0] shadow-[0_4px_20px_rgba(16,185,129,0.06)] select-none transform-gpu"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-[#10B981]/15 border border-[#10B981]/25 shrink-0">
                <Zap className="h-3 w-3 text-[#10B981] fill-[#10B981]/20" />
              </div>
              <div className="min-w-0">
                <span className="block text-[0.58rem] font-mono text-[#10B981] uppercase font-black tracking-widest leading-none">
                  Settlement Verified
                </span>
                <span className="block text-[0.66rem] font-semibold text-slate-300 mt-1 leading-none truncate select-text">
                  Epoch records verified perfectly on Solana
                </span>
              </div>
            </div>

            <div className="text-right shrink-0 ml-3">
              <span className="block text-[0.5rem] font-mono uppercase tracking-wider text-slate-500 leading-none">
                Total Time
              </span>
              <strong className="block text-[0.85rem] font-display font-black text-[#10B981] mt-0.5 whitespace-nowrap tabular-nums min-w-[52px]">
                {elapsed.toFixed(2)}s
              </strong>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 border-t border-white/5 bg-[#111114]/10 px-3 py-2 flex items-center justify-between text-slate-400 select-none transform-gpu"
          >
            <div className="flex items-center gap-2 min-w-0 overflow-hidden text-ellipsis">
              <Loader2 className="h-3 w-3 text-[#22D3EE] animate-spin shrink-0" />
              <span className="text-[0.62rem] font-mono leading-none tracking-wide text-slate-400 truncate select-text">
                Active Protocol Pipeline:{" "}
                <span className="text-[#22D3EE] font-bold">{activeStep?.statusText}</span>
              </span>
            </div>
            <span className="text-[0.55rem] font-mono text-slate-500 uppercase tracking-widest shrink-0 ml-3 font-bold">
              Active
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export function TxProcessAnimator() {
  const [activeTab, setActiveTab] = useState<"intent" | "video">("intent");
  const [steps, setSteps] = useState<Step[]>(generateRandomizedSteps());
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  useEffect(() => {
    if (isCompleted || activeTab !== "intent") return;

    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 50);

    return () => clearInterval(interval);
  }, [loopCount, isCompleted, activeTab]);

  useEffect(() => {
    if (activeTab !== "intent") return;

    if (isCompleted) {
      const timer = setTimeout(() => {
        setIsCompleted(false);
        setSteps(generateRandomizedSteps());
        setCurrentStepIndex(0);
        setStepProgress(0);
        setElapsed(0);
        setLoopCount((prev) => prev + 1);
      }, 2000);

      return () => clearTimeout(timer);
    }

    const activeStep = steps[currentStepIndex];
    if (!activeStep) return;

    const startTime = Date.now();
    const tracker = setInterval(() => {
      const msElapsed = Date.now() - startTime;
      const progress = Math.min((msElapsed / activeStep.duration) * 100, 100);
      setStepProgress(progress);

      if (msElapsed >= activeStep.duration) {
        clearInterval(tracker);
        if (currentStepIndex < steps.length - 1) {
          setCurrentStepIndex((prev) => prev + 1);
          setStepProgress(0);
        } else {
          setStepProgress(100);
          setIsCompleted(true);
        }
      }
    }, 16);

    return () => clearInterval(tracker);
  }, [currentStepIndex, isCompleted, steps, activeTab]);

  return (
    <div className="relative w-full min-w-0 max-w-full flex flex-col overflow-hidden">
      {/* Tab Controls Bar */}
      <div className="relative z-10 flex min-w-0 items-center justify-between gap-4">
        <div className="w-full min-w-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between tl-panel-header">
          <p className="tl-meta-label max-w-full text-[0.65rem] uppercase leading-5 tracking-[0.2em] text-[var(--text-faint)]">
            How a payment works?
          </p>


          <div className="flex max-w-full flex-wrap items-center gap-1.5">
            <button onClick={() => setActiveTab("intent")} className={`tl-badge tl-meta-label rounded-full px-3 py-1 text-[0.66rem] font-black text-nowrap whitespace-nowrap ${activeTab === "intent"
              ? "is-active"
              : "is-inactive"
              }`}>Payment intent</button>

            <button onClick={() => setActiveTab("video")} className={`tl-badge tl-meta-label rounded-full px-3 py-1 text-[0.66rem] font-black text-nowrap whitespace-nowrap ${activeTab === "video"
              ? "is-active"
              : "is-inactive"
              }`}>Explainer Video</button>
          </div>
        </div>
      </div>


      {/* Main Container View Box */}
      <div className="relative flex gap-0 flex-col w-full min-w-0 max-w-full overflow-hidden contain-layout rounded-xl border border-[#2D3139]/80 bg-[#111215]/40 backdrop-blur-md">
        {/* Grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[1.04]"
          style={{
            backgroundImage: `
          linear-gradient(var(--accent-border) 1px, transparent 1px),
          linear-gradient(90deg, var(--accent-border) 1px, transparent 1px)
        `,
            backgroundSize: "12px 12px",
          }}
        />

        <AnimatePresence mode="wait">
          {activeTab === "intent" ? (
            <motion.div
              key="intent-view"
              initial={{ opacity: 0, scale: 0.99, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.99, y: -4 }}
              transition={{ ease: "easeInOut", duration: 0.35 }}
              className="p-2.5 md:p-3 relative gap-1.5 flex min-w-0 flex-col justify-between min-h-55"
            >
              <div className="p-2.5 md:p-3 relative min-w-0 gap-1.5">
                <div className="mb-2.5 relative z-10">
                  <Header elapsed={elapsed} loopCount={loopCount} />
                </div>

                <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-center">
                  <ProcessGrid
                    currentStepIndex={currentStepIndex}
                    isCompleted={isCompleted}
                    stepProgress={stepProgress}
                    steps={steps}
                  />
                </div>

              </div>

              <div className="mt-4 relative z-10 -mx-2.5 md:-mx-3 -mb-3">
                <StatusBanner
                  isCompleted={isCompleted}
                  currentStepIndex={currentStepIndex}
                  elapsed={elapsed}
                  steps={steps}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="video-view"
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -8 }}
              transition={{ ease: "easeInOut", duration: 0.4 }}
              className="relative w-full min-w-0 max-w-full p-3 aspect-video flex items-center justify-center bg-black/40 min-h-55"
            >
              <div className="relative h-full w-full min-w-0 max-w-full rounded-lg overflow-hidden border border-[#2D3139]/60 shadow-[0_12px_40px_rgba(0,0,0,0.7)] bg-black">
                <video
                  src="https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-32124-large.mp4" // Swap this string with your absolute video source path
                  autoPlay
                  controls
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="relative min-h-screen bg-[#0C0D0E] text-[#E0E2E5] flex flex-col items-center justify-center font-sans p-4 overflow-hidden">
      <div className="absolute inset-0 bg-radial-[circle_at_center_top,rgba(34,211,238,0.015)_0%,transparent_60%] pointer-events-none z-0" />
      <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none z-0" />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.54]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(45,49,57,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(45,49,57,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "12px 12px",
        }}
      />

      {/* Core Presentation Window Frame */}
      <div className="w-full max-w-4xl bg-[#111215]/95 border border-[#2D3139] rounded-2xl p-5 md:p-6 shadow-2xl shadow-black/60 relative z-10 overflow-hidden">
        <TxProcessAnimator />
      </div>
    </div>
  );
}
