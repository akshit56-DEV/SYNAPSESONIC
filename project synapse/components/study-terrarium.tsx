"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Search,
  Zap,
  Navigation,
  RotateCcw,
  Sparkles,
  X,
  Bot,
  Hand,
  Play,
  Pause,
  ChevronRight,
  Plus,
  Dices,
  RefreshCw,
  RotateCcw as ResetIcon,
} from "lucide-react";
import type { Concept } from "./decks";

export type SynapseKind = "base" | "branch" | "forged";

export interface ForgedBridgePayload {
  relationshipLabel: string;
  connectionSummary: string;
  examTrap: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface ForgedSynapse {
  sourceId: string;
  targetId: string;
  label: string;
  kind?: SynapseKind;
  isCustom?: boolean;
  data?: ForgedBridgePayload;
}

interface StudyTerrariumProps {
  deckTitle: string;
  nodes: Concept[];
  values?: number[];
  day?: number;
  activeIndex?: number;
  forgedSynapses?: ForgedSynapse[];
  onSelectConcept: (indexOrId: number | string) => void;
  onUpdateMastery: (nodeId: string, newMastery: number) => void;
  onAddSubconcepts: (parentId: string, newConcepts: any[]) => void;
  onForgeSynapse: (
    sourceId: string,
    targetId: string,
    label: string,
    boostMastery?: boolean,
    data?: ForgedBridgePayload
  ) => void;
  onResetDay?: () => void;
  onJumpToTutor?: (conceptIndex?: number) => void;
  onJumpToAR?: (conceptIndex?: number) => void;
}

// ── Color Utilities ───────────────────────────────────────────────────────────
function getMasteryTheme(mastery: number) {
  if (mastery >= 80) {
    return {
      hex: "#C6F432",
      threeColor: new THREE.Color("#C6F432"),
      intensity: 1.8,
      speed: 1.8,
      statusLabel: "Mastered",
    };
  }
  if (mastery >= 50) {
    return {
      hex: "#FBBF24",
      threeColor: new THREE.Color("#FBBF24"),
      intensity: 1.3,
      speed: 1.0,
      statusLabel: "Learning",
    };
  }
  if (mastery > 0) {
    return {
      hex: "#F87171",
      threeColor: new THREE.Color("#F87171"),
      intensity: 1.1,
      speed: 1.6,
      statusLabel: "Weak",
    };
  }
  return {
    hex: "#94A3B8",
    threeColor: new THREE.Color("#94A3B8"),
    intensity: 0.7,
    speed: 0.4,
    statusLabel: "New",
  };
}

// ── Procedural Radial Sprite Glow Texture ─────────────────────────────────────
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

// ── Custom GLSL Electric Filament Shader ──────────────────────────────────────
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

      // Pulse shockwave ripple on quiz success / branching
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

// ── Deterministic 3D Force-Directed Layout ────────────────────────────────────
function computeForceDirected3DPositions(
  nodes: Concept[],
  forgedSynapses: ForgedSynapse[]
): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();
  const count = nodes.length;
  if (count === 0) return positions;

  const baseRadius = count <= 6 ? 7.0 : count <= 12 ? 9.5 : 12.0;

  // 1. Initial spherical / branched positions
  nodes.forEach((n, i) => {
    if (n.parentId && positions.has(n.parentId)) {
      const parentPos = positions.get(n.parentId)!;
      const angle = (i * 2.39996) % (Math.PI * 2);
      const elevation = ((i % 3) - 1) * 2.2;
      const offset = new THREE.Vector3(
        Math.cos(angle) * 5.4,
        elevation,
        Math.sin(angle) * 5.4
      );
      positions.set(n.id, parentPos.clone().add(offset));
    } else {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
      const theta = Math.PI * (1 + 5 ** 0.5) * (i + 0.5);
      const x = baseRadius * Math.sin(phi) * Math.cos(theta);
      const y = baseRadius * Math.cos(phi) * 0.75;
      const z = baseRadius * Math.sin(phi) * Math.sin(theta);
      positions.set(n.id, new THREE.Vector3(x, y, z));
    }
  });

  // 2. Deterministic Relaxation Loop (85 iterations, min separation 4.3)
  const minSep = 4.3;
  const idealEdgeLen = 5.0;
  const iterations = 85;

  for (let it = 0; it < iterations; it++) {
    // Repulsion between all node pairs
    for (let i = 0; i < count; i++) {
      const idA = nodes[i].id;
      const posA = positions.get(idA)!;

      for (let j = i + 1; j < count; j++) {
        const idB = nodes[j].id;
        const posB = positions.get(idB)!;

        const delta = posA.clone().sub(posB);
        let dist = delta.length();
        if (dist < 0.01) {
          delta.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
          dist = 0.01;
        }

        if (dist < minSep) {
          const push = ((minSep - dist) / dist) * 0.14;
          posA.addScaledVector(delta, push);
          posB.addScaledVector(delta, -push);
        }
      }
    }

    // Spring attraction along connected links
    const handleAttraction = (sourceId: string, targetId: string) => {
      const posA = positions.get(sourceId);
      const posB = positions.get(targetId);
      if (!posA || !posB) return;

      const delta = posB.clone().sub(posA);
      const dist = delta.length();
      if (dist > idealEdgeLen) {
        const pull = ((dist - idealEdgeLen) / (dist || 1)) * 0.045;
        posA.addScaledVector(delta, pull);
        posB.addScaledVector(delta, -pull);
      }
    };

    nodes.forEach((n, idx) => {
      if (n.parentId) handleAttraction(n.parentId, n.id);
      else if (idx < count - 1 && !nodes[idx + 1].parentId) {
        handleAttraction(n.id, nodes[idx + 1].id);
      }
    });

    forgedSynapses.forEach((fs) => {
      handleAttraction(fs.sourceId, fs.targetId);
    });

    // Centering dampening
    positions.forEach((pos) => {
      pos.multiplyScalar(0.99);
    });
  }

  return positions;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StudyTerrarium({
  deckTitle,
  nodes,
  values = [],
  day = 0,
  activeIndex = 0,
  forgedSynapses = [],
  onSelectConcept,
  onUpdateMastery,
  onAddSubconcepts,
  onForgeSynapse,
  onResetDay,
  onJumpToTutor,
  onJumpToAR,
}: StudyTerrariumProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const inspectorScrollRef = useRef<HTMLDivElement>(null);

  // ── States ──────────────────────────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    nodes[activeIndex]?.id || null
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "weak" | "mastered">("all");

  // Feature 1: Synapse Fusion Mode
  const [fuseMode, setFuseMode] = useState(false);
  const [fusionA, setFusionA] = useState<string | null>(null);
  const [fusionB, setFusionB] = useState<string | null>(null);
  const [fusionLoading, setFusionLoading] = useState(false);
  const [fusionData, setFusionData] = useState<ForgedBridgePayload | null>(null);
  const [fusionQuizSelected, setFusionQuizSelected] = useState<number | null>(null);
  const [fusionAnswered, setFusionAnswered] = useState(false);
  const [fusionError, setFusionError] = useState<string | null>(null);

  // Feature 2: Branch Deeper inline state
  const [branchingLoading, setBranchingLoading] = useState(false);
  const [branchingError, setBranchingError] = useState<string | null>(null);

  // Feature 3: Dynamic Infinite Recall Quiz Mode
  const [quizQuestionData, setQuizQuestionData] = useState<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  } | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizHistory, setQuizHistory] = useState<string[]>([]);
  const [inspectorQuizSelected, setInspectorQuizSelected] = useState<number | null>(null);
  const [inspectorQuizAnswered, setInspectorQuizAnswered] = useState(false);

  // Feature 4: Neural Study GPS (Interactive 5-stop Path)
  const [studyPathActive, setStudyPathActive] = useState(false);
  const [studyPathIndex, setStudyPathIndex] = useState(0);

  // View Controls
  const [autoRotate, setAutoRotate] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Projected 2D screen positions for labels
  const [labelCoords, setLabelCoords] = useState<
    Array<{
      id: string;
      title: string;
      x: number;
      y: number;
      visible: boolean;
      mastery: number;
    }>
  >([]);

  // Projected 2D screen positions for forged arc pills
  const [bridgePillCoords, setBridgePillCoords] = useState<
    Array<{
      key: string;
      label: string;
      x: number;
      y: number;
      visible: boolean;
      bridge: ForgedSynapse;
    }>
  >([]);

  // ── Synapse Fusion State Machine Refs (Immune to Stale Closures) ─────────────
  const fuseModeRef = useRef(fuseMode);
  fuseModeRef.current = fuseMode;

  const fusionARef = useRef(fusionA);
  fusionARef.current = fusionA;

  const fusionBRef = useRef(fusionB);
  fusionBRef.current = fusionB;

  const hoveredNodeIdRef = useRef(hoveredNodeId);
  hoveredNodeIdRef.current = hoveredNodeId;

  // Surprise / Try Another Pair Rotation Ref
  const recentPairsRef = useRef<Set<string>>(new Set());

  // ── Three.js Scene References ───────────────────────────────────────────────
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const linksGroupRef = useRef<THREE.Group | null>(null);
  const arcsGroupRef = useRef<THREE.Group | null>(null);
  const studyPathMeshGroupRef = useRef<THREE.Group | null>(null);
  const previewBeamLineRef = useRef<THREE.Line | null>(null);

  // Map of 3D objects per node
  const nodeObjectsRef = useRef<
    Map<
      string,
      {
        mesh: THREE.Mesh;
        coreMesh: THREE.Mesh;
        shaderMat: THREE.ShaderMaterial;
        sprite: THREE.Sprite;
        ringMesh: THREE.Mesh;
        currentPos: THREE.Vector3;
        targetPos: THREE.Vector3;
        pulseTimer: number;
      }
    >
  >(new Map());

  // Camera lerp animation ref
  const isCameraLerpingRef = useRef(false);
  const targetCameraPosRef = useRef(new THREE.Vector3());
  const targetLookAtRef = useRef(new THREE.Vector3());

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  // ── Compute 3D Positions ────────────────────────────────────────────────────
  const targetPositions = useMemo(() => {
    return computeForceDirected3DPositions(nodes, forgedSynapses);
  }, [nodes, forgedSynapses]);

  // ── Compute Dynamic Study Path ──────────────────────────────────────────────
  const studyPathStops = useMemo(() => {
    if (!nodes.length) return [];
    const scored = nodes.map((n, i) => {
      const currentVal = values[i] ?? n.retention ?? 0;
      return {
        node: n,
        index: i,
        mastery: currentVal,
      };
    });
    const weakList = scored
      .filter((x) => x.mastery < 80)
      .sort((a, b) => a.mastery - b.mastery);
    const pool = weakList.length >= 3 ? weakList : scored;
    return pool.slice(0, 5);
  }, [nodes, values]);

  // ── Camera Framing Helpers ──────────────────────────────────────────────────
  const cancelCameraTransition = useCallback(() => {
    isCameraLerpingRef.current = false;
  }, []);

  const smoothFrame = useCallback(
    (targetPos: THREE.Vector3, lookAt: THREE.Vector3) => {
      targetCameraPosRef.current.copy(targetPos);
      targetLookAtRef.current.copy(lookAt);
      isCameraLerpingRef.current = true;
    },
    []
  );

  const frameSingleOrb = useCallback(
    (nodeId: string, hasRightDrawer = false, minDistance?: number) => {
      const obj = nodeObjectsRef.current.get(nodeId);
      if (!obj || !cameraRef.current) return;

      const targetLook = obj.targetPos.clone();
      if (hasRightDrawer) {
        // Shift camera lookAt to right so sphere sits in open left area
        targetLook.x += 1.8;
      }

      const currentDist = cameraRef.current.position.distanceTo(targetLook);
      const dist =
        minDistance !== undefined
          ? Math.max(minDistance, Math.min(currentDist, 11.0))
          : 6.8;

      const dir = cameraRef.current.position.clone().sub(targetLook).normalize();
      if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
      const camPos = targetLook.clone().add(dir.multiplyScalar(dist));
      smoothFrame(camPos, targetLook);
    },
    [smoothFrame]
  );

  const frameFusedPair = useCallback(
    (idA: string, idB: string) => {
      const objA = nodeObjectsRef.current.get(idA);
      const objB = nodeObjectsRef.current.get(idB);
      if (!objA || !objB || !cameraRef.current) return;

      const mid = objA.targetPos.clone().add(objB.targetPos).multiplyScalar(0.5);
      const dist = objA.targetPos.distanceTo(objB.targetPos);
      const dir = cameraRef.current.position.clone().sub(mid).normalize();
      const distOffset = Math.max(7.2, dist * 1.85);
      const camPos = mid.clone().add(dir.multiplyScalar(distOffset));
      smoothFrame(camPos, mid);
    },
    [smoothFrame]
  );

  const handleResetView = useCallback(() => {
    cancelCameraTransition();
    smoothFrame(new THREE.Vector3(0, 4, 18), new THREE.Vector3(0, 0, 0));
    setSelectedNodeId(null);
    setFusionA(null);
    setFusionB(null);
    setFusionData(null);
  }, [cancelCameraTransition, smoothFrame]);

  // ── Fix Stale Quiz Leak Between Nodes ───────────────────────────────────────
  useEffect(() => {
    setQuizQuestionData(null);
    setInspectorQuizSelected(null);
    setInspectorQuizAnswered(false);
    setQuizError(null);
    setBranchingError(null);
    setQuizHistory([]);
    if (inspectorScrollRef.current) {
      inspectorScrollRef.current.scrollTop = 0;
    }
  }, [selectedNodeId]);

  // Auto-scroll inspector when fusion targets change
  useEffect(() => {
    if (inspectorScrollRef.current) {
      inspectorScrollRef.current.scrollTop = 0;
    }
    setFusionError(null);
  }, [fusionA, fusionB]);

  // ── Initialize Scene ────────────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0B0B0C");
    scene.fog = new THREE.FogExp2("#0B0B0C", 0.016);
    sceneRef.current = scene;

    // 2. Camera with enforced comfortable depth
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 5, 19);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls with strict distance clamping
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.85;
    controls.minDistance = 3.4; // Prevents camera from ever clipping inside an orb!
    controls.maxDistance = 26.0;

    controls.addEventListener("start", cancelCameraTransition);
    controlsRef.current = controls;

    // 5. Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(12, 20, 16);
    scene.add(dir);

    // 6. Subtle Concentric Radial Spatial Horizon Anchor (at y = -6.4)
    const horizonGroup = new THREE.Group();
    horizonGroup.position.set(0, -6.4, 0);
    const horizonRadii = [6, 11, 17, 23];
    horizonRadii.forEach((rad) => {
      const ringGeo = new THREE.RingGeometry(rad - 0.03, rad, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.04,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      horizonGroup.add(ringMesh);
    });
    scene.add(horizonGroup);

    // 7. Groups for Links, Arcs & Preview Beam
    const linksGroup = new THREE.Group();
    scene.add(linksGroup);
    linksGroupRef.current = linksGroup;

    const arcsGroup = new THREE.Group();
    scene.add(arcsGroup);
    arcsGroupRef.current = arcsGroup;

    const studyPathGroup = new THREE.Group();
    scene.add(studyPathGroup);
    studyPathMeshGroupRef.current = studyPathGroup;

    // Live Aim-to-Fuse Preview Beam (Dashed Line)
    const previewGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const previewMat = new THREE.LineDashedMaterial({
      color: 0xc6f432,
      dashSize: 0.35,
      gapSize: 0.22,
      transparent: true,
      opacity: 0.85,
    });
    const previewLine = new THREE.Line(previewGeo, previewMat);
    previewLine.visible = false;
    scene.add(previewLine);
    previewBeamLineRef.current = previewLine;

    // 8. Pointer Click & Drag Guard (Threshold = 6px)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDown = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = Math.abs(e.clientX - pointerDown.x);
      const dy = Math.abs(e.clientY - pointerDown.y);
      if (dx > 6 || dy > 6) return; // Drag occurred, cancel click!

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      raycaster.params.Line = { threshold: 0.4 };

      const clickableMeshes: THREE.Mesh[] = [];
      nodeObjectsRef.current.forEach((obj) => {
        clickableMeshes.push(obj.mesh);
      });

      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const clickedId = hits[0].object.userData.nodeId;
        if (clickedId) {
          handleOrbClick(clickedId, e.shiftKey);
          return;
        }
      }

      // Check if user clicked a forged synapse arc
      const arcLines: THREE.Line[] = [];
      if (arcsGroupRef.current) {
        arcsGroupRef.current.children.forEach((c) => {
          if (c.userData?.forgedSynapse) {
            arcLines.push(c as THREE.Line);
          }
        });
      }
      if (arcLines.length > 0) {
        const arcHits = raycaster.intersectObjects(arcLines, false);
        if (arcHits.length > 0 && arcHits[0].object.userData?.forgedSynapse) {
          handleOpenSavedBridge(arcHits[0].object.userData.forgedSynapse);
          return;
        }
      }

      // Clicked background
      if (!fuseModeRef.current) {
        setSelectedNodeId(null);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const clickableMeshes: THREE.Mesh[] = [];
      nodeObjectsRef.current.forEach((obj) => {
        clickableMeshes.push(obj.mesh);
      });

      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        setHoveredNodeId(hits[0].object.userData.nodeId);
        renderer.domElement.style.cursor = "pointer";
      } else {
        setHoveredNodeId(null);
        renderer.domElement.style.cursor = "grab";
      }
    };

    const domEl = renderer.domElement;
    domEl.addEventListener("pointerdown", onPointerDown);
    domEl.addEventListener("pointerup", onPointerUp);
    domEl.addEventListener("pointermove", onPointerMove);

    // 9. Main Animation Loop
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Auto-orbit
      if (autoRotateRef.current && !isCameraLerpingRef.current) {
        scene.rotation.y += delta * 0.08;
      }

      // Smooth camera lerp
      if (isCameraLerpingRef.current && cameraRef.current && controlsRef.current) {
        cameraRef.current.position.lerp(targetCameraPosRef.current, 0.085);
        controlsRef.current.target.lerp(targetLookAtRef.current, 0.085);

        if (
          cameraRef.current.position.distanceTo(targetCameraPosRef.current) < 0.03 &&
          controlsRef.current.target.distanceTo(targetLookAtRef.current) < 0.03
        ) {
          cameraRef.current.position.copy(targetCameraPosRef.current);
          controlsRef.current.target.copy(targetLookAtRef.current);
          isCameraLerpingRef.current = false;
        }
      }

      controls.update();

      // Update Node 3D Objects
      const coords: Array<{
        id: string;
        title: string;
        x: number;
        y: number;
        visible: boolean;
        mastery: number;
      }> = [];

      nodeObjectsRef.current.forEach((obj, nodeId) => {
        obj.currentPos.lerp(obj.targetPos, 0.1);
        obj.mesh.position.copy(obj.currentPos);
        obj.coreMesh.position.copy(obj.currentPos);
        obj.sprite.position.copy(obj.currentPos);
        obj.ringMesh.position.copy(obj.currentPos);

        obj.shaderMat.uniforms.uTime.value = elapsed;

        if (obj.pulseTimer > 0) {
          obj.pulseTimer = Math.max(0, obj.pulseTimer - delta * 1.25);
          obj.shaderMat.uniforms.uPulse.value = obj.pulseTimer;
        }

        const isTarget =
          nodeId === selectedNodeId ||
          nodeId === hoveredNodeIdRef.current ||
          nodeId === fusionARef.current ||
          nodeId === fusionBRef.current;
        const targetCharge = isTarget ? 1.0 : 0.0;
        obj.shaderMat.uniforms.uCharge.value = THREE.MathUtils.lerp(
          obj.shaderMat.uniforms.uCharge.value,
          targetCharge,
          0.12
        );

        obj.ringMesh.rotation.z = elapsed * 0.4;

        // Project position to 2D screen space
        const screenV = obj.currentPos.clone().project(camera);
        const halfW = width / 2;
        const halfH = height / 2;
        const sx = screenV.x * halfW + halfW;
        const sy = -(screenV.y * halfH) + halfH;
        const isBehind = screenV.z > 1;

        coords.push({
          id: nodeId,
          title: obj.mesh.userData.title || "",
          x: sx,
          y: sy,
          visible:
            !isBehind && sx > -40 && sx < width + 40 && sy > -40 && sy < height + 40,
          mastery: obj.mesh.userData.mastery ?? 0,
        });
      });

      setLabelCoords(coords);

      // Live Aim-to-Fuse Preview Beam Update
      const pBeam = previewBeamLineRef.current;
      if (pBeam) {
        const curA = fusionARef.current;
        const curB = fusionBRef.current;
        const curHov = hoveredNodeIdRef.current;
        const isFuse = fuseModeRef.current;

        if (isFuse && curA && !curB && curHov && curHov !== curA) {
          const objA = nodeObjectsRef.current.get(curA);
          const objHov = nodeObjectsRef.current.get(curHov);
          if (objA && objHov) {
            const points = [objA.currentPos, objHov.currentPos];
            pBeam.geometry.setFromPoints(points);
            pBeam.computeLineDistances();
            pBeam.visible = true;
          } else {
            pBeam.visible = false;
          }
        } else {
          pBeam.visible = false;
        }
      }

      // Animate Crackling Electric Arcs
      if (arcsGroupRef.current) {
        arcsGroupRef.current.children.forEach((child: any) => {
          if (child.userData?.curve && child.geometry) {
            const curve = child.userData.curve as THREE.QuadraticBezierCurve3;
            const points = curve.getPoints(36);
            const isWhiteCore = child.userData.isCore;
            const seed = child.userData.seed || 1;

            for (let i = 1; i < points.length - 1; i++) {
              const t = i / (points.length - 1);
              const envelope = Math.sin(Math.PI * t);
              const noiseX =
                Math.sin(t * 18 + elapsed * 16 * seed) * 0.18 * envelope;
              const noiseY =
                Math.cos(t * 22 - elapsed * 18 * seed) * 0.18 * envelope;
              const noiseZ =
                Math.sin(t * 14 + elapsed * 14 * seed) * 0.18 * envelope;
              points[i].x += isWhiteCore ? noiseX * 0.6 : noiseX;
              points[i].y += isWhiteCore ? noiseY * 0.6 : noiseY;
              points[i].z += isWhiteCore ? noiseZ * 0.6 : noiseZ;
            }
            child.geometry.setFromPoints(points);
          }
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      domEl.removeEventListener("pointerdown", onPointerDown);
      domEl.removeEventListener("pointerup", onPointerUp);
      domEl.removeEventListener("pointermove", onPointerMove);
      controls.dispose();
      renderer.dispose();
      if (domEl.parentNode) domEl.parentNode.removeChild(domEl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync 3D Electric Knowledge Orbs With Nodes ──────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old meshes
    nodeObjectsRef.current.forEach((obj) => {
      scene.remove(obj.mesh);
      scene.remove(obj.coreMesh);
      scene.remove(obj.sprite);
      scene.remove(obj.ringMesh);
      obj.mesh.geometry.dispose();
      obj.shaderMat.dispose();
      (obj.coreMesh.material as THREE.Material).dispose();
      obj.sprite.geometry.dispose();
      (obj.sprite.material as THREE.Material).dispose();
      obj.ringMesh.geometry.dispose();
      (obj.ringMesh.material as THREE.Material).dispose();
    });
    nodeObjectsRef.current.clear();

    // Sleeker orb radius: 0.40 core, 0.40 * 1.14 plasma shell
    const orbRadius = 0.4;
    const sphereGeo = new THREE.SphereGeometry(orbRadius * 1.14, 32, 32);
    const coreGeo = new THREE.SphereGeometry(orbRadius * 0.9, 24, 24);

    nodes.forEach((n, idx) => {
      const mastery = values[idx] ?? n.retention ?? 0;
      const theme = getMasteryTheme(mastery);
      const targetPos = targetPositions.get(n.id) || new THREE.Vector3();

      // 1. Obsidian Glass Core
      const coreMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#0C0C10"),
        roughness: 0.18,
        metalness: 0.2,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        emissive: theme.threeColor,
        emissiveIntensity: 0.18,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.copy(targetPos);

      // 2. Custom GLSL Electric-Filament Plasma Shell
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

      const mesh = new THREE.Mesh(sphereGeo, shaderMat);
      mesh.position.copy(targetPos);
      mesh.userData = { nodeId: n.id, index: idx, title: n.title, mastery };

      // 3. Procedural Radial Sprite Glow Texture
      const glowTex = createGlowTexture(theme.hex);
      const spriteMat = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.65,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(2.0, 2.0, 1.0);
      sprite.position.copy(targetPos);

      // 4. Thin 3D Orbital Mastery Ring
      const arcLen = Math.max(0.05, (mastery / 100) * Math.PI * 2);
      const ringGeo = new THREE.TorusGeometry(
        orbRadius * 1.45,
        0.015,
        8,
        48,
        arcLen
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: theme.threeColor,
        transparent: true,
        opacity: 0.7,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI * 0.35;
      ringMesh.rotation.y = Math.PI * 0.2;
      ringMesh.position.copy(targetPos);

      scene.add(coreMesh);
      scene.add(mesh);
      scene.add(sprite);
      scene.add(ringMesh);

      nodeObjectsRef.current.set(n.id, {
        mesh,
        coreMesh,
        shaderMat,
        sprite,
        ringMesh,
        currentPos: targetPos.clone(),
        targetPos,
        pulseTimer: 0,
      });
    });
  }, [nodes, values, targetPositions]);

  // ── Sync Default Graph & Branch Edges ─────────────────────────────────────
  useEffect(() => {
    const linksGroup = linksGroupRef.current;
    if (!linksGroup) return;

    while (linksGroup.children.length > 0) {
      const child = linksGroup.children[0];
      linksGroup.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) (child as any).material.dispose();
    }

    const baseLineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
    });

    const branchLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.38,
    });

    // 1. Sequential base links
    nodes.forEach((n, i) => {
      const posA = targetPositions.get(n.id);
      if (!posA || isNaN(posA.x) || isNaN(posA.y) || isNaN(posA.z)) return;

      if (i < nodes.length - 1 && !nodes[i + 1]?.parentId && !n.parentId) {
        const posB = targetPositions.get(nodes[i + 1].id);
        if (posB && !isNaN(posB.x) && !isNaN(posB.y) && !isNaN(posB.z)) {
          const pts = [posA, posB];
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          linksGroup.add(new THREE.Line(geo, baseLineMat));
        }
      }
    });

    // 2. Structural sub-concept branches (sleek, calm translucent cyan/slate)
    const branchLinks = new Set<string>();
    nodes.forEach((n) => {
      if (n.parentId && targetPositions.has(n.parentId)) {
        const posA = targetPositions.get(n.id);
        const posP = targetPositions.get(n.parentId);
        if (
          posA &&
          posP &&
          !isNaN(posA.x) &&
          !isNaN(posA.y) &&
          !isNaN(posP.x) &&
          !isNaN(posP.y)
        ) {
          const key = [n.id, n.parentId].sort().join("::");
          branchLinks.add(key);
          const pts = [posA, posP];
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          linksGroup.add(new THREE.Line(geo, branchLineMat));
        }
      }
    });

    forgedSynapses.forEach((fs) => {
      if (fs.kind === "branch" || fs.label === "Sub-concept") {
        const key = [fs.sourceId, fs.targetId].sort().join("::");
        if (!branchLinks.has(key)) {
          branchLinks.add(key);
          const posA = targetPositions.get(fs.sourceId);
          const posB = targetPositions.get(fs.targetId);
          if (
            posA &&
            posB &&
            !isNaN(posA.x) &&
            !isNaN(posA.y) &&
            !isNaN(posB.x) &&
            !isNaN(posB.y)
          ) {
            const pts = [posA, posB];
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            linksGroup.add(new THREE.Line(geo, branchLineMat));
          }
        }
      }
    });
  }, [nodes, targetPositions, forgedSynapses]);

  // ── Sync Crackling Electric Arcs (Genuine Synapse Fusion Bridges ONLY) ─────
  useEffect(() => {
    const arcsGroup = arcsGroupRef.current;
    if (!arcsGroup) return;

    while (arcsGroup.children.length > 0) {
      const child = arcsGroup.children[0];
      arcsGroup.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) (child as any).material.dispose();
    }

    const addArcBetween = (
      idA: string,
      idB: string,
      isLiveFusion = false,
      fsRef?: ForgedSynapse
    ) => {
      const posA = targetPositions.get(idA);
      const posB = targetPositions.get(idB);
      if (
        !posA ||
        !posB ||
        isNaN(posA.x) ||
        isNaN(posA.y) ||
        isNaN(posB.x) ||
        isNaN(posB.y)
      )
        return;

      const mid = posA.clone().add(posB).multiplyScalar(0.5);
      const normal = mid
        .clone()
        .normalize()
        .multiplyScalar(isLiveFusion ? 2.6 : 1.8);
      const ctrl = mid.clone().add(normal);

      const curve = new THREE.QuadraticBezierCurve3(posA, ctrl, posB);
      const pts = curve.getPoints(36);

      // Strand 1: Outer glowing lime arc
      const glowGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const glowMat = new THREE.LineBasicMaterial({
        color: 0xc6f432,
        transparent: true,
        opacity: isLiveFusion ? 0.95 : 0.75,
      });
      const glowLine = new THREE.Line(glowGeo, glowMat);
      glowLine.userData = {
        curve,
        isCore: false,
        seed: 1,
        forgedSynapse: fsRef,
      };
      arcsGroup.add(glowLine);

      // Strand 2: Crisp white-hot core
      const coreGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const coreMat = new THREE.LineBasicMaterial({
        color: 0xf0ffbe,
        transparent: true,
        opacity: isLiveFusion ? 1.0 : 0.85,
      });
      const coreLine = new THREE.Line(coreGeo, coreMat);
      coreLine.userData = {
        curve,
        isCore: true,
        seed: 2,
        forgedSynapse: fsRef,
      };
      arcsGroup.add(coreLine);
    };

    // Render crackling electric arcs ONLY for genuine forged Synapse Fusion bridges (NOT branches)
    const genuineForged = forgedSynapses.filter(
      (fs) =>
        fs.kind === "forged" ||
        (fs.isCustom && fs.kind !== "branch" && fs.label !== "Sub-concept")
    );

    genuineForged.forEach((fs) => {
      addArcBetween(fs.sourceId, fs.targetId, false, fs);
    });

    // Active live fusion pair
    if (fusionA && fusionB && fusionA !== fusionB) {
      addArcBetween(fusionA, fusionB, true);
    }
  }, [forgedSynapses, fusionA, fusionB, targetPositions]);

  // Project Floating Midpoint Pills for Forged Synapses (GENUINE BRIDGES ONLY)
  useEffect(() => {
    if (!cameraRef.current || !mountRef.current || forgedSynapses.length === 0) {
      setBridgePillCoords([]);
      return;
    }

    const camera = cameraRef.current;
    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;

    const pills: Array<{
      key: string;
      label: string;
      x: number;
      y: number;
      visible: boolean;
      bridge: ForgedSynapse;
    }> = [];

    const genuineForged = forgedSynapses.filter(
      (fs) =>
        fs.kind === "forged" ||
        (fs.isCustom && fs.kind !== "branch" && fs.label !== "Sub-concept")
    );

    genuineForged.forEach((fs) => {
      const posA = targetPositions.get(fs.sourceId);
      const posB = targetPositions.get(fs.targetId);
      if (
        !posA ||
        !posB ||
        isNaN(posA.x) ||
        isNaN(posA.y) ||
        isNaN(posB.x) ||
        isNaN(posB.y)
      )
        return;

      const mid = posA.clone().add(posB).multiplyScalar(0.5);
      const normal = mid.clone().normalize().multiplyScalar(1.8);
      const ctrl = mid.clone().add(normal);

      const screenV = ctrl.project(camera);
      const sx = screenV.x * (w / 2) + w / 2;
      const sy = -(screenV.y * (h / 2)) + h / 2;
      const isBehind = screenV.z > 1;

      pills.push({
        key: `${fs.sourceId}-${fs.targetId}`,
        label: fs.label,
        x: sx,
        y: sy,
        visible: !isBehind && sx > 0 && sx < w && sy > 0 && sy < h,
        bridge: fs,
      });
    });

    setBridgePillCoords(pills);
  }, [forgedSynapses, targetPositions, labelCoords]);

  // ── Sync Neural Study GPS 3D Path ───────────────────────────────────────────
  useEffect(() => {
    const group = studyPathMeshGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) (child as any).material.dispose();
    }

    if (!studyPathActive || studyPathStops.length < 2) return;

    const points: THREE.Vector3[] = [];
    studyPathStops.forEach((stop) => {
      const p = targetPositions.get(stop.node.id);
      if (p && !isNaN(p.x) && !isNaN(p.y) && !isNaN(p.z)) {
        points.push(p.clone());
      }
    });

    if (points.length >= 2) {
      const pathGeo = new THREE.BufferGeometry().setFromPoints(points);
      const pathMat = new THREE.LineBasicMaterial({
        color: 0xc6f432,
        transparent: true,
        opacity: 0.85,
      });
      group.add(new THREE.Line(pathGeo, pathMat));
    }
  }, [studyPathActive, studyPathStops, targetPositions]);

  // ── Robust 2-Click Orb Selection State Machine ──────────────────────────────
  const handleOrbClick = (nodeId: string, shiftKey: boolean) => {
    const isFuse = fuseModeRef.current || shiftKey;

    if (isFuse) {
      const curA = fusionARef.current;
      const curB = fusionBRef.current;

      // Rule 1: No concept selected yet -> Lock A
      if (!curA) {
        setFusionA(nodeId);
        setFusionB(null);
        setFusionData(null);
        setSelectedNodeId(null);
        // Keep wide overview distance >= 9.5 so remaining orbs remain visible
        frameSingleOrb(nodeId, false, 9.8);
        return;
      }

      // Rule 2: Clicked A again -> Deselect A
      if (curA === nodeId) {
        setFusionA(null);
        setFusionB(null);
        setFusionData(null);
        return;
      }

      // Rule 3: A locked, no B, clicked another node -> Lock B and fetch bridge
      if (curA && !curB && nodeId !== curA) {
        setFusionB(nodeId);
        setSelectedNodeId(null);
        setFusionData(null);
        frameFusedPair(curA, nodeId);
        triggerFusionBridge(curA, nodeId);
        return;
      }

      // Rule 4: A & B already active, user clicks 3rd node -> Cleanly start NEW selection with clicked node as A
      if (curA && curB) {
        setFusionA(nodeId);
        setFusionB(null);
        setFusionData(null);
        setSelectedNodeId(null);
        // Keep wide overview distance >= 9.5 so remaining orbs remain visible
        frameSingleOrb(nodeId, false, 9.8);
        return;
      }
    }

    // Standard inspection mode
    setSelectedNodeId(nodeId);
    onSelectConcept(nodeId);
    frameSingleOrb(nodeId, true);
  };

  // ── Open Saved Bridge on Click ──────────────────────────────────────────────
  const handleOpenSavedBridge = (bridge: ForgedSynapse) => {
    setFuseMode(true);
    setFusionA(bridge.sourceId);
    setFusionB(bridge.targetId);
    setSelectedNodeId(null);

    if (bridge.data) {
      setFusionData(bridge.data);
      setFusionLoading(false);
      setFusionError(null);
      setFusionAnswered(true);
      setFusionQuizSelected(bridge.data.correctIndex);
    } else {
      triggerFusionBridge(bridge.sourceId, bridge.targetId);
    }
    frameFusedPair(bridge.sourceId, bridge.targetId);
  };

  // ── Surprise / Try Another Pair Rotation Generator ──────────────────────────
  const getNextUnpairedConcepts = (): [string, string] | null => {
    if (nodes.length < 2) return null;

    const allPairs: [string, string][] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        allPairs.push([nodes[i].id, nodes[j].id]);
      }
    }

    const forgedSet = new Set(
      forgedSynapses.map((s) => [s.sourceId, s.targetId].sort().join("::"))
    );

    // Filter candidate pairs not yet forged and not in recentPairsRef
    let candidates = allPairs.filter((pair) => {
      const key = [...pair].sort().join("::");
      return !forgedSet.has(key) && !recentPairsRef.current.has(key);
    });

    if (candidates.length === 0) {
      recentPairsRef.current.clear();
      candidates = allPairs.filter((pair) => {
        const key = [...pair].sort().join("::");
        return !forgedSet.has(key);
      });
      if (candidates.length === 0) {
        candidates = allPairs;
      }
    }

    // Sort by lowest combined retention to prioritize weakest links
    candidates.sort((p1, p2) => {
      const n1A = nodes.find((n) => n.id === p1[0]);
      const n1B = nodes.find((n) => n.id === p1[1]);
      const n2A = nodes.find((n) => n.id === p2[0]);
      const n2B = nodes.find((n) => n.id === p2[1]);
      const ret1 = (n1A?.retention ?? 50) + (n1B?.retention ?? 50);
      const ret2 = (n2A?.retention ?? 50) + (n2B?.retention ?? 50);
      return ret1 - ret2;
    });

    const chosen = candidates[0];
    const chosenKey = [...chosen].sort().join("::");
    recentPairsRef.current.add(chosenKey);
    return chosen;
  };

  const handleSurprisePair = () => {
    const pair = getNextUnpairedConcepts();
    if (!pair) return;
    const [nA, nB] = pair;
    setFuseMode(true);
    setFusionA(nA);
    setFusionB(nB);
    setFusionData(null);
    setSelectedNodeId(null);
    frameFusedPair(nA, nB);
    triggerFusionBridge(nA, nB);
  };

  // ── Trigger Synapse Fusion AI Bridge ────────────────────────────────────────
  const triggerFusionBridge = async (idA: string, idB: string) => {
    const nodeA = nodes.find((n) => n.id === idA);
    const nodeB = nodes.find((n) => n.id === idB);
    if (!nodeA || !nodeB) return;

    setFusionLoading(true);
    setFusionError(null);
    setFusionData(null);
    setFusionQuizSelected(null);
    setFusionAnswered(false);

    try {
      const res = await fetch("/api/terrarium-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "bridge",
          conceptA: { title: nodeA.title, summary: nodeA.summary },
          conceptB: { title: nodeB.title, summary: nodeB.summary },
          deckTitle,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to synthesize connection");
      }

      const data: ForgedBridgePayload = await res.json();
      setFusionData(data);
    } catch (err: any) {
      setFusionError(err.message || "Synthesis failed. Please retry.");
    } finally {
      setFusionLoading(false);
    }
  };

  const handleAnswerFusionQuiz = (optIdx: number) => {
    if (fusionQuizSelected !== null || !fusionData) return;
    setFusionQuizSelected(optIdx);
    setFusionAnswered(true);

    const isCorrect = optIdx === fusionData.correctIndex;
    if (isCorrect && fusionA && fusionB) {
      onForgeSynapse(
        fusionA,
        fusionB,
        fusionData.relationshipLabel,
        true,
        fusionData
      );
      // Trigger electric pulse shockwave
      const objA = nodeObjectsRef.current.get(fusionA);
      const objB = nodeObjectsRef.current.get(fusionB);
      if (objA) objA.pulseTimer = 1.0;
      if (objB) objB.pulseTimer = 1.0;
    }
  };

  // ── Feature 2: Branch Deeper (AI) ───────────────────────────────────────────
  const handleBranchDeeper = async (parent: Concept) => {
    setBranchingLoading(true);
    setBranchingError(null);
    try {
      const existingTitles = nodes.map((n) => n.title);
      const res = await fetch("/api/terrarium-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "expand",
          parentConcept: { title: parent.title, summary: parent.summary },
          existingTitles,
          deckTitle,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to grow sub-concepts");
      }

      const data = await res.json();
      if (Array.isArray(data.subconcepts) && data.subconcepts.length > 0) {
        onAddSubconcepts(parent.id, data.subconcepts);
        const parentObj = nodeObjectsRef.current.get(parent.id);
        if (parentObj) parentObj.pulseTimer = 1.0;
      }
    } catch (err: any) {
      setBranchingError(err.message || "Branching failed. Please retry.");
    } finally {
      setBranchingLoading(false);
    }
  };

  // ── Feature 3: Dynamic Infinite AI Recall Quiz ──────────────────────────────
  const handleFetchNextQuiz = async (concept: Concept) => {
    setQuizLoading(true);
    setQuizError(null);
    try {
      const res = await fetch("/api/terrarium-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "quiz",
          concept: { title: concept.title, summary: concept.summary },
          previousQuestions: quizHistory,
          deckTitle,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate question");
      }

      const data = await res.json();
      setQuizQuestionData(data);
      setQuizHistory((prev) => [...prev, data.question]);
      setInspectorQuizSelected(null);
      setInspectorQuizAnswered(false);
    } catch (err: any) {
      setQuizError(err.message || "Failed to fetch question");
    } finally {
      setQuizLoading(false);
    }
  };

  const handleAnswerInspectorQuiz = (
    optIdx: number,
    correctIdx: number,
    concept: Concept
  ) => {
    if (inspectorQuizSelected !== null) return;
    setInspectorQuizSelected(optIdx);
    setInspectorQuizAnswered(true);

    const isCorrect = optIdx === correctIdx;
    const currentM = concept.retention ?? 0;
    const newM = isCorrect
      ? Math.min(100, currentM + 15)
      : Math.max(5, currentM - 10);
    onUpdateMastery(concept.id, newM);

    if (isCorrect) {
      const obj = nodeObjectsRef.current.get(concept.id);
      if (obj) obj.pulseTimer = 1.0;
    }
  };

  // Active Selected Concept
  const selectedConcept = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Active quiz question for the selected concept
  const activeQuiz = useMemo(() => {
    if (quizQuestionData) return quizQuestionData;
    if (selectedConcept?.quiz) {
      return {
        question: selectedConcept.quiz.question,
        options: selectedConcept.quiz.options,
        correctIndex: selectedConcept.quiz.correctIndex,
        explanation: selectedConcept.quiz.explanation,
      };
    }
    return null;
  }, [quizQuestionData, selectedConcept]);

  // Connected Neighbors
  const neighborConcepts = useMemo(() => {
    if (!selectedConcept) return [];
    const connectedIds = new Set<string>();

    forgedSynapses.forEach((s) => {
      if (s.sourceId === selectedConcept.id) connectedIds.add(s.targetId);
      if (s.targetId === selectedConcept.id) connectedIds.add(s.sourceId);
    });

    if (selectedConcept.parentId) connectedIds.add(selectedConcept.parentId);
    nodes.forEach((n) => {
      if (n.parentId === selectedConcept.id) connectedIds.add(n.id);
    });

    const idx = nodes.findIndex((n) => n.id === selectedConcept.id);
    if (idx > 0) connectedIds.add(nodes[idx - 1].id);
    if (idx < nodes.length - 1) connectedIds.add(nodes[idx + 1].id);

    return nodes.filter(
      (n) => connectedIds.has(n.id) && n.id !== selectedConcept.id
    );
  }, [selectedConcept, nodes, forgedSynapses]);

  const avgMastery = useMemo(() => {
    if (!nodes.length) return 0;
    const total = nodes.reduce(
      (acc, n, i) => acc + (values[i] ?? n.retention ?? 0),
      0
    );
    return Math.round(total / nodes.length);
  }, [nodes, values]);

  const forgedCount = useMemo(() => {
    return forgedSynapses.filter(
      (fs) =>
        fs.kind === "forged" ||
        (fs.isCustom && fs.kind !== "branch" && fs.label !== "Sub-concept")
    ).length;
  }, [forgedSynapses]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#0B0B0C",
        userSelect: "none",
      }}
    >
      {/* ── Edge-to-Edge 3D Viewport ──────────────────────────────────────── */}
      <div
        ref={mountRef}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          outline: "none",
        }}
      />

      {/* ── Positioned HTML Labels Below Spheres (pointer-events: none) ───── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 10,
          overflow: "hidden",
        }}
      >
        {labelCoords.map((item) => {
          if (!item.visible) return null;
          const isSelected = item.id === selectedNodeId;
          const isHovered = item.id === hoveredNodeId;
          const isFusing = item.id === fusionA || item.id === fusionB;
          const studyStopIdx = studyPathStops.findIndex(
            (s) => s.node.id === item.id
          );
          const isStudyStop = studyPathActive && studyStopIdx !== -1;
          const isAimTarget =
            fuseMode &&
            fusionA &&
            !fusionB &&
            item.id === hoveredNodeId &&
            item.id !== fusionA;

          const isHighlighted =
            isSelected || isHovered || isFusing || isStudyStop || isAimTarget;
          const opacity = isHighlighted
            ? 1
            : selectedNodeId || fusionA
            ? 0.24
            : 0.75;

          return (
            <div
              key={item.id}
              style={{
                position: "absolute",
                left: `${item.x}px`,
                top: `${item.y + 16}px`,
                transform: "translate(-50%, 0)",
                whiteSpace: "nowrap",
                fontSize: 11,
                fontWeight: isHighlighted ? 600 : 500,
                color: isHighlighted ? "#FAFAFA" : "#A1A1AA",
                background: isHighlighted
                  ? "rgba(11, 11, 12, 0.88)"
                  : "transparent",
                border: isHighlighted
                  ? `1px solid ${
                      isFusing || isAimTarget
                        ? "#C6F432"
                        : "rgba(255, 255, 255, 0.14)"
                    }`
                  : "1px solid transparent",
                borderRadius: 6,
                padding: isHighlighted ? "2px 7px" : "0 2px",
                backdropFilter: isHighlighted ? "blur(12px)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 5,
                opacity,
                transition: "opacity 0.2s, color 0.15s, background 0.15s",
              }}
            >
              {isStudyStop && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    background: "#C6F432",
                    color: "#0B0B0C",
                    borderRadius: 3,
                    padding: "1px 4px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {String(studyStopIdx + 1).padStart(2, "0")}
                </span>
              )}
              {item.id === fusionA && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    background: "#C6F432",
                    color: "#0B0B0C",
                    borderRadius: 3,
                    padding: "1px 4px",
                  }}
                >
                  A
                </span>
              )}
              {item.id === fusionB && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    background: "#38BDF8",
                    color: "#0B0B0C",
                    borderRadius: 3,
                    padding: "1px 4px",
                  }}
                >
                  B
                </span>
              )}
              {isAimTarget && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    background: "#C6F432",
                    color: "#0B0B0C",
                    borderRadius: 3,
                    padding: "1px 4px",
                  }}
                >
                  Click to fuse
                </span>
              )}
              <span>{item.title}</span>
            </div>
          );
        })}

        {/* Clickable Floating Forged Arc Relationship Badges */}
        {bridgePillCoords.map((pill) => {
          if (!pill.visible) return null;
          return (
            <button
              key={pill.key}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenSavedBridge(pill.bridge);
              }}
              style={{
                position: "absolute",
                left: `${pill.x}px`,
                top: `${pill.y}px`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "auto",
                background: "rgba(11, 11, 12, 0.88)",
                border: "1px solid rgba(198, 244, 50, 0.4)",
                borderRadius: 999,
                padding: "2px 8px",
                color: "#C6F432",
                fontSize: 10.5,
                fontWeight: 650,
                backdropFilter: "blur(12px)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#C6F432";
                e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(198, 244, 50, 0.4)";
                e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)";
              }}
            >
              <Zap size={10} color="#C6F432" />
              <span>{pill.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Top-Left Floating Header with Live Stats & Projected Decay Badge ── */}
      <div
        style={{
          position: "absolute",
          top: 18,
          left: 22,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          gap: 9,
          pointerEvents: "auto",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#FAFAFA",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {deckTitle}
          </h2>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              flexWrap: "wrap",
              marginTop: 3,
            }}
          >
            <span style={{ fontSize: 12, color: "#A1A1AA" }}>
              {nodes.length} concepts · {avgMastery}% retention
            </span>
            <span style={{ fontSize: 11, color: "#71717A" }}>•</span>
            <span
              style={{
                fontSize: 12,
                color: "#C6F432",
                fontWeight: 550,
              }}
            >
              {forgedCount} forged
            </span>

            {day > 0 && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  background: "rgba(251, 191, 36, 0.12)",
                  border: "1px solid rgba(251, 191, 36, 0.35)",
                  borderRadius: 999,
                  padding: "1px 8px",
                  fontSize: 11,
                  color: "#FBBF24",
                  fontWeight: 600,
                }}
              >
                <span>Projected +{day}d</span>
                {onResetDay && (
                  <button
                    onClick={onResetDay}
                    title="Reset time-decay to 0d"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#FBBF24",
                      cursor: "pointer",
                      padding: "0 2px",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <ResetIcon size={10} />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3 Clean Pill Filters */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "#18181B",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 8,
            padding: 2,
            gap: 2,
            width: "fit-content",
          }}
        >
          {(["all", "weak", "mastered"] as const).map((m) => {
            const isAct = filterMode === m;
            return (
              <button
                key={m}
                onClick={() => setFilterMode(m)}
                style={{
                  padding: "4px 9px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 550,
                  border: "none",
                  cursor: "pointer",
                  background: isAct ? "#27272A" : "transparent",
                  color: isAct ? "#FAFAFA" : "#71717A",
                  textTransform: "capitalize",
                  transition: "all 0.15s ease",
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Top-Center Guided Prompt (Fusion Mode Active) ─────────────────── */}
      {fuseMode && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 25,
            background: "rgba(18, 18, 21, 0.94)",
            border: "1px solid rgba(198, 244, 50, 0.35)",
            borderRadius: 999,
            padding: "5px 14px",
            fontSize: 12,
            fontWeight: 550,
            color: "#FAFAFA",
            display: "flex",
            alignItems: "center",
            gap: 8,
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.45)",
          }}
        >
          <Zap size={14} color="#C6F432" />
          <span>
            {!fusionA
              ? "Select 1st concept"
              : !fusionB
              ? `Select 2nd concept to fuse with "${
                  nodes.find((n) => n.id === fusionA)?.title
                }"`
              : "Synapse Bridge active"}
          </span>

          {/* Surprise Pair Shortcut Button */}
          {!fusionB && (
            <button
              onClick={handleSurprisePair}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 6,
                background: "rgba(198, 244, 50, 0.15)",
                border: "1px solid rgba(198, 244, 50, 0.3)",
                color: "#C6F432",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              <Dices size={12} />
              <span>Surprise pair</span>
            </button>
          )}

          <button
            onClick={() => {
              setFuseMode(false);
              setFusionA(null);
              setFusionB(null);
              setFusionData(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#A1A1AA",
              cursor: "pointer",
              padding: 0,
              marginLeft: 4,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Bottom-Left Interactive 5-Stop Study Path HUD ─────────────────── */}
      {studyPathActive && studyPathStops.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 22,
            left: 22,
            zIndex: 25,
            background: "rgba(18, 18, 21, 0.92)",
            border: "1px solid rgba(198, 244, 50, 0.3)",
            borderRadius: 14,
            padding: "12px 16px",
            maxWidth: 340,
            backdropFilter: "blur(20px)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.08em",
                color: "#C6F432",
                fontWeight: 700,
              }}
            >
              NEURAL STUDY GPS
            </span>
            <button
              onClick={() => setStudyPathActive(false)}
              style={{
                background: "none",
                border: "none",
                color: "#71717A",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Clickable 5-Stop Numbered Pills */}
          <div style={{ display: "flex", gap: 5 }}>
            {studyPathStops.map((stop, sIdx) => {
              const isCurrent = studyPathIndex === sIdx;
              return (
                <button
                  key={stop.node.id}
                  onClick={() => {
                    setStudyPathIndex(sIdx);
                    setSelectedNodeId(stop.node.id);
                    frameSingleOrb(stop.node.id, true);
                  }}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    borderRadius: 6,
                    border: isCurrent
                      ? "1px solid rgba(198, 244, 50, 0.5)"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                    background: isCurrent
                      ? "rgba(198, 244, 50, 0.2)"
                      : "rgba(255, 255, 255, 0.04)",
                    color: isCurrent ? "#C6F432" : "#A1A1AA",
                    fontSize: 11,
                    fontWeight: 650,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  {String(sIdx + 1).padStart(2, "0")}
                </button>
              );
            })}
          </div>

          {/* Current Stop Title & Mastery */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#FAFAFA",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {studyPathStops[studyPathIndex]?.node.title}
            </span>
            <span
              style={{
                fontSize: 11,
                color: getMasteryTheme(
                  studyPathStops[studyPathIndex]?.mastery ?? 0
                ).hex,
                fontWeight: 650,
                flexShrink: 0,
              }}
            >
              {studyPathStops[studyPathIndex]?.mastery ?? 0}%
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <button
              onClick={() => {
                const stop = studyPathStops[studyPathIndex];
                if (stop) {
                  setSelectedNodeId(stop.node.id);
                  frameSingleOrb(stop.node.id, true);
                }
              }}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#FAFAFA",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Frame Stop
            </button>
            {onJumpToTutor && (
              <button
                onClick={() => {
                  const stop = studyPathStops[studyPathIndex];
                  if (stop) onJumpToTutor(stop.index);
                }}
                style={{
                  flex: 1.2,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "#C6F432",
                  border: "none",
                  color: "#0B0B0C",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: 650,
                }}
              >
                Start with Micu →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom-Center Floating Dock ───────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          pointerEvents: "auto",
        }}
      >
        {/* Search Popover */}
        {showSearch && (
          <div
            style={{
              width: 320,
              background: "rgba(18, 18, 21, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 14,
              padding: "10px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
              backdropFilter: "blur(24px)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 260,
            }}
          >
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find concept in terrarium…"
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                padding: "6px 10px",
                color: "#FAFAFA",
                fontSize: 12,
                outline: "none",
              }}
            />
            <div
              style={{
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {nodes
                .filter((n) =>
                  n.title.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setSelectedNodeId(n.id);
                      frameSingleOrb(n.id, true);
                      setShowSearch(false);
                      setSearchQuery("");
                    }}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "transparent",
                      border: "none",
                      color: "#A1A1AA",
                      fontSize: 12,
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.06)";
                      e.currentTarget.style.color = "#FAFAFA";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#A1A1AA";
                    }}
                  >
                    <span>{n.title}</span>
                    <span style={{ fontSize: 10, color: "#71717A" }}>
                      {n.retention ?? 0}%
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Compact Dock Pill */}
        <div
          style={{
            background: "rgba(18, 18, 21, 0.84)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 999,
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          }}
        >
          {/* Search Toggle */}
          <button
            onClick={() => setShowSearch((v) => !v)}
            title="Search concepts"
            style={{
              background: showSearch ? "rgba(255,255,255,0.12)" : "transparent",
              border: "none",
              color: showSearch ? "#FAFAFA" : "#A1A1AA",
              borderRadius: 8,
              padding: "6px 9px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
            }}
          >
            <Search size={14} />
          </button>

          <div
            style={{
              width: 1,
              height: 16,
              background: "rgba(255,255,255,0.1)",
            }}
          />

          {/* Fuse Concepts Toggle */}
          <button
            onClick={() => {
              const next = !fuseMode;
              setFuseMode(next);
              if (!next) {
                setFusionA(null);
                setFusionB(null);
                setFusionData(null);
              }
            }}
            style={{
              background: fuseMode
                ? "rgba(198, 244, 50, 0.16)"
                : "transparent",
              border: fuseMode
                ? "1px solid rgba(198, 244, 50, 0.4)"
                : "1px solid transparent",
              color: fuseMode ? "#C6F432" : "#A1A1AA",
              borderRadius: 999,
              padding: "5px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 550,
              transition: "all 0.15s ease",
            }}
          >
            <Zap size={14} />
            <span>Fuse Concepts</span>
          </button>

          {/* Study Path Toggle */}
          <button
            onClick={() => {
              const next = !studyPathActive;
              setStudyPathActive(next);
              if (next && studyPathStops.length > 0) {
                setStudyPathIndex(0);
                setSelectedNodeId(studyPathStops[0].node.id);
                frameSingleOrb(studyPathStops[0].node.id, true);
              }
            }}
            style={{
              background: studyPathActive
                ? "rgba(198, 244, 50, 0.16)"
                : "transparent",
              border: studyPathActive
                ? "1px solid rgba(198, 244, 50, 0.4)"
                : "1px solid transparent",
              color: studyPathActive ? "#C6F432" : "#A1A1AA",
              borderRadius: 999,
              padding: "5px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 550,
              transition: "all 0.15s ease",
            }}
          >
            <Navigation size={14} />
            <span>Study Path</span>
          </button>

          <div
            style={{
              width: 1,
              height: 16,
              background: "rgba(255,255,255,0.1)",
            }}
          />

          {/* Auto-Rotate Toggle */}
          <button
            onClick={() => setAutoRotate((v) => !v)}
            title={autoRotate ? "Pause orbit" : "Auto-orbit"}
            style={{
              background: autoRotate
                ? "rgba(255,255,255,0.12)"
                : "transparent",
              border: "none",
              color: autoRotate ? "#C6F432" : "#71717A",
              borderRadius: 8,
              padding: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            {autoRotate ? <Pause size={14} /> : <Play size={14} />}
          </button>

          {/* Reset View */}
          <button
            onClick={handleResetView}
            title="Reset viewpoint"
            style={{
              background: "transparent",
              border: "none",
              color: "#71717A",
              borderRadius: 8,
              padding: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* ── On-Demand Right Floating Inspector Card ──────────────────────── */}
      {/* CASE A: Synapse Fusion Active */}
      {fusionA && fusionB && (
        <div
          ref={inspectorScrollRef}
          style={{
            position: "absolute",
            top: 18,
            right: 22,
            bottom: 22,
            width: 340,
            zIndex: 30,
            maxHeight: "calc(100% - 40px)",
            overflowY: "auto",
            scrollbarWidth: "none",
            background: "rgba(15, 15, 18, 0.9)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 18,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.08em",
                color: "#C6F432",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              SYNAPSE FUSION
            </span>
            <button
              onClick={() => {
                setFusionA(null);
                setFusionB(null);
                setFusionData(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#A1A1AA",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Connected Pair Badges */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                padding: "4px 9px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.06)",
                fontSize: 12,
                color: "#FAFAFA",
                fontWeight: 550,
              }}
            >
              {nodes.find((n) => n.id === fusionA)?.title}
            </span>
            <span style={{ color: "#C6F432", fontSize: 13, fontWeight: 700 }}>
              ⟷
            </span>
            <span
              style={{
                padding: "4px 9px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.06)",
                fontSize: 12,
                color: "#FAFAFA",
                fontWeight: 550,
              }}
            >
              {nodes.find((n) => n.id === fusionB)?.title}
            </span>
          </div>

          {/* Loading State */}
          {fusionLoading && (
            <div
              style={{
                padding: "24px 12px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Sparkles size={20} color="#C6F432" className="animate-spin" />
              <span style={{ fontSize: 13, color: "#A1A1AA" }}>
                Synthesizing cognitive bridge…
              </span>
            </div>
          )}

          {/* Error with Inline Dark-Zinc Retry Banner */}
          {fusionError && !fusionLoading && (
            <div
              style={{
                padding: "12px",
                borderRadius: 10,
                background: "#18181B",
                border: "1px solid rgba(244, 66, 50, 0.3)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ color: "#fca5a5", fontSize: 12 }}>
                {fusionError}
              </div>
              <button
                onClick={() => triggerFusionBridge(fusionA, fusionB)}
                style={{
                  alignSelf: "flex-start",
                  padding: "5px 12px",
                  borderRadius: 6,
                  background: "#C6F432",
                  border: "none",
                  color: "#0B0B0C",
                  fontSize: 11,
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Fusion Bridge Content */}
          {fusionData && !fusionLoading && (
            <>
              <div
                style={{
                  display: "inline-block",
                  padding: "3px 9px",
                  borderRadius: 6,
                  background: "rgba(198, 244, 50, 0.12)",
                  border: "1px solid rgba(198, 244, 50, 0.3)",
                  color: "#C6F432",
                  fontSize: 11,
                  fontWeight: 650,
                  width: "fit-content",
                }}
              >
                {fusionData.relationshipLabel}
              </div>

              <div>
                <span
                  style={{
                    fontSize: 10,
                    color: "#71717A",
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                  }}
                >
                  HIDDEN LINK
                </span>
                <p
                  style={{
                    fontSize: 13,
                    color: "#D4D4D8",
                    lineHeight: 1.55,
                    margin: "4px 0 0",
                  }}
                >
                  {fusionData.connectionSummary}
                </p>
              </div>

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#FBBF24",
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                  }}
                >
                  EXAM TRAP
                </span>
                <p
                  style={{
                    fontSize: 12,
                    color: "#A1A1AA",
                    margin: "4px 0 0",
                    lineHeight: 1.5,
                  }}
                >
                  {fusionData.examTrap}
                </p>
              </div>

              {/* Cross-Concept Synthesis Quiz */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    color: "#71717A",
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                  }}
                >
                  CROSS-CONCEPT SYNTHESIS QUIZ
                </span>
                <p
                  style={{
                    fontSize: 13,
                    color: "#FAFAFA",
                    margin: 0,
                    fontWeight: 550,
                    lineHeight: 1.45,
                  }}
                >
                  {fusionData.question}
                </p>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  {fusionData.options.map((opt, oi) => {
                    const isSelected = fusionQuizSelected === oi;
                    const isCorrect = oi === fusionData.correctIndex;
                    let bg = "rgba(255, 255, 255, 0.05)";
                    let border = "1px solid rgba(255, 255, 255, 0.08)";
                    let textColor = "#D4D4D8";

                    if (fusionAnswered) {
                      if (isCorrect) {
                        bg = "rgba(16, 185, 129, 0.16)";
                        border = "1px solid rgba(16, 185, 129, 0.4)";
                        textColor = "#6ee7b7";
                      } else if (isSelected) {
                        bg = "rgba(244, 66, 50, 0.14)";
                        border = "1px solid rgba(244, 66, 50, 0.4)";
                        textColor = "#fca5a5";
                      }
                    }

                    return (
                      <button
                        key={oi}
                        disabled={fusionAnswered}
                        onClick={() => handleAnswerFusionQuiz(oi)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: bg,
                          border,
                          color: textColor,
                          fontSize: 12,
                          textAlign: "left",
                          cursor: fusionAnswered ? "default" : "pointer",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          lineHeight: 1.4,
                        }}
                      >
                        <span
                          style={{
                            opacity: 0.5,
                            fontWeight: 700,
                            fontSize: 10,
                          }}
                        >
                          {String.fromCharCode(65 + oi)}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {fusionAnswered && (
                  <div
                    style={{
                      padding: "9px 12px",
                      borderRadius: 8,
                      background: "rgba(255, 255, 255, 0.04)",
                      fontSize: 12,
                      color: "#A1A1AA",
                      lineHeight: 1.5,
                    }}
                  >
                    {fusionQuizSelected === fusionData.correctIndex ? (
                      <span style={{ color: "#C6F432", fontWeight: 600 }}>
                        ✓ +15 Mastery Welded!{" "}
                      </span>
                    ) : (
                      <span style={{ color: "#f87171", fontWeight: 600 }}>
                        ✗ Concept gap:{" "}
                      </span>
                    )}
                    {fusionData.explanation}
                  </div>
                )}
              </div>

              {/* Try Another Pair Button */}
              <button
                onClick={handleSurprisePair}
                style={{
                  marginTop: 6,
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#FAFAFA",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 550,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Dices size={14} color="#C6F432" />
                <span>Try another pair</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* CASE B: Single-Node Inspector Active */}
      {!fuseMode && selectedConcept && (
        <div
          ref={inspectorScrollRef}
          style={{
            position: "absolute",
            top: 18,
            right: 22,
            bottom: 22,
            width: 340,
            zIndex: 30,
            maxHeight: "calc(100% - 40px)",
            overflowY: "auto",
            scrollbarWidth: "none",
            background: "rgba(15, 15, 18, 0.9)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 18,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#FAFAFA",
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {selectedConcept.title}
              </h3>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: getMasteryTheme(selectedConcept.retention ?? 0).hex,
                    fontWeight: 650,
                  }}
                >
                  {selectedConcept.retention ?? 0}% mastery ·{" "}
                  {
                    getMasteryTheme(selectedConcept.retention ?? 0)
                      .statusLabel
                  }
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedNodeId(null)}
              style={{
                background: "none",
                border: "none",
                color: "#71717A",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Slim Progress Bar */}
          <div
            style={{
              width: "100%",
              height: 3,
              borderRadius: 2,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${selectedConcept.retention ?? 0}%`,
                background: getMasteryTheme(selectedConcept.retention ?? 0).hex,
                transition: "width 0.4s ease",
              }}
            />
          </div>

          {/* Concept Summary */}
          <p
            style={{
              fontSize: 13.5,
              color: "#D4D4D8",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {selectedConcept.summary}
          </p>

          {/* Connected Concepts Chips */}
          {neighborConcepts.length > 0 && (
            <div>
              <span
                style={{
                  fontSize: 10,
                  color: "#71717A",
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                }}
              >
                CONNECTED SYNAPSES
              </span>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                  marginTop: 6,
                }}
              >
                {neighborConcepts.map((nc) => (
                  <button
                    key={nc.id}
                    onClick={() => {
                      setSelectedNodeId(nc.id);
                      frameSingleOrb(nc.id, true);
                    }}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      color: "#A1A1AA",
                      fontSize: 11,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span>{nc.title}</span>
                    <ChevronRight size={11} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Inline Quick Recall Check with Infinite AI Loop */}
          {activeQuiz && (
            <div
              style={{
                padding: "12px",
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#71717A",
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                  }}
                >
                  QUICK RECALL CHECK
                </span>
                {quizLoading && (
                  <Sparkles
                    size={12}
                    color="#C6F432"
                    className="animate-spin"
                  />
                )}
              </div>

              <p
                style={{
                  fontSize: 12.5,
                  color: "#FAFAFA",
                  margin: 0,
                  fontWeight: 550,
                  lineHeight: 1.45,
                }}
              >
                {activeQuiz.question}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {activeQuiz.options.map((opt, oi) => {
                  const isSelected = inspectorQuizSelected === oi;
                  const isCorrect = oi === activeQuiz.correctIndex;
                  let bg = "rgba(255, 255, 255, 0.04)";
                  let border = "1px solid rgba(255, 255, 255, 0.07)";
                  let color = "#D4D4D8";

                  if (inspectorQuizAnswered) {
                    if (isCorrect) {
                      bg = "rgba(16, 185, 129, 0.16)";
                      border = "1px solid rgba(16, 185, 129, 0.4)";
                      color = "#6ee7b7";
                    } else if (isSelected) {
                      bg = "rgba(244, 66, 50, 0.14)";
                      border = "1px solid rgba(244, 66, 50, 0.4)";
                      color = "#fca5a5";
                    }
                  }

                  return (
                    <button
                      key={oi}
                      disabled={inspectorQuizAnswered || quizLoading}
                      onClick={() =>
                        handleAnswerInspectorQuiz(
                          oi,
                          activeQuiz.correctIndex,
                          selectedConcept
                        )
                      }
                      style={{
                        padding: "7px 9px",
                        borderRadius: 7,
                        background: bg,
                        border,
                        color,
                        fontSize: 11.5,
                        textAlign: "left",
                        cursor: inspectorQuizAnswered ? "default" : "pointer",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 6,
                        lineHeight: 1.35,
                      }}
                    >
                      <span
                        style={{
                          opacity: 0.5,
                          fontWeight: 700,
                          fontSize: 10,
                        }}
                      >
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {inspectorQuizAnswered && (
                <div
                  style={{
                    fontSize: 11.5,
                    color: "#A1A1AA",
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {inspectorQuizSelected === activeQuiz.correctIndex ? (
                    <span style={{ color: "#C6F432", fontWeight: 600 }}>
                      ✓ +15 Mastery!{" "}
                    </span>
                  ) : (
                    <span style={{ color: "#f87171", fontWeight: 600 }}>
                      ✗ Review:{" "}
                    </span>
                  )}
                  {activeQuiz.explanation}
                </div>
              )}

              {/* Next Question (AI) Button */}
              {inspectorQuizAnswered && (
                <button
                  disabled={quizLoading}
                  onClick={() => handleFetchNextQuiz(selectedConcept)}
                  style={{
                    marginTop: 4,
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: "rgba(255, 255, 255, 0.07)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#FAFAFA",
                    fontSize: 11.5,
                    fontWeight: 550,
                    cursor: quizLoading ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <RefreshCw
                    size={12}
                    className={quizLoading ? "animate-spin" : ""}
                  />
                  <span>Next question (AI)</span>
                </button>
              )}

              {quizError && (
                <div style={{ color: "#fca5a5", fontSize: 11 }}>{quizError}</div>
              )}
            </div>
          )}

          {/* Living AI Branching Button */}
          <button
            disabled={branchingLoading}
            onClick={() => handleBranchDeeper(selectedConcept)}
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#FAFAFA",
              fontSize: 12,
              fontWeight: 550,
              cursor: branchingLoading ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "background 0.15s",
            }}
          >
            {branchingLoading ? (
              <>
                <Sparkles size={14} color="#C6F432" className="animate-spin" />
                <span>Growing sub-concepts…</span>
              </>
            ) : (
              <>
                <Plus size={14} color="#C6F432" />
                <span>Branch deeper (AI)</span>
              </>
            )}
          </button>

          {branchingError && (
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                background: "#18181B",
                border: "1px solid rgba(244, 66, 50, 0.3)",
                color: "#fca5a5",
                fontSize: 11.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>{branchingError}</span>
              <button
                onClick={() => handleBranchDeeper(selectedConcept)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#C6F432",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 650,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Both Cross-Tab Handoffs in Clean Footer Row */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: "auto",
              paddingTop: 10,
            }}
          >
            {onJumpToTutor && (
              <button
                onClick={() =>
                  onJumpToTutor(
                    nodes.findIndex((n) => n.id === selectedConcept.id)
                  )
                }
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: 10,
                  background: "#C6F432",
                  border: "none",
                  color: "#0B0B0C",
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Bot size={14} />
                <span>Learn with Micu →</span>
              </button>
            )}
            {onJumpToAR && (
              <button
                onClick={() =>
                  onJumpToAR(
                    nodes.findIndex((n) => n.id === selectedConcept.id)
                  )
                }
                title="Practice in AR"
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: 10,
                  background: "#18181B",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#F4F4F5",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Hand size={14} />
                <span>Practice in AR →</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
