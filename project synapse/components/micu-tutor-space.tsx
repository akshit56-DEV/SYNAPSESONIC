"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Sparkles,
  Lightbulb,
  Brain,
  Loader2,
  Keyboard,
  Send,
  X,
  History,
  MessageSquare,
  Sparkle,
  Radio,
  Sliders,
  Compass,
} from "lucide-react";
import type { Recall } from "./use-recall";

// Dynamically import DotLottieReact with ssr: false
const DotLottieReact = dynamic(
  () =>
    import("@lottiefiles/dotlottie-react").then((mod) => mod.DotLottieReact),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: "50%",
            background: "rgba(198, 244, 50, 0.12)",
            border: "1px solid rgba(198, 244, 50, 0.3)",
          }}
        />
      </div>
    ),
  }
);

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

function masteryColor(pct: number) {
  if (pct >= 70) return "#C6F432";
  if (pct >= 40) return "#F4A232";
  return "#F44232";
}

function extractKeywords(title: string, summary: string): string[] {
  const stopWords = new Set([
    "the", "and", "that", "this", "with", "from", "for", "are", "which",
    "allows", "refers", "means", "used", "each", "into", "their", "have",
    "will", "such", "than", "been", "also", "about", "other", "where",
    "when", "while", "what", "more", "most", "some", "both", "across"
  ]);
  const text = `${title} ${summary}`.toLowerCase().replace(/[^\w\s]/g, " ");
  const rawWords = text.split(/\s+/).filter((w) => w.length >= 4 && !stopWords.has(w));
  const unique = Array.from(new Set(rawWords));
  return unique.slice(0, 3).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
}

export function MicuTutorSpace({
  recall,
  isUploadOpen,
  onJumpToAR,
}: MicuTutorSpaceProps) {
  const nodes = recall.nodes ?? [];
  const activeNode = recall.node ?? nodes[0];
  const activeIndex = recall.q;
  const values = recall.values ?? [];

  // Core status
  const [tutorState, setTutorState] = useState<TutorState>("idle");
  const [modeType, setModeType] = useState<
    "standard" | "simple" | "analogy" | "question" | "test"
  >("standard");

  // Teleprompter text & streaming reveal
  const [activeText, setActiveText] = useState("");
  const [revealedWordIndex, setRevealedWordIndex] = useState(0);

  // Audio-reactive visual volume & spectrum (0 to 1)
  const [audioVolume, setAudioVolume] = useState(0);
  const [spectrumBars, setSpectrumBars] = useState<number[]>(new Array(12).fill(0.1));

  // Voice speed (0.9x, 1.0x, 1.2x)
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);

  // Keyboard inline input toggle & query
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [typedQuestion, setTypedQuestion] = useState("");

  // History slide-over drawer & session log
  const [showHistory, setShowHistory] = useState(false);
  const [historyLog, setHistoryLog] = useState<QALogItem[]>([]);

  // Test mode options state
  const [testSelected, setTestSelected] = useState<number | null>(null);

  // Error/notification messages
  const [statusMessage, setStatusMessage] = useState("");

  // Web Audio & Speech References
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const testTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioStartEpochRef = useRef<number>(0);
  const audioDurationRef = useRef<number>(0);

  // Stop active speech and reset audio graph
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

  // Stop Speech Recognition
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  // Bug Fix 1: When Upload Modal Opens, Immediately Pause/Reset All Speech
  useEffect(() => {
    if (isUploadOpen) {
      stopSpeech();
      stopListening();
      setTutorState("idle");
    }
  }, [isUploadOpen, stopSpeech, stopListening]);

  // Web Audio / Browser TTS Speak Pipeline
  const speakText = useCallback(
    async (textToSpeak: string) => {
      stopSpeech();
      stopListening();
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
        utterance.onerror = () => {
          setTutorState("idle");
        };
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

        // AudioContext setup
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

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
    [speechSpeed, stopSpeech, stopListening]
  );

  // Call `/api/micu-chat` Groq endpoint, append to History, then speak reply
  const requestMicuAI = useCallback(
    async (
      mode: "simple" | "analogy" | "question",
      userQuestion?: string
    ) => {
      if (!activeNode) return;
      stopSpeech();
      stopListening();
      setTutorState("thinking");
      setModeType(mode);
      setTestSelected(null);
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

        const data = await res.json();
        const reply =
          data.reply || `${activeNode.title}. ${activeNode.summary}`;

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

        await speakText(reply);
      } catch (err) {
        console.error("Micu Chat error:", err);
        const fallback = `${activeNode.title}. ${activeNode.summary}`;
        await speakText(fallback);
      }
    },
    [activeNode, speakText, stopSpeech, stopListening]
  );

  // Real-Time Audio-reactive volume loop (RMS calculation + Spectrum Bars + Word Sync)
  useEffect(() => {
    let animId: number;

    const tick = () => {
      const now = performance.now();
      const totalWords = activeText ? activeText.split(" ").length : 0;

      // 1. Precise Teleprompter Word Sync using AudioContext currentTime
      if (tutorState === "speaking" && audioCtxRef.current && audioDurationRef.current > 0 && totalWords > 0) {
        const elapsed = (audioCtxRef.current.currentTime - audioStartEpochRef.current);
        const progress = Math.min(1, Math.max(0, elapsed / audioDurationRef.current));
        const syncIndex = Math.floor(progress * totalWords);
        setRevealedWordIndex(syncIndex);
      }

      // 2. Audio-reactive Volume & 12-Bar Spectrum
      if (tutorState === "speaking") {
        if (analyserRef.current) {
          const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(freqData);

          const timeData = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteTimeDomainData(timeData);

          let sum = 0;
          for (let i = 0; i < timeData.length; i++) {
            const v = (timeData[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / timeData.length);
          setAudioVolume((prev) => prev * 0.7 + Math.min(1, rms * 3.6) * 0.3);

          // Sample 12 spectrum bars
          const step = Math.max(1, Math.floor(freqData.length / 12));
          const bars: number[] = [];
          for (let b = 0; b < 12; b++) {
            const rawVal = freqData[Math.min(freqData.length - 1, b * step)] / 255;
            bars.push(Math.max(0.1, rawVal));
          }
          setSpectrumBars(bars);
        } else {
          const t = now * 0.009;
          const fakeRms = Math.sin(t) * 0.25 + 0.35;
          setAudioVolume(fakeRms);
          setSpectrumBars(
            new Array(12).fill(0).map((_, i) => Math.max(0.12, Math.sin(t + i * 0.5) * 0.35 + 0.4))
          );
        }
      } else if (tutorState === "thinking" || tutorState === "listening") {
        const t = now * 0.005;
        const v = 0.18 + Math.sin(t) * 0.12;
        setAudioVolume(v);
        setSpectrumBars(
          new Array(12).fill(0).map((_, i) => Math.max(0.08, Math.sin(t * 1.5 + i * 0.4) * 0.18 + 0.22))
        );
      } else {
        setAudioVolume((prev) => Math.max(0, prev * 0.85));
        const t = now * 0.002;
        setSpectrumBars(
          new Array(12).fill(0).map((_, i) => Math.max(0.06, Math.sin(t + i * 0.3) * 0.08 + 0.1))
        );
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [tutorState, activeText]);

  // Push-to-Talk Mic (SpeechRecognition)
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
      setStatusMessage("Speech recognition is not supported in this browser.");
      setTimeout(() => setStatusMessage(""), 3500);
      return;
    }

    try {
      stopSpeech();
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
        setTutorState((prev) => (prev === "listening" ? "idle" : prev));
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setTutorState("idle");
    }
  }, [tutorState, stopSpeech, stopListening, requestMicuAI]);

  // Handle Typed Question Submit
  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedQuestion.trim()) return;
    const q = typedQuestion.trim();
    setTypedQuestion("");
    setShowKeyInput(false);
    requestMicuAI("question", q);
  };

  // Reset text when active node changes
  useEffect(() => {
    stopSpeech();
    stopListening();
    setTestSelected(null);
    setModeType("standard");
    setTutorState("idle");
    if (activeNode) {
      const initialText = `${activeNode.title}. ${activeNode.summary}`;
      setActiveText(initialText);
      setRevealedWordIndex(initialText.split(" ").length);
    }
  }, [activeNode?.id, stopSpeech, stopListening]);

  // Full Cleanup on unmount or tab switch
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopSpeech();
        stopListening();
        setTutorState("idle");
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopSpeech();
      stopListening();
      if (testTimeoutRef.current) {
        clearTimeout(testTimeoutRef.current);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stopSpeech, stopListening]);

  // Focus inline input when keyboard mode opens
  useEffect(() => {
    if (showKeyInput) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showKeyInput]);

  // Action Chip Handlers
  const handleExplainSimply = () => {
    requestMicuAI("simple");
  };

  const handleAnalogy = () => {
    requestMicuAI("analogy");
  };

  const handleTestMe = () => {
    stopSpeech();
    stopListening();
    setModeType("test");
    setTestSelected(null);
    setTutorState("idle");
    const qz = activeNode?.quiz;
    if (qz) {
      setActiveText(qz.question);
      speakText(`Quick check: ${qz.question}`);
    }
  };

  const handleAnswerTest = (optIdx: number) => {
    if (testSelected !== null || !activeNode?.quiz) return;
    setTestSelected(optIdx);
    const isCorrect = optIdx === activeNode.quiz.correctIndex;

    setTutorState(isCorrect ? "test-correct" : "test-wrong");

    const feedback = isCorrect
      ? `Correct! ${activeNode.quiz.explanation}`
      : `Not quite. ${activeNode.quiz.explanation}`;

    speakText(feedback);

    if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current);
    testTimeoutRef.current = setTimeout(() => {
      if (tutorState === "test-correct" || tutorState === "test-wrong") {
        setTutorState("idle");
      }
    }, 4500);
  };

  // State-Reactive Colors & Status Pill
  const getStateInfo = () => {
    switch (tutorState) {
      case "listening":
        return {
          color: "#38BDF8",
          label: "LISTENING",
          glow: "rgba(56, 189, 248, 0.4)",
        };
      case "thinking":
        return {
          color: "#A855F7",
          label: "THINKING",
          glow: "rgba(168, 85, 247, 0.4)",
        };
      case "speaking":
        return {
          color: "#C6F432",
          label: "SPEAKING",
          glow: "rgba(198, 244, 50, 0.45)",
        };
      case "test-correct":
        return {
          color: "#10B981",
          label: "CORRECT",
          glow: "rgba(16, 185, 129, 0.45)",
        };
      case "test-wrong":
        return {
          color: "#F44232",
          label: "REVIEW",
          glow: "rgba(244, 66, 50, 0.45)",
        };
      default:
        return {
          color: "rgba(255, 255, 255, 0.4)",
          label: "READY",
          glow: "rgba(255, 255, 255, 0.05)",
        };
    }
  };

  const stateInfo = getStateInfo();
  const words = activeText.split(" ");
  const quiz = activeNode?.quiz;
  const currentMastery = Math.round(values[activeIndex] ?? activeNode?.retention ?? 80);
  const currentMasteryColor = masteryColor(currentMastery);

  // Derive 3 keyword chips from concept title and summary
  const keywordChips = useMemo(() => {
    if (!activeNode) return [];
    return extractKeywords(activeNode.title, activeNode.summary);
  }, [activeNode?.title, activeNode?.summary]);

  // Up next in deck list (next 3-4 nodes)
  const upNextNodes = useMemo(() => {
    if (!nodes.length) return [];
    const list = [];
    for (let i = 1; i <= Math.min(4, nodes.length - 1); i++) {
      const idx = (activeIndex + i) % nodes.length;
      list.push({ node: nodes[idx], idx });
    }
    return list;
  }, [nodes, activeIndex]);

  // Vision Pro Focus-Dimming: true when Micu is speaking or listening
  const isDimmed = tutorState === "speaking" || tutorState === "listening";

  return (
    <>
      <style>{`
        @keyframes micuFloat {
          0% { transform: translateY(0px); }
          100% { transform: translateY(-7px); }
        }
        @keyframes soundwaveBar {
          0%, 100% { height: 3px; }
          50% { height: 11px; }
        }
        @keyframes waveRibbonA {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 40; }
        }
        @keyframes waveRibbonB {
          0% { stroke-dashoffset: 40; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes rotateGlow {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes pulseRing {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.45; }
          50% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.85; }
        }

        .micu-spatial-grid {
          display: grid;
          grid-template-columns: 230px minmax(0, 1fr) 230px;
          align-items: center;
          gap: 16px;
          width: 100%;
          max-width: 1260px;
          margin: 0 auto;
          flex: 1 1 auto;
          min-height: 0;
          height: 100%;
        }

        .micu-peripheral-cluster {
          transition: opacity 0.4s ease, border-color 0.3s ease;
        }
        .micu-peripheral-cluster.dimmed {
          opacity: 0.42;
        }
        .micu-peripheral-cluster:hover {
          opacity: 1 !important;
        }

        @media (max-width: 1079px) {
          .micu-spatial-grid {
            grid-template-columns: 1fr;
          }
          .micu-peripheral-cluster {
            display: none !important;
          }
        }
      `}</style>

      {/* ── Strict 100% Viewport Fit Stage ───────────────────────────────── */}
      <div
        style={{
          height: "100%",
          width: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "#0B0B0C",
          padding: "12px 20px 16px",
          gap: 8,
          userSelect: "none",
        }}
      >
        {/* Atmospheric Spatial Background: Radial-Masked Dot-Grid */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 80%)",
          }}
        />

        {/* ── ROW 1: Top Concept Strip with Edge Masks + History (N) ────────── */}
        <div
          style={{
            flexShrink: 0,
            width: "100%",
            maxWidth: 1040,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            zIndex: 10,
          }}
        >
          {/* Scrollable Concept Pills with Fade Mask */}
          <nav
            aria-label="Concepts"
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              background: "rgba(18, 19, 23, 0.78)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 999,
              overflowX: "auto",
              scrollbarWidth: "none",
              maskImage:
                "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
            }}
          >
            {nodes.map((node, i) => {
              const mastery = Math.round(values[i] ?? node.retention);
              const isCurrent = i === activeIndex;
              const dotColor = masteryColor(mastery);

              return (
                <button
                  key={node.id}
                  onClick={() => recall.focusNode(i)}
                  aria-pressed={isCurrent}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 11px",
                    borderRadius: 999,
                    background: isCurrent
                      ? "rgba(255, 255, 255, 0.12)"
                      : "transparent",
                    border: isCurrent
                      ? "1px solid rgba(198, 244, 50, 0.45)"
                      : "1px solid transparent",
                    color: isCurrent ? "#fff" : "rgba(255, 255, 255, 0.52)",
                    fontSize: 12,
                    fontWeight: isCurrent ? 600 : 500,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: dotColor,
                      boxShadow: isCurrent ? `0 0 8px ${dotColor}` : "none",
                    }}
                  />
                  <span>{node.title}</span>
                </button>
              );
            })}
          </nav>

          {/* History (N) Glass Pill Button */}
          <button
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Toggle history transcript"
            aria-expanded={showHistory}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 999,
              background: showHistory
                ? "rgba(198, 244, 50, 0.18)"
                : "rgba(18, 19, 23, 0.8)",
              border: showHistory
                ? "1px solid rgba(198, 244, 50, 0.45)"
                : "1px solid rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(18px)",
              color: showHistory ? "#C6F432" : "rgba(255, 255, 255, 0.8)",
              fontSize: 12,
              fontWeight: 550,
              cursor: "pointer",
              transition: "all 0.18s ease",
              flexShrink: 0,
            }}
          >
            <History
              size={13}
              style={{
                color: showHistory ? "#C6F432" : "rgba(255,255,255,0.7)",
              }}
            />
            <span>History ({historyLog.length})</span>
          </button>
        </div>

        {/* ── ROW 2: 3-Zone Spatial Stage (Peripheral Satellites + Center) ─── */}
        <div className="micu-spatial-grid" style={{ zIndex: 5 }}>
          {/* ── Left Peripheral Cluster (Floating Translucent Glass) ───────── */}
          <aside
            className={`micu-peripheral-cluster ${isDimmed ? "dimmed" : ""}`}
            style={{
              background: "rgba(255, 255, 255, 0.025)",
              border: "1px solid rgba(255, 255, 255, 0.07)",
              borderRadius: 20,
              padding: "16px",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              height: "calc(100% - 10px)",
              maxHeight: 440,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              overflow: "hidden",
            }}
          >
            {/* Active Concept Mastery Meter */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: 650,
                  color: "rgba(255, 255, 255, 0.6)",
                  letterSpacing: "0.8px",
                }}
              >
                <span>CONCEPT {activeIndex + 1} OF {nodes.length}</span>
              </div>

              {/* Circular SVG Mastery Ring */}
              <div style={{ position: "relative", width: 74, height: 74 }}>
                <svg width="74" height="74" viewBox="0 0 74 74">
                  <circle
                    cx="37"
                    cy="37"
                    r="30"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="5"
                    fill="none"
                  />
                  <circle
                    cx="37"
                    cy="37"
                    r="30"
                    stroke={currentMasteryColor}
                    strokeWidth="5"
                    fill="none"
                    strokeDasharray={188.5}
                    strokeDashoffset={188.5 * (1 - currentMastery / 100)}
                    strokeLinecap="round"
                    transform="rotate(-90 37 37)"
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  />
                  <text
                    x="37"
                    y="42"
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="13.5"
                    fontWeight="700"
                    fontFamily="ui-monospace, monospace"
                  >
                    {currentMastery}%
                  </text>
                </svg>
              </div>

              <span
                style={{
                  fontSize: 11,
                  fontFamily: "ui-monospace, monospace",
                  color: currentMasteryColor,
                  fontWeight: 600,
                  letterSpacing: "0.5px",
                }}
              >
                {currentMastery >= 70
                  ? "STRONG RETENTION"
                  : currentMastery >= 40
                    ? "NEEDS PRACTICE"
                    : "WEAK RETENTION"}
              </span>
            </div>

            {/* Up Next in Deck */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: 700,
                  color: "rgba(255, 255, 255, 0.45)",
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  paddingLeft: 2,
                }}
              >
                Up Next in Deck
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {upNextNodes.map(({ node, idx }) => (
                  <button
                    key={node.id}
                    onClick={() => recall.focusNode(idx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 9px",
                      borderRadius: 8,
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      color: "rgba(255, 255, 255, 0.7)",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: masteryColor(values[idx] ?? node.retention),
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {node.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* ── Center Column: Canopy + Hovering Micu + Teleprompter ──────── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              height: "100%",
              minHeight: 0,
              gap: 6,
            }}
          >
            {/* Upper Spatial Canopy (Title + Keywords + Acoustic Wave Ribbon) */}
            <div
              style={{
                flexShrink: 0,
                textAlign: "center",
                width: "100%",
                maxWidth: 480,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* Concept Index Pill */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(198, 244, 50, 0.08)",
                  border: "1px solid rgba(198, 244, 50, 0.25)",
                  fontSize: 9.5,
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: 700,
                  color: "#C6F432",
                  letterSpacing: "1px",
                  marginBottom: 3,
                }}
              >
                <span>CONCEPT {activeIndex + 1} OF {nodes.length} · ACTIVE DECK</span>
              </div>

              {/* Crisp Editorial Concept Title */}
              <h2
                style={{
                  margin: "0 0 5px",
                  fontSize: "clamp(18px, 2.2vw, 25px)",
                  fontWeight: 600,
                  lineHeight: 1.15,
                  color: "#fff",
                  letterSpacing: "-0.5px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {activeNode?.title}
              </h2>

              {/* 3 Subtle Floating Keyword Chips */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  justifyContent: "center",
                  flexWrap: "nowrap",
                  marginBottom: 3,
                }}
              >
                {keywordChips.map((chip, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      fontSize: 10,
                      color: "rgba(255, 255, 255, 0.6)",
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    #{chip}
                  </span>
                ))}
              </div>

              {/* SVG Orbital Telemetry Arc + 3-Layer Acoustic Wave Ribbon */}
              <div
                style={{
                  height: 32,
                  width: "min(360px, 100%)",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="100%"
                  height="32"
                  viewBox="0 0 360 32"
                  fill="none"
                  style={{ overflow: "visible" }}
                >
                  {/* Subtle Orbital Background Arc */}
                  <path
                    d="M 10 24 Q 180 6 350 24"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="1"
                    fill="none"
                  />
                  {/* Layer 1: Ambient baseline ribbon */}
                  <path
                    d={`M 20 20 Q 90 ${
                      16 - audioVolume * 14
                    } 180 16 T 340 20`}
                    stroke={stateInfo.color}
                    strokeWidth="1.5"
                    strokeOpacity={0.7}
                    fill="none"
                    strokeDasharray="4 4"
                    style={{
                      animation: "waveRibbonA 3s linear infinite",
                      transition: "stroke 0.3s ease",
                    }}
                  />
                  {/* Layer 2: Main dynamic frequency wave */}
                  <path
                    d={`M 15 22 Q 100 ${
                      22 + audioVolume * 18
                    } 180 18 T 345 22`}
                    stroke={stateInfo.color}
                    strokeWidth="2"
                    strokeOpacity={0.9}
                    fill="none"
                    style={{
                      filter: `drop-shadow(0 0 6px ${stateInfo.glow})`,
                      transition: "stroke 0.3s ease",
                    }}
                  />
                  {/* Layer 3: Secondary acoustic phase ribbon */}
                  <path
                    d={`M 30 18 Q 110 ${
                      18 - audioVolume * 10
                    } 190 20 T 330 18`}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth="1"
                    fill="none"
                    strokeDasharray="3 3"
                    style={{ animation: "waveRibbonB 4s linear infinite" }}
                  />
                </svg>
              </div>
            </div>

            {/* Hovering Micu Centerpiece */}
            <div
              style={{
                flex: "1 1 auto",
                minHeight: 105,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {/* Reactive Aura Behind Micu */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: `translate(-50%, -50%) scale(${
                    1 + audioVolume * (tutorState === "speaking" ? 0.36 : 0.15)
                  })`,
                  pointerEvents: "none",
                  transition:
                    tutorState === "speaking"
                      ? "transform 0.08s ease-out"
                      : "transform 0.35s ease-out",
                }}
              >
                {tutorState === "thinking" ? (
                  <div
                    style={{
                      width: 180,
                      height: 180,
                      borderRadius: "50%",
                      background:
                        "conic-gradient(from 0deg, transparent 0%, #A855F7 50%, transparent 100%)",
                      filter: "blur(20px)",
                      animation: "rotateGlow 2.4s linear infinite",
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                    }}
                  />
                ) : tutorState === "listening" ? (
                  <div
                    style={{
                      width: 170,
                      height: 170,
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle, rgba(56,189,248,0.25) 0%, transparent 70%)",
                      border: "1.5px solid rgba(56, 189, 248, 0.45)",
                      boxShadow: "0 0 25px rgba(56, 189, 248, 0.35)",
                      animation: "pulseRing 1.8s ease-in-out infinite",
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                    }}
                  />
                ) : tutorState === "speaking" ? (
                  <>
                    <div
                      style={{
                        width: 180,
                        height: 180,
                        borderRadius: "50%",
                        background: `radial-gradient(circle, rgba(198,244,50,${
                          0.18 + audioVolume * 0.35
                        }) 0%, transparent 70%)`,
                        filter: "blur(14px)",
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: 200 + audioVolume * 40,
                        height: 200 + audioVolume * 40,
                        transform: "translate(-50%, -50%)",
                        borderRadius: "50%",
                        border: `1.5px solid rgba(198, 244, 50, ${
                          0.25 + audioVolume * 0.5
                        })`,
                        boxShadow: "0 0 20px rgba(198, 244, 50, 0.25)",
                        transition: "all 0.08s ease-out",
                      }}
                    />
                  </>
                ) : (
                  <div
                    style={{
                      width: 150,
                      height: 150,
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle, rgba(198, 244, 50, 0.05) 0%, transparent 70%)",
                      filter: "blur(16px)",
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                )}
              </div>

              {/* Responsively Clamped Lottie Centerpiece */}
              <div
                style={{
                  position: "relative",
                  zIndex: 10,
                  width: modeType === "test" ? 110 : "clamp(115px, 20vh, 185px)",
                  height: modeType === "test" ? 110 : "clamp(115px, 20vh, 185px)",
                  animation: "micuFloat 4s ease-in-out infinite alternate",
                  transition: "width 0.3s ease, height 0.3s ease",
                }}
              >
                <DotLottieReact
                  src="/micu.lottie"
                  loop
                  autoplay
                  style={{ width: "100%", height: "100%" }}
                />
              </div>

              {/* Compact Status Pill */}
              <div
                style={{
                  marginTop: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 9px",
                  borderRadius: 999,
                  background: "rgba(14, 15, 18, 0.8)",
                  backdropFilter: "blur(16px)",
                  border: `1px solid ${stateInfo.glow}`,
                  color: stateInfo.color,
                  fontSize: 9.5,
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "1px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  boxShadow: `0 0 10px ${stateInfo.glow}`,
                  zIndex: 10,
                }}
              >
                {tutorState === "speaking" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 2, height: 9 }}>
                    <span style={{ width: 2, background: "#C6F432", borderRadius: 1, animation: "soundwaveBar 0.5s infinite ease-in-out" }} />
                    <span style={{ width: 2, background: "#C6F432", borderRadius: 1, animation: "soundwaveBar 0.5s infinite ease-in-out 0.15s" }} />
                    <span style={{ width: 2, background: "#C6F432", borderRadius: 1, animation: "soundwaveBar 0.5s infinite ease-in-out 0.3s" }} />
                  </div>
                )}
                <span>● {stateInfo.label}</span>
              </div>
            </div>

            {/* Floating Teleprompter / Inline Quiz Surface */}
            <div
              role="region"
              aria-live="polite"
              style={{
                flexShrink: 0,
                maxWidth: 680,
                width: "100%",
                margin: "0 auto",
                maxHeight: modeType === "test" ? 210 : 145,
                overflowY: "auto",
                scrollbarWidth: "thin",
                background: "rgba(14, 15, 18, 0.72)",
                backdropFilter: "blur(22px)",
                WebkitBackdropFilter: "blur(22px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 18,
                padding: "12px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 7,
                boxShadow:
                  "0 18px 48px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
                zIndex: 10,
                transition: "all 0.25s ease",
              }}
            >
              {/* Header Row in Teleprompter */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: 4,
                  borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: stateInfo.color,
                      boxShadow: `0 0 6px ${stateInfo.color}`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "ui-monospace, monospace",
                      color: "rgba(255, 255, 255, 0.5)",
                      letterSpacing: "0.8px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    {activeNode?.title}
                  </span>
                </div>

                {modeType === "test" && (
                  <button
                    onClick={() => {
                      setModeType("standard");
                      setTestSelected(null);
                      setTutorState("idle");
                      const initial = `${activeNode.title}. ${activeNode.summary}`;
                      setActiveText(initial);
                      setRevealedWordIndex(initial.split(" ").length);
                    }}
                    aria-label="Exit quiz mode"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "rgba(255, 255, 255, 0.6)",
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    <X size={11} />
                    <span>Exit Quiz</span>
                  </button>
                )}
              </div>

              {/* Body: Quiz Mode (2x2 Grid) or Teleprompter Captions */}
              {modeType === "test" && quiz ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.4,
                      color: "rgba(255,255,255,0.92)",
                      fontWeight: 500,
                    }}
                  >
                    {quiz.question}
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 6,
                    }}
                  >
                    {quiz.options.map((opt, idx) => {
                      const isChosen = testSelected === idx;
                      const isCorrect =
                        testSelected !== null && idx === quiz.correctIndex;
                      const isWrong = isChosen && idx !== quiz.correctIndex;

                      return (
                        <button
                          key={idx}
                          disabled={testSelected !== null}
                          onClick={() => handleAnswerTest(idx)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "7px 10px",
                            borderRadius: 9,
                            background: isCorrect
                              ? "rgba(16, 185, 129, 0.2)"
                              : isWrong
                                ? "rgba(244, 66, 50, 0.2)"
                                : "rgba(255, 255, 255, 0.05)",
                            border: `1px solid ${
                              isCorrect
                                ? "#10B981"
                                : isWrong
                                  ? "#F44232"
                                  : "rgba(255, 255, 255, 0.1)"
                            }`,
                            color: isCorrect
                              ? "#10B981"
                              : isWrong
                                ? "#F44232"
                                : "#fff",
                            fontSize: 11,
                            textAlign: "left",
                            cursor:
                              testSelected === null ? "pointer" : "default",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span
                            style={{
                              width: 17,
                              height: 17,
                              display: "grid",
                              placeItems: "center",
                              borderRadius: 4,
                              background: "rgba(0,0,0,0.35)",
                              fontSize: 9,
                              fontFamily: "ui-monospace, monospace",
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span style={{ flex: 1, lineHeight: 1.3 }}>{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {testSelected !== null && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        paddingTop: 2,
                        fontSize: 11,
                        color:
                          testSelected === quiz.correctIndex
                            ? "#10B981"
                            : "#F44232",
                      }}
                    >
                      <span>
                        {testSelected === quiz.correctIndex
                          ? "✓ Correct answer!"
                          : `✕ Explanation: ${quiz.explanation}`}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* High-Contrast Teleprompter Captions */
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    fontWeight: 450,
                    letterSpacing: "-0.15px",
                  }}
                >
                  {tutorState === "thinking" ? (
                    <span
                      style={{
                        color: "#A855F7",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12.5,
                      }}
                    >
                      <Loader2 size={13} className="animate-spin" />
                      <span>{activeText}</span>
                    </span>
                  ) : (
                    words.map((word, wIdx) => {
                      const isSpoken = wIdx < revealedWordIndex;
                      const isActive =
                        tutorState === "speaking" && wIdx === revealedWordIndex;

                      return (
                        <span
                          key={wIdx}
                          style={{
                            color: isActive
                              ? "#C6F432"
                              : isSpoken
                                ? "#F4F4F5"
                                : "rgba(244, 244, 245, 0.55)",
                            fontWeight: isActive ? 600 : 450,
                            textShadow: isActive
                              ? "0 0 12px rgba(198,244,50,0.7)"
                              : "none",
                            transition: "color 0.12s ease",
                            display: "inline-block",
                            marginRight: 4,
                          }}
                        >
                          {word}
                        </span>
                      );
                    })
                  )}
                </p>
              )}

              {statusMessage && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 10,
                    color: "#F4A232",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {statusMessage}
                </p>
              )}
            </div>
          </div>

          {/* ── Right Peripheral Cluster (Live Spectrum + Speed + AR Jump) ── */}
          <aside
            className={`micu-peripheral-cluster ${isDimmed ? "dimmed" : ""}`}
            style={{
              background: "rgba(255, 255, 255, 0.025)",
              border: "1px solid rgba(255, 255, 255, 0.07)",
              borderRadius: 20,
              padding: "16px",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              height: "calc(100% - 10px)",
              maxHeight: 440,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              overflow: "hidden",
            }}
          >
            {/* Live 12-Bar Audio Spectrum */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10.5,
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: 700,
                  color: "rgba(255, 255, 255, 0.5)",
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                }}
              >
                <Radio size={12} style={{ color: stateInfo.color }} />
                <span>Audio Spectrum</span>
              </div>

              {/* 12-Bar Visualizer Container */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 4,
                  height: 38,
                  padding: "6px 10px",
                  borderRadius: 10,
                  background: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                {spectrumBars.map((val, idx) => (
                  <span
                    key={idx}
                    style={{
                      flex: 1,
                      height: `${Math.max(10, Math.min(100, val * 100))}%`,
                      background:
                        tutorState === "speaking"
                          ? "#C6F432"
                          : tutorState === "listening"
                            ? "#38BDF8"
                            : tutorState === "thinking"
                              ? "#A855F7"
                              : "rgba(255, 255, 255, 0.25)",
                      borderRadius: 2,
                      transition: "height 0.08s ease-out, background 0.2s ease",
                      boxShadow:
                        tutorState === "speaking"
                          ? "0 0 6px rgba(198, 244, 50, 0.5)"
                          : "none",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Voice Speed Toggle (0.9x, 1.0x, 1.2x) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10.5,
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: 700,
                  color: "rgba(255, 255, 255, 0.5)",
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                }}
              >
                <Sliders size={12} />
                <span>Voice Speed</span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 6,
                  background: "rgba(0, 0, 0, 0.3)",
                  padding: 3,
                  borderRadius: 10,
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                {[0.9, 1.0, 1.2].map((spd) => {
                  const isCurrent = speechSpeed === spd;
                  return (
                    <button
                      key={spd}
                      onClick={() => {
                        setSpeechSpeed(spd);
                        if (audioSourceRef.current) {
                          audioSourceRef.current.playbackRate.value = spd;
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        borderRadius: 7,
                        background: isCurrent
                          ? "rgba(198, 244, 50, 0.2)"
                          : "transparent",
                        border: isCurrent
                          ? "1px solid rgba(198, 244, 50, 0.45)"
                          : "1px solid transparent",
                        color: isCurrent ? "#C6F432" : "rgba(255, 255, 255, 0.6)",
                        fontSize: 11,
                        fontFamily: "ui-monospace, monospace",
                        fontWeight: 650,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {spd.toFixed(1)}×
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Action: Jump to AR Practice */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                onClick={onJumpToAR}
                aria-label="Jump to AR Practice in Gesture Synth"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  padding: "9px 12px",
                  borderRadius: 12,
                  background: "rgba(198, 244, 50, 0.12)",
                  border: "1px solid rgba(198, 244, 50, 0.35)",
                  color: "#C6F432",
                  fontSize: 11.5,
                  fontWeight: 650,
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  boxShadow: "0 4px 16px rgba(198, 244, 50, 0.1)",
                }}
              >
                <Compass size={13} />
                <span>Jump to AR Practice →</span>
              </button>
            </div>
          </aside>
        </div>

        {/* ── ROW 3: Single-Row Floating Glass Command Island ──────────────── */}
        <div
          style={{
            flexShrink: 0,
            margin: "0 auto",
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 999,
              background: "rgba(14, 15, 18, 0.84)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.65)",
            }}
          >
            {/* Primary Action: Explain / Stop */}
            <button
              onClick={() => {
                if (tutorState === "speaking" || tutorState === "thinking") {
                  stopSpeech();
                  setTutorState("idle");
                } else {
                  setModeType("standard");
                  setTestSelected(null);
                  speakText(`${activeNode.title}. ${activeNode.summary}`);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 15px",
                borderRadius: 999,
                background:
                  tutorState === "speaking"
                    ? "rgba(244, 66, 50, 0.18)"
                    : "#C6F432",
                border:
                  tutorState === "speaking"
                    ? "1px solid rgba(244, 66, 50, 0.5)"
                    : "1px solid transparent",
                color: tutorState === "speaking" ? "#F44232" : "#0B0B0C",
                fontSize: 12.5,
                fontWeight: 650,
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              {tutorState === "thinking" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : tutorState === "speaking" ? (
                <VolumeX size={14} />
              ) : (
                <Volume2 size={14} />
              )}
              <span>{tutorState === "speaking" ? "Stop" : "Explain"}</span>
            </button>

            {/* Push-to-Talk Mic: 🎙️ Ask */}
            <button
              onClick={toggleListening}
              aria-label={
                tutorState === "listening" ? "Stop listening" : "Ask Micu"
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 13px",
                borderRadius: 999,
                background:
                  tutorState === "listening"
                    ? "rgba(56, 189, 248, 0.2)"
                    : "rgba(255, 255, 255, 0.08)",
                border:
                  tutorState === "listening"
                    ? "1px solid rgba(56, 189, 248, 0.55)"
                    : "1px solid rgba(255, 255, 255, 0.1)",
                color: tutorState === "listening" ? "#38BDF8" : "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              {tutorState === "listening" ? (
                <MicOff size={13} style={{ color: "#38BDF8" }} />
              ) : (
                <Mic size={13} style={{ color: "#C6F432" }} />
              )}
              <span>{tutorState === "listening" ? "Listening…" : "Ask"}</span>
            </button>

            {/* Keyboard Question Toggle: ⌨️ */}
            <button
              onClick={() => setShowKeyInput((v) => !v)}
              aria-label="Type question"
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: showKeyInput
                  ? "rgba(198, 244, 50, 0.2)"
                  : "rgba(255, 255, 255, 0.08)",
                border: showKeyInput
                  ? "1px solid rgba(198, 244, 50, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.1)",
                color: showKeyInput ? "#C6F432" : "rgba(255, 255, 255, 0.65)",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <Keyboard size={13} />
            </button>

            {/* Subtle Vertical Divider */}
            <div
              aria-hidden="true"
              style={{
                width: 1,
                height: 18,
                background: "rgba(255, 255, 255, 0.14)",
              }}
            />

            {/* Quick Chips: Simply, Analogy, Test me */}
            <button
              onClick={handleExplainSimply}
              aria-label="Explain simply"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 11px",
                borderRadius: 999,
                background:
                  modeType === "simple"
                    ? "rgba(198, 244, 50, 0.15)"
                    : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${
                  modeType === "simple"
                    ? "rgba(198, 244, 50, 0.45)"
                    : "rgba(255, 255, 255, 0.08)"
                }`,
                color: modeType === "simple" ? "#C6F432" : "rgba(255,255,255,0.75)",
                fontSize: 11.5,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Sparkles size={12} style={{ color: "#C6F432" }} />
              <span>Simply</span>
            </button>

            <button
              onClick={handleAnalogy}
              aria-label="Real-world analogy"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 11px",
                borderRadius: 999,
                background:
                  modeType === "analogy"
                    ? "rgba(56, 189, 248, 0.15)"
                    : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${
                  modeType === "analogy"
                    ? "rgba(56, 189, 248, 0.45)"
                    : "rgba(255, 255, 255, 0.08)"
                }`,
                color: modeType === "analogy" ? "#38BDF8" : "rgba(255,255,255,0.75)",
                fontSize: 11.5,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Lightbulb size={12} style={{ color: "#38BDF8" }} />
              <span>Analogy</span>
            </button>

            <button
              onClick={handleTestMe}
              aria-label="Test me on this concept"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 11px",
                borderRadius: 999,
                background:
                  modeType === "test"
                    ? "rgba(168, 85, 247, 0.15)"
                    : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${
                  modeType === "test"
                    ? "rgba(168, 85, 247, 0.45)"
                    : "rgba(255, 255, 255, 0.08)"
                }`,
                color: modeType === "test" ? "#A855F7" : "rgba(255,255,255,0.75)",
                fontSize: 11.5,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Brain size={12} style={{ color: "#A855F7" }} />
              <span>Test me</span>
            </button>

            {/* Smooth Inline Expandable Text Input */}
            {showKeyInput && (
              <form
                onSubmit={handleTypedSubmit}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingLeft: 8,
                  marginLeft: 4,
                  borderLeft: "1px solid rgba(255, 255, 255, 0.15)",
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={typedQuestion}
                  onChange={(e) => setTypedQuestion(e.target.value)}
                  placeholder={`Ask Micu anything about ${activeNode?.title}…`}
                  style={{
                    width: 200,
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(198, 244, 50, 0.35)",
                    borderRadius: 999,
                    padding: "4px 10px",
                    color: "#fff",
                    fontSize: 11.5,
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={!typedQuestion.trim()}
                  aria-label="Send query"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: typedQuestion.trim()
                      ? "#C6F432"
                      : "rgba(255, 255, 255, 0.1)",
                    border: "none",
                    color: typedQuestion.trim() ? "#0B0B0C" : "rgba(255,255,255,0.4)",
                    display: "grid",
                    placeItems: "center",
                    cursor: typedQuestion.trim() ? "pointer" : "default",
                  }}
                >
                  <Send size={11} />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── Slide-Over Transcript Drawer ─────────────────────────────────── */}
        {showHistory && (
          <div
            role="dialog"
            aria-label="Session history"
            style={{
              position: "absolute",
              top: 56,
              right: 20,
              bottom: 80,
              width: 310,
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              background: "rgba(14, 15, 18, 0.94)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 18,
              zIndex: 40,
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.75)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MessageSquare size={14} style={{ color: "#C6F432" }} />
                <span style={{ fontSize: 13, fontWeight: 650, color: "#fff" }}>
                  Session History
                </span>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                aria-label="Close history"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.5)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Drawer Items */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                scrollbarWidth: "thin",
              }}
            >
              {historyLog.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "rgba(255, 255, 255, 0.4)",
                    fontSize: 12,
                    textAlign: "center",
                    padding: "0 20px",
                  }}
                >
                  <History size={24} style={{ opacity: 0.35, marginBottom: 8 }} />
                  <p style={{ margin: 0 }}>
                    No conversations yet. Ask Micu questions or click Explain to start logging!
                  </p>
                </div>
              ) : (
                historyLog.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.07)",
                      borderRadius: 12,
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 10,
                        fontFamily: "ui-monospace, monospace",
                        color: "rgba(255, 255, 255, 0.45)",
                      }}
                    >
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "rgba(198, 244, 50, 0.12)",
                          color: "#C6F432",
                          fontWeight: 600,
                        }}
                      >
                        {item.conceptTitle}
                      </span>
                      <span>{item.time}</span>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#fff",
                      }}
                    >
                      "{item.query}"
                    </p>

                    <p
                      style={{
                        margin: 0,
                        fontSize: 11.5,
                        color: "rgba(255, 255, 255, 0.72)",
                        lineHeight: 1.45,
                      }}
                    >
                      {item.reply}
                    </p>

                    <button
                      onClick={() => speakText(item.reply)}
                      style={{
                        alignSelf: "flex-end",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: "#C6F432",
                        fontSize: 10.5,
                        cursor: "pointer",
                      }}
                    >
                      <Volume2 size={11} />
                      <span>Replay</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
