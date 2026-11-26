"use client";

import React, { useRef, useState } from "react";
import { X } from "lucide-react";

interface SwipeToastProps {
  message: string;
  onDismiss: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export function SwipeToast({
  message,
  onDismiss,
  actionLabel,
  onAction,
}: SwipeToastProps) {
  const [dragX, setDragX] = useState(0);
  const startXRef = useRef<number | null>(null);

  return (
    <div
      role="status"
      aria-live="polite"
      onPointerDown={(e) => {
        startXRef.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (startXRef.current === null) return;
        const delta = e.clientX - startXRef.current;
        setDragX(Math.max(-180, Math.min(220, delta)));
      }}
      onPointerUp={() => {
        if (startXRef.current === null) return;
        startXRef.current = null;
        if (Math.abs(dragX) > 75) {
          onDismiss();
        } else {
          setDragX(0);
        }
      }}
      onPointerCancel={() => {
        startXRef.current = null;
        setDragX(0);
      }}
      className="fixed right-4 bottom-4 sm:right-5 sm:bottom-5 z-[110] max-w-[min(360px,calc(100vw-32px))] touch-pan-y select-none cursor-grab active:cursor-grabbing"
      style={{
        transform: `translateX(${dragX}px)`,
        opacity: Math.max(0.25, 1 - Math.abs(dragX) / 180),
        transition: startXRef.current === null ? "transform 220ms ease, opacity 220ms ease" : "none",
      }}
    >
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#141416]/95 backdrop-blur-xl border border-[#C6F432]/40 shadow-[0_12px_32px_rgba(0,0,0,0.6)] text-zinc-50 text-xs sm:text-[12.5px] font-medium"
      >
        <span className="w-2 h-2 rounded-full bg-[#C6F432] shadow-[0_0_8px_#C6F432] shrink-0" />
        <span className="flex-1 leading-snug">{message}</span>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className="shrink-0 px-2 py-1 rounded-md bg-[#C6F432] text-[#0B0B0C] text-[11px] font-semibold cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss notification"
          className="shrink-0 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
