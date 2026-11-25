"use client";

import React, { useEffect, useRef } from "react";

interface CodeSlotsProps {
  length?: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
}

export function CodeSlots({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  autoFocus = true,
}: CodeSlotsProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const lastCompletedRef = useRef<string>("");

  const digits = Array.from({ length }, (_, idx) => value[idx] || "");

  useEffect(() => {
    if (autoFocus && !disabled) {
      const id = window.setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 40);
      return () => window.clearTimeout(id);
    }
  }, [autoFocus, disabled]);

  const emitChange = (chars: string[]) => {
    const next = chars.join("").slice(0, length);
    onChange(next);
    if (next.length === length && /^\d+$/.test(next)) {
      if (lastCompletedRef.current !== next) {
        lastCompletedRef.current = next;
        onComplete?.(next);
      }
    } else {
      lastCompletedRef.current = "";
    }
  };

  const handleInputChange = (idx: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[idx] = "";
      emitChange(next);
      return;
    }

    if (clean.length > 1) {
      // Handle autofill or multi-character input
      const filled = clean.slice(0, length).split("");
      const next = Array.from({ length }, (_, i) => filled[i] || "");
      emitChange(next);
      const focusIdx = Math.min(length - 1, filled.length - 1);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...digits];
    next[idx] = clean;
    emitChange(next);

    if (idx < length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (
    idx: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[idx]) {
        next[idx] = "";
        emitChange(next);
      } else if (idx > 0) {
        next[idx - 1] = "";
        emitChange(next);
        inputRefs.current[idx - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < length - 1) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (idx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();

    const next = [...digits];
    const startIdx = pasted.length >= length ? 0 : idx;
    for (let i = 0; i < pasted.length && startIdx + i < length; i++) {
      next[startIdx + i] = pasted[i];
    }
    emitChange(next);
    const focusIdx = Math.min(length - 1, startIdx + pasted.length - 1);
    inputRefs.current[focusIdx]?.focus();
  };

  return (
    <div
      className="grid grid-cols-6 gap-2 sm:gap-2.5"
      role="group"
      aria-label="6-digit verification code"
    >
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          maxLength={length}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleInputChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={(e) => handlePaste(idx, e)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Digit ${idx + 1} of ${length}`}
          className={`h-12 sm:h-13 w-full rounded-xl bg-[#0B0B0C] text-center text-lg font-mono font-semibold text-white transition-all focus:outline-none disabled:opacity-50 ${
            hasError
              ? "border border-red-400/70 focus:border-red-400 focus:shadow-[0_0_0_2px_rgba(248,113,113,0.2)]"
              : digit
                ? "border border-[#C6F432]/60 focus:border-[#C6F432] focus:shadow-[0_0_0_2px_rgba(198,244,50,0.25)]"
                : "border border-white/15 focus:border-[#C6F432] focus:shadow-[0_0_0_2px_rgba(198,244,50,0.25)]"
          }`}
        />
      ))}
    </div>
  );
}
