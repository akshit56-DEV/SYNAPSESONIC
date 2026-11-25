"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

interface WorkspaceTourProps {
  active: boolean;
  onFinish: () => void;
  onSkip: () => void;
  onHighlightTab?: (tab: "micu" | "terrarium" | "ar") => void;
}

interface TourStep {
  selector: string;
  title: string;
  description: string;
  tab?: "micu" | "terrarium" | "ar";
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="deck-switcher"]',
    title: "Your Knowledge Decks & PDFs",
    description:
      "Switch decks or upload any lecture PDF to generate a live concept graph.",
  },
  {
    selector: '[data-tour="tab-micu"]',
    title: "Learn with Micu",
    description:
      "Voice-first AI tutor with synced teleprompter, instant simplifications, analogies, and quick recall checks.",
    tab: "micu",
  },
  {
    selector: '[data-tour="tab-terrarium"]',
    title: "Study Terrarium",
    description:
      "3D knowledge graph—fuse any two orbs with Synapse Fusion to uncover exam traps, branch deeper, and monitor calendar retention decay.",
    tab: "terrarium",
  },
  {
    selector: '[data-tour="tab-ar"]',
    title: "Gesture Synth",
    description:
      "Hands-free webcam AR lab—pinch and pull orbs closer to trigger quizzes and answer with 1–4 fingers (camera only activates when you enter this tab).",
    tab: "ar",
  },
  {
    selector: '[data-tour="account-pill"]',
    title: "Cloud Sync & Controls",
    description:
      "Auto-syncs decks when signed in. Replay this walkthrough or edit your study profile anytime here.",
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function WorkspaceTour({
  active,
  onFinish,
  onSkip,
  onHighlightTab,
}: WorkspaceTourProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [viewport, setViewport] = useState({ w: 1280, h: 720 });

  const onHighlightTabRef = useRef(onHighlightTab);
  onHighlightTabRef.current = onHighlightTab;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;

  const currentStep = TOUR_STEPS[stepIdx] || TOUR_STEPS[0];

  const measureTarget = useCallback(() => {
    if (!active || typeof window === "undefined") return;
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    const el = document.querySelector(currentStep.selector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setRect(null);
      return;
    }
    setRect({
      top: Math.max(4, r.top - 5),
      left: Math.max(4, r.left - 5),
      width: r.width + 10,
      height: r.height + 10,
    });
  }, [active, currentStep.selector]);

  // Reset step on start
  useEffect(() => {
    if (active) {
      setStepIdx(0);
    }
  }, [active]);

  // Highlight tab cleanly once when step transitions
  useEffect(() => {
    if (!active) return;
    const step = TOUR_STEPS[stepIdx];
    if (step?.tab) {
      onHighlightTabRef.current?.(step.tab);
    }
  }, [active, stepIdx]);

  // Measure target rect reliably
  useEffect(() => {
    if (!active) return;
    const id = window.requestAnimationFrame(measureTarget);
    const timer = window.setTimeout(measureTarget, 90);

    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(timer);
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [active, stepIdx, measureTarget]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkipRef.current();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (stepIdx < TOUR_STEPS.length - 1) {
          setStepIdx((i) => i + 1);
        } else {
          onFinishRef.current();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, stepIdx]);

  if (!active) return null;

  // Smartly clamp floating popover within viewport
  const cardWidth = Math.min(340, Math.max(260, viewport.w - 24));
  let popTop = 96;
  let popLeft = Math.max(12, Math.round((viewport.w - cardWidth) / 2));

  if (rect) {
    const spaceBelow = viewport.h - (rect.top + rect.height);
    if (spaceBelow >= 210) {
      popTop = rect.top + rect.height + 14;
    } else {
      popTop = Math.max(12, rect.top - 205);
    }
    const centeredLeft = rect.left + rect.width / 2 - cardWidth / 2;
    popLeft = Math.max(
      12,
      Math.min(viewport.w - cardWidth - 12, Math.round(centeredLeft))
    );
  }

  const progressPct = ((stepIdx + 1) / TOUR_STEPS.length) * 100;

  return (
    <div
      className="fixed inset-0 z-[90] pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Workspace tour step ${stepIdx + 1} of ${TOUR_STEPS.length}`}
    >
      {/* Dim backdrop cutout using huge box-shadow around target rect */}
      {rect ? (
        <div
          aria-hidden="true"
          onClick={onSkip}
          className="fixed rounded-xl transition-all duration-300 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow:
              "0 0 0 9999px rgba(11, 11, 12, 0.76), 0 0 24px rgba(198, 244, 50, 0.35)",
            border: "1.5px solid #C6F432",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          onClick={onSkip}
          className="fixed inset-0 bg-[#0B0B0C]/75"
        />
      )}

      {/* Click-outside dismiss catch layer */}
      <div
        aria-hidden="true"
        onClick={onSkip}
        className="fixed inset-0 bg-transparent"
      />

      {/* Clamped Floating Popover */}
      <div
        className="fixed z-[92] rounded-2xl bg-[#141416]/95 backdrop-blur-xl border border-white/15 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.85)] transition-all duration-200 ease-out"
        style={{
          top: popTop,
          left: popLeft,
          width: cardWidth,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#C6F432]">
            Step {stepIdx + 1} of {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={onSkip}
            aria-label="Close tour"
            className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-[#C6F432] rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <h3 className="text-base font-semibold text-white tracking-tight">
          {currentStep.title}
        </h3>
        <p className="mt-1.5 text-xs sm:text-[13px] text-zinc-300 leading-relaxed">
          {currentStep.description}
        </p>

        <div className="mt-5 pt-3.5 border-t border-white/10 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            Skip
          </button>

          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 bg-[#0B0B0C] border border-white/15 hover:border-white/30 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (stepIdx < TOUR_STEPS.length - 1) {
                  setStepIdx((i) => i + 1);
                } else {
                  onFinish();
                }
              }}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#C6F432] text-[#0B0B0C] hover:bg-[#d4f75c] transition-colors cursor-pointer"
            >
              <span>
                {stepIdx === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
              </span>
              {stepIdx < TOUR_STEPS.length - 1 && (
                <ArrowRight className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
