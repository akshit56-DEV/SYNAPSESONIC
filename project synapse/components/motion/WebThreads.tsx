"use client";

import React, { useEffect, useRef } from "react";

interface WebThreadsProps {
  opacity?: number;
  className?: string;
}

export function WebThreads({
  opacity = 0.28,
  className = "",
}: WebThreadsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    const pointer = { x: 0.5, y: 0.35, active: false };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(resize)
        : null;
    ro?.observe(canvas);
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = (e.clientX - rect.left) / rect.width;
      pointer.y = (e.clientY - rect.top) / rect.height;
      pointer.active = true;
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    let rafId = 0;
    const drawFrame = (timeMs: number) => {
      const t = timeMs * 0.00045;
      ctx.clearRect(0, 0, width, height);

      const strandCount = 11;
      for (let s = 0; s < strandCount; s++) {
        const norm = s / (strandCount - 1);
        const baseY = height * (0.16 + norm * 0.68);
        const isLime = s % 3 === 1;

        ctx.beginPath();
        const steps = 36;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const x = u * width;
          const wave1 = Math.sin(u * 4.2 + t + s * 0.65) * 28;
          const wave2 = Math.cos(u * 2.4 - t * 0.8 + s * 1.1) * 18;
          const dx = u - pointer.x;
          const dy = baseY / Math.max(height, 1) - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const pull = pointer.active ? Math.exp(-dist * 4.5) * 38 * (dy >= 0 ? 1 : -1) : 0;
          const y = baseY + wave1 + wave2 + pull;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = isLime
          ? `rgba(198, 244, 50, ${0.42 - norm * 0.14})`
          : `rgba(228, 228, 231, ${0.18 - norm * 0.06})`;
        ctx.lineWidth = isLime ? 1.15 : 0.8;
        ctx.stroke();
      }

      if (!reducedMotion) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    if (reducedMotion) {
      drawFrame(0);
    } else {
      rafId = requestAnimationFrame(drawFrame);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none ${className}`}
      style={{ opacity }}
    />
  );
}
