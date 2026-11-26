"use client";

import React, { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

interface BellToggleProps {
  active: boolean;
  onToggle: () => void;
  activeLabel?: string;
  inactiveLabel?: string;
  badgeCount?: number;
  expanded?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function BellToggle({
  active,
  onToggle,
  activeLabel = "Alerts On",
  inactiveLabel = "Muted",
  badgeCount = 0,
  expanded = true,
  compact = false,
  ariaLabel,
  className = "",
}: BellToggleProps) {
  const [ringing, setRinging] = useState(false);

  useEffect(() => {
    if (!ringing) return;
    const t = window.setTimeout(() => setRinging(false), 520);
    return () => window.clearTimeout(t);
  }, [ringing]);

  const handleClick = () => {
    setRinging(true);
    onToggle();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={active}
        aria-label={ariaLabel || (active ? activeLabel : inactiveLabel)}
        className={`relative inline-flex items-center justify-center rounded-full bg-[#0B0B0C] transition-all duration-300 ease-out cursor-pointer select-none ${
          compact ? "h-[30px] md:h-[34px] px-2.5 gap-1.5" : "h-10 px-3.5 gap-2"
        } ${
          active
            ? "border border-[#C6F432]/55 text-[#C6F432] shadow-[0_0_18px_rgba(198,244,50,0.18)]"
            : "border border-white/15 text-zinc-400 hover:border-white/30 hover:text-zinc-200"
        } ${className}`}
      >
        <span
          className="relative inline-flex items-center justify-center shrink-0"
          style={
            ringing
              ? {
                  animation: "ssBellRing 480ms cubic-bezier(0.36, 0.07, 0.19, 0.97)",
                  transformOrigin: "50% 2px",
                }
              : undefined
          }
        >
          {active ? (
            <Bell className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          ) : (
            <BellOff className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          )}
        </span>

        {expanded && (
          <span
            className={`overflow-hidden whitespace-nowrap font-medium transition-all duration-300 ${
              compact ? "text-[11px] hidden sm:inline" : "text-xs"
            }`}
          >
            {active ? activeLabel : inactiveLabel}
          </span>
        )}

        {badgeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#C6F432] text-[#0B0B0C] text-[10px] font-bold leading-none shadow-[0_0_8px_rgba(198,244,50,0.55)]">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      <style>{`
        @keyframes ssBellRing {
          0% { transform: rotate(0deg); }
          18% { transform: rotate(18deg); }
          36% { transform: rotate(-16deg); }
          54% { transform: rotate(12deg); }
          72% { transform: rotate(-8deg); }
          90% { transform: rotate(4deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
    </>
  );
}
