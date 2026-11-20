"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Sparkles,
  Lightbulb,
  Brain,
  Check,
  Loader2,
  Keyboard,
  Send,
  X,
  ChevronLeft,
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
          width: 220,
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
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
}

type TutorState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "test-correct"
  | "test-wrong";

function masteryColor(pct: number) {
  if (pct >= 70) return "#C6F432";
  if (pct >= 40) return "#F4A232";
  return "#F44232";
}

export function MicuTutorSpace({ recall }: MicuTutorSpaceProps) {
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

  // Audio-reactive visual volume (0 to 1)
  const [audioVolume, setAudioVolume] = useState(0);

  // Keyboard text input toggle & query
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [typedQuestion, setTypedQuestion] = useState("");

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

      // Word-by-word streaming teleprompter reveal
      let wIdx = 0;
      streamTimerRef.current = setInterval(() => {
        wIdx++;
        setRevealedWordIndex(wIdx);
        if (wIdx >= totalWords && streamTimerRef.current) {
          clearInterval(streamTimerRef.current);
          streamTimerRef.current = null;
        }
      }, 140);

      const runBrowserFallback = () => {
        setTutorState("speaking");
        if (typeof window === "undefined" || !("speechSynthesis" in window))
          return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 0.96;
        utterance.pitch = 1.04;
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find(
            (v) => v.lang.startsWith("en") && v.name.includes("Google")
          ) ||
          voices.find((v) => v.lang.startsWith("en")) ||
          voices[0];
        if (preferred) utterance.voice = preferred;

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
        analyser.fftSize = 256;

        source.buffer = audioBuffer;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        audioSourceRef.current = source;
        analyserRef.current = analyser;

        source.onended = () => {
          setTutorState("idle");
          setRevealedWordIndex(totalWords);
          audioSourceRef.current = null;
        };

        source.start();
        setTutorState("speaking");
      } catch (err) {
        console.warn("Speech API error, using browser fallback:", err);
        runBrowserFallback();
      }
    },
    [stopSpeech, stopListening]
  );

  // Call `/api/micu-chat` Groq endpoint then speak reply
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
          ? `Answering your question about ${activeNode.title}…`
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
          data.reply ||
          `${activeNode.title}. ${activeNode.summary}`;
        await speakText(reply);
      } catch (err) {
        console.error("Micu Chat error:", err);
        // Fallback to local node summary
        const fallback = `${activeNode.title}. ${activeNode.summary}`;
        await speakText(fallback);
      }
    },
    [activeNode, speakText, stopSpeech, stopListening]
  );

  // Real-Time Audio-reactive volume loop (RMS calculation)
  useEffect(() => {
    let animId: number;

    const tick = () => {
      if (tutorState === "speaking") {
        if (analyserRef.current) {
          const data = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setAudioVolume((prev) => prev * 0.7 + Math.min(1, rms * 3.6) * 0.3);
        } else {
          const t = performance.now() * 0.009;
          const fakeRms = Math.sin(t) * 0.25 + 0.35;
          setAudioVolume(fakeRms);
        }
      } else if (tutorState === "thinking" || tutorState === "listening") {
        const t = performance.now() * 0.005;
        setAudioVolume(0.18 + Math.sin(t) * 0.12);
      } else {
        setAudioVolume((prev) => Math.max(0, prev * 0.85));
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [tutorState]);

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
    const quiz = activeNode?.quiz;
    if (quiz) {
      setActiveText(quiz.question);
      speakText(`Quick check: ${quiz.question}`);
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
    }, 4000);
  };

  // State-Reactive Aura Color
  const getAuraColor = () => {
    switch (tutorState) {
      case "listening":
        return "#38BDF8"; // Cyan
      case "thinking":
        return "#A855F7"; // Violet
      case "speaking":
        return "#C6F432"; // Lime
      case "test-correct":
        return "#10B981"; // Emerald
      case "test-wrong":
        return "#F44232"; // Coral
      default:
        return "#C6F432"; // Ambient Lime
    }
  };

  const auraColor = getAuraColor();
  const words = activeText.split(" ");
  const quiz = activeNode?.quiz;

  return (
    <>
      <style>{`
        @keyframes micuFloat {
          0% { transform: translateY(0px); }
          100% { transform: translateY(-11px); }
        }
        @keyframes soundwaveBar {
          0%, 100% { height: 4px; }
          50% { height: 13px; }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.65; transform: scale(1.06); }
        }
      `}</style>

      {/* ── Strict Full-Screen Vertical Flex Container ───────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          padding: "16px 24px 20px",
          gap: 14,
          overflow: "hidden",
          background: "#0B0B0C",
          position: "relative",
          userSelect: "none",
        }}
      >
        {/* Ambient background glows */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 70% 50% at 50% 35%, rgba(198, 244, 50, 0.04) 0%, rgba(60, 80, 160, 0.05) 60%, transparent 100%)",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage:
              "radial-gradient(rgba(185, 195, 218, 0.08) 0.6px, transparent 0.8px)",
            backgroundSize: "32px 32px",
            maskImage:
              "linear-gradient(transparent, rgba(0,0,0,0.25) 20%, rgba(0,0,0,0.5) 70%, transparent 95%)",
          }}
        />

        {/* ── ROW 1: Top Concept Bar (Scrollable Pill Strip with Fade Mask) ── */}
        <nav
          aria-label="Concepts"
          style={{
            flexShrink: 0,
            width: "100%",
            maxWidth: 820,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            background: "rgba(18, 19, 23, 0.78)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 999,
            overflowX: "auto",
            scrollbarWidth: "none",
            maskImage:
              "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            zIndex: 10,
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
                  gap: 7,
                  padding: "6px 13px",
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
                  transition: "all 0.2s ease",
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

        {/* ── ROW 2: Hovering Micu Stage + State-Reactive Aura Rings ───────── */}
        <div
          style={{
            flex: 1,
            minHeight: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 5,
          }}
        >
          {/* Audio & State Reactive Aura Rings */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) scale(${
                1 + audioVolume * (tutorState === "speaking" ? 0.42 : 0.2)
              })`,
              pointerEvents: "none",
              transition:
                tutorState === "speaking"
                  ? "transform 0.08s ease-out"
                  : "transform 0.4s ease-out",
            }}
          >
            {/* Core Glow */}
            <div
              style={{
                width: 240,
                height: 240,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${auraColor}${Math.round(
                  (0.12 + audioVolume * 0.45) * 255
                ).toString(16).padStart(2, "0")} 0%, ${auraColor}00 70%)`,
                filter: "blur(14px)",
                transition: "background 0.35s ease",
              }}
            />

            {/* Concentric soundwave ring 1 */}
            <div
              style={{
                position: "absolute",
                inset: -22 - audioVolume * 30,
                borderRadius: "50%",
                border: `1.5px solid ${auraColor}${Math.round(
                  (0.18 + audioVolume * 0.5) * 255
                ).toString(16).padStart(2, "0")}`,
                boxShadow: `0 0 20px ${auraColor}33`,
                transition: "all 0.1s ease-out",
              }}
            />

            {/* Concentric soundwave ring 2 */}
            <div
              style={{
                position: "absolute",
                inset: -48 - audioVolume * 55,
                borderRadius: "50%",
                border: `1px solid ${auraColor}${Math.round(
                  (0.09 + audioVolume * 0.35) * 255
                ).toString(16).padStart(2, "0")}`,
                transition: "all 0.1s ease-out",
              }}
            />

            {/* Concentric soundwave ring 3 */}
            <div
              style={{
                position: "absolute",
                inset: -76 - audioVolume * 75,
                borderRadius: "50%",
                border: `0.75px solid ${auraColor}${Math.round(
                  (0.04 + audioVolume * 0.2) * 255
                ).toString(16).padStart(2, "0")}`,
                transition: "all 0.1s ease-out",
              }}
            />
          </div>

          {/* Freely floating Micu lottie */}
          <div
            style={{
              position: "relative",
              zIndex: 10,
              width: 220,
              height: 220,
              animationName: "micuFloat",
              animationDuration: "4.2s",
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDirection: "alternate",
            }}
          >
            <DotLottieReact
              src="/micu.lottie"
              loop
              autoplay
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </div>

        {/* ── ROW 3: Teleprompter / Interactive Quiz Card ──────────────────── */}
        <div
          role="region"
          aria-live="polite"
          style={{
            flexShrink: 0,
            maxWidth: 680,
            width: "100%",
            margin: "0 auto",
            maxHeight: 220,
            overflowY: "auto",
            scrollbarWidth: "thin",
            background: "rgba(11, 11, 14, 0.78)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: `1px solid ${auraColor}40`,
            borderRadius: 20,
            boxShadow:
              "0 20px 60px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
            padding: "16px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            zIndex: 10,
            transition: "border-color 0.35s ease",
          }}
        >
          {/* Header row inside teleprompter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: 8,
              borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Animated status dot or wave */}
              {tutorState === "speaking" ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    height: 14,
                  }}
                >
                  <span
                    style={{
                      width: 3,
                      background: "#C6F432",
                      borderRadius: 1,
                      animation: "soundwaveBar 0.6s infinite ease-in-out",
                    }}
                  />
                  <span
                    style={{
                      width: 3,
                      background: "#C6F432",
                      borderRadius: 1,
                      animation: "soundwaveBar 0.6s infinite ease-in-out 0.2s",
                    }}
                  />
                  <span
                    style={{
                      width: 3,
                      background: "#C6F432",
                      borderRadius: 1,
                      animation: "soundwaveBar 0.6s infinite ease-in-out 0.4s",
                    }}
                  />
                </div>
              ) : (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: auraColor,
                    boxShadow: `0 0 10px ${auraColor}`,
                  }}
                />
              )}

              <span
                style={{
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "1.2px",
                  color: auraColor,
                  fontWeight: 650,
                  textTransform: "uppercase",
                }}
              >
                {tutorState === "listening"
                  ? "LISTENING TO YOU…"
                  : tutorState === "thinking"
                    ? "MICU IS THINKING…"
                    : tutorState === "speaking"
                      ? "MICU SPEAKING"
                      : tutorState === "test-correct"
                        ? "CORRECT! EXCELLENT!"
                        : tutorState === "test-wrong"
                          ? "NEEDS REVIEW"
                          : modeType === "test"
                            ? "KNOWLEDGE CHECK"
                            : "VOICE TUTOR"}
              </span>
            </div>

            <span
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                color: "rgba(255, 255, 255, 0.4)",
              }}
            >
              {activeNode?.title}
            </span>
          </div>

          {/* Test Mode Interactive 4-Option Grid */}
          {modeType === "test" && quiz ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: 14,
                  lineHeight: 1.5,
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
                  gap: 8,
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
                        gap: 8,
                        padding: "9px 12px",
                        borderRadius: 10,
                        background: isCorrect
                          ? "rgba(16, 185, 129, 0.18)"
                          : isWrong
                            ? "rgba(244, 66, 50, 0.18)"
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
                        fontSize: 12,
                        textAlign: "left",
                        cursor: testSelected === null ? "pointer" : "default",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          display: "grid",
                          placeItems: "center",
                          borderRadius: 4,
                          background: "rgba(0,0,0,0.35)",
                          fontSize: 10,
                          fontFamily: "ui-monospace, monospace",
                          fontWeight: 700,
                        }}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span style={{ flex: 1 }}>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {testSelected !== null && (
                <button
                  onClick={() => {
                    setModeType("standard");
                    setTestSelected(null);
                    setTutorState("idle");
                    const initial = `${activeNode.title}. ${activeNode.summary}`;
                    setActiveText(initial);
                    setRevealedWordIndex(initial.split(" ").length);
                  }}
                  style={{
                    alignSelf: "flex-start",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 11,
                    cursor: "pointer",
                    marginTop: 2,
                  }}
                >
                  <ChevronLeft size={13} />
                  <span>Back to Explanation</span>
                </button>
              )}
            </div>
          ) : (
            /* Teleprompter Text with Live Word Reveal */
            <p
              style={{
                margin: 0,
                fontSize: 14.5,
                lineHeight: 1.6,
                color: "rgba(255, 255, 255, 0.88)",
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
                    fontSize: 13,
                  }}
                >
                  <Loader2 size={14} className="animate-spin" />
                  <span>{activeText}</span>
                </span>
              ) : (
                words.map((word, wIdx) => {
                  const isRevealed = wIdx <= revealedWordIndex;
                  const isCurrent =
                    tutorState === "speaking" && wIdx === revealedWordIndex;

                  return (
                    <span
                      key={wIdx}
                      style={{
                        opacity: isRevealed ? 1 : 0.22,
                        color: isCurrent
                          ? "#C6F432"
                          : isRevealed
                            ? "#fff"
                            : "rgba(255,255,255,0.4)",
                        textShadow: isCurrent
                          ? "0 0 10px rgba(198,244,50,0.6)"
                          : "none",
                        transition: "color 0.15s, opacity 0.2s",
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
                fontSize: 11,
                color: "#F4A232",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {statusMessage}
            </p>
          )}
        </div>

        {/* ── ROW 4: Bottom Command Dock ───────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            width: "100%",
            maxWidth: 680,
            margin: "0 auto",
            zIndex: 10,
          }}
        >
          {/* Row of 3 Quick Action Chips */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              onClick={handleExplainSimply}
              aria-label="Explain simply"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 13px",
                borderRadius: 999,
                background:
                  modeType === "simple"
                    ? "rgba(198, 244, 50, 0.15)"
                    : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${
                  modeType === "simple"
                    ? "rgba(198, 244, 50, 0.45)"
                    : "rgba(255, 255, 255, 0.1)"
                }`,
                color: modeType === "simple" ? "#C6F432" : "#e0e2ec",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                backdropFilter: "blur(12px)",
                transition: "all 0.15s ease",
              }}
            >
              <Sparkles size={13} style={{ color: "#C6F432" }} />
              <span>Explain simply</span>
            </button>

            <button
              onClick={handleAnalogy}
              aria-label="Real-world analogy"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 13px",
                borderRadius: 999,
                background:
                  modeType === "analogy"
                    ? "rgba(198, 244, 50, 0.15)"
                    : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${
                  modeType === "analogy"
                    ? "rgba(198, 244, 50, 0.45)"
                    : "rgba(255, 255, 255, 0.1)"
                }`,
                color: modeType === "analogy" ? "#C6F432" : "#e0e2ec",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                backdropFilter: "blur(12px)",
                transition: "all 0.15s ease",
              }}
            >
              <Lightbulb size={13} style={{ color: "#38BDF8" }} />
              <span>Real-world analogy</span>
            </button>

            <button
              onClick={handleTestMe}
              aria-label="Test me on this concept"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 13px",
                borderRadius: 999,
                background:
                  modeType === "test"
                    ? "rgba(198, 244, 50, 0.15)"
                    : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${
                  modeType === "test"
                    ? "rgba(198, 244, 50, 0.45)"
                    : "rgba(255, 255, 255, 0.1)"
                }`,
                color: modeType === "test" ? "#C6F432" : "#e0e2ec",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                backdropFilter: "blur(12px)",
                transition: "all 0.15s ease",
              }}
            >
              <Brain size={13} style={{ color: "#A855F7" }} />
              <span>Test me</span>
            </button>
          </div>

          {/* Primary Controls Row: Explain/Stop, Ask Micu Voice, Keyboard Toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "rgba(18, 19, 23, 0.88)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 999,
              padding: "6px 12px",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.65)",
            }}
          >
            {/* Primary Explain/Stop Button */}
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
                gap: 7,
                padding: "8px 18px",
                borderRadius: 999,
                background:
                  tutorState === "speaking"
                    ? "rgba(244, 66, 50, 0.18)"
                    : "var(--lime, #C6F432)",
                border:
                  tutorState === "speaking"
                    ? "1px solid rgba(244, 66, 50, 0.5)"
                    : "1px solid transparent",
                color: tutorState === "speaking" ? "#F44232" : "#0B0B0C",
                fontSize: 13,
                fontWeight: 650,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {tutorState === "thinking" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : tutorState === "speaking" ? (
                <VolumeX size={15} />
              ) : (
                <Volume2 size={15} />
              )}
              <span>{tutorState === "speaking" ? "Stop" : "Explain"}</span>
            </button>

            {/* Vertical Divider */}
            <div
              aria-hidden="true"
              style={{
                width: 1,
                height: 20,
                background: "rgba(255, 255, 255, 0.12)",
              }}
            />

            {/* Push-to-Talk Voice Mic */}
            <button
              onClick={toggleListening}
              aria-label={
                tutorState === "listening"
                  ? "Stop listening"
                  : "Ask Micu with your voice"
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 999,
                background:
                  tutorState === "listening"
                    ? "rgba(56, 189, 248, 0.2)"
                    : "rgba(255, 255, 255, 0.08)",
                border:
                  tutorState === "listening"
                    ? "1px solid rgba(56, 189, 248, 0.55)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                color: tutorState === "listening" ? "#38BDF8" : "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {tutorState === "listening" ? (
                <MicOff size={14} style={{ color: "#38BDF8" }} />
              ) : (
                <Mic size={14} style={{ color: "#C6F432" }} />
              )}
              <span>
                {tutorState === "listening" ? "Listening…" : "Ask Micu"}
              </span>
            </button>

            {/* Compact Keyboard Question Input Toggle */}
            <button
              onClick={() => setShowKeyInput((v) => !v)}
              aria-label="Type a question"
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
                transition: "all 0.2s ease",
              }}
            >
              <Keyboard size={14} />
            </button>
          </div>

          {/* Collapsible Sleek Frosted Keyboard Query Input */}
          {showKeyInput && (
            <form
              onSubmit={handleTypedSubmit}
              style={{
                width: "100%",
                maxWidth: 480,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(18, 19, 23, 0.95)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(198, 244, 50, 0.35)",
                borderRadius: 999,
                padding: "4px 8px 4px 16px",
                boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
              }}
            >
              <input
                type="text"
                value={typedQuestion}
                onChange={(e) => setTypedQuestion(e.target.value)}
                placeholder={`Ask Micu anything about ${activeNode?.title}…`}
                autoFocus
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#fff",
                  fontSize: 12.5,
                }}
              />
              <button
                type="submit"
                disabled={!typedQuestion.trim()}
                aria-label="Send question"
                style={{
                  width: 28,
                  height: 28,
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
                <Send size={12} />
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
