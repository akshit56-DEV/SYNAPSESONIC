"use client";

import React from "react";

interface StarBorderProps {
  color?: string;
  speed?: string;
  className?: string;
  children: React.ReactNode;
}

export function StarBorder({
  color = "#C6F432",
  speed = "4.5s",
  className = "",
  children,
}: StarBorderProps) {
  return (
    <div
      className={`relative inline-flex rounded-full p-[1.5px] overflow-hidden group ${className}`}
    >
      {/* Sweeping conic perimeter highlight */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[-120%] opacity-90 group-hover:opacity-100 transition-opacity"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, transparent 285deg, ${color} 330deg, #ffffff 350deg, transparent 360deg)`,
          animation: `ssStarSpin ${speed} linear infinite`,
        }}
      />
      <div className="relative z-10 rounded-full">{children}</div>
      <style>{`
        @keyframes ssStarSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ssStarSpin {
            from, to { transform: rotate(0deg); }
          }
        }
      `}</style>
    </div>
  );
}
