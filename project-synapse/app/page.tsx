"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Compass,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ClickSpark } from "@/components/motion/ClickSpark";
import { PillNav } from "@/components/motion/PillNav";
import { WebThreads } from "@/components/motion/WebThreads";
import { DecryptedText } from "@/components/motion/DecryptedText";
import { SplitText } from "@/components/motion/SplitText";
import { StarBorder } from "@/components/motion/StarBorder";
import { SpatialOrbStage } from "@/components/motion/SpatialOrbStage";
import { Stepper, type StepItem } from "@/components/motion/Stepper";
import { RubberSegment } from "@/components/motion/RubberSegment";
import { TextType } from "@/components/motion/TextType";
import { ScrollReveal } from "@/components/motion/ScrollReveal";
import { supabase } from "@/lib/supabase";

/* Clean white minimalist robot fallback + live Micu Lottie */
function WhiteMicuSvg() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <rect x="22" y="5" width="4" height="5" rx="2" fill="#E4E4E7" />
      <circle cx="24" cy="4.5" r="2.5" fill="#F4F4F5" />
      <rect
        x="9"
        y="11"
        width="30"
        height="22"
        rx="11"
        fill="#F4F4F5"
        stroke="#FFFFFF"
        strokeWidth="1.2"
      />
      <rect x="14" y="16" width="20" height="11" rx="5.5" fill="#141416" />
      <circle cx="19.5" cy="21.5" r="2.2" fill="#F4F4F5" />
      <circle cx="28.5" cy="21.5" r="2.2" fill="#F4F4F5" />
      <rect x="16" y="35" width="16" height="8" rx="4" fill="#E4E4E7" />
    </svg>
  );
}

const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  {
    ssr: false,
    loading: () => <WhiteMicuSvg />,
  }
);

const NAV_ITEMS = [
  { id: "workflow", label: "Workflow" },
  { id: "modes", label: "Modes" },
  { id: "faq", label: "FAQ" },
];

const PIPELINE_STEPS: StepItem[] = [
  {
    number: "01",
    title: "Upload PDF",
    subtitle: "Parse lecture slides or notes into concept cards.",
    badge: "Automatic Extraction",
    detail:
      "Drop any lecture PDF, textbook chapter, or notes file to extract structured concepts, summaries, and adaptive recall questions automatically.",
  },
  {
    number: "02",
    title: "Map & Fuse in 3D",
    subtitle: "Inspect decay, branch sub-concepts, and bridge ideas.",
    badge: "Study Terrarium",
    detail:
      "Orbit your concepts as electric-filament orbs, simulate memory Time-Decay, spawn AI sub-concepts, and forge Synapse Fusion bridges between ideas.",
  },
  {
    number: "03",
    title: "Drill Hands-Free in AR",
    subtitle: "Grab orbs and answer quizzes with webcam hand tracking.",
    badge: "Gesture Synth",
    detail:
      "Switch into zero-gravity AR over your webcam to pinch orbs closer, expand radial recall lenses, and answer questions with natural hand gestures.",
  },
];

const MICU_OPTIONS = ["Explain", "Simplify", "Analogy", "Test me"] as const;
type MicuOption = (typeof MICU_OPTIONS)[number];

const MICU_RESPONSES: Record<MicuOption, string> = {
  Explain:
    "Backpropagation applies the chain rule from output loss backward through each layer, computing exact parameter gradients.",
  Simplify:
    "It traces how wrong a prediction was back through the network so every weight adjusts only by its share of the error.",
  Analogy:
    "Like tasting a soup and tracing backward to tell each chef exactly how much salt or heat to tweak next batch.",
  "Test me":
    "Quick check: why do we multiply local derivatives backward layer by layer instead of perturbing every weight individually?",
};

const GESTURE_CHIPS = [
  { id: "pinch", label: "🤏 Pinch & Pull", depth: 82 },
  { id: "palm", label: "🖐️ Open Palm Rest", depth: 48 },
  { id: "next", label: "👍 Next Orb", depth: 62 },
  { id: "toss", label: "✊ Toss Back", depth: 18 },
] as const;

const FAQS = [
  {
    q: "Is SynapseSonic free to use?",
    a: "Yes—free open-access study workspace with instant Guest Mode or optional Google Sign-In.",
  },
  {
    q: "Do I need an account to start?",
    a: "Click Launch Workspace to sign in via Email OTP or Google, or continue directly into Guest Mode from the login screen.",
  },
  {
    q: "How does Gesture Synth hand tracking work?",
    a: "Runs directly in your browser using your webcam—no VR headset or extra hardware needed.",
  },
  {
    q: "What happens to my uploaded PDFs and progress?",
    a: "Stored locally in Guest Mode, or automatically synced to your private Supabase cloud account when signed in.",
  },
];

export default function LandingPage() {
  const [activeNav, setActiveNav] = useState("workflow");
  const [hasSession, setHasSession] = useState(false);

  // Bento Card 1 state (Study Terrarium)
  const [bridgeForged, setBridgeForged] = useState(true);
  const [bridgeTag, setBridgeTag] = useState<"Hidden Link" | "Exam Trap">(
    "Hidden Link"
  );
  const [decayDays, setDecayDays] = useState(4);
  const [card1Spot, setCard1Spot] = useState({ x: 50, y: 50, on: false });

  // Bento Card 2 state (Learn with Micu)
  const [micuTab, setMicuTab] = useState<MicuOption>("Explain");

  // Bento Card 3 state (Gesture Synth cursor depth stage)
  const [depthPct, setDepthPct] = useState(66);
  const [activeGestureChip, setActiveGestureChip] = useState<string>("pinch");

  // Editorial FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Scroll-spy for PillNav without mutating URL hash
  useEffect(() => {
    const ids = ["workflow", "modes", "faq"];
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveNav(entry.target.id);
          }
        }
      },
      { rootMargin: "-35% 0px -45% 0px", threshold: 0.05 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleNavSelect = (id: string) => {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setHasSession(Boolean(data.session?.user));
      })
      .catch(() => {});

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) setHasSession(Boolean(session?.user));
      }
    );

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const workspaceHref = hasSession ? "/workspace" : "/login";

  const decayedRetention = Math.max(24, Math.round(96 - decayDays * 2.2));

  return (
    <ClickSpark
      sparkColor="#C6F432"
      sparkCount={6}
      sparkSize={10}
      sparkRadius={22}
      duration={380}
    >
      <div className="min-h-screen bg-[#0B0B0C] text-zinc-100 antialiased selection:bg-[#C6F432] selection:text-[#0B0B0C] relative overflow-x-hidden">
        {/* Background WebThreads */}
        <WebThreads
          opacity={0.28}
          className="fixed inset-0 w-full h-full z-0"
        />

        {/* Subtle Top Radial Edge Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 38% at 50% 0%, rgba(198,244,50,0.08), transparent 70%)",
          }}
        />

        {/* ── Floating Glass PillNav Header ──────────────────────────────── */}
        <header className="fixed top-4 left-0 right-0 z-50 px-4">
          <div className="max-w-5xl mx-auto h-14 px-3.5 sm:px-4 rounded-full bg-[#111214]/80 backdrop-blur-xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.55)] flex items-center justify-between gap-3">
            <Link
              href="/"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-label="SynapseSonic Home"
              className="pl-1 shrink-0"
            >
              <BrandLogo size="sm" />
            </Link>

            <PillNav
              items={NAV_ITEMS}
              activeId={activeNav}
              onSelect={handleNavSelect}
              className="hidden md:inline-flex"
            />

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:text-white border border-white/10 hover:border-white/25 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href={workspaceHref}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#C6F432] text-[#0B0B0C] text-xs font-semibold hover:bg-[#d4f75c] transition-colors"
              >
                <span>Open App</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="relative z-10 pt-28 sm:pt-32">
          {/* ── Asymmetric Spatial Hero ───────────────────────────────────── */}
          <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-6 pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* Left Editorial Column */}
              <div className="lg:col-span-6 text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#141416] border border-white/10 mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C6F432] shadow-[0_0_8px_#C6F432]" />
                  <DecryptedText
                    text="SPATIAL LEARNING ENGINE · V1.0"
                    animateOn="view"
                    className="text-[11px] font-mono tracking-[0.14em] text-zinc-300 uppercase"
                  />
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-semibold tracking-[-0.035em] text-white leading-[1.06]">
                  <SplitText
                    text="Turn any PDF into a spatial 3D study room."
                    highlightWords={["spatial", "3D", "study", "room."]}
                  />
                </h1>

                <p className="mt-5 text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl">
                  Upload lecture notes to learn by voice with Micu, fuse
                  concepts in a 3D Terrarium, and drill hands-free in webcam AR.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3.5">
                  <StarBorder color="#C6F432" speed="4.5s">
                    <Link
                      href={workspaceHref}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#C6F432] text-[#0B0B0C] text-sm font-semibold hover:bg-[#d4f75c] transition-colors"
                    >
                      <span>Launch Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </StarBorder>
                </div>
              </div>

              {/* Right Spatial 3D Orbital Stage */}
              <div className="lg:col-span-6">
                <SpatialOrbStage />
              </div>
            </div>
          </section>

          {/* ── Interactive Horizontal Stepper Pipeline ───────────────────── */}
          <section
            id="workflow"
            className="scroll-mt-28 max-w-6xl mx-auto px-5 sm:px-8 py-16 border-t border-white/10"
          >
            <ScrollReveal>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                  <DecryptedText
                    text="WORKFLOW"
                    className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#C6F432] block mb-2"
                  />
                  <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.025em] text-white">
                    Three steps from static pages to spatial mastery.
                  </h2>
                </div>
                <span className="text-xs font-mono text-zinc-500">
                  Click any stage to inspect
                </span>
              </div>
              <Stepper steps={PIPELINE_STEPS} />
            </ScrollReveal>
          </section>

          {/* ── Asymmetric 12-Column Interactive Bento ────────────────────── */}
          <section
            id="modes"
            className="scroll-mt-28 max-w-6xl mx-auto px-5 sm:px-8 py-16 border-t border-white/10"
          >
            <ScrollReveal>
              <div className="mb-9">
                <DecryptedText
                  text="WORKSPACE MODES"
                  className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#C6F432] block mb-2"
                />
                <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.025em] text-white">
                  Three specialized modes sharing one deck.
                </h2>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Card 1 (7-col): Study Terrarium */}
              <ScrollReveal delayMs={40} className="lg:col-span-7">
                <div
                  onPointerMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setCard1Spot({
                      x: ((e.clientX - rect.left) / rect.width) * 100,
                      y: ((e.clientY - rect.top) / rect.height) * 100,
                      on: true,
                    });
                  }}
                  onPointerLeave={() =>
                    setCard1Spot((s) => ({ ...s, on: false }))
                  }
                  className="relative h-full rounded-2xl bg-[#141416] border border-white/10 p-6 sm:p-7 overflow-hidden flex flex-col justify-between gap-6"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                    style={{
                      opacity: card1Spot.on ? 1 : 0,
                      background: `radial-gradient(280px circle at ${card1Spot.x}% ${card1Spot.y}%, rgba(198,244,50,0.10), transparent 65%)`,
                    }}
                  />

                  <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                        Mode 01 · 3D Knowledge Graph
                      </span>
                      <h3 className="text-xl sm:text-2xl font-semibold text-white mt-1">
                        Study Terrarium
                      </h3>
                      <p className="text-sm text-zinc-400 mt-1.5 max-w-md leading-relaxed">
                        Inspect decaying concept orbs, branch AI sub-concepts,
                        and forge Synapse Fusion bridges between related ideas.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setBridgeForged((v) => !v);
                        setBridgeTag((t) =>
                          t === "Hidden Link" ? "Exam Trap" : "Hidden Link"
                        );
                      }}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        bridgeForged
                          ? "bg-[#C6F432]/15 border-[#C6F432]/60 text-[#C6F432]"
                          : "bg-[#0B0B0C] border-white/15 text-zinc-300 hover:border-white/30"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>
                        {bridgeForged
                          ? "Bridge Forged"
                          : "Click to forge Synapse Bridge"}
                      </span>
                    </button>
                  </div>

                  {/* Mini Fusion Graph + Telemetry Controls */}
                  <div className="relative z-10 rounded-xl bg-[#0B0B0C] border border-white/10 p-4 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full transition-all"
                          style={{
                            background:
                              decayedRetention > 65 ? "#C6F432" : "#F59E0B",
                            boxShadow:
                              decayedRetention > 65
                                ? "0 0 12px #C6F432"
                                : "0 0 10px #F59E0B",
                            opacity: Math.max(0.45, decayedRetention / 100),
                          }}
                        />
                        <span className="text-xs font-medium text-white">
                          Backpropagation
                        </span>
                      </div>

                      <div className="flex-1 mx-2 relative h-6 flex items-center">
                        <div
                          className={`w-full h-[2px] transition-all duration-300 ${
                            bridgeForged
                              ? "bg-[#C6F432] shadow-[0_0_10px_#C6F432]"
                              : "bg-white/10"
                          }`}
                        />
                        {bridgeForged && (
                          <span className="absolute left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#141416] border border-[#C6F432]/50 text-[10px] font-mono text-[#C6F432] whitespace-nowrap">
                            {bridgeTag}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-medium text-white">
                          Gradient Descent
                        </span>
                        <span className="w-3.5 h-3.5 rounded-full bg-[#C6F432] shadow-[0_0_12px_#C6F432]" />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                        <Compass className="w-3.5 h-3.5 text-[#C6F432]" />
                        <span>Study GPS: Focus Next Weak Node</span>
                      </div>

                      <label className="flex items-center gap-2.5 text-[11px] font-mono text-zinc-300">
                        <Timer className="w-3.5 h-3.5 text-[#C6F432]" />
                        <span>Time-Decay</span>
                        <input
                          type="range"
                          min={0}
                          max={30}
                          value={decayDays}
                          onChange={(e) => setDecayDays(+e.target.value)}
                          className="w-24 accent-[#C6F432] cursor-pointer"
                        />
                        <span className="text-[#C6F432] w-7 text-right">
                          {decayDays}d
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </ScrollReveal>

              {/* Card 2 (5-col): Learn with Micu */}
              <ScrollReveal delayMs={110} className="lg:col-span-5">
                <div className="h-full rounded-2xl bg-[#141416] border border-white/10 p-6 sm:p-7 flex flex-col justify-between gap-5">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[#0B0B0C] border border-white/15 flex items-center justify-center shrink-0 overflow-hidden">
                      <DotLottieReact
                        src="/micu.lottie"
                        loop
                        autoplay
                        style={{ width: 56, height: 56 }}
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                        Mode 02 · Voice AI Tutor
                      </span>
                      <h3 className="text-xl sm:text-2xl font-semibold text-white mt-0.5">
                        Learn with Micu
                      </h3>
                    </div>
                  </div>

                  <RubberSegment
                    options={MICU_OPTIONS}
                    value={micuTab}
                    onChange={setMicuTab}
                    className="w-full justify-between"
                  />

                  <div className="rounded-xl bg-[#0B0B0C] border border-white/10 p-4 min-h-[116px] flex flex-col justify-between">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
                      Live Teleprompter · {micuTab}
                    </div>
                    <p className="text-sm text-zinc-200 leading-relaxed">
                      <TextType text={MICU_RESPONSES[micuTab]} speedMs={12} />
                    </p>
                  </div>
                </div>
              </ScrollReveal>

              {/* Card 3 (Full 12-col): Gesture Synth */}
              <ScrollReveal delayMs={160} className="lg:col-span-12">
                <div
                  onPointerMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(
                      8,
                      Math.min(
                        92,
                        ((e.clientX - rect.left) / rect.width) * 100
                      )
                    );
                    setDepthPct(Math.round(pct));
                  }}
                  className="rounded-2xl bg-[#141416] border border-white/10 p-6 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
                >
                  <div className="lg:col-span-5 space-y-4">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                        Mode 03 · Hands-Only Webcam AR
                      </span>
                      <h3 className="text-xl sm:text-2xl font-semibold text-white mt-1">
                        Gesture Synth
                      </h3>
                      <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
                        Move your pointer across the stage to simulate pulling a
                        floating 3D orb toward the quiz threshold using natural
                        webcam hand gestures.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {GESTURE_CHIPS.map((chip) => {
                        const active = activeGestureChip === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => {
                              setActiveGestureChip(chip.id);
                              setDepthPct(chip.depth);
                            }}
                            className={`text-left px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                              active
                                ? "bg-white/10 border-[#C6F432]/60 text-white"
                                : "bg-[#0B0B0C] border-white/10 text-zinc-300 hover:border-white/25"
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Interactive Cursor-Responsive Depth Stage */}
                  <div className="lg:col-span-7 relative h-52 rounded-xl bg-[#0B0B0C] border border-white/10 overflow-hidden flex flex-col justify-between p-4 select-none">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span>ZERO-G AR STAGE · MOVE CURSOR ACROSS</span>
                      <span className="text-[#C6F432]">
                        {depthPct >= 75 ? "QUIZ LENS READY" : "ORBITING"}
                      </span>
                    </div>

                    {/* Orb moving horizontally with scale proportional to depthPct */}
                    <div className="relative flex-1 flex items-center">
                      <div
                        className="absolute -translate-x-1/2 transition-all duration-150 ease-out flex flex-col items-center"
                        style={{
                          left: `${depthPct}%`,
                          transform: `translate(-50%, 0) scale(${0.72 + (depthPct / 100) * 0.45})`,
                        }}
                      >
                        <div className="w-20 h-20 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(198,244,50,0.48),rgba(198,244,50,0.08)_65%,transparent)] border border-[#C6F432]/70 shadow-[0_0_32px_rgba(198,244,50,0.28)] flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-[#C6F432]" />
                        </div>
                        <span className="mt-1.5 text-[11px] font-medium text-white whitespace-nowrap">
                          Activation Function
                        </span>
                      </div>
                    </div>

                    {/* Live FAR ──●── QUIZ Rail */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 bg-[#141416] border border-white/10 rounded-lg px-3 py-2">
                      <span>FAR</span>
                      <div className="flex-1 mx-3 h-1 bg-zinc-800 rounded-full relative">
                        <span
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#C6F432] shadow-[0_0_8px_#C6F432] transition-all duration-150"
                          style={{ left: `${depthPct}%` }}
                        />
                      </div>
                      <span className="text-[#C6F432]">QUIZ</span>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </section>

          {/* ── Minimal Editorial FAQ (2-Column Split) ────────────────────── */}
          <section
            id="faq"
            className="scroll-mt-28 max-w-6xl mx-auto px-5 sm:px-8 py-20 border-t border-white/10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
              <div className="lg:col-span-4 lg:sticky lg:top-28 lg:self-start">
                <DecryptedText
                  text="QUESTIONS"
                  className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#C6F432] block mb-2"
                />
                <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.025em] text-white">
                  Built for fast, focused study.
                </h2>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                  Start immediately without creating an account, or sign in with
                  Google when you want cloud backup.
                </p>
              </div>

              <div className="lg:col-span-8 divide-y divide-white/10 border-y border-white/10">
                {FAQS.map((item, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div key={item.q} className="py-5">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center justify-between gap-4 text-left cursor-pointer group"
                      >
                        <span
                          className={`text-base sm:text-lg font-medium transition-colors ${
                            isOpen
                              ? "text-[#C6F432]"
                              : "text-white group-hover:text-zinc-200"
                          }`}
                        >
                          {item.q}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 shrink-0 transition-transform duration-300 ${
                            isOpen
                              ? "rotate-180 text-[#C6F432]"
                              : "text-zinc-400"
                          }`}
                        />
                      </button>
                      <div
                        className="grid transition-all duration-300 ease-out"
                        style={{
                          gridTemplateRows: isOpen ? "1fr" : "0fr",
                          opacity: isOpen ? 1 : 0,
                        }}
                      >
                        <div className="overflow-hidden">
                          <p className="pt-3 text-sm text-zinc-400 leading-relaxed pr-6">
                            {item.a}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── Full-Width Obsidian Closing CTA Strip ─────────────────────── */}
          <section className="w-full border-t border-white/10 bg-[#111214]/80">
            <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.025em] text-white">
                  Ready to turn your notes into a 3D study space?
                </h2>
                <p className="mt-1.5 text-sm text-zinc-400">
                  Sign in with Email OTP or Google to sync your decks, or enter
                  Guest Mode in seconds.
                </p>
              </div>
              <StarBorder color="#C6F432" speed="4.5s">
                <Link
                  href={workspaceHref}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#C6F432] text-[#0B0B0C] text-sm font-semibold hover:bg-[#d4f75c] transition-colors whitespace-nowrap"
                >
                  <span>Launch Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </StarBorder>
            </div>
          </section>
        </main>

        {/* ── Single-Row Footer ───────────────────────────────────────────── */}
        <footer className="relative z-10 border-t border-white/10 bg-[#0B0B0C]">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-7 flex flex-col sm:flex-row items-center justify-between gap-4">
            <BrandLogo size="sm" />
            <div className="flex items-center gap-6 text-xs text-zinc-400">
              <Link
                href={workspaceHref}
                className="hover:text-white transition-colors"
              >
                Workspace
              </Link>
              <Link
                href="/login"
                className="hover:text-white transition-colors"
              >
                Sign in
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </ClickSpark>
  );
}
