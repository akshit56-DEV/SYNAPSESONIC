"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Magnet,
} from "lucide-react";
import type { Recall } from "./use-recall";
import type { Concept } from "./decks";
import type { ForgedBridgePayload } from "./study-terrarium";

// ─── MediaPipe Assets ─────────────────────────────────────────────────────────
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

const ORBS_PER_PAGE = 8;
const PINCH_DIST_THRESHOLD = 0.062;

// Timings (ms)
const ENTRY_LOCKOUT_MS = 1800; // 1800ms reading grace lockout
const FINGER_HOLD_MS = 800;    // 800ms steady hold on 1-4 fingers
const FIST_HOLD_MS = 650;      // 650ms fist hold for Toss Back
const THUMBS_UP_HOLD_MS = 650; // 650ms thumbs up hold for Next Orb
const OPEN_PALM_HOLD_MS = 750; // 750ms open palm hold for New AI Question
const POD_DWELL_MS = 550;      // 550ms pod / button dwell

// MediaPipe landmark indices
const LM_WRIST = 0;
const LM_THUMB_CMC = 1;
const LM_THUMB_MCP = 2;
const LM_THUMB_IP = 3;
const LM_THUMB_TIP = 4;
const LM_INDEX_MCP = 5;
const LM_INDEX_PIP = 6;
const LM_INDEX_TIP = 8;
const LM_MIDDLE_MCP = 9;
const LM_MIDDLE_PIP = 10;
const LM_MIDDLE_TIP = 12;
const LM_RING_PIP = 14;
const LM_RING_TIP = 16;
const LM_PINKY_MCP = 17;
const LM_PINKY_PIP = 18;
const LM_PINKY_TIP = 20;

const HAND_CHAINS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 13, 17, 0],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

// ─── Wide Peripheral Frame Scatter + 30-Step Repulsion (Face-Clear Center) ────
function calculateScatteredPositions(count: number): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  const minDistance = 2.25;

  // Peripheral wing/arc anchors keeping the user's face center clear
  const peripheralAnchors: [number, number, number][] = [
    [-4.7, 1.65, -0.5],  // Top-left outer
    [4.7, 1.65, -0.5],   // Top-right outer
    [-2.5, 2.0, 0.5],    // Top-left upper arch
    [2.5, 2.0, 0.5],     // Top-right upper arch
    [-4.9, -0.35, 0.4],  // Mid-left outer
    [4.9, -0.35, 0.4],   // Mid-right outer
    [-2.7, -0.95, -1.2], // Bottom-left lower arc
    [2.7, -0.95, -1.2],  // Bottom-right lower arc
  ];

  for (let i = 0; i < count; i++) {
    const anchor = peripheralAnchors[i % peripheralAnchors.length];
    const ringBoost = Math.floor(i / peripheralAnchors.length) * 0.45;
    const xSign = anchor[0] >= 0 ? 1 : -1;
    const x = THREE.MathUtils.clamp(
      anchor[0] + (Math.random() - 0.5) * 0.55 + xSign * ringBoost,
      -5.4,
      5.4
    );
    const y = THREE.MathUtils.clamp(
      anchor[1] + (Math.random() - 0.5) * 0.35,
      -1.1,
      2.2
    );
    const z = THREE.MathUtils.clamp(
      anchor[2] + (Math.random() - 0.5) * 0.5,
      -2.0,
      1.2
    );
    positions.push(new THREE.Vector3(x, y, z));
  }

  // 2. 30-step iterative repulsion relaxation pass
  for (let step = 0; step < 30; step++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const pA = positions[i];
        const pB = positions[j];
        const diff = pA.clone().sub(pB);
        const distXY = Math.hypot(diff.x, diff.y * 1.25);
        const dist3D = pA.distanceTo(pB);

        if (dist3D < minDistance || distXY < 1.95) {
          const pushDist = (minDistance - Math.max(0.01, dist3D)) * 0.5;
          const pushDir =
            diff.lengthSq() > 0.0001
              ? diff.normalize()
              : new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 0).normalize();

          pA.addScaledVector(pushDir, pushDist);
          pB.addScaledVector(pushDir, -pushDist);
        }
      }
    }

    // Keep peripheral frame bounds & push out of user's central face zone
    for (const p of positions) {
      if (Math.abs(p.x) < 1.9 && p.y > -0.65 && p.y < 1.65) {
        const side = p.x >= 0 ? 1 : -1;
        p.x = side * 1.95;
      }
      p.x = THREE.MathUtils.clamp(p.x, -5.4, 5.4);
      p.y = THREE.MathUtils.clamp(p.y, -1.1, 2.2);
      p.z = THREE.MathUtils.clamp(p.z, -2.0, 1.2);
    }
  }

  return positions;
}

// ─── Math Text Helper ─────────────────────────────────────────────────────────
function cleanMathText(str: string): string {
  if (!str || typeof str !== "string") return "";
  let s = str
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\\$/g, "")
    .replace(/\$/g, "");

  const replacements: [RegExp, string][] = [
    [/\\alpha\b/gi, "α"],
    [/\\beta\b/gi, "β"],
    [/\\gamma\b/gi, "γ"],
    [/\\theta\b/gi, "θ"],
    [/\\lambda\b/gi, "λ"],
    [/\\mu\b/gi, "μ"],
    [/\\sigma\b/gi, "σ"],
    [/\\nabla\b/gi, "∇"],
    [/\\delta\b/gi, "Δ"],
    [/\\partial\b/gi, "∂"],
    [/\\le(q)?\b/gi, "≤"],
    [/\\ge(q)?\b/gi, "≥"],
    [/\\times\b/gi, "×"],
    [/\\approx\b/gi, "≈"],
    [/\\neq\b/gi, "≠"],
    [/\\to\b/gi, "→"],
    [/\\in\b/gi, "∈"],
    [/\\infty\b/gi, "∞"],
    [/\\sqrt\{([^}]+)\}/gi, "√($1)"],
    [/\\frac\{([^}]+)\}\{([^}]+)\}/gi, "($1)/($2)"],
    [/\\cdot\b/gi, "·"],
    [/\\pm\b/gi, "±"],
  ];

  for (const [re, rep] of replacements) {
    s = s.replace(re, rep);
  }

  s = s.replace(/\\([a-zA-Z]+)/g, "$1");
  return s.trim();
}

// ─── Mastery Theme Colors ─────────────────────────────────────────────────────
function getMasteryTheme(mastery: number) {
  if (mastery >= 80) {
    return {
      hex: "#C6F432",
      threeColor: new THREE.Color("#C6F432"),
      intensity: 1.25,
      speed: 0.85,
      statusLabel: "Mastered",
    };
  }
  if (mastery >= 50) {
    return {
      hex: "#FBBF24",
      threeColor: new THREE.Color("#FBBF24"),
      intensity: 1.05,
      speed: 0.65,
      statusLabel: "Learning",
    };
  }
  if (mastery > 0) {
    return {
      hex: "#F87171",
      threeColor: new THREE.Color("#F87171"),
      intensity: 0.9,
      speed: 0.5,
      statusLabel: "Weak",
    };
  }
  return {
    hex: "#94A3B8",
    threeColor: new THREE.Color("#94A3B8"),
    intensity: 0.72,
    speed: 0.4,
    statusLabel: "New",
  };
}

// ─── Procedural Radial Sprite Glow Texture ────────────────────────────────────
function createGlowTexture(hexColor: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.25, hexColor);
    gradient.addColorStop(0.65, `${hexColor}33`);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

// ─── Custom GLSL Electric Filament Shader (Study Terrarium Craft) ──────────────
const ElectricShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      vec4 mvPosition = viewMatrix * worldPos;
      vViewDir = normalize(-mvPosition.xyz);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uIntensity;
    uniform float uSpeed;
    uniform float uCharge;
    uniform float uPulse;

    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPosition;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 x) {
      vec3 p = floor(x);
      vec3 w = fract(x);
      vec3 u = w * w * (3.0 - 2.0 * w);
      return mix(
        mix(mix(hash(p + vec3(0,0,0)), hash(p + vec3(1,0,0)), u.x),
            mix(hash(p + vec3(0,1,0)), hash(p + vec3(1,1,0)), u.x), u.y),
        mix(mix(hash(p + vec3(0,0,1)), hash(p + vec3(1,0,1)), u.x),
            mix(hash(p + vec3(0,1,1)), hash(p + vec3(1,1,1)), u.x), u.y), u.z);
    }

    void main() {
      float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.2);

      float t = uTime * uSpeed;
      vec3 p = vWorldPosition * 3.2;

      // Multi-octave electric streaks
      float n1 = noise(p + vec3(t * 0.7, -t * 0.5, t * 0.3));
      float n2 = noise(p * 2.1 - vec3(-t * 0.4, t * 0.8, -t * 0.6));
      float filament1 = smoothstep(0.48, 0.54, n1) * smoothstep(0.60, 0.54, n1);
      float filament2 = smoothstep(0.46, 0.52, n2) * smoothstep(0.58, 0.52, n2);
      float filament = (filament1 + filament2 * 0.8) * 4.0;

      // Pulse shockwave ripple on quiz success
      float ripple = sin((vWorldPosition.y + uTime * 3.5) * 8.0) * 0.5 + 0.5;
      float pulseAdd = uPulse * ripple * 2.2;

      float brightness = fresnel * (1.1 + filament * (1.0 + uCharge * 2.2)) * uIntensity + pulseAdd;

      vec3 whiteHot = vec3(1.0, 1.0, 1.0);
      vec3 finalColor = mix(uColor, whiteHot, clamp((brightness - 1.0) * 0.75, 0.0, 1.0));

      float alpha = clamp(brightness * (0.35 + fresnel * 0.65), 0.0, 0.95);
      gl_FragColor = vec4(finalColor * (1.0 + uCharge * 0.7), alpha);
    }
  `,
};

// ─── Web Audio API Spatial Synthesizer ────────────────────────────────────────
class ARPlasmaSynth {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor(muted: boolean = false) {
    this.muted = muted;
  }

  public setMuted(v: boolean) {
    this.muted = v;
  }

  private initCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playGrabHum() {
    if (this.muted) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.23);
    } catch {
      // Quiet fallback
    }
  }

  public playTossWhoosh() {
    if (this.muted) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.24);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch {
      // Quiet fallback
    }
  }

  public playCorrectChord() {
    if (this.muted) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.05);
        gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + i * 0.05 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.05 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.05);
        osc.stop(ctx.currentTime + i * 0.05 + 0.46);
      });
    } catch {
      // Quiet fallback
    }
  }

  public playWrong() {
    if (this.muted) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.21);
    } catch {
      // Quiet fallback
    }
  }

  public playHover(step = 0) {
    if (this.muted) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const notes = [440, 554.37, 659.25, 880];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(notes[step % notes.length], ctx.currentTime);
      gain.gain.setValueAtTime(0.035, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.11);
    } catch {
      // Quiet fallback
    }
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface ARBubbleSpaceProps {
  recall: Recall;
  synthMuted?: boolean;
  onToggleMute?: () => void;
  onForgeSynapse?: (
    sourceId: string,
    targetId: string,
    label: string,
    boostMastery?: boolean,
    data?: ForgedBridgePayload
  ) => void;
  onUpdateMastery?: (nodeId: string, newMastery: number) => void;
  nodes?: Concept[];
  activeConceptId?: string;
  deckTitle?: string;
}

interface ZeroGOrb {
  id: string;
  concept: Concept;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  plasmaMesh: THREE.Mesh;
  shaderMat: THREE.ShaderMaterial;
  sprite: THREE.Sprite;
  ringMesh: THREE.Line | THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  targetScale: number;
  isGrabbed: boolean;
  grabHand: "left" | "right" | "mouse" | null;
  grabStartPalmSize: number;
  grabStartZ: number;
}

interface HandData {
  wrist: { x: number; y: number };
  thumbTip: { x: number; y: number };
  indexTip: { x: number; y: number };
  middleTip: { x: number; y: number };
  chains: Array<Array<{ x: number; y: number }>>;
  isPinching: boolean;
  pinchCenter: { x: number; y: number };
  palmSize: number;
  fingerCount: number; // 0 to 4 extended
  isThumbExtended: boolean;
  isOpenPalm: boolean; // 5-finger rest palm (all 4 + thumb extended)
  isFourFingersTuckedThumb: boolean; // 4 fingers up, thumb tucked (Option D)
  isThreeFingers: boolean; // 3 fingers up, thumb tucked (Option C)
  isTwoFingers: boolean;   // 2 fingers up (Option B)
  isOneFinger: boolean;   // 1 finger up (Option A)
  isFist: boolean;        // 0 fingers up, thumb tucked (Toss Back)
  isThumbsUp: boolean;    // thumb pointing up, 4 fingers curled (Next Orb)
  visible: boolean;
}

interface TelemetryState {
  emoji: string;
  text: string;
  progress: number; // 0 to 1
  accentColor?: string;
}

interface NearestTarget {
  orb: ZeroGOrb;
  sx: number;
  sy: number;
  dist: number;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ARBubbleSpace({
  recall,
  synthMuted,
  onToggleMute,
  onUpdateMastery,
  nodes,
  deckTitle,
}: ARBubbleSpaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handCanvasRef = useRef<HTMLCanvasElement>(null);

  // Sound Engine
  const synthRef = useRef<ARPlasmaSynth>(new ARPlasmaSynth(synthMuted ?? false));
  useEffect(() => {
    synthRef.current.setMuted(synthMuted ?? false);
  }, [synthMuted]);

  // Concepts
  const allConcepts = useMemo(() => {
    if (nodes && nodes.length > 0) return nodes;
    if (recall.nodes && recall.nodes.length > 0) return recall.nodes;
    return [];
  }, [nodes, recall.nodes]);

  // Camera & pagination
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [pageIndex, setPageIndex] = useState(0);
  const totalPages = Math.max(1, Math.ceil(allConcepts.length / ORBS_PER_PAGE));

  const pageConcepts = useMemo(() => {
    const start = pageIndex * ORBS_PER_PAGE;
    return allConcepts.slice(start, start + ORBS_PER_PAGE);
  }, [allConcepts, pageIndex]);

  // Quiz Lens Active State
  const [activeQuizNode, setActiveQuizNode] = useState<Concept | null>(null);
  const [quizAnsweredIndex, setQuizAnsweredIndex] = useState<number | null>(null);
  const [quizAiLoading, setQuizAiLoading] = useState(false);
  const [quizCustomQuestion, setQuizCustomQuestion] = useState<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  } | null>(null);

  // Live Gesture charging feedback
  const [holdingFingerInfo, setHoldingFingerInfo] = useState<{ count: number; progress: number } | null>(null);
  const [dwellPodInfo, setDwellPodInfo] = useState<{ index: number; progress: number } | null>(null);
  const [openPalmProgress, setOpenPalmProgress] = useState<number>(0);
  const [thumbsUpProgress, setThumbsUpProgress] = useState<number>(0);
  const [fistProgress, setFistProgress] = useState<number>(0);

  // Live Top-Center Telemetry Pill
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    emoji: "🖐️",
    text: "Hand Tracking Ready",
    progress: 0,
  });

  // Strict 1800ms entry lockout ref
  const gestureUnlockAtRef = useRef(0);

  // Projected 2D screen positions of 3D orbs for HTML labels (CSS pixels, throttled)
  const [screenCoords, setScreenCoords] = useState<
    Array<{ id: string; title: string; x: number; y: number; z: number; mastery: number; visible: boolean }>
  >([]);
  const lastScreenCoordsUpdateRef = useRef<number>(0);

  // Three.js Scene References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbsMapRef = useRef<Map<string, ZeroGOrb>>(new Map());

  // Mouse Interaction Ref
  const mouseDragRef = useRef<{
    orbId: string;
    startTime: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    vel: THREE.Vector3;
  } | null>(null);

  // Latch locked orb for each pinching hand to prevent switching orbs mid-grab
  const grabbedOrbIdByHandRef = useRef<{ left: string | null; right: string | null }>({
    left: null,
    right: null,
  });

  // MediaPipe Hands Refs (mirrored CSS pixels)
  const handLeftRef = useRef<HandData>({
    wrist: { x: 0, y: 0 },
    thumbTip: { x: 0, y: 0 },
    indexTip: { x: 0, y: 0 },
    middleTip: { x: 0, y: 0 },
    chains: [],
    isPinching: false,
    pinchCenter: { x: 0, y: 0 },
    palmSize: 0.18,
    fingerCount: 0,
    isThumbExtended: false,
    isOpenPalm: false,
    isFourFingersTuckedThumb: false,
    isThreeFingers: false,
    isTwoFingers: false,
    isOneFinger: false,
    isFist: false,
    isThumbsUp: false,
    visible: false,
  });

  const handRightRef = useRef<HandData>({
    wrist: { x: 0, y: 0 },
    thumbTip: { x: 0, y: 0 },
    indexTip: { x: 0, y: 0 },
    middleTip: { x: 0, y: 0 },
    chains: [],
    isPinching: false,
    pinchCenter: { x: 0, y: 0 },
    palmSize: 0.18,
    fingerCount: 0,
    isThumbExtended: false,
    isOpenPalm: false,
    isFourFingersTuckedThumb: false,
    isThreeFingers: false,
    isTwoFingers: false,
    isOneFinger: false,
    isFist: false,
    isThumbsUp: false,
    visible: false,
  });

  // MediaPipe Instances & Monotonic Timestamp Ref
  const handLandmarkerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  // Gesture Hold, Cooldown & Async Sequence Guards
  const pinchStartRef = useRef<{ [key: string]: { time: number; x: number; y: number } }>({});
  const fistHoldStartRef = useRef<number | null>(null);
  const thumbsUpHoldStartRef = useRef<number | null>(null);
  const openPalmHoldStartRef = useRef<number | null>(null);
  const fingerHoldStartRef = useRef<{ count: number; startTime: number } | null>(null);
  const podDwellStartRef = useRef<{ index: number; startTime: number } | null>(null);
  const btnDwellStartRef = useRef<{ action: string; startTime: number } | null>(null);
  const quizFetchSeqRef = useRef<number>(0);
  const isQuizOpenRef = useRef<boolean>(false);
  const isGeneratingQuizRef = useRef<boolean>(false);
  const grabUnlockAtRef = useRef<number>(0);

  useEffect(() => {
    isQuizOpenRef.current = activeQuizNode !== null;
  }, [activeQuizNode]);

  // ── Open Morphing Quiz Lens ─────────────────────────────────────────────────
  const handleOpenQuiz = useCallback((concept: Concept) => {
    quizFetchSeqRef.current++;
    isQuizOpenRef.current = true;
    isGeneratingQuizRef.current = false;
    setQuizAiLoading(false);
    setActiveQuizNode(concept);
    setQuizAnsweredIndex(null);
    setQuizCustomQuestion(null);
    setHoldingFingerInfo(null);
    setDwellPodInfo(null);
    setOpenPalmProgress(0);
    setThumbsUpProgress(0);
    setFistProgress(0);
    synthRef.current.playHover(0);
    gestureUnlockAtRef.current = performance.now() + ENTRY_LOCKOUT_MS;
  }, []);

  // ── Close / Toss Back Quiz ──────────────────────────────────────────────────
  const handleCloseQuiz = useCallback((impulse: boolean = false) => {
    quizFetchSeqRef.current++; // Cancel any in-flight AI question fetch
    isQuizOpenRef.current = false;
    isGeneratingQuizRef.current = false;
    setQuizAiLoading(false);

    if (activeQuizNode) {
      const orb = orbsMapRef.current.get(activeQuizNode.id);
      if (orb && impulse) {
        orb.vel.set((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.1, -0.12);
        synthRef.current.playTossWhoosh();
      }
    }

    // Clear all grabs & start 1000ms cooldown so releasing a closed fist never re-grabs
    grabbedOrbIdByHandRef.current = { left: null, right: null };
    pinchStartRef.current = {};
    orbsMapRef.current.forEach((o) => {
      o.isGrabbed = false;
      o.grabHand = null;
    });
    grabUnlockAtRef.current = performance.now() + 1000;

    setActiveQuizNode(null);
    setQuizAnsweredIndex(null);
    setQuizCustomQuestion(null);
    setHoldingFingerInfo(null);
    setDwellPodInfo(null);
    setOpenPalmProgress(0);
    setThumbsUpProgress(0);
    setFistProgress(0);
    fistHoldStartRef.current = null;
    thumbsUpHoldStartRef.current = null;
    openPalmHoldStartRef.current = null;
    fingerHoldStartRef.current = null;
    podDwellStartRef.current = null;
    btnDwellStartRef.current = null;
    gestureUnlockAtRef.current = performance.now() + 500;
  }, [activeQuizNode]);

  // ── Grade Selected Quiz Option (Strict Single-Attempt Lock) ─────────────────
  const handleSelectQuizOption = useCallback(
    (chosenIndex: number) => {
      if (isGeneratingQuizRef.current || quizAnsweredIndex !== null || !activeQuizNode) return;
      if (performance.now() < gestureUnlockAtRef.current) return;

      const q = quizCustomQuestion || activeQuizNode.quiz;
      const correctIdx = q?.correctIndex ?? 0;
      const isCorrect = chosenIndex === correctIdx;

      setQuizAnsweredIndex(chosenIndex);

      const orb = orbsMapRef.current.get(activeQuizNode.id);
      if (orb) {
        orb.shaderMat.uniforms.uPulse.value = isCorrect ? 1.0 : 0.35;
      }

      if (isCorrect) {
        synthRef.current.playCorrectChord();
        const currentMastery = activeQuizNode.retention || 0;
        const newMastery = Math.min(100, currentMastery + 18);
        if (onUpdateMastery) {
          onUpdateMastery(activeQuizNode.id, newMastery);
        }
      } else {
        synthRef.current.playWrong();
      }
    },
    [activeQuizNode, quizAnsweredIndex, quizCustomQuestion, onUpdateMastery]
  );

  // ── Next AI Question in Lens (Sequence-Guarded Against Zombie Re-Open) ───────
  const handleFetchNextAiQuestion = useCallback(async () => {
    if (!activeQuizNode || isGeneratingQuizRef.current) return;
    const targetNode = activeQuizNode;
    const seq = ++quizFetchSeqRef.current;

    isGeneratingQuizRef.current = true;
    setQuizAiLoading(true);
    // Keep quizAnsweredIndex frozen until the new question arrives so gestures stay safely blocked
    setHoldingFingerInfo(null);
    setDwellPodInfo(null);
    setOpenPalmProgress(0);
    setThumbsUpProgress(0);
    setFistProgress(0);
    openPalmHoldStartRef.current = null;
    thumbsUpHoldStartRef.current = null;
    fistHoldStartRef.current = null;
    fingerHoldStartRef.current = null;
    podDwellStartRef.current = null;
    btnDwellStartRef.current = null;

    try {
      const prevQ = targetNode.quiz?.question ? [targetNode.quiz.question] : [];
      if (quizCustomQuestion?.question) prevQ.push(quizCustomQuestion.question);

      const res = await fetch("/api/terrarium-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "quiz",
          concept: {
            title: targetNode.title,
            summary: targetNode.summary,
          },
          previousQuestions: prevQ,
          deckTitle: deckTitle || "Zero-G Spatial Lab",
        }),
      });

      // Stale response check before parsing JSON
      if (seq !== quizFetchSeqRef.current || !isQuizOpenRef.current) return;

      if (res.ok) {
        const data = await res.json();
        // Re-check after awaiting JSON body in case user tossed back or switched orbs
        if (seq !== quizFetchSeqRef.current || !isQuizOpenRef.current) return;

        if (data.question && Array.isArray(data.options)) {
          setQuizCustomQuestion(data);
          setQuizAnsweredIndex(null);
          isGeneratingQuizRef.current = false;
          setQuizAiLoading(false);
          gestureUnlockAtRef.current = performance.now() + ENTRY_LOCKOUT_MS;
          synthRef.current.playHover(2);
          const orb = orbsMapRef.current.get(targetNode.id);
          if (orb) orb.shaderMat.uniforms.uPulse.value = 0.8;
          return;
        }
      }

      if (seq === quizFetchSeqRef.current && isQuizOpenRef.current) {
        isGeneratingQuizRef.current = false;
        setQuizAiLoading(false);
      }
    } catch {
      if (seq === quizFetchSeqRef.current && isQuizOpenRef.current) {
        isGeneratingQuizRef.current = false;
        setQuizAiLoading(false);
      }
    }
  }, [activeQuizNode, quizCustomQuestion, deckTitle]);

  // ── Advance to Next Concept in Lens ─────────────────────────────────────────
  const handleNextOrbInLens = useCallback(() => {
    if (!activeQuizNode || allConcepts.length === 0) return;
    const currentIdx = allConcepts.findIndex((c) => c.id === activeQuizNode.id);
    const nextConcept = allConcepts[(currentIdx + 1) % allConcepts.length];
    if (nextConcept) {
      handleOpenQuiz(nextConcept);
    }
  }, [activeQuizNode, allConcepts, handleOpenQuiz]);

  // ── Gather / Summon All Orbs (Stratified Repulsion Scatter) ─────────────────
  const handleGatherOrbs = useCallback(() => {
    synthRef.current.playTossWhoosh();
    const orbs = Array.from(orbsMapRef.current.values());
    const scattered = calculateScatteredPositions(orbs.length);
    orbs.forEach((orb, i) => {
      const target = scattered[i] || new THREE.Vector3(0, 0, 0);
      orb.vel.set(
        (target.x - orb.pos.x) * 0.14,
        (target.y - orb.pos.y) * 0.14,
        (target.z - orb.pos.z) * 0.14
      );
    });
  }, []);

  // ── Camera & MediaPipe Initializer (Safe Timestamp Guard) ──────────────────
  const startCamera = useCallback(async () => {
    setCameraLoading(true);
    setCameraError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Webcam access not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);

      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });

      lastTsRef.current = 0;
      setCameraActive(true);
    } catch {
      setCameraError("Camera unavailable. Full mouse and keyboard controls active.");
      setCameraActive(false);
    } finally {
      setCameraLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (handLandmarkerRef.current) {
      handLandmarkerRef.current.close?.();
      handLandmarkerRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // ── Initialize Transparent Three.js Viewport ────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = null; // Strictly transparent for live webcam pass-through
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.display = "block";
    renderer.setClearColor(0x000000, 0); // Clear alpha is 0
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Atmospheric Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const p1 = new THREE.PointLight(0xc6f432, 1.2, 40);
    p1.position.set(6, 6, 12);
    scene.add(p1);
    const p2 = new THREE.PointLight(0x38bdf8, 0.9, 40);
    p2.position.set(-6, -6, 10);
    scene.add(p2);

    // Spatial Dust Motes
    const dustCount = 80;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount * 3; i += 3) {
      dustPos[i] = (Math.random() - 0.5) * 12;
      dustPos[i + 1] = (Math.random() - 0.5) * 6;
      dustPos[i + 2] = -3.5 + Math.random() * 5.0;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 0.055,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    scene.add(dustPoints);

    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const r = container.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      dustGeo.dispose();
      dustMat.dispose();
      renderer.dispose();
      container.innerHTML = "";
    };
  }, []);

  // ── Populate Scattered 3D Zero-G Orbs (Stratified Repulsion) ─────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clean previous
    orbsMapRef.current.forEach((obj) => {
      scene.remove(obj.group);
      obj.coreMesh.geometry.dispose();
      (obj.coreMesh.material as THREE.Material).dispose();
      obj.plasmaMesh.geometry.dispose();
      obj.shaderMat.dispose();
      obj.ringMesh.geometry.dispose();
      (obj.ringMesh.material as THREE.Material).dispose();
      obj.sprite.material.dispose();
    });
    orbsMapRef.current.clear();

    const orbRadius = 0.54;
    const sphereGeo = new THREE.SphereGeometry(orbRadius * 1.15, 32, 32);
    const coreGeo = new THREE.SphereGeometry(orbRadius * 0.92, 24, 24);

    // Calculate wide clean positions with at least 2.3 units separation
    const initialPositions = calculateScatteredPositions(pageConcepts.length);

    pageConcepts.forEach((c, idx) => {
      const mastery = c.retention || 0;
      const theme = getMasteryTheme(mastery);
      const pos = initialPositions[idx] || new THREE.Vector3(0, 0, 0);

      const group = new THREE.Group();
      group.position.copy(pos);

      // Core: deeper obsidian glass core (Study Terrarium aesthetic)
      const coreMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#0C0C10"),
        roughness: 0.15,
        metalness: 0.2,
        clearcoat: 0.95,
        clearcoatRoughness: 0.1,
        emissive: theme.threeColor,
        emissiveIntensity: 0.18,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      group.add(coreMesh);

      // Custom GLSL Plasma Shell
      const shaderMat = new THREE.ShaderMaterial({
        vertexShader: ElectricShader.vertexShader,
        fragmentShader: ElectricShader.fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: theme.threeColor },
          uIntensity: { value: theme.intensity },
          uSpeed: { value: theme.speed },
          uCharge: { value: 0 },
          uPulse: { value: 0 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const plasmaMesh = new THREE.Mesh(sphereGeo, shaderMat);
      plasmaMesh.userData = { orbId: c.id, concept: c };
      group.add(plasmaMesh);

      // Radial Bloom
      const glowTex = createGlowTexture(theme.hex);
      const spriteMat = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.65,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(orbRadius * 3.4, orbRadius * 3.4, 1);
      group.add(sprite);

      // Thin 3D Orbital Mastery Ring
      const ringRadius = orbRadius * 1.36;
      const ringGeo = new THREE.BufferGeometry();
      const ringSegs = 48;
      const ringPositions = new Float32Array((ringSegs + 1) * 3);
      const arcFraction = Math.max(0.08, mastery / 100);
      const maxAngle = arcFraction * Math.PI * 2;
      for (let i = 0; i <= ringSegs; i++) {
        const theta = (i / ringSegs) * maxAngle;
        ringPositions[i * 3] = Math.cos(theta) * ringRadius;
        ringPositions[i * 3 + 1] = Math.sin(theta) * ringRadius;
        ringPositions[i * 3 + 2] = 0;
      }
      ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3));
      const ringMat = new THREE.LineBasicMaterial({
        color: theme.threeColor,
        transparent: true,
        opacity: 0.85,
        linewidth: 2,
      });
      const ringMesh = new THREE.Line(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 4;
      group.add(ringMesh);

      scene.add(group);

      orbsMapRef.current.set(c.id, {
        id: c.id,
        concept: c,
        group,
        coreMesh,
        plasmaMesh,
        shaderMat,
        sprite,
        ringMesh,
        pos,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.015,
          (Math.random() - 0.5) * 0.015,
          (Math.random() - 0.5) * 0.015
        ),
        targetScale: 1.0,
        isGrabbed: false,
        grabHand: null,
        grabStartPalmSize: 0.18,
        grabStartZ: pos.z,
      });
    });
  }, [pageConcepts]);

  // ── Main Zero-G Physics, MediaPipe & Render Loop ─────────────────────────────
  useEffect(() => {
    let animId: number;
    let prevLoopTime = performance.now();
    const loopStartTime = prevLoopTime;

    function renderLoop() {
      const now = performance.now();
      const deltaSec = Math.min(0.1, (now - prevLoopTime) / 1000);
      prevLoopTime = now;
      const timeSec = (now - loopStartTime) / 1000;

      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const handCanvas = handCanvasRef.current;
      const handCtx = handCanvas?.getContext("2d");

      if (renderer && scene && camera) {
        // Pure 1:1 CSS Pixels from the overlay canvas / container (NEVER multiply by DPR)
        const rect = containerRef.current
          ? containerRef.current.getBoundingClientRect()
          : { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
        const cssW = (handCanvas ? handCanvas.clientWidth : 0) || rect.width || window.innerWidth;
        const cssH = (handCanvas ? handCanvas.clientHeight : 0) || rect.height || window.innerHeight;

        // Keep WebGL renderer CSS layout and camera aspect locked 1:1 with cssW x cssH
        if (
          Math.abs(renderer.domElement.clientWidth - cssW) > 1 ||
          Math.abs(renderer.domElement.clientHeight - cssH) > 1
        ) {
          camera.aspect = cssW / Math.max(1, cssH);
          camera.updateProjectionMatrix();
          renderer.setSize(cssW, cssH);
        }

        // ── 1. Process MediaPipe Hand Tracking (Mirrored CSS Pixels) ───────────
        if (
          cameraActive &&
          videoRef.current &&
          handLandmarkerRef.current &&
          videoRef.current.readyState >= 2 &&
          videoRef.current.videoWidth > 0 &&
          videoRef.current.videoHeight > 0 &&
          !videoRef.current.paused &&
          !videoRef.current.ended
        ) {
          const safeTs = Math.max(lastTsRef.current + 1, Math.floor(performance.now()));
          lastTsRef.current = safeTs;

          try {
            const results = handLandmarkerRef.current.detectForVideo(videoRef.current, safeTs);
            const hands = results.landmarks || [];

            handLeftRef.current.visible = false;
            handRightRef.current.visible = false;

            // Account for <video> object-fit: cover Aspect-Ratio Cropping
            const video = videoRef.current;
            const vW = video.videoWidth || cssW;
            const vH = video.videoHeight || cssH;
            const videoAspect = vW / Math.max(1, vH);
            const viewAspect = cssW / Math.max(1, cssH);
            let renderW = cssW,
              renderH = cssH,
              offsetX = 0,
              offsetY = 0;
            if (videoAspect > viewAspect) {
              renderH = cssH;
              renderW = cssH * videoAspect;
              offsetX = (renderW - cssW) / 2;
            } else {
              renderW = cssW;
              renderH = cssW / videoAspect;
              offsetY = (renderH - cssH) / 2;
            }

            // Convert normalized landmark [0, 1] to mirrored CSS pixel coordinate
            const toScreenPx = (normX: number, normY: number) => ({
              x: (1 - normX) * renderW - offsetX,
              y: normY * renderH - offsetY,
            });

            hands.forEach((lms: any[], hIdx: number) => {
              const handedness =
                results.handednesses?.[hIdx]?.[0]?.categoryName || (hIdx === 0 ? "Left" : "Right");
              const cursor = handedness === "Left" ? handLeftRef.current : handRightRef.current;

              // Convert landmarks strictly into CSS pixels
              const wrist = toScreenPx(lms[LM_WRIST].x, lms[LM_WRIST].y);
              const thumbTip = toScreenPx(lms[LM_THUMB_TIP].x, lms[LM_THUMB_TIP].y);
              const indexTip = toScreenPx(lms[LM_INDEX_TIP].x, lms[LM_INDEX_TIP].y);
              const middleTip = toScreenPx(lms[LM_MIDDLE_TIP].x, lms[LM_MIDDLE_TIP].y);

              // Skeleton chains in CSS pixels
              const chains = HAND_CHAINS.map((chain) =>
                chain.map((idx) => toScreenPx(lms[idx].x, lms[idx].y))
              );

              // Pinch calculation (both normalized aspect-corrected and pixel threshold)
              const pinchDistPx = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
              const dx = (lms[LM_INDEX_TIP].x - lms[LM_THUMB_TIP].x) * videoAspect;
              const dy = lms[LM_INDEX_TIP].y - lms[LM_THUMB_TIP].y;
              const isPinching = Math.hypot(dx, dy) < PINCH_DIST_THRESHOLD || pinchDistPx < 44;

              // Palm size in screen space
              const rawPalmSize = Math.hypot(
                lms[LM_MIDDLE_MCP].x - lms[LM_WRIST].x,
                lms[LM_MIDDLE_MCP].y - lms[LM_WRIST].y
              );
              cursor.palmSize = cursor.palmSize * 0.8 + rawPalmSize * 0.2;

              // ── Accurate Landmark Gesture Classifier ───────────────────────
              const indexExtended = lms[LM_INDEX_TIP].y < lms[LM_INDEX_PIP].y - 0.025;
              const middleExtended = lms[LM_MIDDLE_TIP].y < lms[LM_MIDDLE_PIP].y - 0.025;
              const ringExtended = lms[LM_RING_TIP].y < lms[LM_RING_PIP].y - 0.025;
              const pinkyExtended = lms[LM_PINKY_TIP].y < lms[LM_PINKY_PIP].y - 0.025;

              const fourCount =
                (indexExtended ? 1 : 0) +
                (middleExtended ? 1 : 0) +
                (ringExtended ? 1 : 0) +
                (pinkyExtended ? 1 : 0);

              // Palm width and thumb extension metrics
              const palmWidth = Math.hypot(lms[5].x - lms[17].x, lms[5].y - lms[17].y);
              const dTip = Math.hypot(lms[4].x - lms[17].x, lms[4].y - lms[17].y);
              const dIndex = Math.hypot(lms[4].x - lms[5].x, lms[4].y - lms[5].y);

              const thumbOut = dTip > palmWidth * 1.15 || dIndex > palmWidth * 0.45;
              const thumbTucked = !thumbOut && dTip < palmWidth * 0.98;

              // Thumbs Up
              const isThumbsUp =
                fourCount === 0 &&
                lms[LM_THUMB_TIP].y < lms[LM_THUMB_IP].y - 0.025 &&
                lms[LM_THUMB_IP].y < lms[LM_THUMB_MCP].y &&
                lms[LM_THUMB_TIP].y < lms[LM_INDEX_MCP].y - 0.035;

              // Fist
              const isFist = fourCount === 0 && !isThumbsUp && !thumbOut;

              // 5-Finger Open Palm (Rest)
              const isOpenPalm = fourCount === 4 && thumbOut && !isPinching;

              // 4 Fingers (Thumb Tucked - Option D)
              const isFourFingersTuckedThumb = fourCount === 4 && thumbTucked && !isPinching;

              // 3 Fingers (Option C)
              const isThreeFingers = fourCount === 3 && !thumbOut && !isPinching;

              // 2 Fingers (Option B)
              const isTwoFingers =
                fourCount === 2 &&
                indexExtended &&
                middleExtended &&
                !ringExtended &&
                !pinkyExtended &&
                !isPinching;

              // 1 Finger (Option A)
              const isOneFinger =
                fourCount === 1 &&
                indexExtended &&
                !middleExtended &&
                !ringExtended &&
                !pinkyExtended &&
                !isPinching;

              const pinchCenterX = (thumbTip.x + indexTip.x) / 2;
              const pinchCenterY = (thumbTip.y + indexTip.y) / 2;

              cursor.wrist = wrist;
              cursor.thumbTip = thumbTip;
              cursor.indexTip = indexTip;
              cursor.middleTip = middleTip;
              cursor.chains = chains;
              cursor.isPinching = isPinching;
              cursor.pinchCenter = { x: pinchCenterX, y: pinchCenterY };
              cursor.fingerCount = fourCount;
              cursor.isThumbExtended = thumbOut;
              cursor.isOpenPalm = isOpenPalm;
              cursor.isFourFingersTuckedThumb = isFourFingersTuckedThumb;
              cursor.isThreeFingers = isThreeFingers;
              cursor.isTwoFingers = isTwoFingers;
              cursor.isOneFinger = isOneFinger;
              cursor.isFist = isFist;
              cursor.isThumbsUp = isThumbsUp;
              cursor.visible = true;
            });
          } catch {
            // Quiet fallback
          }
        }

        // ── 2. Screen-Space Targeting for Orbs (CSS Pixels) ───────────────────
        const orbs = Array.from(orbsMapRef.current.values());
        const isQuizOpen = activeQuizNode !== null;

        let nearestOrbToHand: NearestTarget | null = null;
        const activeHands = [handLeftRef.current, handRightRef.current].filter((h) => h.visible);

        if (!isQuizOpen && now >= grabUnlockAtRef.current && activeHands.length > 0) {
          const h = activeHands[0];
          for (const orb of orbs) {
            const proj = orb.pos.clone().project(camera);
            if (proj.z < 1.0) {
              const sx = (proj.x * 0.5 + 0.5) * cssW;
              const sy = (-proj.y * 0.5 + 0.5) * cssH;
              if (Number.isFinite(sx) && Number.isFinite(sy)) {
                const dist = Math.hypot(sx - h.pinchCenter.x, sy - h.pinchCenter.y);
                if (dist < 85) {
                  const currentBest = nearestOrbToHand as NearestTarget | null;
                  if (
                    !currentBest ||
                    dist < currentBest.dist ||
                    (Math.abs(dist - currentBest.dist) < 10 && orb.pos.z > currentBest.orb.pos.z)
                  ) {
                    nearestOrbToHand = { orb, sx, sy, dist };
                  }
                }
              }
            }
          }
        }

        // ── 3. Draw 2D Hand Skeleton, Lock-on Bracket & Energy Tether (Pure 1:1 CSS Pixels) ──
        if (handCanvas && handCtx) {
          const targetW = Math.round(cssW);
          const targetH = Math.round(cssH);
          if (handCanvas.width !== targetW || handCanvas.height !== targetH) {
            handCanvas.width = targetW;
            handCanvas.height = targetH;
          }
          handCtx.save();
          handCtx.setTransform(1, 0, 0, 1, 0, 0);
          handCtx.clearRect(0, 0, cssW, cssH);

          // Draw Lock-On Bracket tightly centered around hovered orb (CSS pixels)
          if (nearestOrbToHand && !activeHands[0]?.isPinching && !nearestOrbToHand.orb.isGrabbed) {
            const { sx, sy } = nearestOrbToHand;
            handCtx.save();
            handCtx.strokeStyle = "#C6F432";
            handCtx.lineWidth = 2.0;
            handCtx.shadowBlur = 12;
            handCtx.shadowColor = "#C6F432";

            const s = 24;
            const l = 9;
            // TL
            handCtx.beginPath();
            handCtx.moveTo(sx - s, sy - s + l);
            handCtx.lineTo(sx - s, sy - s);
            handCtx.lineTo(sx - s + l, sy - s);
            handCtx.stroke();
            // TR
            handCtx.beginPath();
            handCtx.moveTo(sx + s - l, sy - s);
            handCtx.lineTo(sx + s, sy - s);
            handCtx.lineTo(sx + s, sy - s + l);
            handCtx.stroke();
            // BL
            handCtx.beginPath();
            handCtx.moveTo(sx - s, sy + s - l);
            handCtx.lineTo(sx - s, sy + s);
            handCtx.lineTo(sx - s + l, sy + s);
            handCtx.stroke();
            // BR
            handCtx.beginPath();
            handCtx.moveTo(sx + s - l, sy + s);
            handCtx.lineTo(sx + s, sy + s);
            handCtx.lineTo(sx + s, sy + s - l);
            handCtx.stroke();

            // Pinch Tag Badge
            handCtx.shadowBlur = 0;
            handCtx.fillStyle = "rgba(15, 15, 18, 0.88)";
            handCtx.fillRect(sx - 36, sy + s + 6, 72, 18);
            handCtx.strokeStyle = "rgba(198, 244, 50, 0.4)";
            handCtx.strokeRect(sx - 36, sy + s + 6, 72, 18);
            handCtx.fillStyle = "#C6F432";
            handCtx.font = "bold 9.5px monospace";
            handCtx.textAlign = "center";
            handCtx.fillText("🤏 PINCH", sx, sy + s + 19);
            handCtx.restore();
          }

          // Draw Glowing Energy Tether Line and Depth Meter on Grabbed Orb: FAR ──●── QUIZ
          orbs.forEach((orb) => {
            if (orb.isGrabbed && orb.grabHand !== "mouse") {
              const proj = orb.pos.clone().project(camera);
              if (proj.z < 1.0) {
                const sx = (proj.x * 0.5 + 0.5) * cssW;
                const sy = (-proj.y * 0.5 + 0.5) * cssH;
                if (Number.isFinite(sx) && Number.isFinite(sy)) {
                  const grabbingHand =
                    orb.grabHand === "left"
                      ? handLeftRef.current
                      : orb.grabHand === "right"
                      ? handRightRef.current
                      : null;

                  handCtx.save();

                  // 1. Glowing energy tether line connecting hand pinch center to orb center
                  if (grabbingHand && grabbingHand.visible) {
                    handCtx.strokeStyle = "rgba(198, 244, 50, 0.75)";
                    handCtx.lineWidth = 2.0;
                    handCtx.shadowBlur = 10;
                    handCtx.shadowColor = "#C6F432";
                    handCtx.beginPath();
                    handCtx.moveTo(grabbingHand.pinchCenter.x, grabbingHand.pinchCenter.y);
                    handCtx.lineTo(sx, sy);
                    handCtx.stroke();
                    handCtx.shadowBlur = 0;
                  }

                  // 2. Position FAR ──●── QUIZ meter directly under (sx, sy)
                  const meterY = sy + 44;
                  const isInspect = orb.pos.z >= 1.0;

                  // Meter track
                  handCtx.strokeStyle = "rgba(255, 255, 255, 0.22)";
                  handCtx.lineWidth = 2.0;
                  handCtx.beginPath();
                  handCtx.moveTo(sx - 52, meterY);
                  handCtx.lineTo(sx + 52, meterY);
                  handCtx.stroke();

                  // Normalized Z position (range -2.4 to 1.1)
                  const zNorm = THREE.MathUtils.clamp((orb.pos.z - (-2.4)) / (1.1 - (-2.4)), 0, 1);
                  const dotX = sx - 52 + zNorm * 104;

                  handCtx.fillStyle = isInspect ? "#C6F432" : "#FAFAFA";
                  if (isInspect) {
                    handCtx.shadowBlur = 10;
                    handCtx.shadowColor = "#C6F432";
                  }
                  handCtx.beginPath();
                  handCtx.arc(dotX, meterY, isInspect ? 5 : 3.5, 0, Math.PI * 2);
                  handCtx.fill();
                  handCtx.shadowBlur = 0;

                  handCtx.font = "bold 8.5px monospace";
                  handCtx.fillStyle = "rgba(255, 255, 255, 0.45)";
                  handCtx.textAlign = "right";
                  handCtx.fillText("FAR", sx - 58, meterY + 3);
                  handCtx.fillStyle = isInspect ? "#C6F432" : "rgba(255, 255, 255, 0.45)";
                  handCtx.textAlign = "left";
                  handCtx.fillText("QUIZ 🔍", sx + 58, meterY + 3);

                  handCtx.restore();
                }
              }
            }
          });

          // Draw Hand Skeletons 1:1 in CSS Pixels
          [handLeftRef.current, handRightRef.current].forEach((h, hIdx) => {
            if (!h.visible) return;
            const jointColor = hIdx === 0 ? "#38BDF8" : "#C6F432";

            handCtx.strokeStyle = "rgba(255, 255, 255, 0.28)";
            handCtx.lineWidth = 1.5;
            h.chains.forEach((chain) => {
              handCtx.beginPath();
              chain.forEach((pt, i) => {
                if (i === 0) handCtx.moveTo(pt.x, pt.y);
                else handCtx.lineTo(pt.x, pt.y);
              });
              handCtx.stroke();
            });

            [h.thumbTip, h.indexTip, h.middleTip].forEach((pt) => {
              handCtx.beginPath();
              handCtx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
              handCtx.fillStyle = jointColor;
              handCtx.shadowBlur = 10;
              handCtx.shadowColor = jointColor;
              handCtx.fill();
              handCtx.shadowBlur = 0;
            });

            if (h.isPinching) {
              handCtx.beginPath();
              handCtx.arc(h.pinchCenter.x, h.pinchCenter.y, 14, 0, Math.PI * 2);
              handCtx.strokeStyle = "#FFFFFF";
              handCtx.lineWidth = 2.5;
              handCtx.shadowBlur = 16;
              handCtx.shadowColor = jointColor;
              handCtx.stroke();
              handCtx.shadowBlur = 0;
            }
          });

          handCtx.restore();
        }

        // ── 4. Zero-G Physics Simulation & Exact 1:1 Frustum Hand Drag ─────────
        orbs.forEach((orb, orbIdx) => {
          orb.shaderMat.uniforms.uTime.value = timeSec;
          orb.shaderMat.uniforms.uPulse.value *= 0.92;

          const isSelected = activeQuizNode?.id === orb.id;

          if (isSelected) {
            orb.pos.lerp(new THREE.Vector3(0, 2.05, 1.6), 0.12);
            orb.targetScale = 1.12;
            (orb.shaderMat as THREE.ShaderMaterial).opacity = 1.0;
            orb.sprite.material.opacity = 0.65;
          } else if (isQuizOpen) {
            // Push radially outward toward screen perimeter (x to ±5.5, z to -4.2)
            const targetX = orb.pos.x >= 0 ? 5.5 : -5.5;
            orb.pos.x = THREE.MathUtils.lerp(orb.pos.x, targetX, 0.06);
            orb.pos.z = THREE.MathUtils.lerp(orb.pos.z, -4.2, 0.06);
            orb.vel.multiplyScalar(0.9);
            orb.targetScale = 0.48;
            (orb.shaderMat as THREE.ShaderMaterial).opacity = THREE.MathUtils.lerp(
              (orb.shaderMat as THREE.ShaderMaterial).opacity ?? 1.0,
              0.15,
              0.08
            );
            orb.sprite.material.opacity = THREE.MathUtils.lerp(
              orb.sprite.material.opacity,
              0.10,
              0.08
            );
          } else {
            orb.targetScale = 1.0;
            (orb.shaderMat as THREE.ShaderMaterial).opacity = 1.0;
            orb.sprite.material.opacity = 0.65;

            const checkHands: Array<{ hand: HandData; name: "left" | "right" }> = [
              { hand: handLeftRef.current, name: "left" },
              { hand: handRightRef.current, name: "right" },
            ];

            let isGrabbedThisFrame = false;

            checkHands.forEach(({ hand, name }) => {
              if (!hand.visible) return;

              const proj = orb.pos.clone().project(camera);
              if (proj.z >= 1.0) return;
              const sx = (proj.x * 0.5 + 0.5) * cssW;
              const sy = (-proj.y * 0.5 + 0.5) * cssH;
              if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

              const distToPinch = Math.hypot(sx - hand.pinchCenter.x, sy - hand.pinchCenter.y);
              const isTargeted = nearestOrbToHand?.orb.id === orb.id;

              // Hover charge highlight
              if (isTargeted && !orb.isGrabbed) {
                orb.shaderMat.uniforms.uCharge.value = THREE.MathUtils.lerp(
                  orb.shaderMat.uniforms.uCharge.value,
                  0.85,
                  0.25
                );
              } else if (!orb.isGrabbed) {
                orb.shaderMat.uniforms.uCharge.value = THREE.MathUtils.lerp(
                  orb.shaderMat.uniforms.uCharge.value,
                  0.0,
                  0.1
                );
              }

              // Lock grabbedOrbId strictly to hovered orb at pinch start (respecting Toss Back cooldown)
              if (hand.isPinching) {
                if (grabbedOrbIdByHandRef.current[name] === null && now >= grabUnlockAtRef.current) {
                  if (isTargeted && distToPinch < 85 && !orb.isGrabbed) {
                    grabbedOrbIdByHandRef.current[name] = orb.id;
                    orb.isGrabbed = true;
                    orb.grabHand = name;
                    orb.grabStartPalmSize = hand.palmSize;
                    orb.grabStartZ = orb.pos.z;
                    synthRef.current.playGrabHum();
                    pinchStartRef.current[orb.id] = {
                      time: now,
                      x: hand.pinchCenter.x,
                      y: hand.pinchCenter.y,
                    };
                  }
                }

                if (grabbedOrbIdByHandRef.current[name] === orb.id && orb.isGrabbed) {
                  isGrabbedThisFrame = true;

                  // 1. Z-Depth Mapping from Palm Size Scale with AMPLIFIED sensitivity (* 18.0)
                  const scaleRatio = hand.palmSize / Math.max(0.08, orb.grabStartPalmSize);
                  const targetZ = THREE.MathUtils.clamp(
                    orb.grabStartZ + (scaleRatio - 1.0) * 18.0,
                    -2.4,
                    1.4
                  );

                  // 2. Exact 1:1 Frustum Screen-to-World Mapping
                  const nx = hand.pinchCenter.x / cssW;
                  const ny = hand.pinchCenter.y / cssH;
                  const camDist = Math.max(2, camera.position.z - orb.pos.z);
                  const visibleH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camDist;
                  const visibleW = visibleH * (cssW / cssH);
                  const targetX = (nx - 0.5) * visibleW;
                  const targetY = (0.5 - ny) * visibleH;

                  const prevPos = orb.pos.clone();
                  orb.pos.x = THREE.MathUtils.lerp(orb.pos.x, targetX, 0.45);
                  orb.pos.y = THREE.MathUtils.lerp(orb.pos.y, targetY, 0.45);
                  orb.pos.z = THREE.MathUtils.lerp(orb.pos.z, targetZ, 0.25);

                  // Velocity flick on release
                  orb.vel.copy(orb.pos).sub(prevPos).clampLength(0, 0.35);
                }
              } else {
                if (grabbedOrbIdByHandRef.current[name] === orb.id) {
                  grabbedOrbIdByHandRef.current[name] = null;
                }
              }
            });

            // Release Pinch
            if (orb.isGrabbed && !isGrabbedThisFrame && orb.grabHand !== "mouse") {
              const pStart = pinchStartRef.current[orb.id];
              const elapsed = pStart ? now - pStart.time : 999;
              const releaseHand = orb.grabHand === "right" ? handRightRef.current : handLeftRef.current;
              const moveDist = pStart
                ? Math.hypot(
                    (releaseHand.pinchCenter.x || 0) - pStart.x,
                    (releaseHand.pinchCenter.y || 0) - pStart.y
                  )
                : 999;

              // Pull close (> 1.0) or quick pinch tap opens Quiz
              if (orb.pos.z > 1.0 || (elapsed < 350 && moveDist < 25)) {
                handleOpenQuiz(orb.concept);
              } else {
                synthRef.current.playTossWhoosh();
              }

              orb.isGrabbed = false;
              orb.grabHand = null;
              delete pinchStartRef.current[orb.id];
            }

            // Closed-Fist Summon (draw orbs toward mid-depth)
            const fistHand = [handLeftRef.current, handRightRef.current].find(
              (h) => h.visible && h.isFist
            );
            if (fistHand && now >= grabUnlockAtRef.current) {
              orb.vel.z += (-orb.pos.z) * 0.015;
            }

            // Open-Palm Radial Push Wake
            const palmHand = [handLeftRef.current, handRightRef.current].find(
              (h) => h.visible && h.isOpenPalm
            );
            if (palmHand && !orb.isGrabbed) {
              const proj = orb.pos.clone().project(camera);
              if (proj.z < 1.0) {
                const sx = (proj.x * 0.5 + 0.5) * cssW;
                const sy = (-proj.y * 0.5 + 0.5) * cssH;
                if (Number.isFinite(sx) && Number.isFinite(sy)) {
                  const dPalm = Math.hypot(sx - palmHand.wrist.x, sy - palmHand.wrist.y);
                  if (dPalm < 160 && dPalm > 10) {
                    const push = (160 - dPalm) / 160;
                    orb.vel.x += (sx - palmHand.wrist.x) * push * 0.0008;
                    orb.vel.y += (sy - palmHand.wrist.y) * push * 0.0008;
                  }
                }
              }
            }

            // ── Zero-Gravity Drift & Physics Boundaries ─────────────────────
            if (!orb.isGrabbed) {
              orb.vel.multiplyScalar(0.965);
              orb.vel.x += Math.sin(timeSec * 1.2 + orbIdx * 1.7) * 0.0008;
              orb.vel.y += Math.cos(timeSec * 1.4 + orbIdx * 1.3) * 0.0008;
              orb.vel.z += Math.sin(timeSec * 1.0 + orbIdx * 2.1) * 0.0008;
              orb.pos.add(orb.vel);

              // Wide Peripheral Room Bounds: x in [-5.5, 5.5], y in [-1.15, 2.25], z in [-2.4, 1.4]
              if (orb.pos.x < -5.5) orb.vel.x += (-5.5 - orb.pos.x) * 0.08;
              if (orb.pos.x > 5.5) orb.vel.x += (5.5 - orb.pos.x) * 0.08;
              if (orb.pos.y < -1.15) orb.vel.y += (-1.15 - orb.pos.y) * 0.08;
              if (orb.pos.y > 2.25) orb.vel.y += (2.25 - orb.pos.y) * 0.08;
              if (orb.pos.z < -2.4) orb.vel.z += (-2.4 - orb.pos.z) * 0.08;
              if (orb.pos.z > 1.4) orb.vel.z += (1.4 - orb.pos.z) * 0.08;
            }
          }

          // Soft elastic orb-to-orb bounce (guaranteeing >= 2.1 units separation)
          for (let j = orbIdx + 1; j < orbs.length; j++) {
            const oB = orbs[j];
            const dist3D = orb.pos.distanceTo(oB.pos);
            const minDist = 2.1;
            if (dist3D < minDist && dist3D > 0.001) {
              const diff = orb.pos.clone().sub(oB.pos).normalize();
              const overlap = (minDist - dist3D) * 0.5;
              if (!orb.isGrabbed && activeQuizNode?.id !== orb.id) {
                orb.pos.addScaledVector(diff, overlap * 0.5);
                orb.vel.addScaledVector(diff, 0.012);
              }
              if (!oB.isGrabbed && activeQuizNode?.id !== oB.id) {
                oB.pos.addScaledVector(diff, -overlap * 0.5);
                oB.vel.addScaledVector(diff, -0.012);
              }
            }
          }

          // Smooth scale lerp
          const curScale = orb.group.scale.x;
          const nextScale = THREE.MathUtils.lerp(curScale, orb.targetScale, 0.14);
          orb.group.scale.set(nextScale, nextScale, nextScale);
          orb.group.position.copy(orb.pos);
        });

        // ── 5. Project 3D Orbs to 2D Screen for HTML Labels (CSS Pixels) ───────
        if (now - lastScreenCoordsUpdateRef.current > 40) {
          lastScreenCoordsUpdateRef.current = now;
          const nextScreenCoords: Array<{
            id: string;
            title: string;
            x: number;
            y: number;
            z: number;
            mastery: number;
            visible: boolean;
          }> = [];

          // When quiz is active, hide HTML labels completely
          if (!isQuizOpen) {
            orbs.forEach((orb) => {
              const proj = orb.pos.clone().project(camera);
              const isBehind = proj.z > 1.0;
              const sx = (proj.x * 0.5 + 0.5) * cssW;
              const sy = (-proj.y * 0.5 + 0.5) * cssH;
              const isValid =
                !isBehind &&
                Number.isFinite(sx) &&
                Number.isFinite(sy) &&
                sx > -120 &&
                sx < cssW + 120 &&
                sy > -120 &&
                sy < cssH + 120;

              nextScreenCoords.push({
                id: orb.id,
                title: orb.concept.title,
                x: Number.isFinite(sx) ? sx : 0,
                y: Number.isFinite(sy) ? sy : 0,
                z: orb.pos.z,
                mastery: orb.concept.retention || 0,
                visible: isValid,
              });
            });
          }

          setScreenCoords(nextScreenCoords);
        }

        // ── 6. Advanced Landmark Gesture Classification & Telemetry ───────────
        const primaryHand = [handLeftRef.current, handRightRef.current].find((h) => h.visible);

        if (primaryHand) {
          // Dwell & Pinch Hit-Testing against DOM Buttons (viewport CSS pixels = rect.left/top + container CSS pixels)
          const cx = primaryHand.pinchCenter.x;
          const cy = primaryHand.pinchCenter.y;
          const hoveredEl =
            typeof document !== "undefined"
              ? document.elementFromPoint(rect.left + cx, rect.top + cy)
              : null;
          const quizActionBtn = hoveredEl?.closest("[data-quiz-action]");
          const quizOptionBtn = hoveredEl?.closest("[data-quiz-option]");
          const dockBtn = hoveredEl?.closest("[data-dock-action]");

          // ── Quiz Mode Gestures ──────────────────────────────────────────────
          if (activeQuizNode) {
            const inLockout = now < gestureUnlockAtRef.current;
            const remainingSec = inLockout
              ? Math.max(0.1, (gestureUnlockAtRef.current - now) / 1000).toFixed(1)
              : "0";

            if (isGeneratingQuizRef.current) {
              // Freeze answered state & block ALL finger / 🖐️ / 👍 / dwell triggers while synthesizing
              fingerHoldStartRef.current = null;
              openPalmHoldStartRef.current = null;
              thumbsUpHoldStartRef.current = null;
              podDwellStartRef.current = null;
              setHoldingFingerInfo(null);
              setDwellPodInfo(null);
              setOpenPalmProgress(0);
              setThumbsUpProgress(0);

              if (primaryHand.isFist) {
                if (!fistHoldStartRef.current) fistHoldStartRef.current = now;
                const elapsed = now - fistHoldStartRef.current;
                const prog = Math.min(1.0, elapsed / FIST_HOLD_MS);
                setFistProgress(prog);
                setTelemetry({
                  emoji: "✊",
                  text: `Hold Fist → Cancel & Toss Back (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#F87171",
                });
                if (prog >= 1.0) {
                  handleCloseQuiz(true);
                  fistHoldStartRef.current = null;
                  setFistProgress(0);
                }
              } else {
                fistHoldStartRef.current = null;
                setFistProgress(0);
                setTelemetry({
                  emoji: "✨",
                  text: "Synthesizing AI Question… (🖐️/👍/1–4 paused · ✊ to cancel)",
                  progress: 0,
                  accentColor: "#38BDF8",
                });
              }
            } else if (inLockout) {
              setTelemetry({
                emoji: "🔒",
                text: `Reading grace period… (${remainingSec}s)`,
                progress: 1 - Math.max(0, gestureUnlockAtRef.current - now) / ENTRY_LOCKOUT_MS,
                accentColor: "#FBBF24",
              });
              fingerHoldStartRef.current = null;
              setHoldingFingerInfo(null);
            } else if (quizAnsweredIndex === null) {
              // ── UNANSWERED QUIZ ─────────────────────────────────────────────
              // 1. Closed Fist Hold -> Toss Back (650ms)
              if (primaryHand.isFist) {
                if (!fistHoldStartRef.current) fistHoldStartRef.current = now;
                const elapsed = now - fistHoldStartRef.current;
                const prog = Math.min(1.0, elapsed / FIST_HOLD_MS);
                setTelemetry({
                  emoji: "✊",
                  text: `Hold Fist → Toss Back (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#F87171",
                });
                if (prog >= 1.0) {
                  handleCloseQuiz(true);
                  fistHoldStartRef.current = null;
                }
                fingerHoldStartRef.current = null;
                setHoldingFingerInfo(null);
              }
              // 2. Open Palm (5 fingers + thumb outstretched) -> SAFE NEUTRAL / REST
              else if (primaryHand.isOpenPalm) {
                fistHoldStartRef.current = null;
                fingerHoldStartRef.current = null;
                setHoldingFingerInfo(null);
                setTelemetry({
                  emoji: "🖐️",
                  text: "🖐️ Palm Resting (safe)",
                  progress: 0,
                  accentColor: "#A1A1AA",
                });
              }
              // 3. Option D: 4 fingers extended + thumb tucked
              else if (primaryHand.isFourFingersTuckedThumb) {
                fistHoldStartRef.current = null;
                if (!fingerHoldStartRef.current || fingerHoldStartRef.current.count !== 4) {
                  fingerHoldStartRef.current = { count: 4, startTime: now };
                }
                const elapsed = now - fingerHoldStartRef.current.startTime;
                const prog = Math.min(1.0, elapsed / FINGER_HOLD_MS);
                setHoldingFingerInfo({ count: 4, progress: prog });
                setTelemetry({
                  emoji: "🖖",
                  text: `Holding 4 Fingers (Thumb In) → D (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#C6F432",
                });
                if (prog >= 1.0) {
                  handleSelectQuizOption(3);
                  fingerHoldStartRef.current = null;
                  setHoldingFingerInfo(null);
                }
              }
              // 4. Option C: 3 fingers extended
              else if (primaryHand.isThreeFingers) {
                fistHoldStartRef.current = null;
                if (!fingerHoldStartRef.current || fingerHoldStartRef.current.count !== 3) {
                  fingerHoldStartRef.current = { count: 3, startTime: now };
                }
                const elapsed = now - fingerHoldStartRef.current.startTime;
                const prog = Math.min(1.0, elapsed / FINGER_HOLD_MS);
                setHoldingFingerInfo({ count: 3, progress: prog });
                setTelemetry({
                  emoji: "🤟",
                  text: `Holding 3 Fingers → C (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#C6F432",
                });
                if (prog >= 1.0) {
                  handleSelectQuizOption(2);
                  fingerHoldStartRef.current = null;
                  setHoldingFingerInfo(null);
                }
              }
              // 5. Option B: 2 fingers extended
              else if (primaryHand.isTwoFingers) {
                fistHoldStartRef.current = null;
                if (!fingerHoldStartRef.current || fingerHoldStartRef.current.count !== 2) {
                  fingerHoldStartRef.current = { count: 2, startTime: now };
                }
                const elapsed = now - fingerHoldStartRef.current.startTime;
                const prog = Math.min(1.0, elapsed / FINGER_HOLD_MS);
                setHoldingFingerInfo({ count: 2, progress: prog });
                setTelemetry({
                  emoji: "✌️",
                  text: `Holding 2 Fingers → B (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#C6F432",
                });
                if (prog >= 1.0) {
                  handleSelectQuizOption(1);
                  fingerHoldStartRef.current = null;
                  setHoldingFingerInfo(null);
                }
              }
              // 6. Option A: 1 finger extended
              else if (primaryHand.isOneFinger) {
                fistHoldStartRef.current = null;
                if (!fingerHoldStartRef.current || fingerHoldStartRef.current.count !== 1) {
                  fingerHoldStartRef.current = { count: 1, startTime: now };
                }
                const elapsed = now - fingerHoldStartRef.current.startTime;
                const prog = Math.min(1.0, elapsed / FINGER_HOLD_MS);
                setHoldingFingerInfo({ count: 1, progress: prog });
                setTelemetry({
                  emoji: "☝️",
                  text: `Holding 1 Finger → A (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#C6F432",
                });
                if (prog >= 1.0) {
                  handleSelectQuizOption(0);
                  fingerHoldStartRef.current = null;
                  setHoldingFingerInfo(null);
                }
              }
              // 7. Pod Hover Dwell or Pinch
              else if (quizOptionBtn) {
                const optIdx = parseInt(quizOptionBtn.getAttribute("data-quiz-option") || "0", 10);
                if (primaryHand.isPinching) {
                  handleSelectQuizOption(optIdx);
                } else {
                  if (!podDwellStartRef.current || podDwellStartRef.current.index !== optIdx) {
                    podDwellStartRef.current = { index: optIdx, startTime: now };
                  }
                  const elapsed = now - podDwellStartRef.current.startTime;
                  const prog = Math.min(1.0, elapsed / POD_DWELL_MS);
                  setDwellPodInfo({ index: optIdx, progress: prog });
                  setTelemetry({
                    emoji: "🎯",
                    text: `Dwell on Option ${String.fromCharCode(65 + optIdx)} (${Math.round(prog * 100)}%)`,
                    progress: prog,
                    accentColor: "#C6F432",
                  });
                  if (prog >= 1.0) {
                    handleSelectQuizOption(optIdx);
                    podDwellStartRef.current = null;
                    setDwellPodInfo(null);
                  }
                }
              } else {
                fistHoldStartRef.current = null;
                fingerHoldStartRef.current = null;
                podDwellStartRef.current = null;
                setHoldingFingerInfo(null);
                setDwellPodInfo(null);
                setTelemetry({
                  emoji: "🖐️",
                  text: "Hold 1–4 Fingers (☝️✌️🤟🖖) or Pinch Pod",
                  progress: 0,
                });
              }
            } else {
              // ── ALREADY ANSWERED QUIZ ───────────────────────────────────────
              fingerHoldStartRef.current = null;
              setHoldingFingerInfo(null);
              setDwellPodInfo(null);

              // 1. Thumbs Up Hold -> Next Orb (650ms)
              if (primaryHand.isThumbsUp) {
                openPalmHoldStartRef.current = null;
                setOpenPalmProgress(0);
                fistHoldStartRef.current = null;
                setFistProgress(0);

                if (!thumbsUpHoldStartRef.current) thumbsUpHoldStartRef.current = now;
                const elapsed = now - thumbsUpHoldStartRef.current;
                const prog = Math.min(1.0, elapsed / THUMBS_UP_HOLD_MS);
                setThumbsUpProgress(prog);
                setTelemetry({
                  emoji: "👍",
                  text: `Hold Thumbs Up → Next Orb (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#C6F432",
                });
                if (prog >= 1.0) {
                  handleNextOrbInLens();
                  thumbsUpHoldStartRef.current = null;
                  setThumbsUpProgress(0);
                }
              }
              // 2. Open Palm Hold -> New AI Question (750ms)
              else if (primaryHand.isOpenPalm) {
                thumbsUpHoldStartRef.current = null;
                setThumbsUpProgress(0);
                fistHoldStartRef.current = null;
                setFistProgress(0);

                if (!openPalmHoldStartRef.current) openPalmHoldStartRef.current = now;
                const elapsed = now - openPalmHoldStartRef.current;
                const prog = Math.min(1.0, elapsed / OPEN_PALM_HOLD_MS);
                setOpenPalmProgress(prog);
                setTelemetry({
                  emoji: "🖐️",
                  text: `🖐️ Hold Open Palm → New AI Question (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#38BDF8",
                });
                if (prog >= 1.0) {
                  if (!isGeneratingQuizRef.current) {
                    handleFetchNextAiQuestion();
                  }
                  openPalmHoldStartRef.current = null;
                  setOpenPalmProgress(0);
                }
              }
              // 3. Closed Fist Hold -> Toss Back (650ms)
              else if (primaryHand.isFist) {
                thumbsUpHoldStartRef.current = null;
                setThumbsUpProgress(0);
                openPalmHoldStartRef.current = null;
                setOpenPalmProgress(0);

                if (!fistHoldStartRef.current) fistHoldStartRef.current = now;
                const elapsed = now - fistHoldStartRef.current;
                const prog = Math.min(1.0, elapsed / FIST_HOLD_MS);
                setFistProgress(prog);
                setTelemetry({
                  emoji: "✊",
                  text: `Hold Fist → Toss Back (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#F87171",
                });
                if (prog >= 1.0) {
                  handleCloseQuiz(true);
                  fistHoldStartRef.current = null;
                  setFistProgress(0);
                }
              }
              // 4. Action Button Dwell or Pinch
              else if (quizActionBtn) {
                thumbsUpHoldStartRef.current = null;
                setThumbsUpProgress(0);
                openPalmHoldStartRef.current = null;
                setOpenPalmProgress(0);
                fistHoldStartRef.current = null;
                setFistProgress(0);

                const act = quizActionBtn.getAttribute("data-quiz-action");
                if (primaryHand.isPinching) {
                  (quizActionBtn as HTMLElement).click();
                } else {
                  if (!btnDwellStartRef.current || btnDwellStartRef.current.action !== act) {
                    btnDwellStartRef.current = { action: act || "", startTime: now };
                  }
                  const elapsed = now - btnDwellStartRef.current.startTime;
                  const prog = Math.min(1.0, elapsed / POD_DWELL_MS);
                  setTelemetry({
                    emoji: "🎯",
                    text: `Dwell on Button (${Math.round(prog * 100)}%)`,
                    progress: prog,
                    accentColor: "#C6F432",
                  });
                  if (prog >= 1.0) {
                    (quizActionBtn as HTMLElement).click();
                    btnDwellStartRef.current = null;
                  }
                }
              } else {
                thumbsUpHoldStartRef.current = null;
                setThumbsUpProgress(0);
                openPalmHoldStartRef.current = null;
                setOpenPalmProgress(0);
                fistHoldStartRef.current = null;
                setFistProgress(0);
                btnDwellStartRef.current = null;
                setTelemetry({
                  emoji: "✨",
                  text: "Answered! 👍 Next Orb · 🖐️ New Question · ✊ Toss Back",
                  progress: 0,
                });
              }
            }
          }
          // ── Room Mode Gestures ──────────────────────────────────────────────
          else {
            const grabbedOrb = orbs.find((o) => o.isGrabbed);
            if (grabbedOrb) {
              setTelemetry({
                emoji: "🤏",
                text: `Grabbed: ${grabbedOrb.concept.title} · Pull closer to study`,
                progress: 0,
                accentColor: "#C6F432",
              });
            } else if (nearestOrbToHand) {
              setTelemetry({
                emoji: "🎯",
                text: `Hovering: ${nearestOrbToHand.orb.concept.title} · Pinch to grab`,
                progress: 0,
                accentColor: "#C6F432",
              });
            } else if (primaryHand.isFist) {
              setTelemetry({
                emoji: "✊",
                text: "Closed Fist · Summoning orbs to center",
                progress: 0,
                accentColor: "#38BDF8",
              });
            } else if (primaryHand.isOpenPalm) {
              setTelemetry({
                emoji: "🖐️",
                text: "Open Palm · Wave to repel orbs",
                progress: 0,
                accentColor: "#38BDF8",
              });
            } else if (primaryHand.isPinching) {
              setTelemetry({
                emoji: "🤏",
                text: "Pinch active",
                progress: 0,
              });
            } else if (dockBtn) {
              if (primaryHand.isPinching) {
                (dockBtn as HTMLElement).click();
              } else {
                const act = dockBtn.getAttribute("data-dock-action") || "dock";
                if (!btnDwellStartRef.current || btnDwellStartRef.current.action !== act) {
                  btnDwellStartRef.current = { action: act, startTime: now };
                }
                const elapsed = now - btnDwellStartRef.current.startTime;
                const prog = Math.min(1.0, elapsed / POD_DWELL_MS);
                setTelemetry({
                  emoji: "🎯",
                  text: `Dwell on Control (${Math.round(prog * 100)}%)`,
                  progress: prog,
                  accentColor: "#C6F432",
                });
                if (prog >= 1.0) {
                  (dockBtn as HTMLElement).click();
                  btnDwellStartRef.current = null;
                }
              }
            } else {
              btnDwellStartRef.current = null;
              setTelemetry({
                emoji: "🖐️",
                text: "Hand active · Pinch an orb to inspect · Fist to summon",
                progress: 0,
              });
            }
          }
        } else {
          fistHoldStartRef.current = null;
          thumbsUpHoldStartRef.current = null;
          openPalmHoldStartRef.current = null;
          fingerHoldStartRef.current = null;
          podDwellStartRef.current = null;
          btnDwellStartRef.current = null;
          setHoldingFingerInfo(null);
          setDwellPodInfo(null);
          setTelemetry({
            emoji: cameraActive ? "👋" : "🖱️",
            text: cameraActive ? "Show hand to control · Mouse controls active" : "Mouse & click controls active",
            progress: 0,
          });
        }

        // ── 7. Render Three.js Scene ──────────────────────────────────────────
        renderer.render(scene, camera);
      }

      animId = requestAnimationFrame(renderLoop);
    }

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [
    cameraActive,
    activeQuizNode,
    quizAnsweredIndex,
    handleOpenQuiz,
    handleCloseQuiz,
    handleSelectQuizOption,
    handleNextOrbInLens,
    handleFetchNextAiQuestion,
  ]);

  // ── Mouse Drag & Scroll Interactivity (Full Parity) ─────────────────────────
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!rendererRef.current || !cameraRef.current || activeQuizNode) return;
    const rect = containerRef.current
      ? containerRef.current.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const clickableMeshes: THREE.Mesh[] = [];
    orbsMapRef.current.forEach((obj) => clickableMeshes.push(obj.plasmaMesh));
    const intersects = raycaster.intersectObjects(clickableMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const orbId = hit.userData?.orbId;
      const orb = orbsMapRef.current.get(orbId);

      if (orb) {
        orb.isGrabbed = true;
        orb.grabHand = "mouse";
        synthRef.current.playGrabHum();
        mouseDragRef.current = {
          orbId,
          startTime: performance.now(),
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          vel: new THREE.Vector3(),
        };
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!mouseDragRef.current || !rendererRef.current || !cameraRef.current) return;
    const rect = containerRef.current
      ? containerRef.current.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const orb = orbsMapRef.current.get(mouseDragRef.current.orbId);
    if (!orb) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -orb.pos.z);
    const intersect = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersect);

    const prevPos = orb.pos.clone();
    orb.pos.x = intersect.x;
    orb.pos.y = intersect.y;
    orb.vel.copy(orb.pos).sub(prevPos);

    mouseDragRef.current.lastX = e.clientX;
    mouseDragRef.current.lastY = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!mouseDragRef.current) return;
    const { orbId, startTime, startX, startY } = mouseDragRef.current;
    const orb = orbsMapRef.current.get(orbId);

    if (orb) {
      const elapsed = performance.now() - startTime;
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);

      if (elapsed < 300 && dist < 15) {
        handleOpenQuiz(orb.concept);
      } else {
        synthRef.current.playTossWhoosh();
      }

      orb.isGrabbed = false;
      orb.grabHand = null;
    }

    mouseDragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!rendererRef.current || !cameraRef.current) return;
    const rect = containerRef.current
      ? containerRef.current.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const clickableMeshes: THREE.Mesh[] = [];
    orbsMapRef.current.forEach((obj) => clickableMeshes.push(obj.plasmaMesh));
    const intersects = raycaster.intersectObjects(clickableMeshes, false);

    if (intersects.length > 0) {
      const orbId = intersects[0].object.userData?.orbId;
      const orb = orbsMapRef.current.get(orbId);
      if (orb) {
        orb.pos.z = THREE.MathUtils.clamp(orb.pos.z - e.deltaY * 0.008, -2.4, 1.4);
      }
    }
  };

  // Keyboard shortcut parity (1-4 answers, Escape to close, N for next, S for synthesize)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeQuizNode) {
        if (["1", "2", "3", "4"].includes(e.key) && quizAnsweredIndex === null) {
          handleSelectQuizOption(parseInt(e.key, 10) - 1);
        } else if (e.key === "Escape") {
          handleCloseQuiz(true);
        } else if (e.key === "n" || e.key === "N") {
          handleNextOrbInLens();
        } else if (e.key === "s" || e.key === "S") {
          void handleFetchNextAiQuestion();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeQuizNode,
    quizAnsweredIndex,
    handleSelectQuizOption,
    handleCloseQuiz,
    handleNextOrbInLens,
    handleFetchNextAiQuestion,
  ]);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#0B0B0C", // Obsidian solid fallback strictly behind live webcam video
        userSelect: "none",
        touchAction: "none",
        zIndex: 0,
      }}
    >
      {/* ── Live Mirrored AR Webcam Video (z-index: 1) ──────────────────────── */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",
          zIndex: 1,
          opacity: cameraActive ? 1 : 0,
          display: cameraActive ? "block" : "none",
          pointerEvents: "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {/* ── Subtle Edge Vignette (pointer-events: none, z-index: 5) ─────────── */}
      {cameraActive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgba(11, 11, 12, 0.45) 80%, rgba(11, 11, 12, 0.85) 100%)",
          }}
        />
      )}

      {/* ── Three.js WebGL Layer (Full-Bleed Transparent Viewport, z-index: 10) ── */}
      <div
        ref={mountRef}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          background: "transparent",
          pointerEvents: activeQuizNode ? "none" : "auto",
        }}
      />

      {/* ── 2D Transparent Canvas for Hand Skeleton Wireframe (z-index: 35, Pure 1:1 CSS) ── */}
      <canvas
        ref={handCanvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 35,
          pointerEvents: "none",
        }}
      />

      {/* ── Top-Center Live Gesture Telemetry Pill ──────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 32,
          display: "flex",
          alignItems: "center",
          gap: 9,
          background: "rgba(15, 15, 18, 0.82)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 999,
          padding: "6px 16px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
          color: "#FAFAFA",
          fontSize: 12,
          fontWeight: 600,
          pointerEvents: "none",
          userSelect: "none",
          transition: "all 0.15s ease",
          maxWidth: "90vw",
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>{telemetry.emoji}</span>
        <span style={{ color: "#E4E4E7", whiteSpace: "nowrap" }}>{telemetry.text}</span>
        {telemetry.progress > 0 && (
          <div
            style={{
              width: 52,
              height: 4,
              borderRadius: 999,
              background: "rgba(255, 255, 255, 0.12)",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: `${Math.min(100, telemetry.progress * 100)}%`,
                height: "100%",
                background: telemetry.accentColor || "#C6F432",
                borderRadius: 999,
                boxShadow: `0 0 6px ${telemetry.accentColor || "#C6F432"}`,
                transition: "width 0.05s linear",
              }}
            />
          </div>
        )}
      </div>

      {/* ── Floating 2D HTML Titles Over 3D Orbs (Hidden in Quiz Focus Theater) ───── */}
      {!activeQuizNode && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          {screenCoords.map((item) => {
            if (!item.visible || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return null;
            const theme = getMasteryTheme(item.mastery);
            const depthScale = THREE.MathUtils.clamp((item.z + 4.0) / 4.5, 0.7, 1.3);
            const depthOpacity = THREE.MathUtils.clamp((item.z + 3.5) / 4.0, 0.35, 1.0);

            return (
              <div
                key={item.id}
                style={{
                  position: "absolute",
                  left: item.x,
                  top: item.y + 42 * depthScale,
                  transform: `translate(-50%, 0) scale(${depthScale})`,
                  maxWidth: 160,
                  padding: "4px 8px",
                  borderRadius: 8,
                  background: "rgba(12, 12, 16, 0.82)",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  textAlign: "center",
                  lineHeight: 1.25,
                  opacity: depthOpacity,
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.45)",
                  transition: "opacity 0.2s ease",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 650,
                    color: "#FAFAFA",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    fontFamily: "ui-monospace, monospace",
                    color: theme.hex,
                    marginTop: 2,
                  }}
                >
                  {item.mastery > 0 ? `${item.mastery}%` : "NEW"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Holographic Quiz Lens & Floating Wing Answer Pods ──────────────── */}
      {activeQuizNode && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 25,
            pointerEvents: "auto",
          }}
        >
          {/* Central Question Lens (Under the 3D Orb, with strict bottom safe-margin) */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 96,
              transform: "translateX(-50%)",
              width: "min(92vw, 520px)",
              maxHeight: "calc(100vh - 220px)",
              overflowY: "auto",
              padding: "20px 24px",
              borderRadius: 24,
              background: "rgba(12, 12, 16, 0.78)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.8)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 10,
              scrollbarWidth: "none",
            }}
          >
            {/* Title & Mastery Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: getMasteryTheme(activeQuizNode.retention || 0).hex,
                  boxShadow: `0 0 10px ${getMasteryTheme(activeQuizNode.retention || 0).hex}`,
                }}
              />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#FAFAFA" }}>
                {activeQuizNode.title}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: "rgba(255, 255, 255, 0.08)",
                  color: getMasteryTheme(activeQuizNode.retention || 0).hex,
                }}
              >
                {activeQuizNode.retention || 0}%
              </span>
            </div>

            {/* Question Text */}
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 550,
                color: "#F4F4F5",
                lineHeight: 1.45,
                marginTop: 2,
              }}
            >
              {cleanMathText(
                quizCustomQuestion?.question ||
                  activeQuizNode.quiz?.question ||
                  "Recall core insight:"
              )}
            </div>

            {/* Finger Count Charge Feedback */}
            {holdingFingerInfo && quizAnsweredIndex === null && (
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 650,
                  color: "#C6F432",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>
                  Holding {holdingFingerInfo.count} finger{holdingFingerInfo.count > 1 ? "s" : ""} → Option{" "}
                  {String.fromCharCode(65 + holdingFingerInfo.count - 1)}
                </span>
                <span style={{ fontSize: 10, opacity: 0.8 }}>
                  ({Math.round(holdingFingerInfo.progress * 100)}%)
                </span>
              </div>
            )}

            {/* Compact Answer Explanation Feedback */}
            {quizAnsweredIndex !== null && (
              <div
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 12,
                  background:
                    quizAnsweredIndex ===
                    (quizCustomQuestion?.correctIndex ?? activeQuizNode.quiz?.correctIndex ?? 0)
                      ? "rgba(198, 244, 50, 0.12)"
                      : "rgba(248, 113, 113, 0.12)",
                  border: `1px solid ${
                    quizAnsweredIndex ===
                    (quizCustomQuestion?.correctIndex ?? activeQuizNode.quiz?.correctIndex ?? 0)
                      ? "rgba(198, 244, 50, 0.4)"
                      : "rgba(248, 113, 113, 0.4)"
                  }`,
                  fontSize: 12.5,
                  color: "#E4E4E7",
                  lineHeight: 1.38,
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                  {quizAnsweredIndex ===
                  (quizCustomQuestion?.correctIndex ?? activeQuizNode.quiz?.correctIndex ?? 0)
                    ? "✓ Correct! +18% Mastery Boost"
                    : "Target Insight:"}
                </div>
                {cleanMathText(
                  quizCustomQuestion?.explanation ||
                    activeQuizNode.quiz?.explanation ||
                    activeQuizNode.summary
                )}
              </div>
            )}

            {/* Clean 3-Button Action Bar with Hand Emojis & Interactive Hold Progress */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <button
                data-quiz-action="next-orb"
                onClick={handleNextOrbInLens}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 13px",
                  borderRadius: 999,
                  background:
                    thumbsUpProgress > 0 ? "rgba(198, 244, 50, 0.28)" : "rgba(198, 244, 50, 0.16)",
                  border:
                    thumbsUpProgress > 0
                      ? "1px solid #C6F432"
                      : "1px solid rgba(198, 244, 50, 0.45)",
                  boxShadow:
                    thumbsUpProgress > 0 ? "0 0 16px rgba(198, 244, 50, 0.45)" : "none",
                  color: "#C6F432",
                  fontSize: 11.5,
                  fontWeight: 650,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {thumbsUpProgress > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      height: 2,
                      width: `${thumbsUpProgress * 100}%`,
                      background: "#C6F432",
                      transition: "width 0.05s linear",
                    }}
                  />
                )}
                <span>👍 Next Orb</span>
                <ArrowRight size={12} />
              </button>

              <button
                data-quiz-action="new-ai"
                disabled={quizAiLoading}
                onClick={handleFetchNextAiQuestion}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 13px",
                  borderRadius: 999,
                  background:
                    openPalmProgress > 0 ? "rgba(56, 189, 248, 0.28)" : "rgba(255, 255, 255, 0.08)",
                  border:
                    openPalmProgress > 0
                      ? "1px solid #38BDF8"
                      : "1px solid rgba(255, 255, 255, 0.15)",
                  boxShadow:
                    openPalmProgress > 0 ? "0 0 16px rgba(56, 189, 248, 0.45)" : "none",
                  color: "#FAFAFA",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {openPalmProgress > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      height: 2,
                      width: `${openPalmProgress * 100}%`,
                      background: "#38BDF8",
                      transition: "width 0.05s linear",
                    }}
                  />
                )}
                <Sparkles size={12} color={openPalmProgress > 0 ? "#38BDF8" : undefined} />
                <span>{quizAiLoading ? "Synthesizing…" : "🖐️ New AI Question"}</span>
              </button>

              <button
                data-quiz-action="toss-back"
                onClick={() => handleCloseQuiz(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 13px",
                  borderRadius: 999,
                  background:
                    fistProgress > 0 ? "rgba(248, 113, 113, 0.25)" : "rgba(255, 255, 255, 0.06)",
                  border:
                    fistProgress > 0 ? "1px solid #F87171" : "1px solid rgba(255, 255, 255, 0.12)",
                  boxShadow:
                    fistProgress > 0 ? "0 0 16px rgba(248, 113, 113, 0.4)" : "none",
                  color: "#D4D4D8",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {fistProgress > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      height: 2,
                      width: `${fistProgress * 100}%`,
                      background: "#F87171",
                      transition: "width 0.05s linear",
                    }}
                  />
                )}
                <X size={12} />
                <span>✊ Toss Back</span>
              </button>
            </div>
          </div>

          {/* 4 Floating Wing Answer Pods with Hand Emoji Badges */}
          {(
            quizCustomQuestion?.options ||
            activeQuizNode.quiz?.options || [
              "Option A",
              "Option B",
              "Option C",
              "Option D",
            ]
          )
            .slice(0, 4)
            .map((opt, i) => {
              const badges = ["☝️ A", "✌️ B", "🤟 C", "🖖 D"];
              const podPositions = [
                { left: "5%", top: "34%" }, // A
                { right: "5%", top: "34%" }, // B
                { left: "5%", top: "54%" }, // C
                { right: "5%", top: "54%" }, // D
              ];
              const pos = podPositions[i];
              const correctIdx =
                quizCustomQuestion?.correctIndex ?? activeQuizNode.quiz?.correctIndex ?? 0;
              const isChosen = quizAnsweredIndex === i;
              const isCorrect = i === correctIdx;

              const isDwellActive = dwellPodInfo?.index === i && dwellPodInfo.progress > 0;
              const isFingerActive = holdingFingerInfo && holdingFingerInfo.count - 1 === i;
              const chargeProg = isDwellActive
                ? dwellPodInfo.progress
                : isFingerActive
                ? holdingFingerInfo.progress
                : 0;

              let borderColor = "rgba(255, 255, 255, 0.12)";
              let bg = "rgba(18, 18, 22, 0.82)";

              if (isDwellActive || isFingerActive) {
                borderColor = "#C6F432";
                bg = "rgba(198, 244, 50, 0.16)";
              }

              if (quizAnsweredIndex !== null) {
                if (isCorrect) {
                  borderColor = "#C6F432";
                  bg = "rgba(198, 244, 50, 0.18)";
                } else if (isChosen) {
                  borderColor = "#F87171";
                  bg = "rgba(248, 113, 113, 0.18)";
                }
              }

              return (
                <button
                  key={i}
                  data-quiz-option={i}
                  disabled={quizAnsweredIndex !== null}
                  onClick={() => handleSelectQuizOption(i)}
                  style={{
                    position: "absolute",
                    ...pos,
                    width: 230,
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: bg,
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: `1px solid ${borderColor}`,
                    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textAlign: "left",
                    cursor: quizAnsweredIndex !== null ? "default" : "pointer",
                    transition: "all 0.18s ease",
                    overflow: "hidden",
                  }}
                >
                  {chargeProg > 0 && quizAnsweredIndex === null && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        bottom: 0,
                        height: 3,
                        width: `${chargeProg * 100}%`,
                        background: "#C6F432",
                        borderRadius: "0 0 16px 16px",
                        boxShadow: "0 0 8px #C6F432",
                        transition: "width 0.05s linear",
                      }}
                    />
                  )}

                  <span
                    style={{
                      height: 26,
                      padding: "0 8px",
                      borderRadius: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      background:
                        isCorrect && quizAnsweredIndex !== null
                          ? "#C6F432"
                          : "rgba(255, 255, 255, 0.08)",
                      color:
                        isCorrect && quizAnsweredIndex !== null ? "#0B0B0C" : "#FAFAFA",
                      flexShrink: 0,
                    }}
                  >
                    {badges[i]}
                  </span>
                  <span style={{ fontSize: 12, color: "#E4E4E7", lineHeight: 1.35, flex: 1 }}>
                    {cleanMathText(opt)}
                  </span>
                </button>
              );
            })}
        </div>
      )}

      {/* ── Minimal Floating Bottom Dock (z-index: 30) ──────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 30,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(18, 18, 21, 0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 999,
            padding: "5px 12px",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
          }}
        >
          {/* Camera Toggle */}
          <button
            data-dock-action="camera"
            disabled={cameraLoading}
            onClick={() => (cameraActive ? stopCamera() : startCamera())}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              background: cameraActive ? "rgba(198, 244, 50, 0.16)" : "transparent",
              border: `1px solid ${cameraActive ? "rgba(198, 244, 50, 0.4)" : "transparent"}`,
              color: cameraActive ? "#C6F432" : "#A1A1AA",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {cameraActive ? <Camera size={13} /> : <CameraOff size={13} />}
            <span>{cameraLoading ? "Starting…" : cameraActive ? "AR Camera Live" : "Enable AR Camera"}</span>
          </button>

          {/* Gather Orbs Button */}
          <button
            data-dock-action="gather"
            onClick={handleGatherOrbs}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              background: "transparent",
              border: "1px solid transparent",
              color: "#D4D4D8",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Magnet size={13} color="#C6F432" />
            <span>Gather Orbs</span>
          </button>

          {/* Synth Sound Toggle */}
          <button
            data-dock-action="mute"
            onClick={onToggleMute}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              background: "transparent",
              border: "1px solid transparent",
              color: synthMuted ? "#71717A" : "#D4D4D8",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {synthMuted ? <VolumeX size={13} /> : <Volume2 size={13} color="#C6F432" />}
            <span>{synthMuted ? "Muted" : "Synth Sound"}</span>
          </button>

          {/* Compact Page Pager when nodes > 8 */}
          {totalPages > 1 && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                paddingLeft: 8,
                borderLeft: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <button
                data-dock-action="pager-prev"
                disabled={pageIndex === 0}
                onClick={() => {
                  synthRef.current.playTossWhoosh();
                  setPageIndex((p) => Math.max(0, p - 1));
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: pageIndex === 0 ? "#52525B" : "#FAFAFA",
                  cursor: pageIndex === 0 ? "default" : "pointer",
                  display: "grid",
                  placeItems: "center",
                  padding: 2,
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  color: "#A1A1AA",
                  padding: "0 2px",
                }}
              >
                {pageIndex + 1}/{totalPages}
              </span>
              <button
                data-dock-action="pager-next"
                disabled={pageIndex === totalPages - 1}
                onClick={() => {
                  synthRef.current.playTossWhoosh();
                  setPageIndex((p) => Math.min(totalPages - 1, p + 1));
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: pageIndex === totalPages - 1 ? "#52525B" : "#FAFAFA",
                  cursor: pageIndex === totalPages - 1 ? "default" : "pointer",
                  display: "grid",
                  placeItems: "center",
                  padding: 2,
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Contextual Status Hint */}
        <div
          style={{
            fontSize: 10.5,
            color: "#8E8E93",
            letterSpacing: 0.2,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {activeQuizNode
            ? "☝️✌️🤟🖖 Hold 1–4 fingers to answer · 🖐️ Palm safe · ✊ Fist tosses back · 👍 Thumbs up advances"
            : "Pinch to grab & toss · Closer/farther for depth · Pull close or tap to quiz · Fist to summon"}
        </div>
      </div>
    </div>
  );
}
