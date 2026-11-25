"use client";

import React from "react";

interface AuroraProps {
  className?: string;
}

export function Aurora({ className = "" }: AuroraProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 overflow-hidden z-0 ${className}`}
    >
      {/* Top-center lime edge glow */}
      <div
        className="absolute -top-44 left-1/2 -translate-x-1/2 w-[780px] h-[420px] rounded-full opacity-25 blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, rgba(198,244,50,0.45) 0%, rgba(198,244,50,0.08) 55%, transparent 75%)",
          animation: "ssAuroraDrift 14s ease-in-out infinite alternate",
        }}
      />
      {/* Bottom-right cool obsidian-slate halo */}
      <div
        className="absolute -bottom-52 -right-32 w-[620px] h-[380px] rounded-full opacity-20 blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, rgba(161,161,170,0.28) 0%, rgba(24,24,27,0.12) 60%, transparent 80%)",
        }}
      />
      {/* Subtle architectural grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      <style>{`
        @keyframes ssAuroraDrift {
          0% { transform: translate(-52%, 0px) scale(1); }
          100% { transform: translate(-48%, 18px) scale(1.06); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ssAuroraDrift {
            0%, 100% { transform: translate(-50%, 0px) scale(1); }
          }
        }
      `}</style>
    </div>
  );
}
