"use client";

import React from "react";

interface VoicePillProps {
  state: "listening" | "speaking" | "thinking";
  label?: string;
  volume?: number;
  className?: string;
}

export function VoicePill({
  state,
  label,
  volume = 0.35,
  className = "",
}: VoicePillProps) {
  const accent =
    state === "listening"
      ? "#38BDF8"
      : state === "thinking"
        ? "#A855F7"
        : "#C6F432";

  const text =
    label ||
    (state === "listening"
      ? "Listening"
      : state === "thinking"
        ? "Thinking"
        : "Speaking");

  const bars = [0.55, 0.95, 0.7, 1.0, 0.6];

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 bg-[#141416]/90 border text-xs font-medium text-zinc-100 backdrop-blur-md transition-colors ${className}`}
      style={{
        borderColor: `${accent}55`,
        boxShadow: `0 0 18px ${accent}24`,
      }}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-end gap-[2.5px] h-3.5" aria-hidden="true">
        {bars.map((mult, i) => {
          const boost = Math.max(0.28, Math.min(1, volume * 1.45 + 0.35));
          const heightPct =
            state === "thinking" ? 45 : Math.round(35 + mult * boost * 65);
          return (
            <span
              key={i}
              className="w-[2.5px] rounded-full transition-all duration-150"
              style={{
                height: `${heightPct}%`,
                backgroundColor: accent,
                animation: `ssVoiceWave 900ms ease-in-out ${i * 110}ms infinite alternate`,
              }}
            />
          );
        })}
      </span>
      <span style={{ color: accent }} className="font-mono text-[11px] uppercase tracking-wider">
        {text}
      </span>

      <style>{`
        @keyframes ssVoiceWave {
          0% { transform: scaleY(0.55); opacity: 0.72; }
          100% { transform: scaleY(1.05); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
