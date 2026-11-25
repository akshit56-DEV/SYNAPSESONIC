"use client";

import React, { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·/+-";

interface DecryptedTextProps {
  text: string;
  animateOn?: "view" | "mount";
  speed?: number;
  className?: string;
}

export function DecryptedText({
  text,
  animateOn = "view",
  speed = 28,
  className = "",
}: DecryptedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(text);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(text);
      return;
    }

    let intervalId = 0;
    const startScramble = () => {
      if (hasRunRef.current) return;
      hasRunRef.current = true;
      let revealed = 0;
      intervalId = window.setInterval(() => {
        revealed += 0.55;
        const next = text
          .split("")
          .map((ch, idx) => {
            if (ch === " " || ch === "·") return ch;
            if (idx < revealed) return ch;
            return GLYPHS[(idx + Math.floor(revealed * 3)) % GLYPHS.length];
          })
          .join("");
        setDisplay(next);
        if (revealed >= text.length) {
          window.clearInterval(intervalId);
          setDisplay(text);
        }
      }, speed);
    };

    if (animateOn === "mount") {
      startScramble();
      return () => window.clearInterval(intervalId);
    }

    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      startScramble();
      return () => window.clearInterval(intervalId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          startScramble();
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalId);
    };
  }, [text, animateOn, speed]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
