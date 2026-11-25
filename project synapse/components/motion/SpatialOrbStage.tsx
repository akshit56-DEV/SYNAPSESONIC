"use client";

import React, { useEffect, useRef, useState } from "react";

interface SpatialNode {
  id: string;
  label: string;
  mastery: number;
  status: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  isLime: boolean;
}

const BASE_NODES: SpatialNode[] = [
  {
    id: "backprop",
    label: "Backpropagation",
    mastery: 94,
    status: "Synced · 0d decay",
    x: -0.95,
    y: 0.42,
    z: 0.35,
    radius: 26,
    isLime: true,
  },
  {
    id: "chain-rule",
    label: "Chain Rule",
    mastery: 86,
    status: "Linked Bridge",
    x: 0.12,
    y: -0.22,
    z: 0.65,
    radius: 30,
    isLime: true,
  },
  {
    id: "gradient",
    label: "Gradient Descent",
    mastery: 62,
    status: "Review · 6d",
    x: 1.05,
    y: 0.48,
    z: -0.15,
    radius: 23,
    isLime: false,
  },
  {
    id: "activation",
    label: "Activation Fn",
    mastery: 78,
    status: "Stable",
    x: -0.58,
    y: -0.82,
    z: -0.35,
    radius: 20,
    isLime: false,
  },
  {
    id: "dropout",
    label: "Dropout",
    mastery: 88,
    status: "Mastered",
    x: 0.88,
    y: -0.68,
    z: 0.25,
    radius: 21,
    isLime: true,
  },
];

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [0, 3],
  [2, 4],
];

export function SpatialOrbStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ nx: 0, ny: 0, clientX: 0, clientY: 0, hovered: false });
  const [spotlight, setSpotlight] = useState({ x: 50, y: 40, visible: false });
  const [hoveredNode, setHoveredNode] = useState<SpatialNode | null>(BASE_NODES[1]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth || 480;
      h = canvas.clientHeight || 340;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    let rafId = 0;
    let rotY = 0;
    let rotX = 0;

    const render = (now: number) => {
      const t = now * 0.001;
      const targetRotY = (reducedMotion ? 0 : t * 0.22) + pointerRef.current.nx * 0.55;
      const targetRotX = -0.14 + pointerRef.current.ny * 0.35;
      rotY += (targetRotY - rotY) * 0.08;
      rotX += (targetRotX - rotX) * 0.08;

      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.48;
      const scale = Math.min(w, h) * 0.26;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      // Project 3D coordinates
      const projected = BASE_NODES.map((node, idx) => {
        const bob = reducedMotion ? 0 : Math.sin(t * 1.4 + idx * 1.3) * 0.06;
        const x1 = node.x * cosY - node.z * sinY;
        const z1 = node.x * sinY + node.z * cosY;
        const y2 = (node.y + bob) * cosX - z1 * sinX;
        const z2 = (node.y + bob) * sinX + z1 * cosX;
        const persp = 3.2 / (3.2 - z2);
        return {
          node,
          sx: cx + x1 * scale * persp,
          sy: cy + y2 * scale * persp,
          r: node.radius * persp,
          depth: z2,
        };
      });

      // Draw synaptic bridges
      for (const [aIdx, bIdx] of EDGES) {
        const a = projected[aIdx];
        const b = projected[bIdx];
        const isPrimaryBridge = (aIdx === 0 && bIdx === 1) || (aIdx === 1 && bIdx === 4);
        const grad = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
        if (isPrimaryBridge) {
          grad.addColorStop(0, "rgba(198, 244, 50, 0.72)");
          grad.addColorStop(1, "rgba(198, 244, 50, 0.28)");
        } else {
          grad.addColorStop(0, "rgba(255, 255, 255, 0.16)");
          grad.addColorStop(1, "rgba(255, 255, 255, 0.07)");
        }

        ctx.strokeStyle = grad;
        ctx.lineWidth = isPrimaryBridge ? 1.7 : 1;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();

        // Traveling synaptic pulse along main bridge
        if (isPrimaryBridge && !reducedMotion) {
          const u = (t * 0.55 + aIdx * 0.3) % 1;
          const px = a.sx + (b.sx - a.sx) * u;
          const py = a.sy + (b.sy - a.sy) * u;
          ctx.fillStyle = "#C6F432";
          ctx.beginPath();
          ctx.arc(px, py, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Painter's sort back-to-front
      const sorted = [...projected].sort((a, b) => a.depth - b.depth);

      let nearestHover: SpatialNode | null = null;
      let nearestDist = 42;

      for (const item of sorted) {
        const { node, sx, sy, r } = item;

        if (pointerRef.current.hovered) {
          const d = Math.hypot(
            pointerRef.current.clientX - sx,
            pointerRef.current.clientY - sy
          );
          if (d < nearestDist) {
            nearestDist = d;
            nearestHover = node;
          }
        }

        // Outer electric-filament aura
        const glow = ctx.createRadialGradient(sx, sy, r * 0.25, sx, sy, r * 2.1);
        if (node.isLime) {
          glow.addColorStop(0, "rgba(198, 244, 50, 0.35)");
          glow.addColorStop(0.55, "rgba(198, 244, 50, 0.08)");
          glow.addColorStop(1, "rgba(198, 244, 50, 0)");
        } else {
          glow.addColorStop(0, "rgba(245, 158, 11, 0.28)");
          glow.addColorStop(0.55, "rgba(245, 158, 11, 0.06)");
          glow.addColorStop(1, "rgba(245, 158, 11, 0)");
        }
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 2.1, 0, Math.PI * 2);
        ctx.fill();

        // Obsidian core orb with specular highlight
        const orbGrad = ctx.createRadialGradient(
          sx - r * 0.32,
          sy - r * 0.34,
          r * 0.12,
          sx,
          sy,
          r
        );
        orbGrad.addColorStop(0, node.isLime ? "#E8FF8A" : "#FCD34D");
        orbGrad.addColorStop(0.35, node.isLime ? "#657B1C" : "#6D4B16");
        orbGrad.addColorStop(0.85, "#111215");
        orbGrad.addColorStop(1, "#09090B");

        ctx.fillStyle = orbGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();

        // Rim stroke
        ctx.strokeStyle = node.isLime
          ? "rgba(198, 244, 50, 0.72)"
          : "rgba(245, 158, 11, 0.52)";
        ctx.lineWidth = 1.25;
        ctx.stroke();

        // Orbiting filament ring
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate((reducedMotion ? 0.4 : t * 0.6) + node.radius);
        ctx.strokeStyle = node.isLime
          ? "rgba(198, 244, 50, 0.36)"
          : "rgba(255, 255, 255, 0.16)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.32, r * 0.44, 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Crisp node label
        ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "rgba(244, 244, 245, 0.88)";
        ctx.textAlign = "center";
        ctx.fillText(node.label, sx, sy + r + 15);
      }

      if (nearestHover) {
        setHoveredNode((prev) => (prev?.id === nearestHover?.id ? prev : nearestHover));
      }

      if (!reducedMotion) {
        rafId = requestAnimationFrame(render);
      }
    };

    rafId = requestAnimationFrame(render);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    pointerRef.current = {
      nx: (relX / rect.width - 0.5) * 2,
      ny: (relY / rect.height - 0.5) * 2,
      clientX: relX,
      clientY: relY,
      hovered: true,
    };
    setSpotlight({
      x: (relX / rect.width) * 100,
      y: (relY / rect.height) * 100,
      visible: true,
    });
  };

  const handlePointerLeave = () => {
    pointerRef.current.hovered = false;
    pointerRef.current.nx = 0;
    pointerRef.current.ny = 0;
    setSpotlight((s) => ({ ...s, visible: false }));
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative rounded-2xl bg-[#111214]/90 border border-white/10 shadow-[0_28px_80px_rgba(0,0,0,0.65)] overflow-hidden h-[360px] sm:h-[400px] select-none"
    >
      {/* Cursor-tracking specular border spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: spotlight.visible ? 1 : 0,
          background: `radial-gradient(320px circle at ${spotlight.x}% ${spotlight.y}%, rgba(198,244,50,0.12), transparent 65%)`,
        }}
      />

      {/* Top chrome HUD */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/30">
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-[#C6F432] shadow-[0_0_8px_#C6F432]" />
          <span>TERRARIUM CLUSTER · NEURAL NETWORKS</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
          Move cursor to orbit
        </span>
      </div>

      {/* Live 3D Orbital Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-[calc(100%-41px)] block"
      />

      {/* Hoverable Mastery Telemetry Pill */}
      {hoveredNode && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-72 z-10 p-3.5 rounded-xl bg-[#0B0B0C]/90 backdrop-blur-md border border-white/15 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              {hoveredNode.label}
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
              {hoveredNode.status}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-mono font-semibold text-[#C6F432]">
              {hoveredNode.mastery}%
            </div>
            <div className="text-[10px] font-mono text-zinc-500">MASTERY</div>
          </div>
        </div>
      )}
    </div>
  );
}
