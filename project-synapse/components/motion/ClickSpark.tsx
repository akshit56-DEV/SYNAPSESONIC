"use client";

import React, { useEffect, useRef } from "react";

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  local?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function ClickSpark({
  sparkColor = "#C6F432",
  sparkSize = 10,
  sparkRadius = 22,
  sparkCount = 6,
  duration = 380,
  local = false,
  className = "",
  children,
}: ClickSparkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      if (local && containerRef.current) {
        canvas.width = containerRef.current.clientWidth || 100;
        canvas.height = containerRef.current.clientHeight || 40;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    resize();
    const ro =
      local && containerRef.current && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(resize)
        : null;
    if (local && containerRef.current) ro?.observe(containerRef.current);
    window.addEventListener("resize", resize);

    const tick = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const remaining: Spark[] = [];
      for (const s of sparksRef.current) {
        const elapsed = now - s.startTime;
        if (elapsed >= duration) continue;
        remaining.push(s);

        const p = elapsed / duration;
        const eased = 1 - Math.pow(1 - p, 3);
        const dist = eased * sparkRadius;
        const len = sparkSize * (1 - p);

        const x1 = s.x + dist * Math.cos(s.angle);
        const y1 = s.y + dist * Math.sin(s.angle);
        const x2 = s.x + (dist + len) * Math.cos(s.angle);
        const y2 = s.y + (dist + len) * Math.sin(s.angle);

        ctx.strokeStyle = sparkColor;
        ctx.globalAlpha = 1 - p;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      sparksRef.current = remaining;

      if (remaining.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
      }
    };

    const spawnSparks = (clientX: number, clientY: number) => {
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }
      let x = clientX;
      let y = clientY;
      if (local && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        x = clientX - rect.left;
        y = clientY - rect.top;
      }
      const now = performance.now();
      for (let i = 0; i < sparkCount; i++) {
        sparksRef.current.push({
          x,
          y,
          angle: (2 * Math.PI * i) / sparkCount,
          startTime: now,
        });
      }
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const targetEl: Window | HTMLDivElement =
      local && containerRef.current ? containerRef.current : window;
    const handlePointerDown = (e: Event) => {
      const pe = e as PointerEvent;
      spawnSparks(pe.clientX, pe.clientY);
    };

    targetEl.addEventListener("pointerdown", handlePointerDown);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", resize);
      targetEl.removeEventListener("pointerdown", handlePointerDown);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sparkColor, sparkCount, sparkRadius, sparkSize, duration, local]);

  if (local) {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-50"
        />
        {children}
      </div>
    );
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[100]"
      />
      {children}
    </>
  );
}
