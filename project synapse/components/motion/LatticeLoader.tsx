"use client";

import React from "react";

interface LatticeLoaderProps {
  size?: number;
  color?: string;
  label?: string;
  className?: string;
}

export function LatticeLoader({
  size = 24,
  color = "#C6F432",
  label,
  className = "",
}: LatticeLoaderProps) {
  const cell = Math.max(4, Math.round(size / 4.2));
  const gap = Math.max(2, Math.round(size / 10));

  const delays = [0, 0.12, 0.24, 0.12, 0.24, 0.36, 0.24, 0.36, 0.48];

  return (
    <div
      className={`inline-flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-label={label || "Loading"}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(3, ${cell}px)`,
          gap: `${gap}px`,
        }}
      >
        {delays.map((delay, idx) => (
          <span
            key={idx}
            style={{
              width: cell,
              height: cell,
              borderRadius: 2,
              backgroundColor: color,
              animation: `ssLatticePulse 1.15s ease-in-out ${delay}s infinite`,
            }}
          />
        ))}
      </div>
      {label && (
        <span className="text-xs font-mono tracking-wider text-zinc-400 uppercase">
          {label}
        </span>
      )}
      <style>{`
        @keyframes ssLatticePulse {
          0%, 100% { opacity: 0.22; transform: scale(0.76); }
          50% { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ssLatticePulse {
            0%, 100% { opacity: 0.7; transform: scale(1); }
          }
        }
      `}</style>
    </div>
  );
}
