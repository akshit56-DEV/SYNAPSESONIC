"use client";

import React, { useEffect, useState } from "react";

interface SplitTextProps {
  text: string;
  highlightWords?: string[];
  highlightClassName?: string;
  className?: string;
  delayStepMs?: number;
}

export function SplitText({
  text,
  highlightWords = [],
  highlightClassName = "text-[#C6F432]",
  className = "",
  delayStepMs = 45,
}: SplitTextProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const words = text.split(" ");
  const highlightSet = new Set(highlightWords.map((w) => w.toLowerCase()));

  return (
    <span className={className}>
      {words.map((word, idx) => {
        const clean = word.replace(/[.,!?]/g, "").toLowerCase();
        const isHighlighted = highlightSet.has(clean);
        return (
          <span
            key={`${word}-${idx}`}
            className={`inline-block transition-all duration-700 ease-out will-change-transform ${
              isHighlighted ? highlightClassName : ""
            }`}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(14px)",
              filter: visible ? "blur(0px)" : "blur(6px)",
              transitionDelay: `${idx * delayStepMs}ms`,
              marginRight: idx < words.length - 1 ? "0.26em" : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}
