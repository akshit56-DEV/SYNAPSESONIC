"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import type { Recall } from "./use-recall";
import { ScanLine, X, Timer, Keyboard, ArrowRight, Check, Bot, BookOpen, Volume2, ChevronRight, VolumeX, Loader2 } from "lucide-react";
import { useRive } from "@rive-app/react-canvas";
import { Fit, Layout, Alignment } from "@rive-app/canvas";

export function QuizInspector({
  recall: r,
  blocked,
  mode,
}: {
  recall: Recall;
  blocked: boolean;
  mode: number;
}) {
  const quiz = r.node?.quiz,
    answers = quiz?.options ?? [];
  const [activeTab, setActiveTab] = useState<"learn" | "quiz">(
    mode === 0 ? "learn" : "quiz"
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const riveRef = useRef<any>(null);

  // Mode-aware tab switching: hide Learn tab for non-Learn modes
  useEffect(() => {
    if (mode !== 0) {
      setActiveTab("quiz");
    } else {
      setActiveTab("learn");
    }
  }, [mode]);

  // Cleanup audio on node/tab switch
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      window.speechSynthesis?.cancel();
      setIsPlaying(false);
    };
  }, [r.node?.title, activeTab]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        blocked ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.target instanceof HTMLInputElement
      )
        return;
      if (e.key === "Escape") r.close();
      else if (/^[1-4]$/.test(e.key)) r.answer(+e.key - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [r, blocked]);

  if (!quiz || !answers.length) return null;

  const layout = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });
  const { RiveComponent, rive } = useRive({
    src: "/micu.riv",
    autoplay: false,
    layout,
  });

  // Rive playback logic - runs whenever rive instance is available
  useEffect(() => {
    if (!rive) return;
    
    riveRef.current = rive;
    console.log("[Micu] stateMachineNames:", rive.stateMachineNames);
    console.log("[Micu] animationNames:", rive.animationNames);
    
    // Resize drawing surface to canvas
    try {
      rive.resizeDrawingSurfaceToCanvas();
    } catch (e) {
      console.warn("[Micu] resizeDrawingSurfaceToCanvas failed:", e);
    }

    // Play state machine if available
    if (rive.stateMachineNames?.length > 0) {
      console.log("[Micu] Playing state machine:", rive.stateMachineNames[0]);
      rive.play(rive.stateMachineNames[0]);
    } else if (rive.animationNames?.length > 0) {
      // Find idle/loop animation
      const idleAnim = rive.animationNames.find(
        (name: string) => name.toLowerCase().includes("idle") || name.toLowerCase().includes("loop")
      );
      const animToPlay = idleAnim || rive.animationNames[0];
      console.log("[Micu] Playing animation:", animToPlay);
      rive.play(animToPlay);
      
      // Loop the animation
      const handleEnd = () => {
        if (riveRef.current) {
          riveRef.current.play(animToPlay);
        }
      };
      rive.on("end" as any, handleEnd);
      return () => {
        rive.off("end" as any, handleEnd);
      };
    }
  }, [rive]);

  // Explain with AI Voice - wired to /api/speak
  const handleExplain = useCallback(async () => {
    if (!r.node) return;
    const text = `${r.node.title}. ${r.node.summary}`;

    let fallbackStarted = false;
    // Browser-TTS fallback: runs whenever /api/speak fails or HTMLAudioElement
    // playback rejects, so the button always speaks cleanly.
    const speakFallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      try {
        if (!("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice =
          voices.find((v) => v.lang.startsWith("en") && v.name.includes("Google")) ||
          voices.find((v) => v.lang.startsWith("en")) ||
          voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.onstart = () => setIsPlaying(true);
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("[Voice] Browser TTS fallback failed:", err);
      }
    };

    try {
      if (isPlaying) {
        // Stop current playback
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
          URL.revokeObjectURL(audioRef.current.src);
          audioRef.current = null;
        }
        setIsPlaying(false);
        return;
      }

      setIsLoading(true);

      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        console.warn(
          "[Voice] /api/speak failed:",
          response.status,
          response.statusText
        );
        speakFallback();
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      audioRef.current = new Audio(url);
      audioRef.current.onended = () => {
        setIsPlaying(false);
        if (audioRef.current) {
          URL.revokeObjectURL(audioRef.current.src);
          audioRef.current = null;
        }
      };
      audioRef.current.onerror = () => {
        console.warn("[Voice] Audio playback error; falling back to browser TTS.");
        setIsPlaying(false);
        speakFallback();
      };

      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch {
        console.warn("[Voice] audio.play() rejected; falling back to browser TTS.");
        speakFallback();
      }
    } catch (err) {
      console.warn("[Voice] ElevenLabs failed, falling back to browser TTS:", err);
      speakFallback();
    } finally {
      setIsLoading(false);
    }
  }, [r.node, isPlaying]);

  // Conditionally render tab switcher - only show in Learn with Micu mode
  const showTabSwitcher = mode === 0;

  // Mode-specific content rendering
  const isLearnMode = mode === 0;
  const isStudyMode = mode === 1;
  const isGestureMode = mode === 2;

  return (
    <aside className="inspector glass" aria-label="Inspector Panel">
      <div className="ins-head">
        <div className="flex justify-between items-center">
          <span className="eyebrow flex items-center gap-2">
            <ScanLine size={14} /> INSPECTOR
          </span>
          <button
            className="close"
            aria-label="Close inspector"
            onClick={r.close}
          >
            <X size={15} />
          </button>
        </div>
        <h2>{r.node?.title ?? "Node"}</h2>
      </div>

      {/* Tab Switcher - only visible in Learn with Micu mode */}
      {showTabSwitcher && (
        <div className="tab-switcher" role="tablist" aria-label="Inspector mode">
          <button
            role="tab"
            aria-selected={activeTab === "learn"}
            aria-controls="learn-panel"
            id="learn-tab"
            className={`tab-btn ${activeTab === "learn" ? "active" : ""}`}
            onClick={() => setActiveTab("learn")}
          >
            <Bot size={14} />
            <span>Learn & Voice</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "quiz"}
            aria-controls="quiz-panel"
            id="quiz-tab"
            className={`tab-btn ${activeTab === "quiz" ? "active" : ""}`}
            onClick={() => setActiveTab("quiz")}
          >
            <BookOpen size={14} />
            <span>30s Quiz</span>
          </button>
        </div>
      )}

      {/* Learn & Voice Tab - Only in Mode 0 */}
      {(isLearnMode && activeTab === "learn") && (
        <div
          role="tabpanel"
          id="learn-panel"
          aria-labelledby="learn-tab"
          className="tab-panel"
        >
          <div className="micu-stage" aria-label="Micu Rive animation">
            <RiveComponent
              className="rive-canvas"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <div className="learn-content">
            <p className="node-summary">{r.node?.summary}</p>
            <div className="voice-controls">
              <button 
                className="voice-btn glass" 
                aria-label={isPlaying ? "Stop explanation" : "Explain with AI Voice"}
                onClick={handleExplain}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 size={16} className="spin" />
                ) : isPlaying ? (
                  <VolumeX size={16} />
                ) : (
                  <Volume2 size={16} />
                )}
                <span>{isPlaying ? "Stop" : "Explain with AI Voice"}</span>
              </button>
              <div className="waveform-placeholder" aria-hidden="true">
                <canvas width={200} height={40} />
              </div>
            </div>
            <button className="start-quiz-btn glass" onClick={() => setActiveTab("quiz")}>
              <span>Start 30s Quiz</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 30s Quiz Tab - Visible in all modes when quiz is open */}
      {(activeTab === "quiz" || isStudyMode || isGestureMode) && (
        <div
          role="tabpanel"
          id="quiz-panel"
          aria-labelledby="quiz-tab"
          className="tab-panel"
        >
          <div className="ins-body">
            <div className="flex items-center justify-between">
              <span className="eyebrow">
                NODE {String(r.q + 1).padStart(2, "0")} / {r.node.title}
              </span>
              <span className="timer">
                <Timer size={12} />
                00:{String(r.time).padStart(2, "0")}
              </span>
            </div>
            <div
              className="time-track"
              role="progressbar"
              aria-label="Time remaining"
              aria-valuenow={r.time}
              aria-valuemax={30}
            >
              <i style={{ width: `${(r.time / 30) * 100}%` }} />
            </div>
            <h3>{quiz.question}</h3>
            <div className="flex flex-col gap-2">
              {answers.map((v, i) => (
                <button
                  key={i}
                  className={
                    "answer " +
                    (r.done && i === quiz.correctIndex ? "chosen" : "") +
                    (r.done && r.selected === i && i !== quiz.correctIndex
                      ? " missed"
                      : "")
                  }
                  disabled={r.done}
                  onClick={() => r.answer(i)}
                >
                  <span>{String.fromCharCode(65 + i)}</span>
                  {v}
                  {r.done && i === quiz.correctIndex && (
                    <Check size={14} className="ml-auto" />
                  )}
                </button>
              ))}
            </div>
            {r.done && (
              <p className="feedback" role="status">
                <b>
                  {r.selected === quiz.correctIndex
                    ? "Correct."
                    : r.selected === -1
                      ? "Time expired."
                      : "Needs review."}
                </b>{" "}
                {quiz.explanation}
              </p>
            )}
          </div>
          <div className="ins-foot">
            {r.done ? (
              <button onClick={r.next}>
                Next weakest node <ArrowRight size={14} />
              </button>
            ) : (
              <>
                <Keyboard size={14} />
                Press 1–4 to answer
              </>
            )}
            <span className="ml-auto">Streak {r.streak}</span>
          </div>
        </div>
      )}

      {/* Mode 1: Study Terrarium - Show "Switch to Learn" button when quiz is closed */}
      {isStudyMode && !r.panel && (
        <div className="tab-panel" style={{ padding: "20px 22px", textAlign: "center" }}>
          <p style={{ color: "#91949d", marginBottom: "16px" }}>
            Select a node from the neural field to begin a 30-second recall quiz.
          </p>
          <button className="start-quiz-btn glass" onClick={() => r.focusNode(r.q)}>
            <ChevronRight size={14} />
            <span>Start Recall Session</span>
          </button>
        </div>
      )}

      {/* Mode 2: Gesture Synth - AR mode indicator */}
      {isGestureMode && !r.panel && (
        <div className="tab-panel" style={{ padding: "20px 22px", textAlign: "center" }}>
          <p style={{ color: "#91949d", marginBottom: "16px" }}>
            AR Spatial Mode active. Use hand gestures to interact with the floating knowledge graph.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--lime)", fontFamily: "monospace" }}>
              ✋ Palm → Orbit
            </span>
            <span style={{ fontSize: "11px", color: "var(--lime)", fontFamily: "monospace" }}>
              🤏 Pinch → Select
            </span>
            <span style={{ fontSize: "11px", color: "var(--lime)", fontFamily: "monospace" }}>
              ☝️ 1–4 Fingers → Answer
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
