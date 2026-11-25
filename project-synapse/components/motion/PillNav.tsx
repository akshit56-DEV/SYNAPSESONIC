"use client";

import React, { useEffect, useRef, useState } from "react";

export interface PillNavItem {
  id: string;
  label: string;
}

interface PillNavProps {
  items: PillNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function PillNav({
  items,
  activeId,
  onSelect,
  className = "",
}: PillNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    ready: boolean;
  }>({ left: 0, width: 0, ready: false });

  useEffect(() => {
    const updateIndicator = () => {
      const container = containerRef.current;
      const activeEl = itemRefs.current[activeId];
      if (!container || !activeEl) return;
      setIndicator({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        ready: true,
      });
    };
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeId, items]);

  return (
    <div
      ref={containerRef}
      role="navigation"
      aria-label="Section navigation"
      className={`relative inline-flex items-center p-1 rounded-full bg-white/[0.04] border border-white/10 ${className}`}
    >
      {indicator.ready && (
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 rounded-full bg-white/10 border border-white/15 transition-all duration-300 ease-out pointer-events-none"
          style={{
            left: indicator.left,
            width: indicator.width,
          }}
        />
      )}
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[item.id] = el;
            }}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`relative z-10 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              isActive ? "text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
