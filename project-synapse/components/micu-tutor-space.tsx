"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import type { Recall } from "./use-recall";

// ── Dynamically import DotLottie (SSR-safe) ──────────────────────────────────
const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: "rgba(198, 244, 50, 0.08)",
        }}
      />
    ),
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────
interface MicuTutorSpaceProps {
  recall: Recall;
  isUploadOpen?: boolean;
  onJumpToAR?: () => void;
}

type TutorState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "test-correct"
  | "test-wrong";

interface QALogItem {
  id: string;
  time: string;
  query: string;
  conceptTitle: string;
  reply: string;
  mode: "standard" | "simple" | "analogy" | "question" | "test";
}

// ── Background Radial Gradients per State ──────────────────────────────────────
const AMBIENT_BG: Record<string, string> = {
  idle: "radial-gradient(circle 700px at 50% 0%, rgba(255, 255, 255, 0.03), transparent 70%)",
  speaking: "radial-gradient(circle 700px at 50% 0%, rgba(198, 244, 50, 0.11), transparent 70%)",
  listening: "radial-gradient(circle 700px at 50% 0%, rgba(56, 189, 248, 0.12), transparent 70%)",
  thinking: "radial-gradient(circle 700px at 50% 0%, rgba(168, 85, 247, 0.12), transparent 70%)",
  "test-correct": "radial-gradient(circle 700px at 50% 0%, rgba(16, 185, 129, 0.12), transparent 70%)",
  "test-wrong": "radial-gradient(circle 700px at 50% 0%, rgba(244, 66, 50, 0.12), transparent 70%)",
};

// ── Micu Glow Color per State ─────────────────────────────────────────────────
const MICU_GLOW: Record<string, string> = {
  idle: "rgba(255,255,255,0.04)",
  speaking: "rgba(198,244,50,0.30)",
  listening: "rgba(56,189,248,0.30)",
  thinking: "rgba(168,85,247,0.30)",
  "test-correct": "rgba(16,185,129,0.30)",
  "test-wrong": "rgba(244,66,50,0.30)",
};

const STATE_LABEL: Record<string, string> = {
  idle: "Ready",
  speaking: "Speaking",
  listening: "Listening",
  thinking: "Thinking",
  "test-correct": "Correct",
  "test-wrong": "Review",
};

// ── Native SVG Mastery Ring ───────────────────────────────────────────────────
function MasteryRing({ mastery }: { mastery: number }) {
  if (mastery >= 80) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <circle
          cx="7"
          cy="7"
          r="5.5"
          fill="rgba(198,244,50,0.18)"
          stroke="#C6F432"
          strokeWidth="1.5"
        />
        <polyline
          points="4.2,7.2 6.2,9.2 9.8,4.8"
          fill="none"
          stroke="#C6F432"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (mastery > 0) {
    const r = 5;
    const c = 2 * Math.PI * r; // ~31.416
    const dash = (mastery / 100) * c;
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        style={{ flexShrink: 0, transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx="7"
          cy="7"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.5"
        />
        <circle
          cx="7"
          cy="7"
          r={r}
          fill="none"
          stroke="#F4A232"
          strokeWidth="1.5"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 0% mastery = empty muted ring
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MicuTutorSpace({
  recall,
  isUploadOpen,
  onJumpToAR,
}: MicuTutorSpaceProps) {
  const nodes = recall.nodes ?? [];
  const activeNode = recall.node ?? nodes[0];
  const activeIndex = recall.q;
  const values = recall.values ?? [];

  // Mastered count (mastery >= 80)
  const masteredCount = nodes.filter((_, i) => (values[i] ?? 0) >= 80).length;

  // ── Core State ──────────────────────────────────────────────────────────────
  const [tutorState, setTutorState] = useState<TutorState>("idle");
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [activeText, setActiveText] = useState("");
  const [revealedWordIndex, setRevealedWordIndex] = useState(0);
  const [audioVolume, setAudioVolume] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showConceptsDrawer, setShowConceptsDrawer] = useState(false);
  const [historyLog, setHistoryLog] = useState<QALogItem[]>([]);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [typedQuestion, setTypedQuestion] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [quizMode, setQuizMode] = useState(false);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizFeedback, setQuizFeedback] = useState("");

  // Loading task & error state for the native status pill
  const [loadingTask, setLoadingTask] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [lastAction, setLastAction] = useState<(() => void) | null>(null);

  // Concept mastery overrides for live quiz updates
  const [masteryOverrides, setMasteryOverrides] = useState<
    Record<number, number>
  >({});

  // ── Refs ────────────────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const teleprompterRef = useRef<HTMLDivElement | null>(null);
  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const audioStartEpochRef = useRef<number>(0);
  const audioDurationRef = useRef<number>(0);

  // ── Mastery helper ──────────────────────────────────────────────────────────
  const getMastery = (i: number) =>
    masteryOverrides[i] ?? Math.round(values[i] ?? nodes[i]?.retention ?? 0);

  // ── Comprehensive Audio Cancel ──────────────────────────────────────────────
  const stopSpeech = useCallback(() => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      } catch {}
      audioSourceRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setAudioVolume(0);
    audioDurationRef.current = 0;
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const cancelAllAudio = useCallback(() => {
    stopSpeech();
    stopListening();
  }, [stopSpeech, stopListening]);

  // ── Upload open: kill audio immediately ─────────────────────────────────────
  useEffect(() => {
    if (isUploadOpen) {
      cancelAllAudio();
      setTutorState("idle");
      setLoadingTask(null);
    }
  }, [isUploadOpen, cancelAllAudio]);

  // ── Auto-scroll teleprompter to active word ─────────────────────────────────
  useEffect(() => {
    if (activeWordRef.current) {
      activeWordRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [revealedWordIndex]);

  // ── Speak Pipeline ──────────────────────────────────────────────────────────
  const speakText = useCallback(
    async (textToSpeak: string) => {
      cancelAllAudio();
      setTutorState("speaking");
      setActiveText(textToSpeak);
      setRevealedWordIndex(0);
      const words = textToSpeak.split(" ");
      const totalWords = words.length;

      const runBrowserFallback = () => {
        setTutorState("speaking");
        if (typeof window === "undefined" || !("speechSynthesis" in window))
          return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 0.96 * speechSpeed;
        utterance.pitch = 1.04;
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find(
            (v) => v.lang.startsWith("en") && v.name.includes("Google")
          ) ||
          voices.find((v) => v.lang.startsWith("en")) ||
          voices[0];
        if (preferred) utterance.voice = preferred;
        let wIdx = 0;
        const intervalMs = Math.max(90, Math.floor(140 / speechSpeed));
        streamTimerRef.current = setInterval(() => {
          wIdx++;
          setRevealedWordIndex(wIdx);
          if (wIdx >= totalWords && streamTimerRef.current) {
            clearInterval(streamTimerRef.current);
            streamTimerRef.current = null;
          }
        }, intervalMs);
        utterance.onend = () => {
          setTutorState("idle");
          setRevealedWordIndex(totalWords);
        };
        utterance.onerror = () => setTutorState("idle");
        window.speechSynthesis.speak(utterance);
      };

      try {
        const response = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToSpeak }),
        });
        if (!response.ok) {
          runBrowserFallback();
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") await ctx.resume();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const source = ctx.createBufferSource();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.buffer = audioBuffer;
        source.playbackRate.value = speechSpeed;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioSourceRef.current = source;
        analyserRef.current = analyser;
        audioDurationRef.current = audioBuffer.duration / speechSpeed;
        audioStartEpochRef.current = ctx.currentTime;
        source.onended = () => {
          setTutorState("idle");
          setRevealedWordIndex(totalWords);
          audioSourceRef.current = null;
          audioDurationRef.current = 0;
        };
        source.start();
        setTutorState("speaking");
      } catch (err) {
        console.warn("Speech API error, using browser fallback:", err);
        runBrowserFallback();
      }
    },
    [speechSpeed, cancelAllAudio]
  );

  // ── Micu AI Chat Call ───────────────────────────────────────────────────────
  const requestMicuAI = useCallback(
    async (
      mode: "simple" | "analogy" | "question",
      userQuestion?: string
    ) => {
      if (!activeNode) return;
      cancelAllAudio();
      setTutorState("thinking");
      setHasError(false);
      const taskLabel =
        mode === "question"
          ? "Answering..."
          : mode === "simple"
          ? "Simplifying..."
          : "Crafting analogy...";
      setLoadingTask(taskLabel);
      setLastAction(() => () => requestMicuAI(mode, userQuestion));

      setActiveText(
        mode === "question"
          ? `Answering: "${userQuestion}"…`
          : mode === "simple"
          ? `Simplifying ${activeNode.title}…`
          : `Crafting a real-world analogy for ${activeNode.title}…`
      );

      try {
        const res = await fetch("/api/micu-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conceptTitle: activeNode.title,
            conceptSummary: activeNode.summary,
            mode,
            userQuestion,
          }),
        });

        if (!res.ok) throw new Error("Micu request failed");

        const data = await res.json();
        const reply = data.reply || `${activeNode.title}. ${activeNode.summary}`;
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const queryLabel =
          userQuestion ||
          (mode === "simple"
            ? "Explain simply"
            : mode === "analogy"
            ? "Real-world analogy"
            : "Overview");
        setHistoryLog((prev) => [
          {
            id: Math.random().toString(36).slice(2, 9),
            time: timeStr,
            query: queryLabel,
            conceptTitle: activeNode.title,
            reply,
            mode,
          },
          ...prev,
        ]);

        setLoadingTask(null);
        await speakText(reply);
      } catch (err) {
        console.error("Micu Chat error:", err);
        setLoadingTask(null);
        setHasError(true);
        const fallback = `${activeNode.title}. ${activeNode.summary}`;
        await speakText(fallback);
      }
    },
    [activeNode, speakText, cancelAllAudio]
  );

  // ── Explain (standard) ──────────────────────────────────────────────────────
  const handleExplain = useCallback(() => {
    if (!activeNode) return;
    const text = `${activeNode.title}. ${activeNode.summary}`;
    setLoadingTask("Explaining...");
    setHasError(false);
    speakText(text).finally(() => {
      setLoadingTask(null);
    });
  }, [activeNode, speakText]);

  // ── Audio-Reactive RAF Volume Loop ──────────────────────────────────────────
  useEffect(() => {
    let animId: number;
    const tick = () => {
      const now = performance.now();
      const totalWords = activeText ? activeText.split(" ").length : 0;
      if (
        tutorState === "speaking" &&
        audioCtxRef.current &&
        audioDurationRef.current > 0 &&
        totalWords > 0
      ) {
        const elapsed =
          audioCtxRef.current.currentTime - audioStartEpochRef.current;
        const progress = Math.min(
          1,
          Math.max(0, elapsed / audioDurationRef.current)
        );
        setRevealedWordIndex(Math.floor(progress * totalWords));
      }
      if (tutorState === "speaking") {
        if (analyserRef.current) {
          const timeData = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteTimeDomainData(timeData);
          let sum = 0;
          for (let i = 0; i < timeData.length; i++) {
            const v = (timeData[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / timeData.length);
          setAudioVolume((prev) => prev * 0.7 + Math.min(1, rms * 3.6) * 0.3);
        } else {
          const t = now * 0.009;
          setAudioVolume(Math.sin(t) * 0.25 + 0.35);
        }
      } else if (tutorState === "thinking" || tutorState === "listening") {
        const t = now * 0.005;
        setAudioVolume(0.18 + Math.sin(t) * 0.12);
      } else {
        setAudioVolume((prev) => Math.max(0, prev * 0.85));
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [tutorState, activeText]);

  // ── Push-to-Talk (SpeechRecognition) ────────────────────────────────────────
  const toggleListening = useCallback(() => {
    if (tutorState === "listening") {
      stopListening();
      setTutorState("idle");
      return;
    }
    const SpeechRec =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;
    if (!SpeechRec) {
      setStatusMessage("Speech recognition not supported in this browser.");
      setTimeout(() => setStatusMessage(""), 3500);
      return;
    }
    try {
      cancelAllAudio();
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onstart = () => {
        setTutorState("listening");
        setStatusMessage("");
      };
      rec.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          stopListening();
          requestMicuAI("question", transcript);
        }
      };
      rec.onerror = () => {
        stopListening();
        setTutorState("idle");
      };
      rec.onend = () => {
        stopListening();
        setTutorState((prev: TutorState) =>
          prev === "listening" ? "idle" : prev
        );
      };
      recognitionRef.current = rec;
      rec.start();
    } catch {
      setTutorState("idle");
    }
  }, [tutorState, cancelAllAudio, stopListening, requestMicuAI]);

  // ── Typed Question Submit ───────────────────────────────────────────────────
  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedQuestion.trim()) return;
    const q = typedQuestion.trim();
    setTypedQuestion("");
    setShowKeyInput(false);
    requestMicuAI("question", q);
  };

  // ── Quiz Mode Handlers ──────────────────────────────────────────────────────
  const handleTestMe = useCallback(() => {
    cancelAllAudio();
    setQuizMode(true);
    setQuizSelected(null);
    setQuizFeedback("");
    setTutorState("idle");
    const qz = activeNode?.quiz;
    if (qz) speakText(`Quick check: ${qz.question}`);
  }, [activeNode, speakText, cancelAllAudio]);

  const handleAnswerQuiz = (optIdx: number) => {
    if (quizSelected !== null || !activeNode?.quiz) return;
    setQuizSelected(optIdx);
    const isCorrect = optIdx === activeNode.quiz.correctIndex;
    setTutorState(isCorrect ? "test-correct" : "test-wrong");
    setQuizFeedback(
      isCorrect
        ? `✓ Correct! ${activeNode.quiz.explanation}`
        : `✗ Not quite. ${activeNode.quiz.explanation}`
    );
    // Live mastery update
    const prevMastery = getMastery(activeIndex);
    const newMastery = isCorrect
      ? Math.min(100, prevMastery + 20)
      : Math.max(0, prevMastery - 10);
    setMasteryOverrides((prev) => ({ ...prev, [activeIndex]: newMastery }));
    speakText(
      isCorrect
        ? `Correct! ${activeNode.quiz.explanation}`
        : `Not quite. ${activeNode.quiz.explanation}`
    );
  };

  const exitQuiz = useCallback(() => {
    cancelAllAudio();
    setQuizMode(false);
    setQuizSelected(null);
    setQuizFeedback("");
    setTutorState("idle");
  }, [cancelAllAudio]);

  const nextConcept = useCallback(() => {
    cancelAllAudio();
    const nextIdx = (activeIndex + 1) % nodes.length;
    recall.focusNode(nextIdx);
  }, [cancelAllAudio, activeIndex, nodes.length, recall]);

  // ── Reset on concept change ──────────────────────────────────────────────────
  useEffect(() => {
    cancelAllAudio();
    setQuizMode(false);
    setQuizSelected(null);
    setQuizFeedback("");
    setTutorState("idle");
    setLoadingTask(null);
    setHasError(false);
    if (activeNode) {
      const initialText = `${activeNode.title}. ${activeNode.summary}`;
      setActiveText(initialText);
      setRevealedWordIndex(initialText.split(" ").length);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNode?.id]);

  // ── Unmount / Visibility Cleanup ────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAllAudio();
        setTutorState("idle");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      cancelAllAudio();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [cancelAllAudio]);

  // ── Focus inline input when opened ──────────────────────────────────────────
  useEffect(() => {
    if (showKeyInput) setTimeout(() => inputRef.current?.focus(), 50);
  }, [showKeyInput]);

  // ── Derived Variables ────────────────────────────────────────────────────────
  const words = activeText.split(" ");
  const quiz = activeNode?.quiz;
  const isDimmed = tutorState === "speaking" || tutorState === "listening";
  const ambientBackground = AMBIENT_BG[tutorState] ?? AMBIENT_BG.idle;
  const micuGlow = MICU_GLOW[tutorState] ?? MICU_GLOW.idle;
  const micuSize = `clamp(130px, 22vh, 185px)`;
  const currentMastery = getMastery(activeIndex);

  return (
    <>
      <style>{`
        @keyframes micuFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-7px); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 0.4; transform: scale(0.85); }
          50%      { opacity: 1; transform: scale(1.15); }
        }
        .mts-root {
          display: grid;
          grid-template-columns: 256px minmax(0, 1fr);
          height: 100%;
          width: 100%;
          background: #0B0B0C;
          overflow: hidden;
          position: relative;
        }
        @media (max-width: 1023px) {
          .mts-root { grid-template-columns: 1fr; }
          .mts-left  { display: none !important; }
          .mts-right { padding: 12px 14px 16px !important; }
          .mts-top-bar { justify-content: center; flex-wrap: wrap; gap: 8px; }
        }
        @media (max-width: 767px) {
          .mts-dock-container {
            max-width: 100%;
            padding-bottom: max(4px, env(safe-area-inset-bottom));
          }
          .mts-dock {
            overflow-x: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 6px 8px;
          }
          .mts-dock::-webkit-scrollbar { display: none; }
          .mts-history-drawer {
            top: 8px;
            left: 8px;
            right: 8px;
            bottom: 8px;
            width: auto;
          }
          .mts-quiz-opts { grid-template-columns: 1fr !important; }
        }
        .mts-left {
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          padding: 20px 14px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: #0B0B0C;
          z-index: 10;
          transition: opacity 280ms ease;
        }
        .mts-left.dimmed { opacity: 0.42; }
        .mts-left:hover  { opacity: 1 !important; }
        .mts-concept-row {
          padding: 9px 10px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          position: relative;
          cursor: pointer;
          background: transparent;
          border: none;
          color: #A1A1AA;
          width: 100%;
          transition: background 0.14s, color 0.14s;
        }
        .mts-concept-row:hover {
          background: rgba(255, 255, 255, 0.04);
          color: #E4E4E7;
        }
        .mts-concept-row.active {
          background: rgba(255, 255, 255, 0.06);
          color: #FAFAFA;
        }
        .mts-concept-row.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 2px;
          height: 60%;
          border-radius: 2px;
          background: #C6F432;
        }
        .mts-right {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          padding: 16px 32px 20px;
          overflow: hidden;
          transition: padding-right 280ms ease;
        }
        .mts-top-bar {
          position: relative;
          z-index: 20;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          margin-bottom: 4px;
        }
        .mts-ghost-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 9px;
          color: rgba(255, 255, 255, 0.65);
          font-size: 12px;
          font-weight: 500;
          padding: 5px 12px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .mts-ghost-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          color: #FAFAFA;
        }
        .mts-ghost-btn.active {
          background: rgba(198, 244, 50, 0.12);
          border-color: rgba(198, 244, 50, 0.3);
          color: #C6F432;
        }
        .mts-stage {
          position: relative;
          z-index: 10;
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .mts-dock-container {
          position: relative;
          z-index: 20;
          flex-shrink: 0;
          margin: 10px auto 0;
          max-width: 640px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .mts-dock {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 10px;
          background: rgba(24, 24, 27, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 18px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          flex-wrap: nowrap;
          width: 100%;
        }
        .mts-dock-sep {
          width: 1px;
          height: 20px;
          background: rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
          margin: 0 2px;
        }
        .mts-dock-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.72);
          font-size: 13px;
          font-weight: 500;
          padding: 6px 11px;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.14s, color 0.14s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .mts-dock-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #FAFAFA;
        }
        .mts-dock-btn.primary {
          background: #C6F432;
          color: #0B0B0C;
          font-weight: 650;
        }
        .mts-dock-btn.primary:hover { filter: brightness(1.08); }
        .mts-dock-btn.stop-btn {
          background: rgba(244, 66, 50, 0.14);
          color: #f87171;
          border: 1px solid rgba(244, 66, 50, 0.2);
        }
        .mts-dock-btn.stop-btn:hover { background: rgba(244, 66, 50, 0.22); }
        .mts-dock-btn.active {
          background: rgba(255, 255, 255, 0.1);
          color: #FAFAFA;
        }
        .mts-teleprompter {
          max-width: 640px;
          width: 100%;
          max-height: 155px;
          overflow-y: auto;
          scrollbar-width: none;
          text-align: center;
          padding: 0 8px;
          font-size: 15px;
          line-height: 1.65;
        }
        .mts-history-drawer {
          position: absolute;
          top: 56px;
          right: 20px;
          bottom: 84px;
          width: 320px;
          z-index: 40;
          display: flex;
          flex-direction: column;
          background: rgba(14, 14, 17, 0.94);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          overflow: hidden;
        }
        .mts-quiz-card {
          max-width: 660px;
          width: 100%;
          flex: 0 1 auto;
          max-height: calc(100% - 60px);
          overflow-y: auto;
          padding: 16px 20px;
          border-radius: 16px;
          background: rgba(24, 24, 27, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .mts-quiz-opts {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 12px;
        }
        .mts-quiz-opt {
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: rgba(255, 255, 255, 0.85);
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          transition: background 0.14s, border-color 0.14s;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          line-height: 1.4;
        }
        .mts-quiz-opt:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.09);
        }
        .mts-quiz-opt:disabled { cursor: default; }
        .mts-quiz-opt.correct {
          background: rgba(16, 185, 129, 0.14);
          border-color: rgba(16, 185, 129, 0.4);
          color: #6ee7b7;
        }
        .mts-quiz-opt.wrong {
          background: rgba(244, 66, 50, 0.12);
          border-color: rgba(244, 66, 50, 0.35);
          color: #fca5a5;
        }
        .mts-quiz-opt.neutral-after { opacity: 0.5; }
        .mts-opt-label {
          font-size: 11px;
          font-weight: 650;
          opacity: 0.5;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .mts-quiz-feedback {
          margin-top: 10px;
          padding: 9px 12px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          font-size: 12px;
          color: rgba(255, 255, 255, 0.75);
          line-height: 1.5;
        }
        .mts-quiz-footer {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          justify-content: flex-end;
        }
        .mts-status-msg {
          position: absolute;
          bottom: 100px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(14, 14, 17, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 7px 14px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.75);
          pointer-events: none;
          z-index: 50;
          white-space: nowrap;
        }
        .mts-concept-title-text {
          font-size: clamp(22px, 2.3vw, 28px);
          font-weight: 600;
          letter-spacing: -0.02em;
          color: #FAFAFA;
          text-align: center;
          max-width: 580px;
          line-height: 1.2;
          margin: 0;
        }
        .mts-hairline {
          width: 96px;
          height: 2px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.1);
          position: relative;
          overflow: hidden;
        }
        .mts-hairline-fill {
          position: absolute;
          inset-block: 0;
          left: 0;
          border-radius: 2px;
          background: #C6F432;
          transition: width 0.6s ease;
        }
        .mts-micu-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mts-aura {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          pointer-events: none;
          transition: background 0.4s ease, width 0.15s ease, height 0.15s ease;
          filter: blur(36px);
        }
        .mts-micu-inner {
          position: relative;
          z-index: 2;
          animation: micuFloat 3.2s ease-in-out infinite alternate;
        }
        .mts-state-caption {
          font-size: 12px;
          color: #71717A;
          text-align: center;
          letter-spacing: 0.03em;
        }
        .mts-quiz-header {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
          margin-bottom: 8px;
        }
      `}</style>

      {/* ── 2-Column Grid Root ─────────────────────────────────────────────── */}
      <div className="mts-root">

        {/* ── LEFT: Borderless Concept Index ───────────────────────────────── */}
        <aside className={`mts-left${isDimmed ? " dimmed" : ""}`}>
          {/* Header */}
          <div style={{ marginBottom: 4 }}>
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#F4F4F5",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {recall.deck?.name ?? "Deck"}
            </p>
            <p
              style={{
                fontSize: 12,
                color: "#71717A",
                margin: "2px 0 0",
              }}
            >
              {nodes.length} concepts · {masteredCount} mastered
            </p>
            {/* Slim 2px progress bar */}
            <div
              style={{
                width: "100%",
                height: 2,
                borderRadius: 2,
                background: "rgba(255,255,255,0.08)",
                marginTop: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${
                    nodes.length > 0 ? (masteredCount / nodes.length) * 100 : 0
                  }%`,
                  background: "#C6F432",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>

          {/* Scrollable concept list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              scrollbarWidth: "none",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              marginTop: 14,
            }}
          >
            {nodes.map((node, i) => {
              const mastery = getMastery(i);
              const isActive = i === activeIndex;

              return (
                <button
                  key={node.id}
                  className={`mts-concept-row${isActive ? " active" : ""}`}
                  onClick={() => {
                    cancelAllAudio();
                    recall.focusNode(i);
                  }}
                  aria-pressed={isActive}
                >
                  <MasteryRing mastery={mastery} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textAlign: "left",
                    }}
                  >
                    {node.title}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                      flexShrink: 0,
                      color:
                        mastery >= 80
                          ? "#C6F432"
                          : mastery > 0
                          ? "#A1A1AA"
                          : "#71717A",
                    }}
                  >
                    {mastery === 0 ? "New" : `${mastery}%`}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── RIGHT: Main Spatial Stage ─────────────────────────────────────── */}
        <div
          className="mts-right"
          style={{
            paddingRight: showHistory ? 344 : 32,
          }}
        >
          {/* Subtle Ambient CSS Backdrop */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 0,
              background: ambientBackground,
              transition: "background 500ms ease",
            }}
          />

          {/* Row 1 — Top utility bar */}
          <div className="mts-top-bar">
            <button
              type="button"
              className={`mts-ghost-btn lg:hidden${showConceptsDrawer ? " active" : ""}`}
              onClick={() => setShowConceptsDrawer(true)}
              aria-label="Open concepts list"
            >
              Concepts ({nodes.length})
            </button>

            {/* Native segmented speed toggle */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#18181B",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                padding: 2,
                gap: 2,
              }}
            >
              {[0.9, 1.0, 1.2].map((s) => {
                const isAct = speechSpeed === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeechSpeed(s)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 550,
                      border: "none",
                      cursor: "pointer",
                      background: isAct ? "#27272A" : "transparent",
                      color: isAct ? "#FAFAFA" : "#71717A",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {s.toFixed(1)}×
                  </button>
                );
              })}
            </div>

            <button
              className={`mts-ghost-btn${showHistory ? " active" : ""}`}
              onClick={() => setShowHistory((v) => !v)}
              aria-label="Toggle session history"
              aria-expanded={showHistory}
            >
              History ({historyLog.length})
            </button>
            {onJumpToAR && (
              <button
                className="mts-ghost-btn"
                onClick={onJumpToAR}
                aria-label="Practice in AR"
              >
                Practice in AR →
              </button>
            )}
          </div>

          {/* Row 2 — Center stage */}
          <div className="mts-stage">
            {!quizMode ? (
              /* ── Explanation View ─────────────────────────────────────────── */
              <>
                {/* Concept title + mastery hairline */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <h2 className="mts-concept-title-text">
                    {activeNode?.title ?? "Select a concept"}
                  </h2>
                  <div className="mts-hairline">
                    <div
                      className="mts-hairline-fill"
                      style={{ width: `${currentMastery}%` }}
                    />
                  </div>
                </div>

                {/* Ephemeral native dark-zinc status pill */}
                <div
                  style={{
                    minHeight: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {loadingTask && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        background: "#18181B",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 999,
                        padding: "5px 14px",
                        fontSize: 12,
                        color: "#F4F4F5",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#C6F432",
                          animation: "pulseDot 1.4s infinite ease-in-out",
                        }}
                      />
                      <span>{loadingTask}</span>
                    </div>
                  )}
                  {hasError && !loadingTask && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.25)",
                        borderRadius: 999,
                        padding: "5px 14px",
                        fontSize: 12,
                        color: "#fca5a5",
                      }}
                    >
                      <span>Failed to generate response</span>
                      {lastAction && (
                        <button
                          onClick={lastAction}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#FAFAFA",
                            textDecoration: "underline",
                            cursor: "pointer",
                            fontSize: 12,
                            padding: 0,
                          }}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Micu + audio-reactive aura */}
                <div className="mts-micu-wrap">
                  <div
                    className="mts-aura"
                    style={{
                      width: `calc(${micuSize} * ${1 + audioVolume * 0.55})`,
                      height: `calc(${micuSize} * ${1 + audioVolume * 0.55})`,
                      background: micuGlow,
                    }}
                  />
                  <div className="mts-micu-inner">
                    <DotLottieReact
                      src="/micu.lottie"
                      loop
                      autoplay
                      style={{
                        width: micuSize,
                        height: micuSize,
                      }}
                    />
                  </div>
                </div>

                {/* State caption */}
                <p className="mts-state-caption">
                  {STATE_LABEL[tutorState] ?? "Ready"}
                </p>

                {/* Auto-scrolling borderless teleprompter */}
                {activeText && (
                  <div ref={teleprompterRef} className="mts-teleprompter">
                    {words.map((word, wi) => {
                      const isSpoken = wi < revealedWordIndex;
                      const isActive = wi === revealedWordIndex;
                      return (
                        <span
                          key={wi}
                          ref={isActive ? activeWordRef : undefined}
                          style={{
                            color: isActive
                              ? "#C6F432"
                              : isSpoken
                              ? "#F4F4F5"
                              : "rgba(244,244,245,0.38)",
                            transition: "color 0.12s",
                          }}
                        >
                          {word}{" "}
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              /* ── Quiz View ────────────────────────────────────────────────── */
              <>
                {/* Compact quiz header */}
                <div className="mts-quiz-header">
                  <div style={{ flexShrink: 0 }}>
                    <DotLottieReact
                      src="/micu.lottie"
                      loop
                      autoplay
                      style={{ width: 52, height: 52 }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#F4F4F5",
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {activeNode?.title}
                  </span>
                  <button
                    className="mts-ghost-btn"
                    onClick={exitQuiz}
                    aria-label="Exit quiz"
                    style={{ flexShrink: 0 }}
                  >
                    × Exit
                  </button>
                </div>

                {/* Quiz card */}
                <div className="mts-quiz-card">
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#F4F4F5",
                      lineHeight: 1.45,
                      margin: 0,
                    }}
                  >
                    {quiz?.question ?? "No quiz available for this concept."}
                  </p>

                  {quiz && (
                    <>
                      <div className="mts-quiz-opts">
                        {quiz.options.map((opt, oi) => {
                          const labels = ["A", "B", "C", "D"];
                          const isSelected = quizSelected === oi;
                          const isCorrectOpt = oi === quiz.correctIndex;
                          const answered = quizSelected !== null;
                          let cls = "mts-quiz-opt";
                          if (answered) {
                            if (isCorrectOpt) cls += " correct";
                            else if (isSelected) cls += " wrong";
                            else cls += " neutral-after";
                          }
                          return (
                            <button
                              key={oi}
                              className={cls}
                              disabled={answered}
                              onClick={() => handleAnswerQuiz(oi)}
                            >
                              <span className="mts-opt-label">
                                {labels[oi]}
                              </span>
                              <span>{opt}</span>
                            </button>
                          );
                        })}
                      </div>

                      {quizFeedback && (
                        <div className="mts-quiz-feedback">{quizFeedback}</div>
                      )}

                      <div className="mts-quiz-footer">
                        <button
                          className="mts-ghost-btn"
                          onClick={exitQuiz}
                        >
                          Back to tutor
                        </button>
                        {quizSelected !== null && (
                          <button
                            className="mts-dock-btn primary"
                            style={{ borderRadius: 9, fontSize: 13 }}
                            onClick={nextConcept}
                          >
                            Next concept →
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Row 3 — Floating command dock container */}
          <div className="mts-dock-container">
            {/* Floating text input when keyboard mode is ON */}
            {showKeyInput && (
              <form
                onSubmit={handleTypedSubmit}
                style={{
                  width: "100%",
                  maxWidth: 520,
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#18181B",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 14,
                  padding: "5px 8px 5px 14px",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(20px)",
                }}
              >
                <input
                  ref={inputRef}
                  value={typedQuestion}
                  onChange={(e) => setTypedQuestion(e.target.value)}
                  placeholder="Ask Micu anything… (Enter to send, Esc to close)"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#F4F4F5",
                    fontSize: 13,
                    minWidth: 0,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setShowKeyInput(false);
                      setTypedQuestion("");
                    }
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: "#C6F432",
                    color: "#0B0B0C",
                    border: "none",
                    borderRadius: 8,
                    padding: "5px 11px",
                    fontSize: 12,
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowKeyInput(false);
                    setTypedQuestion("");
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#71717A",
                    fontSize: 14,
                    cursor: "pointer",
                    padding: "4px 8px",
                  }}
                >
                  ×
                </button>
              </form>
            )}

            {/* Single-row floating dock */}
            <div className="mts-dock">
              {/* Primary action */}
              {tutorState === "speaking" ? (
                <button
                  className="mts-dock-btn stop-btn"
                  onClick={() => {
                    stopSpeech();
                    setTutorState("idle");
                  }}
                >
                  ⏹ Stop
                </button>
              ) : (
                <button className="mts-dock-btn primary" onClick={handleExplain}>
                  Explain
                </button>
              )}

              {/* Ask voice button with clean 15px SVG mic icon */}
              <button
                className={`mts-dock-btn${
                  tutorState === "listening" ? " active" : ""
                }`}
                onClick={toggleListening}
                title="Voice question"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
                <span>{tutorState === "listening" ? "Listening…" : "Ask"}</span>
              </button>

              {/* Keyboard toggle */}
              <button
                className={`mts-dock-btn${showKeyInput ? " active" : ""}`}
                onClick={() => setShowKeyInput((v) => !v)}
                title="Type question"
              >
                ⌨️
              </button>

              <div className="mts-dock-sep" />

              {/* Secondary actions */}
              <button
                className="mts-dock-btn"
                onClick={() => requestMicuAI("simple")}
                disabled={tutorState === "thinking"}
              >
                Simplify
              </button>
              <button
                className="mts-dock-btn"
                onClick={() => requestMicuAI("analogy")}
                disabled={tutorState === "thinking"}
              >
                Analogy
              </button>
              <button
                className={`mts-dock-btn${quizMode ? " active" : ""}`}
                onClick={quizMode ? exitQuiz : handleTestMe}
              >
                Test me
              </button>
            </div>
          </div>

          {/* Mobile Concepts Slide-Over Drawer (< lg) */}
          {showConceptsDrawer && (
            <div className="lg:hidden fixed inset-0 z-50 flex">
              <div
                className="absolute inset-0 bg-black/65 backdrop-blur-sm"
                onClick={() => setShowConceptsDrawer(false)}
              />
              <aside
                className="relative z-10 w-[82vw] max-w-[300px] h-full bg-[#0B0B0C] border-r border-white/10 p-4 flex flex-col shadow-2xl"
                aria-label="Concepts Drawer"
              >
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 truncate m-0">
                      {recall.deck?.name ?? "Deck"}
                    </p>
                    <p className="text-xs text-zinc-500 m-0 mt-0.5">
                      {nodes.length} concepts · {masteredCount} mastered
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowConceptsDrawer(false)}
                    aria-label="Close concepts drawer"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    ×
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1 mt-3 pb-safe">
                  {nodes.map((node, i) => {
                    const mastery = getMastery(i);
                    const isActive = i === activeIndex;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        className={`mts-concept-row${isActive ? " active" : ""}`}
                        onClick={() => {
                          cancelAllAudio();
                          recall.focusNode(i);
                          setShowConceptsDrawer(false);
                        }}
                        aria-pressed={isActive}
                      >
                        <MasteryRing mastery={mastery} />
                        <span className="flex-1 min-w-0 text-[13px] leading-snug line-clamp-2 text-left">
                          {node.title}
                        </span>
                        <span
                          className="text-[11px] tabular-nums shrink-0"
                          style={{
                            color:
                              mastery >= 80
                                ? "#C6F432"
                                : mastery > 0
                                  ? "#A1A1AA"
                                  : "#71717A",
                          }}
                        >
                          {mastery === 0 ? "New" : `${mastery}%`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>
            </div>
          )}

          {/* History slide-over drawer */}
          {showHistory && (
            <div className="mts-history-drawer">
              <div
                style={{
                  padding: "14px 16px 10px",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#F4F4F5",
                  }}
                >
                  Session History
                </span>
                <button
                  className="mts-ghost-btn"
                  onClick={() => setShowHistory(false)}
                  style={{ padding: "3px 8px" }}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  scrollbarWidth: "none",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {historyLog.length === 0 ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: "#71717A",
                      textAlign: "center",
                      marginTop: 20,
                    }}
                  >
                    No history yet. Ask Micu something!
                  </p>
                ) : (
                  historyLog.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 10,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "#71717A",
                            fontWeight: 500,
                          }}
                        >
                          {item.conceptTitle}
                        </span>
                        <span style={{ fontSize: 11, color: "#71717A" }}>
                          {item.time}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 12,
                          color: "#A1A1AA",
                          margin: "0 0 4px",
                          fontStyle: "italic",
                        }}
                      >
                        "{item.query}"
                      </p>
                      <p
                        style={{
                          fontSize: 12,
                          color: "rgba(244,244,245,0.75)",
                          margin: 0,
                          lineHeight: 1.5,
                          display: "-webkit-box",
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {item.reply}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Native Clear History Ghost Button */}
              {historyLog.length > 0 && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderTop: "1px solid rgba(255,255,255,0.07)",
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setHistoryLog([])}
                    style={{
                      width: "100%",
                      padding: "7px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "transparent",
                      color: "#A1A1AA",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#FAFAFA";
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#A1A1AA";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    Clear history
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Status message toast */}
          {statusMessage && (
            <div className="mts-status-msg" role="status">
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
