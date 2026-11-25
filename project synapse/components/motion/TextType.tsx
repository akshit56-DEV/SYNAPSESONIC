"use client";

import React, { useEffect, useState } from "react";

interface TextTypeProps {
  text: string;
  speedMs?: number;
  className?: string;
}

export function TextType({
  text,
  speedMs = 14,
  className = "",
}: TextTypeProps) {
  const [count, setCount] = useState(text.length);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setCount(text.length);
      return;
    }

    setCount(0);
    let current = 0;
    const id = window.setInterval(() => {
      current += 2;
      if (current >= text.length) {
        setCount(text.length);
        window.clearInterval(id);
      } else {
        setCount(current);
      }
    }, speedMs);

    return () => window.clearInterval(id);
  }, [text, speedMs]);

  const done = count >= text.length;

  return (
    <span className={className}>
      {text.slice(0, count)}
      {!done && (
        <span
          aria-hidden="true"
          className="inline-block w-[2px] h-[1em] align-middle ml-0.5 bg-[#C6F432] animate-pulse"
        />
      )}
    </span>
  );
}
