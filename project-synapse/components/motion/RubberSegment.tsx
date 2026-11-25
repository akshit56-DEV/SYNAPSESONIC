"use client";

import React, { useEffect, useRef, useState } from "react";

interface RubberSegmentProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}

export function RubberSegment<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: RubberSegmentProps<T>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  useEffect(() => {
    const sync = () => {
      const btn = btnRefs.current[value];
      if (!btn) return;
      setPill({ left: btn.offsetLeft, width: btn.offsetWidth, ready: true });
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [value, options]);

  return (
    <div
      ref={wrapRef}
      role="tablist"
      className={`relative inline-flex flex-wrap items-center p-1 rounded-xl bg-[#0B0B0C] border border-white/10 ${className}`}
    >
      {pill.ready && (
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 rounded-lg bg-[#C6F432] shadow-[0_0_16px_rgba(198,244,50,0.28)] pointer-events-none"
          style={{
            left: pill.left,
            width: pill.width,
            transition:
              "left 340ms cubic-bezier(0.34, 1.56, 0.64, 1), width 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      )}
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            ref={(el) => {
              btnRefs.current[opt] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt)}
            className={`relative z-10 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer ${
              active ? "text-[#0B0B0C] font-semibold" : "text-zinc-400 hover:text-white"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
