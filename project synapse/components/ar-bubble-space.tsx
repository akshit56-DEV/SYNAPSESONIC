"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, CameraOff, Volume2, VolumeX,
  X, Timer, Check, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { Recall } from "./use-recall";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

// ─── Constants ────────────────────────────────────────────────────────────────
const WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

const BUBBLE_SIZE      = 162;        // px diameter
const BUBBLE_R         = BUBBLE_SIZE / 2;
const LERP_CURSOR      = 0.24;       // cursor smoothing alpha
const GESTURE_HOLD_MS  = 800;        // ms to confirm gesture in quiz
const COOLDOWN_MS      = 1200;       // ms lock-out after answer / open / close
const PINCH_THRESHOLD  = 0.055;      // normalised pinch distance

// MediaPipe landmark indices
const LM_WRIST     = 0;
const LM_IDX_MCP   = 5;
const LM_IDX_TIP   = 8;
const LM_MID_TIP   = 12;
const LM_RING_TIP  = 16;
const LM_PINKY_TIP = 20;
const LM_THUMB_TIP = 4;
const LM_PINKY_MCP = 17;

const FINGER_TIPS  = [8, 12, 16, 20];
const FINGER_PEN2  = [6, 10, 14, 18];

const HAND_CHAINS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 13, 17, 0],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Pt { x: number; y: number }

interface BubbleState {
  baseX: number; baseY: number;
  px: number;    py: number;
  vx: number;    vy: number;
  mass: number;
  z: number;     // 0.88 to 1.12 for depth parallax
  scale: number;
  tiltX: number;
  tiltY: number;
  hovered: boolean;
  isGrabbed: boolean;
  grabOffsetX: number;
  grabOffsetY: number;
  driftAngle: number;
  driftSpeed: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
}

interface RippleWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

interface ARBubbleSpaceProps {
  recall: Recall;
  synthMuted: boolean;
  onToggleMute: () => void;
}

// ─── Web Audio API Spatial Synthesizer ────────────────────────────────────────
class ARSynth {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor(initialMuted: boolean = false) {
    this.muted = initialMuted;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  private initCtx() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Pentatonic scale hover ping: C4, D4, E4, G4, A4, C5, D5, E5, G5, A5...
  public playHover(bubbleIndex: number) {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
    const freq = scale[bubbleIndex % scale.length];
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const oscHarmonic = ctx.createOscillator();
    const gain = ctx.createGain();
    const gainH = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    oscHarmonic.type = "sine";
    oscHarmonic.frequency.setValueAtTime(freq * 2, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.065, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    gainH.gain.setValueAtTime(0.001, now);
    gainH.gain.exponentialRampToValueAtTime(0.02, now + 0.008);
    gainH.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(gain);
    oscHarmonic.connect(gainH);
    gain.connect(ctx.destination);
    gainH.connect(ctx.destination);

    osc.start(now);
    oscHarmonic.start(now);
    osc.stop(now + 0.24);
    oscHarmonic.stop(now + 0.24);
  }

  // Gentle muted water-drop / glass clink on collision
  public playCollision(speed: number) {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const volume = Math.min(0.075, Math.max(0.015, speed * 0.00035));
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    const baseFreq = 860 + Math.random() * 280;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, now + 0.055);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Grab whoosh (✌️ grab)
  public playGrab() {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.14);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(550, now);
    filter.Q.setValueAtTime(2.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  // Toss air release (✌️ toss)
  public playToss() {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Force push pulse (✋)
  public playForcePush() {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.24);

    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  // Pinch open quiz: crisp futuristic glass-expand chime (ascending arpeggio)
  public playPinchOpen() {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + idx * 0.045;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.05, noteTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.35);
    });
  }

  // Quiz correct: warm major triad shimmer
  public playQuizCorrect() {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.035;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.045, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.6);
    });
  }

  // Quiz wrong: soft low muted pulse
  public playQuizWrong() {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    [160, 125].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.12;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.75, startTime + 0.11);

      gain.gain.setValueAtTime(0.05, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.14);
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function masteryColor(pct: number) {
  if (pct >= 70) return "#C6F432";
  if (pct >= 40) return "#F4A232";
  return "#F44232";
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function mx(lmX: number) { return 1 - lmX; } // mirror MediaPipe X for scaleX(-1) video

function seedPosition(count: number, index: number) {
  const cols     = Math.ceil(Math.sqrt(count + 1));
  const col      = index % cols;
  const row      = Math.floor(index / cols);
  const totalRows= Math.ceil(count / cols);
  const xStep    = 76 / cols;
  const xBase    = 12 + col * xStep + xStep / 2;
  const stagger  = row % 2 === 0 ? 0 : xStep / 2;
  const yStep    = 60 / Math.max(totalRows, 1);
  const yBase    = 14 + row * yStep + yStep / 2;
  return {
    baseX: Math.min(88, xBase + stagger) / 100,
    baseY: Math.min(74, yBase) / 100,
  };
}

function initBubbleStates(count: number, W: number, H: number): BubbleState[] {
  return Array.from({ length: count }, (_, i) => {
    const { baseX, baseY } = seedPosition(count, i);
    // z depth layers: distributed between 0.88 and 1.12
    const zLayers = [0.92, 1.08, 0.96, 1.04, 1.12, 0.88];
    const z = zLayers[i % zLayers.length];
    return {
      baseX, baseY,
      px: baseX * W, py: baseY * H,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.5) * 18,
      mass: z * z,
      z,
      scale: 1,
      tiltX: 0,
      tiltY: 0,
      hovered: false,
      isGrabbed: false,
      grabOffsetX: 0,
      grabOffsetY: 0,
      driftAngle: Math.random() * Math.PI * 2,
      driftSpeed: 8 + Math.random() * 8,
    };
  });
}

// ─── Spatial Cursor & Particles Renderer ──────────────────────────────────────
function drawCursorAndEffects(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  cx: number, cy: number,
  activeGesture: string,
  fingerCount: number,
  quizOpen: boolean,
  landmarks: Pt[] | null,
  particles: Particle[],
  ripples: RippleWave[],
  grabbedPos: Pt | null,
) {
  ctx.clearRect(0, 0, W, H);

  // 1. Ripple Waves
  ripples.forEach(r => {
    ctx.save();
    ctx.strokeStyle = `rgba(198, 244, 50, ${r.alpha})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  // 2. Glowing Particles
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  if (cx < 0) return; // no hand on screen

  const LIME = "#C6F432";

  // 3. Faint Hand Skeleton
  if (landmarks) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = LIME;
    ctx.lineWidth = 1;
    for (const chain of HAND_CHAINS) {
      ctx.beginPath();
      chain.forEach((k, j) => {
        const p = landmarks[k];
        const sx = mx(p.x) * W, sy = p.y * H;
        if (j === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
    for (const k of [LM_THUMB_TIP, LM_IDX_TIP, LM_MID_TIP, LM_RING_TIP, LM_PINKY_TIP]) {
      const p = landmarks[k];
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = LIME;
      ctx.beginPath();
      ctx.arc(mx(p.x) * W, p.y * H, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 4. Tether Line & Ring when Grabbed
  if (grabbedPos) {
    ctx.save();
    ctx.strokeStyle = "rgba(198, 244, 50, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(grabbedPos.x, grabbedPos.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = LIME;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(grabbedPos.x, grabbedPos.y, BUBBLE_R * 1.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Spatial Cursor Ring
  const isPinch = activeGesture === "pinch";
  const isPeace = activeGesture === "peace";
  const isFist  = activeGesture === "fist";
  const ringR   = isPinch ? 9 : isPeace ? 22 : isFist ? 14 : 18;

  ctx.save();
  // Radial glow
  const grd = ctx.createRadialGradient(cx, cy, ringR * 0.3, cx, cy, ringR * 2.4);
  grd.addColorStop(0, isFist ? "rgba(56, 189, 248, 0.35)" : "rgba(198, 244, 50, 0.38)");
  grd.addColorStop(1, "rgba(198, 244, 50, 0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Ring stroke
  ctx.strokeStyle = isFist ? "#38BDF8" : LIME;
  ctx.lineWidth = isPinch || isPeace ? 2.6 : 1.8;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // Mode-specific indicator inside cursor
  if (isPinch) {
    ctx.fillStyle = LIME;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (isPeace) {
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✌️", cx, cy - 26);
  } else if (isFist) {
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✊", cx, cy - 24);
  }

  // In quiz mode: finger count badge
  if (quizOpen && fingerCount >= 1 && fingerCount <= 5) {
    ctx.globalAlpha = 0.92;
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillStyle = fingerCount === 5 ? "#F4A232" : LIME;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = fingerCount === 5 ? "✋" : String(fingerCount);
    ctx.fillText(label, cx, cy + 32);
  }

  ctx.restore();
}

// ─── SpatialQuizCard Component ────────────────────────────────────────────────
function SpatialQuizCard({
  recall,
  onClose,
  gestureCode,
  cooldownActive,
  onAnswerSubmit,
}: {
  recall: Recall;
  onClose: () => void;
  gestureCode: number;
  cooldownActive: boolean;
  onAnswerSubmit: (correct: boolean) => void;
}) {
  const quiz    = recall.node?.quiz;
  const answers = quiz?.options ?? [];

  const backBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // fill[0..3] = answer hold progress, fill[4] = palm "back" progress
  const holdStartRef = useRef<Record<number, number>>({});
  const firedRef     = useRef(false);
  const rafRef       = useRef(0);
  const [fillPct, setFillPct] = useState([0, 0, 0, 0, 0]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") onClose();
      else if (/^[1-4]$/.test(e.key) && !recall.done && !cooldownActive) {
        const idx = +e.key - 1;
        onAnswerSubmit(idx === quiz?.correctIndex);
        recall.answer(idx);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recall, onClose, cooldownActive, onAnswerSubmit, quiz]);

  // Gesture hold fill loop
  useEffect(() => {
    if (!quiz || !answers.length) return;

    function tick() {
      const now = performance.now();
      const newFill = [0, 0, 0, 0, 0];

      if (cooldownActive) {
        setFillPct(newFill);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Open Palm (5) → "Back to Bubbles" fill (slot 4)
      if (gestureCode === 5) {
        if (holdStartRef.current[4] === undefined) holdStartRef.current = { 4: now };
        const elapsed = now - (holdStartRef.current[4] ?? now);
        newFill[4] = Math.min(1, elapsed / GESTURE_HOLD_MS);
        if (newFill[4] >= 1 && !firedRef.current) {
          firedRef.current = true;
          onClose();
        }
      }
      // Fingers 1-4 → answer option fill (slots 0-3), only if not yet answered
      else if (gestureCode >= 1 && gestureCode <= 4 && !recall.done) {
        const slot = gestureCode - 1;
        if (holdStartRef.current[slot] === undefined) holdStartRef.current = { [slot]: now };
        const elapsed = now - (holdStartRef.current[slot] ?? now);
        newFill[slot] = Math.min(1, elapsed / GESTURE_HOLD_MS);
        if (newFill[slot] >= 1 && !firedRef.current) {
          firedRef.current = true;
          onAnswerSubmit(slot === quiz.correctIndex);
          recall.answer(slot);
        }
      } else {
        holdStartRef.current = {};
        firedRef.current = false;
      }

      setFillPct([...newFill]);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      holdStartRef.current = {};
      firedRef.current = false;
      setFillPct([0, 0, 0, 0, 0]);
    };
  }, [gestureCode, cooldownActive, quiz, onClose, recall, onAnswerSubmit]);

  if (!quiz || !answers.length) return null;

  const palmFill = fillPct[4] ?? 0;
  const palmHolding = palmFill > 0 && palmFill < 1 && !cooldownActive;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(4, 6, 14, 0.62)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "arCardIn 0.26s cubic-bezier(.21,1.1,.67,1)",
      }}
    >
      {/* ── Status Pill Cleanly Placed Above the Quiz Card ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "rgba(11, 11, 14, 0.88)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(198, 244, 50, 0.35)",
          borderRadius: 999,
          padding: "6px 16px",
          marginBottom: 14,
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          color: "#C6F432",
          letterSpacing: "0.5px",
          boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
          pointerEvents: "none",
        }}
      >
        <span>Hold Open Palm ✋ anywhere to go back</span>
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Quiz: ${recall.node?.title}`}
        style={{
          maxWidth: 488,
          width: "calc(100% - 32px)",
          maxHeight: "calc(100vh - 120px)",
          overflowY: "auto",
          background: "rgba(11, 11, 14, 0.84)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(198, 244, 50, 0.4)",
          borderRadius: 22,
          boxShadow:
            "0 0 0 1px rgba(198,244,50,0.08) inset, 0 32px 100px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "17px 20px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div>
            <span style={{
              fontSize: 9, fontFamily: "ui-monospace,monospace",
              letterSpacing: "1.6px", color: "rgba(255,255,255,0.35)",
              display: "block", marginBottom: 5,
            }}>
              NODE {String(recall.q + 1).padStart(2, "0")} · 30s QUIZ
            </span>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 650, letterSpacing: "-0.5px", color: "#fff", lineHeight: 1.3 }}>
              {recall.node?.title}
            </h3>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0, marginLeft: 12 }}>
            {!recall.done && (
              <span style={{
                display: "flex", alignItems: "center", gap: 5,
                background: recall.time > 10 ? "rgba(32,36,26,0.95)" : "rgba(70,18,10,0.95)",
                borderRadius: 7, padding: "5px 9px",
                fontFamily: "ui-monospace,monospace", fontSize: 11,
                color: recall.time > 10 ? "#d2dfab" : "#ffa0a0",
                transition: "background 0.5s", whiteSpace: "nowrap",
              }}>
                <Timer size={11} />
                00:{String(recall.time).padStart(2, "0")}
              </span>
            )}

            <button
              ref={closeBtnRef}
              data-quiz-close="true"
              aria-label="Close quiz — back to bubbles"
              onClick={onClose}
              style={{
                width: 32, height: 32, display: "flex",
                alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, color: "rgba(255,255,255,0.55)", cursor: "pointer",
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Time progress ── */}
        {!recall.done && (
          <div role="progressbar" aria-valuenow={recall.time} aria-valuemax={30}
            style={{ height: 2, background: "rgba(255,255,255,0.07)" }}>
            <div style={{
              height: "100%",
              width: `${(recall.time / 30) * 100}%`,
              background: recall.time > 10 ? "#C6F432" : "#F44232",
              transition: "width 0.2s linear, background 0.6s",
            }} />
          </div>
        )}

        {/* ── Question + answers ── */}
        <div style={{ padding: "20px 20px 12px" }}>
          <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.88)" }}>
            {quiz.question}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {answers.map((opt, i) => {
              const isCorrect  = recall.done && i === quiz.correctIndex;
              const isMissed   = recall.done && recall.selected === i && i !== quiz.correctIndex;
              const fill       = fillPct[i] ?? 0;
              const isHolding  = !recall.done && fill > 0 && fill < 1 && !cooldownActive;

              return (
                <button
                  key={i}
                  disabled={recall.done || cooldownActive}
                  onClick={() => {
                    if (!recall.done && !cooldownActive) {
                      onAnswerSubmit(i === quiz.correctIndex);
                      recall.answer(i);
                    }
                  }}
                  style={{
                    position: "relative", display: "flex", alignItems: "center",
                    gap: 11, padding: "12px 14px",
                    background: isCorrect ? "rgba(198,244,50,0.1)"
                      : isMissed  ? "rgba(244,66,50,0.09)"
                      : isHolding ? "rgba(198,244,50,0.06)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${
                      isCorrect  ? "rgba(198,244,50,0.65)"
                      : isMissed  ? "rgba(244,66,50,0.5)"
                      : isHolding ? "rgba(198,244,50,0.45)"
                      : "rgba(255,255,255,0.09)"}`,
                    borderRadius: 11,
                    color: isCorrect ? "#C6F432" : isMissed ? "#F44232" : "#e2e3e6",
                    fontSize: 13, textAlign: "left",
                    cursor: recall.done || cooldownActive ? "default" : "pointer",
                    overflow: "hidden",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  {isHolding && (
                    <div aria-hidden="true" style={{
                      position: "absolute", inset: 0,
                      background: `linear-gradient(90deg, rgba(198,244,50,0.16) ${fill * 100}%, transparent ${fill * 100}%)`,
                      pointerEvents: "none",
                    }} />
                  )}

                  <span style={{
                    flexShrink: 0, width: 23, height: 23, display: "grid", placeItems: "center",
                    border: `1px solid ${
                      isCorrect  ? "rgba(198,244,50,0.6)"
                      : isMissed  ? "rgba(244,66,50,0.5)"
                      : isHolding ? "rgba(198,244,50,0.5)"
                      : "rgba(255,255,255,0.16)"}`,
                    borderRadius: 5, fontFamily: "ui-monospace,monospace", fontSize: 10,
                    background: "rgba(0,0,0,0.28)", zIndex: 1,
                  }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span style={{ flex: 1, zIndex: 1 }}>{opt}</span>
                  {isCorrect && <Check size={13} style={{ flexShrink: 0, zIndex: 1 }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Feedback ── */}
        {recall.done && (
          <div style={{ padding: "0 20px 10px" }}>
            <p role="status" style={{
              fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 1.6,
              margin: 0, padding: "10px 13px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <strong style={{
                color: recall.selected === quiz.correctIndex ? "#C6F432"
                     : recall.selected === -1 ? "#F4A232" : "#F44232",
              }}>
                {recall.selected === quiz.correctIndex ? "Correct. "
                 : recall.selected === -1 ? "Time expired. " : "Needs review. "}
              </strong>
              {quiz.explanation}
            </p>
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div style={{ padding: "12px 20px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              ref={backBtnRef}
              data-quiz-back="true"
              onClick={onClose}
              style={{
                position: "relative",
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                gap: 7, padding: "11px 14px",
                background: palmHolding ? "rgba(198,244,50,0.08)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${palmHolding ? "rgba(198,244,50,0.45)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 10,
                color: palmHolding ? "#C6F432" : "rgba(255,255,255,0.65)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                overflow: "hidden",
                transition: "border-color 0.15s, color 0.15s, background 0.15s",
              }}
            >
              {palmHolding && (
                <div aria-hidden="true" style={{
                  position: "absolute", inset: 0,
                  background: `linear-gradient(90deg, rgba(198,244,50,0.18) ${palmFill * 100}%, transparent ${palmFill * 100}%)`,
                  pointerEvents: "none",
                }} />
              )}
              <ChevronLeft size={14} style={{ zIndex: 1 }} />
              <span style={{ zIndex: 1 }}>Back to Bubbles</span>
            </button>

            <button
              onClick={recall.next}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                gap: 7, padding: "11px 14px",
                background: "rgba(198,244,50,0.1)",
                border: "1px solid rgba(198,244,50,0.35)",
                borderRadius: 10,
                color: "#C6F432",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              <span>Next Concept</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{
              fontSize: 10, fontFamily: "ui-monospace,monospace",
              color: "rgba(255,255,255,0.3)", letterSpacing: "0.4px",
            }}>
              Hold 1–4 fingers to answer
            </span>
            <span style={{
              fontSize: 10, fontFamily: "ui-monospace,monospace",
              color: "#C6F432", letterSpacing: "0.5px", whiteSpace: "nowrap",
            }}>
              Streak {recall.streak}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ARBubbleSpace Component ─────────────────────────────────────────────
export function ARBubbleSpace({ recall, synthMuted, onToggleMute }: ARBubbleSpaceProps) {
  const [cameraPhase, setCameraPhase] = useState<"off" | "loading" | "live">("off");
  const [cameraError, setCameraError]  = useState("");
  const [gestureHint, setGestureHint]  = useState("");
  const [activeGesture, setActiveGesture] = useState<string>("none");
  const [gestureCode, setGestureCode]  = useState(0);
  const [cooldownActive, setCooldownActive] = useState(false);

  // Synthesizer instance
  const synthRef = useRef<ARSynth>(new ARSynth(synthMuted));
  useEffect(() => {
    synthRef.current.setMuted(synthMuted);
  }, [synthMuted]);

  // DOM refs
  const containerRef    = useRef<HTMLDivElement>(null);
  const videoRef        = useRef<HTMLVideoElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const generationRef   = useRef(0);
  const cleanupRef      = useRef<() => void>(() => {});

  // Physics state
  const bubblesRef    = useRef<BubbleState[]>([]);
  const bubbleDivsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const bubbleLabelsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const physicsRafRef = useRef(0);
  const lastTimeRef   = useRef(0);
  const lastHoverIdxRef = useRef<number | null>(null);
  const lastCollisionTimeRef = useRef(0);

  // Grab & Toss mechanics
  const grabbedIdxRef = useRef<number | null>(null);
  const handHistoryRef = useRef<{ x: number; y: number; time: number }[]>([]);

  // Particles & Ripple Waves
  const particlesRef = useRef<Particle[]>([]);
  const ripplesRef   = useRef<RippleWave[]>([]);

  // Cursor state
  const cursorRef    = useRef<Pt>({ x: -1, y: -1 });
  const rawCursorRef = useRef<Pt>({ x: -1, y: -1 });
  const landmarksRef = useRef<Pt[] | null>(null);
  const cooldownEndRef = useRef(0);

  // Live state refs
  const quizOpenRef   = useRef(recall.panel);
  const recallDoneRef = useRef(recall.done);
  useEffect(() => { quizOpenRef.current   = recall.panel; }, [recall.panel]);
  useEffect(() => { recallDoneRef.current = recall.done;  }, [recall.done]);

  const quizOpen   = recall.panel;
  const nodes      = recall.nodes ?? [];
  const values     = recall.values ?? [];
  const isCameraOn = cameraPhase !== "off";

  // Particle emission helper
  const spawnBurst = useCallback((cx: number, cy: number, count = 14, color = "#C6F432") => {
    const newP: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 120 + Math.random() * 220;
      newP.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        size: 2.5 + Math.random() * 2.5,
        color,
      });
    }
    particlesRef.current.push(...newP);
  }, []);

  // Cooldown timer
  const startCooldown = useCallback(() => {
    cooldownEndRef.current = performance.now() + COOLDOWN_MS;
    setCooldownActive(true);
    setTimeout(() => setCooldownActive(false), COOLDOWN_MS);
  }, []);

  useEffect(() => {
    startCooldown();
  }, [quizOpen, recall.selected, recall.q, startCooldown]);

  // Init bubble states
  useEffect(() => {
    const W = containerRef.current?.clientWidth  ?? (typeof window !== "undefined" ? window.innerWidth : 1000);
    const H = containerRef.current?.clientHeight ?? (typeof window !== "undefined" ? window.innerHeight : 800);
    if (nodes.length === 0) return;
    if (bubblesRef.current.length !== nodes.length) {
      bubblesRef.current      = initBubbleStates(nodes.length, W, H);
      bubbleDivsRef.current   = new Array(nodes.length).fill(null);
      bubbleLabelsRef.current = new Array(nodes.length).fill(null);
    }
  }, [nodes.length]);

  // ── Physics & Particle Simulation Loop ─────────────────────────────────────
  useEffect(() => {
    let running = true;
    const gestureStateRef = { gesture: "none", curX: -1, curY: -1 };
    (window as any).__arGestureState = gestureStateRef;

    function physicsFrame(now: number) {
      if (!running) return;

      const W = containerRef.current?.clientWidth  ?? window.innerWidth;
      const H = containerRef.current?.clientHeight ?? window.innerHeight;
      const dt= Math.min((now - (lastTimeRef.current || now)) / 1000, 0.05);
      lastTimeRef.current = now;

      // Cursor smoothing
      const rawC = rawCursorRef.current;
      if (rawC.x >= 0) {
        const prev = cursorRef.current;
        cursorRef.current = {
          x: prev.x < 0 ? rawC.x : lerp(prev.x, rawC.x, LERP_CURSOR),
          y: prev.y < 0 ? rawC.y : lerp(prev.y, rawC.y, LERP_CURSOR),
        };
      } else {
        cursorRef.current = { x: -1, y: -1 };
      }

      const curX = cursorRef.current.x;
      const curY = cursorRef.current.y;
      gestureStateRef.curX = curX;
      gestureStateRef.curY = curY;

      // Update Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt; // soft gravity
        p.vx *= 0.96;
        p.alpha -= 1.4 * dt;
        if (p.alpha <= 0) {
          particlesRef.current.splice(i, 1);
        }
      }

      // Update Ripples
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i];
        r.radius += 320 * dt;
        r.alpha -= 1.8 * dt;
        if (r.alpha <= 0 || r.radius >= r.maxRadius) {
          ripplesRef.current.splice(i, 1);
        }
      }

      // Check grabbed bubble position
      const grabbedIdx = grabbedIdxRef.current;
      const grabbedPos = (grabbedIdx !== null && bubblesRef.current[grabbedIdx])
        ? { x: bubblesRef.current[grabbedIdx].px, y: bubblesRef.current[grabbedIdx].py }
        : null;

      // Draw Cursor, Skeleton, Particles, Ripples on z-index: 70
      const cc = cursorCanvasRef.current;
      if (cc) {
        const ctx = cc.getContext("2d");
        if (ctx) {
          cc.width  = W;
          cc.height = H;
          drawCursorAndEffects(
            ctx, W, H,
            curX, curY,
            gestureStateRef.gesture,
            gestureCode,
            quizOpenRef.current,
            landmarksRef.current,
            particlesRef.current,
            ripplesRef.current,
            grabbedPos,
          );
        }
      }

      // ── BUBBLE PHYSICS SIMULATION ──
      const quizIsOpen = quizOpenRef.current;
      const states     = bubblesRef.current;
      const count      = states.length;
      const gesture    = gestureStateRef.gesture;

      let hoveredAny: number | null = null;

      for (let i = 0; i < count; i++) {
        const b = states[i];
        if (!b) continue;
        const bRad = BUBBLE_R * b.z;

        if (b.isGrabbed && curX >= 0) {
          // Peace sign grab: follow hand smoothly
          const targetX = curX + b.grabOffsetX;
          const targetY = curY + b.grabOffsetY;
          b.vx = (targetX - b.px) * 14;
          b.vy = (targetY - b.py) * 14;
          b.px += b.vx * dt;
          b.py += b.vy * dt;
        } else {
          // Zero-Gravity Organic Drift & Velocity Integration
          b.driftAngle += (Math.random() - 0.5) * 0.08;
          b.vx += Math.cos(b.driftAngle) * b.driftSpeed * dt;
          b.vy += Math.sin(b.driftAngle) * b.driftSpeed * dt;

          // Drag / damping
          b.vx *= 0.988;
          b.vy *= 0.988;

          b.px += b.vx * dt;
          b.py += b.vy * dt;

          // Fist Gesture: Gravity Gather (Pull toward hand in orbital swirl)
          if (!quizIsOpen && gesture === "fist" && curX >= 0) {
            const dx = curX - b.px;
            const dy = curY - b.py;
            const dist = Math.hypot(dx, dy);
            if (dist > 25) {
              const pullForce = Math.min(420, 36000 / (dist + 60));
              b.vx += (dx / dist) * pullForce * dt + (-dy / dist) * (pullForce * 0.32) * dt;
              b.vy += (dy / dist) * pullForce * dt + (dx / dist) * (pullForce * 0.32) * dt;
            }
          }

          // Open Palm Gesture: Force Push Wave
          if (!quizIsOpen && gesture === "palm" && curX >= 0) {
            const dx = b.px - curX;
            const dy = b.py - curY;
            const dist = Math.hypot(dx, dy);
            if (dist < 240 && dist > 1) {
              const pushForce = Math.min(650, 68000 / (dist + 30));
              b.vx += (dx / dist) * pushForce * dt;
              b.vy += (dy / dist) * pushForce * dt;
            }
          }
        }

        // Screen-Edge Soft Elastic Rebounds
        const minX = bRad + 12, maxX = W - bRad - 12;
        const minY = bRad + 64, maxY = H - bRad - 85;
        if (b.px < minX) { b.px = minX; b.vx = Math.abs(b.vx) * 0.82; }
        if (b.px > maxX) { b.px = maxX; b.vx = -Math.abs(b.vx) * 0.82; }
        if (b.py < minY) { b.py = minY; b.vy = Math.abs(b.vy) * 0.82; }
        if (b.py > maxY) { b.py = maxY; b.vy = -Math.abs(b.vy) * 0.82; }

        // Hover Detection
        const isHovered = !quizIsOpen && curX >= 0 && Math.hypot(b.px - curX, b.py - curY) < bRad + 14;
        b.hovered = isHovered;
        if (isHovered) hoveredAny = i;

        // 3D Tilt & Scale
        const targetScale = b.isGrabbed ? 1.16 : isHovered ? 1.12 : 1.0;
        const targetTiltX = isHovered ? ((curY - b.py) / bRad) * -16 : 0;
        const targetTiltY = isHovered ? ((curX - b.px) / bRad) * 16 : 0;

        b.scale = lerp(b.scale, targetScale, Math.min(1, dt * 7));
        b.tiltX = lerp(b.tiltX, targetTiltX, Math.min(1, dt * 8));
        b.tiltY = lerp(b.tiltY, targetTiltY, Math.min(1, dt * 8));

        // Direct DOM update
        const el = bubbleDivsRef.current[i];
        if (el) {
          el.style.left = `${b.px}px`;
          el.style.top  = `${b.py}px`;
          el.style.transform = `perspective(600px) translate(-50%,-50%) rotateX(${b.tiltX.toFixed(2)}deg) rotateY(${b.tiltY.toFixed(2)}deg) scale(${(b.scale * b.z).toFixed(4)})`;

          if (b.isGrabbed) {
            el.style.borderColor = "#C6F432";
            el.style.boxShadow =
              "0 0 0 4px rgba(198,244,50,0.35), 0 24px 60px rgba(0,0,0,0.7), inset 0 1px 2px rgba(255,255,255,0.5), inset 0 -10px 24px rgba(198,244,50,0.25)";
          } else if (isHovered) {
            el.style.borderColor = "rgba(198,244,50,0.85)";
            el.style.boxShadow =
              "0 0 0 3px rgba(198,244,50,0.22), 0 20px 50px rgba(0,0,0,0.65), inset 0 1px 2px rgba(255,255,255,0.45), inset 0 -10px 24px rgba(198,244,50,0.16)";
          } else {
            const sel = quizIsOpen && recall.q === i;
            const c   = masteryColor(Math.round(values[i] ?? 0));
            el.style.borderColor = sel ? c : "rgba(255,255,255,0.14)";
            el.style.boxShadow =
              "0 18px 40px rgba(0,0,0,0.45), inset 0 1px 2px rgba(255,255,255,0.45), inset 0 -10px 24px rgba(198,244,50,0.12)";
          }
        }

        const labelEl = bubbleLabelsRef.current[i];
        if (labelEl) {
          if (b.isGrabbed) {
            labelEl.textContent = "✌️ Moving";
            labelEl.style.display = "block";
            labelEl.style.color = "#C6F432";
          } else if (isHovered && !quizIsOpen) {
            labelEl.textContent = "✌️ Grab · 👌 Pinch Quiz";
            labelEl.style.display = "block";
            labelEl.style.color = "rgba(198,244,50,0.9)";
          } else {
            labelEl.style.display = "none";
          }
        }
      }

      // ── ELASTIC BUBBLE-TO-BUBBLE COLLISIONS ──
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const b1 = states[i];
          const b2 = states[j];
          const r1 = BUBBLE_R * b1.z;
          const r2 = BUBBLE_R * b2.z;
          const minDist = r1 + r2 + 2;
          const dx = b2.px - b1.px;
          const dy = b2.py - b1.py;
          const dist = Math.hypot(dx, dy);

          if (dist < minDist && dist > 0.001) {
            const nx = dx / dist;
            const ny = dy / dist;

            // Separate overlapping spheres
            const overlap = 0.5 * (minDist - dist);
            if (!b1.isGrabbed) { b1.px -= nx * overlap; b1.py -= ny * overlap; }
            if (!b2.isGrabbed) { b2.px += nx * overlap; b2.py += ny * overlap; }

            // Elastic momentum impulse along collision normal
            const kx = b1.vx - b2.vx;
            const ky = b1.vy - b2.vy;
            const velAlongNormal = kx * nx + ky * ny;

            if (velAlongNormal > 0) {
              const restitution = 0.88;
              const impulse = (1 + restitution) * velAlongNormal / (1 / b1.mass + 1 / b2.mass);
              if (!b1.isGrabbed) {
                b1.vx -= (impulse / b1.mass) * nx;
                b1.vy -= (impulse / b1.mass) * ny;
              }
              if (!b2.isGrabbed) {
                b2.vx += (impulse / b2.mass) * nx;
                b2.vy += (impulse / b2.mass) * ny;
              }

              // Sound: gentle glass clink scaled by impact speed
              if (velAlongNormal > 35 && now - lastCollisionTimeRef.current > 75) {
                synthRef.current.playCollision(velAlongNormal);
                lastCollisionTimeRef.current = now;
              }
            }
          }
        }
      }

      // Melodic Hover Ping Sound (unique pitch per bubble)
      if (hoveredAny !== null && hoveredAny !== lastHoverIdxRef.current) {
        synthRef.current.playHover(hoveredAny);
        lastHoverIdxRef.current = hoveredAny;
      } else if (hoveredAny === null) {
        lastHoverIdxRef.current = null;
      }

      physicsRafRef.current = requestAnimationFrame(physicsFrame);
    }

    physicsRafRef.current = requestAnimationFrame(physicsFrame);
    return () => {
      running = false;
      cancelAnimationFrame(physicsRafRef.current);
    };
  }, [nodes.length, values, gestureCode]);

  // ── Camera & Hand-Tracking Pipeline ───────────────────────────────────────
  const stopCamera = useCallback(() => {
    generationRef.current++;
    cleanupRef.current();
    cleanupRef.current = () => {};
    setCameraPhase("off");
    setGestureHint("");
    setCameraError("");
    setGestureCode(0);
    setActiveGesture("none");
    rawCursorRef.current = { x: -1, y: -1 };
    cursorRef.current    = { x: -1, y: -1 };
    landmarksRef.current = null;
    grabbedIdxRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    const token = generationRef.current;
    const valid = () => generationRef.current === token;
    const video = videoRef.current!;

    let model: HandLandmarker | undefined;
    let stream: MediaStream | undefined;
    let raf = 0;

    setCameraPhase("loading");
    setCameraError("");
    setGestureHint("Starting camera…");

    cleanupRef.current = () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      video.pause();
      video.srcObject = null;
      model?.close();
    };

    const fail = (msg: string) => {
      if (valid()) { stopCamera(); setCameraError(msg); }
    };

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("No getUserMedia");

      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!valid()) { stream.getTracks().forEach(t => t.stop()); return; }

      stream.getVideoTracks()[0].addEventListener("ended",
        () => fail("Camera disconnected."), { once: true });
      video.srcObject = stream;
      await video.play();
      if (!valid()) return;

      setGestureHint("Loading hand model…");
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(WASM);
      if (!valid()) return;
      model = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/hand_landmarker.task" },
        runningMode: "VIDEO",
        numHands: 1,
      });
      if (!valid()) { model.close(); return; }
      setCameraPhase("live");

      let lastDetect = 0, prevTime = -1;
      let poseLabel = "", poseSince = 0, poseFired = false;

      function detect(now: number) {
        if (!valid()) return;
        try {
          if (video.readyState >= 2 && now - lastDetect > 45 && prevTime !== video.currentTime) {
            prevTime   = video.currentTime;
            lastDetect = now;

            const result = model!.detectForVideo(video, now);
            const lms: { x: number; y: number; z: number }[] | undefined = result.landmarks?.[0];

            const W = containerRef.current?.clientWidth  ?? window.innerWidth;
            const H = containerRef.current?.clientHeight ?? window.innerHeight;
            const gState = (window as any).__arGestureState as { gesture: string; curX: number; curY: number } | undefined;

            if (!lms || lms.length < 21) {
              rawCursorRef.current = { x: -1, y: -1 };
              landmarksRef.current = null;
              if (gState) gState.gesture = "none";
              setGestureHint("Show one hand");
              setGestureCode(0);
              setActiveGesture("none");

              // Release grabbed bubble if hand drops
              if (grabbedIdxRef.current !== null && bubblesRef.current[grabbedIdxRef.current]) {
                bubblesRef.current[grabbedIdxRef.current].isGrabbed = false;
                grabbedIdxRef.current = null;
                synthRef.current.playToss();
              }
              poseFired = false; poseLabel = ""; poseSince = now;
              raf = requestAnimationFrame(detect);
              return;
            }

            landmarksRef.current = lms;

            // 1:1 Mirrored index-fingertip coordinate
            const tip8 = lms[LM_IDX_TIP];
            const scrX = mx(tip8.x) * W;
            const scrY = tip8.y * H;
            rawCursorRef.current = { x: scrX, y: scrY };

            // Update hand movement history for flick / toss velocity
            handHistoryRef.current.push({ x: scrX, y: scrY, time: now });
            if (handHistoryRef.current.length > 6) handHistoryRef.current.shift();

            // Measure finger extension relative to wrist
            const dist = (a: number, b: number) =>
              Math.hypot((lms[a].x - lms[b].x) * (W / H), lms[a].y - lms[b].y);

            const handW   = Math.max(0.02, dist(LM_IDX_MCP, LM_PINKY_MCP));
            const pDist   = Math.hypot(
              (lms[LM_THUMB_TIP].x - lms[LM_IDX_TIP].x) * (W / H),
              lms[LM_THUMB_TIP].y - lms[LM_IDX_TIP].y,
            );
            const isPinching = pDist < PINCH_THRESHOLD * (W / H);

            const idxExt   = dist(8, LM_WRIST) > dist(6, LM_WRIST) * 1.12;
            const midExt   = dist(12, LM_WRIST) > dist(10, LM_WRIST) * 1.12;
            const ringExt  = dist(16, LM_WRIST) > dist(14, LM_WRIST) * 1.12;
            const pinkyExt = dist(20, LM_WRIST) > dist(18, LM_WRIST) * 1.12;
            const thumbOut = dist(LM_THUMB_TIP, LM_PINKY_MCP) > handW * 1.4;

            const extendedCount = [idxExt, midExt, ringExt, pinkyExt].filter(Boolean).length;

            // ── GESTURE RECOGNITION ──
            // ✌️ Peace Sign: Index + Middle extended, Ring + Pinky curled
            const isPeace = idxExt && midExt && !ringExt && !pinkyExt && !isPinching;

            // ✊ Closed Fist: All 4 fingers curled
            const isFist  = !idxExt && !midExt && !ringExt && !pinkyExt && !isPinching;

            // ✋ Open Palm: All 4 fingers extended + thumb out
            const isPalm  = extendedCount === 4 && thumbOut;

            let gestureNow = "none";
            if (isPinching) {
              gestureNow = "pinch";
            } else if (isPeace) {
              gestureNow = "peace";
            } else if (isFist) {
              gestureNow = "fist";
            } else if (isPalm) {
              gestureNow = "palm";
            } else if (extendedCount > 0) {
              gestureNow = String(extendedCount);
            }

            if (gState) gState.gesture = gestureNow;
            setActiveGesture(gestureNow);

            if (gestureNow !== poseLabel) {
              poseLabel = gestureNow;
              poseSince = now;
              poseFired = false;
            }

            const inCooldown = now < cooldownEndRef.current;

            // ── BUBBLE BROWSING GESTURE ACTIONS ──
            if (!quizOpenRef.current) {
              // 1. Peace Sign: Grab, Move & Toss
              if (gestureNow === "peace") {
                if (grabbedIdxRef.current === null) {
                  // Find bubble under hand
                  const bbs = bubblesRef.current;
                  let closest = -1;
                  let minD = Infinity;
                  for (let bi = 0; bi < bbs.length; bi++) {
                    const d = Math.hypot(bbs[bi].px - scrX, bbs[bi].py - scrY);
                    if (d < (BUBBLE_R * bbs[bi].z) + 26 && d < minD) {
                      minD = d;
                      closest = bi;
                    }
                  }
                  if (closest !== -1) {
                    grabbedIdxRef.current = closest;
                    const b = bbs[closest];
                    b.isGrabbed = true;
                    b.grabOffsetX = b.px - scrX;
                    b.grabOffsetY = b.py - scrY;
                    synthRef.current.playGrab();
                  }
                }
              } else {
                // If peace sign released while holding: Toss with inertia!
                if (grabbedIdxRef.current !== null && bubblesRef.current[grabbedIdxRef.current]) {
                  const b = bubblesRef.current[grabbedIdxRef.current];
                  b.isGrabbed = false;
                  grabbedIdxRef.current = null;

                  // Compute flick velocity from recent points
                  const history = handHistoryRef.current;
                  if (history.length >= 2) {
                    const first = history[0];
                    const last  = history[history.length - 1];
                    const dtSec = Math.max(0.02, (last.time - first.time) / 1000);
                    const vx = (last.x - first.x) / dtSec;
                    const vy = (last.y - first.y) / dtSec;
                    b.vx = Math.max(-750, Math.min(750, vx * 1.2));
                    b.vy = Math.max(-750, Math.min(750, vy * 1.2));
                  }
                  synthRef.current.playToss();
                }
              }

              // 2. Open Palm: Trigger Expanding Force Wave Ripple
              if (gestureNow === "palm" && now - poseSince > 100 && !poseFired) {
                poseFired = true;
                synthRef.current.playForcePush();
                ripplesRef.current.push({
                  x: scrX,
                  y: scrY,
                  radius: 30,
                  maxRadius: 220,
                  alpha: 0.85,
                });
              }

              // 3. Pinch: Open Quiz Card for Hovered Bubble
              if (gestureNow === "pinch" && !inCooldown && now - poseSince > 160 && !poseFired) {
                poseFired = true;
                const bbs = bubblesRef.current;
                let best = Infinity, closest = 0;
                for (let bi = 0; bi < bbs.length; bi++) {
                  const d = Math.hypot(bbs[bi].px - scrX, bbs[bi].py - scrY);
                  if (d < best) { best = d; closest = bi; }
                }
                if (best < BUBBLE_R * 2.2) {
                  synthRef.current.playPinchOpen();
                  spawnBurst(bbs[closest].px, bbs[closest].py, 16, "#C6F432");
                  recall.focusNode(closest);
                  startCooldown();
                }
              }

              // Update Top HUD dynamic hint
              if (gestureNow === "peace") {
                setGestureHint("✌️ Grab & Move · Flick to Toss");
              } else if (gestureNow === "palm") {
                setGestureHint("✋ Force Push Wave Active");
              } else if (gestureNow === "fist") {
                setGestureHint("✊ Gravity Gathering Bubbles…");
              } else if (gestureNow === "pinch") {
                setGestureHint("👌 Opening Concept…");
              } else {
                setGestureHint("✌️ Grab & Toss · 👌 Pinch to Quiz · ✋ Push · ✊ Gather");
              }
            } else {
              // ── QUIZ CARD ACTIVE ACTIONS ──
              if (gestureNow === "pinch" && !inCooldown && now - poseSince > 180 && !poseFired) {
                poseFired = true;
                recall.close();
                startCooldown();
              }

              const fi = Number(gestureNow);
              const code = isPalm ? 5 : (!isNaN(fi) && fi >= 1 && fi <= 4 && !isPinching ? fi : 0);
              setGestureCode(inCooldown ? -1 : code);

              if (isPalm) {
                setGestureHint("Hold Open Palm ✋ to go back");
              } else if (!isNaN(fi) && fi >= 1 && fi <= 4) {
                setGestureHint(`Hold ${fi} · ${String.fromCharCode(64 + fi)}`);
              } else {
                setGestureHint("Hold 1–4 fingers to answer · Hold Open Palm ✋ to go back");
              }
            }
          }

          raf = requestAnimationFrame(detect);
        } catch {
          fail("Hand tracking interrupted.");
        }
      }

      raf = requestAnimationFrame(detect);
    } catch {
      fail("Camera unavailable. Check permissions and reload.");
    }
  }, [stopCamera, startCooldown, recall, spawnBurst]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Mouse fallback
  useEffect(() => {
    if (isCameraOn) return;
    const el = containerRef.current;
    function onMove(e: MouseEvent) {
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      rawCursorRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onLeave() { rawCursorRef.current = { x: -1, y: -1 }; }
    el?.addEventListener("mousemove", onMove);
    el?.addEventListener("mouseleave", onLeave);
    return () => {
      el?.removeEventListener("mousemove", onMove);
      el?.removeEventListener("mouseleave", onLeave);
    };
  }, [isCameraOn]);

  return (
    <>
      <style>{`
        @keyframes arCardIn {
          from { opacity: 0; transform: scale(0.91); }
          to   { opacity: 1; transform: scale(1);    }
        }
        @keyframes arAmbientPulse {
          0%,100% { opacity: 0.48; transform: scale(1);    }
          50%      { opacity: 0.70; transform: scale(1.05); }
        }
      `}</style>

      <div
        ref={containerRef}
        style={{
          position: "relative", width: "100%", height: "100%",
          overflow: "hidden",
          background: isCameraOn ? "#050608" : "#0B0B0C",
          userSelect: "none",
        }}
      >
        {/* ── CAMERA OFF: Obsidian Backdrop + Ambient Glow ───────────────── */}
        {!isCameraOn && (
          <>
            <div aria-hidden="true" style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "radial-gradient(ellipse 72% 56% at 50% 48%, rgba(198,244,50,0.052) 0%, rgba(70,90,180,0.082) 60%, transparent 100%)",
              animation: "arAmbientPulse 8s ease-in-out infinite",
            }} />
            <div aria-hidden="true" style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              backgroundImage: "radial-gradient(rgba(185,195,218,0.09) 0.6px, transparent 0.8px)",
              backgroundSize: "32px 32px",
              maskImage: "linear-gradient(transparent, rgba(0,0,0,0.25) 25%, rgba(0,0,0,0.5) 65%, transparent 95%)",
            }} />
          </>
        )}

        {/* ── CAMERA ON: Full-Screen Mirrored Video (z=0) ────────────────── */}
        <video
          ref={videoRef} muted playsInline autoPlay aria-hidden="true"
          style={{
            display: isCameraOn ? "block" : "none",
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover", transform: "scaleX(-1)", zIndex: 0,
          }}
        />

        {/* Room Vignette */}
        {isCameraOn && (
          <div aria-hidden="true" style={{
            position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
            background: "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 38%, rgba(0,0,0,0.6) 100%)",
            boxShadow: "inset 0 0 130px 50px rgba(0,0,0,0.65)",
          }} />
        )}

        {/* ── Floating 3D Spherical Glass Bubbles (z=10) ─────────────────── */}
        {nodes.map((node, i) => {
          const mastery = Math.round(values[i] ?? node.retention);
          const color   = masteryColor(mastery);
          const circum  = 2 * Math.PI * 78;

          const angle = (mastery / 100) * 2 * Math.PI - Math.PI / 2;
          const tipX = 85 + 78 * Math.cos(angle);
          const tipY = 85 + 78 * Math.sin(angle);

          return (
            <button
              key={node.id}
              ref={el => { bubbleDivsRef.current[i] = el; }}
              data-node={i}
              aria-pressed={recall.panel && recall.q === i}
              aria-label={`Study ${node.title} — mastery ${mastery}%`}
              onClick={() => {
                if (!quizOpen) {
                  synthRef.current.playPinchOpen();
                  spawnBurst(window.innerWidth / 2, window.innerHeight / 2, 14);
                  recall.focusNode(i);
                }
              }}
              style={{
                position: "absolute", left: 0, top: 0,
                transform: "translate(-50%,-50%)",
                width: BUBBLE_SIZE, height: BUBBLE_SIZE,
                borderRadius: "50%",
                // True 3-D spherical spatial glass
                background: "radial-gradient(circle at 28% 22%, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.08) 28%, rgba(12,16,22,0.58) 68%, rgba(8,10,14,0.82) 100%)",
                backdropFilter: "blur(22px) saturate(160%)",
                WebkitBackdropFilter: "blur(22px) saturate(160%)",
                border: "1.5px solid rgba(255,255,255,0.14)",
                boxShadow: "0 18px 40px rgba(0,0,0,0.45), inset 0 1px 2px rgba(255,255,255,0.45), inset 0 -10px 24px rgba(198,244,50,0.12)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 4, cursor: quizOpen ? "default" : "pointer",
                zIndex: 10,
                transition: "border-color 0.22s, box-shadow 0.22s",
                padding: 0, overflow: "visible",
              }}
            >
              {/* Iridescent soap-glass sheen rim (lime, sky blue, purple-violet) */}
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: -1,
                  borderRadius: "50%",
                  background: "conic-gradient(from 140deg at 50% 50%, rgba(198,244,50,0.16) 0%, rgba(56,189,248,0.22) 35%, rgba(168,85,247,0.20) 70%, rgba(198,244,50,0.16) 100%)",
                  mask: "radial-gradient(circle, transparent 66%, black 72%)",
                  WebkitMask: "radial-gradient(circle, transparent 66%, black 72%)",
                  pointerEvents: "none",
                }}
              />

              {/* Inner ambient rim glow */}
              <span aria-hidden="true" style={{
                position: "absolute", inset: 2, borderRadius: "50%",
                boxShadow: `inset 0 0 20px 5px ${color}1a`,
                pointerEvents: "none",
              }} />

              {/* Top-left curved specular reflection arc */}
              <span aria-hidden="true" style={{
                position: "absolute", top: "10%", left: "16%",
                width: "48%", height: "24%",
                background: "radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.1) 45%, transparent 75%)",
                borderRadius: "50%", transform: "rotate(-26deg)",
                pointerEvents: "none",
              }} />

              {/* Secondary softer bottom rim reflection */}
              <span aria-hidden="true" style={{
                position: "absolute", bottom: "8%", right: "16%",
                width: "40%", height: "18%",
                background: `radial-gradient(ellipse at center, ${color}22 0%, transparent 80%)`,
                borderRadius: "50%", transform: "rotate(-18deg)",
                pointerEvents: "none",
              }} />

              {/* Animated SVG mastery ring with soft glow & tip dot */}
              <svg
                aria-hidden="true"
                style={{
                  position: "absolute", inset: -4,
                  width: "calc(100% + 8px)", height: "calc(100% + 8px)",
                  pointerEvents: "none", overflow: "visible",
                }}
                viewBox="0 0 170 170"
              >
                <circle cx="85" cy="85" r="78" fill="none"
                  stroke={color} strokeWidth="2.5" strokeOpacity="0.14" />
                <circle cx="85" cy="85" r="78" fill="none"
                  stroke={color} strokeWidth="2.8" strokeOpacity="0.9"
                  strokeLinecap="round"
                  strokeDasharray={`${(mastery / 100) * circum} ${circum}`}
                  transform="rotate(-90 85 85)"
                  style={{ filter: `drop-shadow(0 0 6px ${color})` }}
                />
                {mastery > 3 && (
                  <circle cx={tipX} cy={tipY} r="4" fill="#fff"
                    stroke={color} strokeWidth="2"
                    style={{ filter: `drop-shadow(0 0 5px ${color})` }}
                  />
                )}
              </svg>

              {/* Concept index */}
              <span style={{
                fontSize: 9, fontFamily: "ui-monospace,monospace",
                letterSpacing: "0.9px", color: "rgba(255,255,255,0.38)",
                lineHeight: 1, zIndex: 1,
              }}>
                N / {String(i + 1).padStart(2, "0")}
              </span>

              {/* Concept title */}
              <span style={{
                fontSize: 13, fontWeight: 600, color: "#fff",
                textAlign: "center", lineHeight: 1.3,
                padding: "0 14px",
                overflowWrap: "normal", wordBreak: "normal", hyphens: "none",
                maxWidth: BUBBLE_SIZE - 10, zIndex: 1,
              }}>
                {node.title}
              </span>

              {/* Mastery % */}
              <span style={{
                fontSize: 11, fontWeight: 700, color,
                fontFamily: "ui-monospace,monospace",
                letterSpacing: "0.3px", zIndex: 1,
              }}>
                {mastery}%
              </span>

              {/* Dynamic Action micro-badge */}
              <span
                ref={el => { bubbleLabelsRef.current[i] = el; }}
                aria-hidden="true"
                style={{
                  display: "none",
                  position: "absolute", top: "calc(100% + 10px)",
                  left: "50%", transform: "translateX(-50%)",
                  whiteSpace: "nowrap", fontSize: 10,
                  fontFamily: "ui-monospace,monospace", letterSpacing: "0.4px",
                  background: "rgba(11,11,14,0.85)",
                  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(198,244,50,0.3)",
                  borderRadius: 6, padding: "3px 8px",
                  pointerEvents: "none",
                }}
              >
                ✌️ Grab · 👌 Pinch
              </span>
            </button>
          );
        })}

        {/* ── Centered Frosted-Glass Spatial Quiz Card (z=50) ────────────── */}
        {quizOpen && recall.node?.quiz && (
          <SpatialQuizCard
            recall={recall}
            onClose={() => { recall.close(); startCooldown(); }}
            gestureCode={cooldownActive ? -1 : gestureCode}
            cooldownActive={cooldownActive}
            onAnswerSubmit={(isCorrect) => {
              if (isCorrect) {
                synthRef.current.playQuizCorrect();
                spawnBurst(window.innerWidth / 2, window.innerHeight / 2 - 40, 22, "#C6F432");
              } else {
                synthRef.current.playQuizWrong();
              }
            }}
          />
        )}

        {/* ── Top-Layer Spatial Fingertip Cursor Canvas (z=70) ───────────── */}
        <canvas
          ref={cursorCanvasRef}
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            zIndex: 70, // ABOVE the expanded Quiz Card (z=50)
            pointerEvents: "none",
          }}
        />

        {/* ── Context-Aware HUD Gesture Pill (z=80) ──────────────────────── */}
        {isCameraOn && gestureHint && (
          <div aria-live="polite" style={{
            position: "absolute", top: 14, left: "50%",
            transform: "translateX(-50%)", zIndex: 80,
            background: "rgba(11,11,14,0.86)",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(198,244,50,0.3)",
            borderRadius: 8, padding: "5px 14px",
            fontSize: 11, fontFamily: "ui-monospace,monospace",
            color: cooldownActive ? "rgba(198,244,50,0.4)" : "#C6F432",
            letterSpacing: "0.5px",
            pointerEvents: "none", whiteSpace: "nowrap",
            transition: "color 0.3s",
          }}>
            {cooldownActive ? "…" : gestureHint}
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <p role="alert" style={{
            position: "absolute", top: isCameraOn ? 52 : 16,
            left: "50%", transform: "translateX(-50%)",
            zIndex: 80, margin: 0,
            background: "rgba(70,15,10,0.92)",
            border: "1px solid rgba(244,66,50,0.4)",
            borderRadius: 8, padding: "7px 16px",
            fontSize: 12, color: "#ffa0a0",
            pointerEvents: "none", whiteSpace: "nowrap",
          }}>
            {cameraError}
          </p>
        )}

        {/* ── Floating Controls Pill (z=30) ──────────────────────────────── */}
        <div style={{
          position: "absolute", bottom: 22, left: "50%",
          transform: "translateX(-50%)", zIndex: 30,
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(10,10,13,0.9)",
          backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 999, padding: "7px 14px",
          boxShadow: "0 8px 36px rgba(0,0,0,0.65)",
          whiteSpace: "nowrap",
        }}>
          <button
            onClick={cameraPhase === "off" ? startCamera : stopCamera}
            disabled={cameraPhase === "loading"}
            aria-label={isCameraOn ? "Stop AR camera" : "Enable AR camera"}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "7px 14px", borderRadius: 999,
              background: cameraPhase === "live"   ? "rgba(198,244,50,0.14)"
                        : cameraPhase === "loading" ? "rgba(244,164,50,0.12)"
                        : "rgba(255,255,255,0.07)",
              border: `1px solid ${
                cameraPhase === "live"   ? "rgba(198,244,50,0.5)"
                : cameraPhase === "loading" ? "rgba(244,164,50,0.4)"
                : "rgba(255,255,255,0.11)"}`,
              color: cameraPhase === "live"   ? "#C6F432"
                   : cameraPhase === "loading" ? "#F4A232" : "#fff",
              fontSize: 12, fontWeight: 600,
              cursor: cameraPhase === "loading" ? "default" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {isCameraOn ? <CameraOff size={14} /> : <Camera size={14} />}
            {cameraPhase === "loading" ? "Starting…" : isCameraOn ? "Stop Camera" : "Enable AR Camera"}
          </button>

          <div aria-hidden="true" style={{ width: 1, height: 20, background: "rgba(255,255,255,0.09)" }} />

          <button
            onClick={onToggleMute}
            aria-label={synthMuted ? "Unmute synth" : "Mute synth"}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 999,
              background: synthMuted ? "rgba(255,255,255,0.05)" : "rgba(198,244,50,0.1)",
              border: `1px solid ${synthMuted ? "rgba(255,255,255,0.09)" : "rgba(198,244,50,0.3)"}`,
              color: synthMuted ? "rgba(255,255,255,0.38)" : "#C6F432",
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
            }}
          >
            {synthMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span style={{ fontSize: 11 }}>{synthMuted ? "Muted" : "Synth"}</span>
          </button>
        </div>
      </div>
    </>
  );
}
