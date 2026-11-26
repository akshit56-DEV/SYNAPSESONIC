"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Bell, Bot, FileUp, Hand, Sprout } from "lucide-react";
import { ElectricLogo } from "@/components/brand-logo";
import { Stepper, type StepItem } from "@/components/motion/Stepper";
import { StarBorder } from "@/components/motion/StarBorder";
import { BellToggle } from "@/components/motion/BellToggle";
import {
  DEFAULT_USER_PROFILE,
  STUDY_FIELDS,
  STUDY_GOALS,
  TUTOR_STYLES,
  type PreferredStart,
  type StudyField,
  type StudyGoal,
  type TutorStyle,
  type UserStudyProfile,
} from "@/lib/user-profile";

interface OnboardingStepperProps {
  open: boolean;
  initialProfile: UserStudyProfile | null;
  defaultName: string;
  onComplete: (profile: UserStudyProfile, startTour: boolean) => void;
  onSkip: () => void;
}

const WIZARD_STEPS: StepItem[] = [
  {
    number: "01",
    title: "Welcome",
    subtitle: "Identity",
    detail: "",
    badge: "Setup",
  },
  {
    number: "02",
    title: "Calibrate",
    subtitle: "Focus & Style",
    detail: "",
    badge: "Setup",
  },
  {
    number: "03",
    title: "Alerts",
    subtitle: "Decay Reminders",
    detail: "",
    badge: "Setup",
  },
  {
    number: "04",
    title: "Launchpad",
    subtitle: "Start Mode",
    detail: "",
    badge: "Setup",
  },
];

const LAUNCHPAD_CARDS: {
  id: PreferredStart;
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "micu",
    title: "Learn with Micu",
    subtitle: "Voice AI tutor & teleprompter",
    Icon: Bot,
  },
  {
    id: "terrarium",
    title: "Study Terrarium",
    subtitle: "3D knowledge graph & fusion",
    Icon: Sprout,
  },
  {
    id: "ar",
    title: "Gesture Synth",
    subtitle: "Hands-free webcam AR drills",
    Icon: Hand,
  },
  {
    id: "upload",
    title: "Upload a PDF Now",
    subtitle: "Turn your notes into a 3D deck",
    Icon: FileUp,
  },
];

export function OnboardingStepper({
  open,
  initialProfile,
  defaultName,
  onComplete,
  onSkip,
}: OnboardingStepperProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [field, setField] = useState<StudyField>(DEFAULT_USER_PROFILE.field);
  const [goal, setGoal] = useState<StudyGoal>(DEFAULT_USER_PROFILE.goal);
  const [tutorStyle, setTutorStyle] = useState<TutorStyle>(
    DEFAULT_USER_PROFILE.tutorStyle
  );
  const [preferredStart, setPreferredStart] = useState<PreferredStart>(
    DEFAULT_USER_PROFILE.preferredStart
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    false
  );
  const [notifStatusNote, setNotifStatusNote] = useState<string>("");
  const [runTour, setRunTour] = useState(true);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName(initialProfile?.name || defaultName || "");
    setField(initialProfile?.field || DEFAULT_USER_PROFILE.field);
    setGoal(initialProfile?.goal || DEFAULT_USER_PROFILE.goal);
    setTutorStyle(
      initialProfile?.tutorStyle || DEFAULT_USER_PROFILE.tutorStyle
    );
    setPreferredStart(
      initialProfile?.preferredStart || DEFAULT_USER_PROFILE.preferredStart
    );
    const hasGranted =
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted";
    setNotificationsEnabled(
      Boolean(initialProfile?.notificationsEnabled) && hasGranted
    );
    setNotifStatusNote("");
    // Default tour ON for first-time setup, OFF when editing profile later
    setRunTour(!initialProfile?.onboardingCompleted);
  }, [open, initialProfile, defaultName]);

  if (!open) return null;

  const handleRequestNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationsEnabled(false);
      setNotifStatusNote("Browser notifications are unavailable on this device.");
      return;
    }
    if (notificationsEnabled) {
      window.localStorage.setItem("synapsesonic_reminders", "false");
      setNotificationsEnabled(false);
      setNotifStatusNote("Reminders muted — you can enable them anytime.");
      return;
    }
    try {
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (perm === "granted") {
        window.localStorage.setItem("synapsesonic_reminders", "true");
        setNotificationsEnabled(true);
        setNotifStatusNote("Study reminders enabled for fading concepts.");
      } else {
        window.localStorage.setItem("synapsesonic_reminders", "false");
        setNotificationsEnabled(false);
        setNotifStatusNote("Blocked in browser settings — in-app bell alerts stay active.");
      }
    } catch {
      setNotifStatusNote("Could not request permission right now.");
    }
  };

  const handleFinish = () => {
    const cleanName = name.trim() || defaultName.trim() || "Learner";
    const completedProfile: UserStudyProfile = {
      name: cleanName,
      field,
      goal,
      tutorStyle,
      preferredStart,
      notificationsEnabled,
      onboardingCompleted: true,
      tourCompleted: initialProfile?.tourCompleted ?? false,
    };
    onComplete(completedProfile, runTour);
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-[#0B0B0C]/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="SynapseSonic Workspace Setup"
    >
      <div className="relative w-full max-w-[620px] rounded-2xl bg-[#141416]/95 border border-white/10 shadow-[0_32px_100px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Specular top hairline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#C6F432]/45 to-transparent"
        />

        {/* Header Row: Stepper + Skip */}
        <div className="px-6 pt-5 pb-4 border-b border-white/10 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-400">
              Step {step + 1} of {WIZARD_STEPS.length}
            </span>
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Skip setup
            </button>
          </div>

          <Stepper
            steps={WIZARD_STEPS}
            activeStep={step}
            onStepChange={setStep}
            hideDetailPanel
            compact
          />
        </div>

        {/* Step Body */}
        <div
          key={step}
          className="px-6 sm:px-8 py-7 animate-[ssOnboardSlide_240ms_ease-out]"
        >
          {step === 0 && (
            <div className="text-center max-w-md mx-auto">
              <div className="flex justify-center mb-5">
                <ElectricLogo size="lg" />
              </div>

              <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#C6F432] mb-2">
                NEURAL WORKSPACE SETUP
              </div>

              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                Welcome to SynapseSonic
              </h2>

              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Take 15 seconds to tune your spatial tutor, recall focus, and
                preferred study mode.
              </p>

              <div className="mt-6 text-left">
                <label
                  htmlFor="ss-onboard-name"
                  className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2"
                >
                  What should we call you?
                </label>
                <input
                  id="ss-onboard-name"
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setStep(1);
                    }
                  }}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 rounded-xl bg-[#0B0B0C] border border-white/15 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#C6F432] transition-colors"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white tracking-tight">
                  Calibrate Your Workspace
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Tailor explanations, recall pacing, and terminology depth.
                </p>
              </div>

              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-2">
                  Focus Area
                </div>
                <div className="flex flex-wrap gap-2">
                  {STUDY_FIELDS.map((item) => {
                    const selected = field === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setField(item)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                          selected
                            ? "bg-[#C6F432] text-[#0B0B0C] border-[#C6F432] font-semibold"
                            : "bg-[#0B0B0C] text-zinc-300 border-white/10 hover:border-white/25"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-2">
                  Primary Goal
                </div>
                <div className="flex flex-wrap gap-2">
                  {STUDY_GOALS.map((item) => {
                    const selected = goal === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setGoal(item)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                          selected
                            ? "bg-[#C6F432] text-[#0B0B0C] border-[#C6F432] font-semibold"
                            : "bg-[#0B0B0C] text-zinc-300 border-white/10 hover:border-white/25"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-2">
                  Micu Style
                </div>
                <div className="flex flex-wrap gap-2">
                  {TUTOR_STYLES.map((item) => {
                    const selected = tutorStyle === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setTutorStyle(item)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                          selected
                            ? "bg-[#C6F432] text-[#0B0B0C] border-[#C6F432] font-semibold"
                            : "bg-[#0B0B0C] text-zinc-300 border-white/10 hover:border-white/25"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 max-w-lg mx-auto">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#C6F432] mb-1.5">
                  AUTOMATED CALENDAR RETENTION
                </div>
                <h2 className="text-xl font-semibold text-white tracking-tight">
                  Memory Decay Alerts
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 leading-relaxed">
                  SynapseSonic monitors elapsed days since your last review and nudges you right before a concept slips below 50% retention.
                </p>
              </div>

              <div className="rounded-2xl bg-[#0B0B0C] border border-white/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-[#C6F432]/12 border border-[#C6F432]/30 grid place-items-center text-[#C6F432] shrink-0">
                    <Bell className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Smart Decay Reminders
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      OS alert when any card fades below 50%
                    </div>
                  </div>
                </div>

                <BellToggle
                  active={notificationsEnabled}
                  onToggle={() => void handleRequestNotifications()}
                  activeLabel="Alerts On"
                  inactiveLabel="Muted"
                />
              </div>

              {!notificationsEnabled && (
                <button
                  type="button"
                  onClick={() => void handleRequestNotifications()}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  Enable Browser Study Reminders →
                </button>
              )}

              {notifStatusNote && (
                <p className="text-xs text-[#C6F432] font-mono">
                  {notifStatusNote}
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white tracking-tight">
                  Pick Your Launchpad
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Choose where you want to start right after setup.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LAUNCHPAD_CARDS.map(({ id, title, subtitle, Icon }) => {
                  const selected = preferredStart === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPreferredStart(id)}
                      className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                        selected
                          ? "bg-[#C6F432]/12 border-[#C6F432] shadow-[0_0_24px_rgba(198,244,50,0.12)]"
                          : "bg-[#0B0B0C] border-white/10 hover:border-white/25"
                      }`}
                    >
                      <span
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                          selected
                            ? "bg-[#C6F432] text-[#0B0B0C] border-[#C6F432]"
                            : "bg-zinc-900 text-zinc-300 border-white/10"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {title}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Guided Walkthrough Toggle */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#0B0B0C] border border-white/10">
                <div>
                  <div className="text-xs font-semibold text-white">
                    Run 30-second interactive walkthrough
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    Highlights your decks, 3D modes, and cloud sync controls
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={runTour}
                  onClick={() => setRunTour((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                    runTour ? "bg-[#C6F432]" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-[#0B0B0C] transition-transform duration-200 ${
                      runTour ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 sm:px-8 py-4 border-t border-white/10 bg-[#0B0B0C]/60 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-white border border-white/10 hover:border-white/25 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step < WIZARD_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#C6F432] text-[#0B0B0C] text-xs font-semibold hover:bg-[#d4f75c] transition-colors cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <StarBorder color="#C6F432" speed="4.5s">
              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#C6F432] text-[#0B0B0C] text-xs font-semibold hover:bg-[#d4f75c] transition-colors cursor-pointer"
              >
                <span>Enter Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </StarBorder>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ssOnboardSlide {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
