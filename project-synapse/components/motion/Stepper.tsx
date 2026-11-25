"use client";

import React, { useState } from "react";

export interface StepItem {
  number: string;
  title: string;
  subtitle: string;
  detail: string;
  badge: string;
}

interface StepperProps {
  steps: StepItem[];
  activeStep?: number;
  onStepChange?: (index: number) => void;
  hideDetailPanel?: boolean;
  compact?: boolean;
}

export function Stepper({
  steps,
  activeStep,
  onStepChange,
  hideDetailPanel = false,
  compact = false,
}: StepperProps) {
  const [internalActive, setInternalActive] = useState(0);
  const active = typeof activeStep === "number" ? activeStep : internalActive;

  const setStep = (idx: number) => {
    if (onStepChange) onStepChange(idx);
    if (typeof activeStep !== "number") setInternalActive(idx);
  };

  const current = steps[active] || steps[0];
  const progressPct =
    steps.length > 1 ? (active / (steps.length - 1)) * 100 : 100;

  return (
    <div
      className={
        compact
          ? "w-full"
          : "rounded-2xl bg-[#141416]/90 border border-white/10 p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
      }
    >
      {/* Horizontal Progress Rail & Step Triggers */}
      <div className="relative">
        <div
          aria-hidden="true"
          className={`hidden sm:block absolute ${
            compact ? "top-4 left-5 right-5" : "top-5 left-6 right-6"
          } h-[2px] bg-white/10 rounded-full overflow-hidden`}
        >
          <div
            className="h-full bg-[#C6F432] transition-all duration-500 ease-out shadow-[0_0_12px_#C6F432]"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div
          className={`grid grid-cols-1 sm:grid-cols-3 ${
            compact ? "gap-2.5" : "gap-4"
          } relative z-10`}
        >
          {steps.map((step, idx) => {
            const isSelected = idx === active;
            const isComplete = idx <= active;
            return (
              <button
                key={step.number}
                type="button"
                onClick={() => setStep(idx)}
                className={`text-left ${
                  compact ? "p-2.5 rounded-xl" : "p-4 rounded-xl"
                } border transition-all duration-300 cursor-pointer ${
                  isSelected
                    ? "bg-[#0B0B0C] border-[#C6F432]/55 shadow-[0_0_24px_rgba(198,244,50,0.10)]"
                    : "bg-[#0B0B0C]/65 border-white/10 hover:border-white/25"
                }`}
              >
                <div
                  className={`flex items-center ${
                    compact ? "gap-2.5" : "gap-3 mb-2.5"
                  }`}
                >
                  <span
                    className={`${
                      compact ? "w-6 h-6 text-[11px]" : "w-7 h-7 text-xs"
                    } rounded-full font-mono font-semibold flex items-center justify-center shrink-0 transition-colors ${
                      isComplete
                        ? "bg-[#C6F432] text-[#0B0B0C]"
                        : "bg-zinc-900 text-zinc-400 border border-white/15"
                    }`}
                  >
                    {step.number}
                  </span>
                  <span
                    className={`${
                      compact ? "text-xs" : "text-sm"
                    } font-semibold text-white truncate`}
                  >
                    {step.title}
                  </span>
                </div>
                {!compact && (
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {step.subtitle}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Animated Detail Panel */}
      {!hideDetailPanel && current && (
        <div
          key={current.number}
          className="mt-6 pt-5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-[ssStepFade_280ms_ease-out]"
        >
          <div className="space-y-1">
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#C6F432]">
              Stage {current.number} · {current.badge}
            </span>
            <p className="text-sm sm:text-base text-zinc-200 leading-relaxed max-w-2xl">
              {current.detail}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {steps.map((s, i) => (
              <button
                key={s.number}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Jump to step ${s.number}`}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  i === active
                    ? "w-7 bg-[#C6F432]"
                    : "w-2 bg-zinc-700 hover:bg-zinc-500"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ssStepFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
