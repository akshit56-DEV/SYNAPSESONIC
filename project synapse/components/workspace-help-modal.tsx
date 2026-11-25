"use client";

import React from "react";
import { Compass, Hand, Keyboard, SlidersHorizontal, X } from "lucide-react";

interface WorkspaceHelpModalProps {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onEditProfile: () => void;
}

const SHORTCUTS = [
  { key: "1", label: "Learn with Micu" },
  { key: "2", label: "Study Terrarium" },
  { key: "3", label: "Gesture Synth" },
  { key: "?", label: "Toggle Help" },
  { key: "Esc", label: "Close overlays" },
];

const GESTURES = [
  { icon: "🤏", title: "Pinch & Pull", action: "Grab / Quiz" },
  { icon: "1–4", title: "Fingers", action: "Answer Quiz" },
  { icon: "🖐️", title: "Open Palm", action: "Safe Rest / New AI Question" },
  { icon: "👍", title: "Thumbs Up", action: "Next Orb" },
  { icon: "✊", title: "Closed Fist", action: "Toss Back" },
];

export function WorkspaceHelpModal({
  open,
  onClose,
  onStartTour,
  onEditProfile,
}: WorkspaceHelpModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] bg-[#0B0B0C]/75 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Quick Help and Gesture Legend"
    >
      <div
        className="relative w-full max-w-[540px] rounded-2xl bg-[#141416]/95 border border-white/10 shadow-[0_28px_90px_rgba(0,0,0,0.85)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#C6F432]">
              Quick Reference
            </span>
            <h2 className="text-lg font-semibold text-white tracking-tight">
              Shortcuts &amp; Gesture Legend
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Keyboard Shortcuts */}
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3">
              <Keyboard className="w-3.5 h-3.5 text-[#C6F432]" />
              <span>Keyboard Shortcuts</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SHORTCUTS.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0B0B0C] border border-white/10"
                >
                  <span className="text-xs text-zinc-300">{item.label}</span>
                  <kbd className="px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[11px] font-mono text-[#C6F432]">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* Gesture Synth Quick Legend */}
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3">
              <Hand className="w-3.5 h-3.5 text-[#C6F432]" />
              <span>Gesture Synth Quick Legend</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GESTURES.map((g) => (
                <div
                  key={g.title}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0B0B0C] border border-white/10"
                >
                  <span className="text-sm font-mono text-[#C6F432] w-7 text-center shrink-0">
                    {g.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate">
                      {g.title}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {g.action}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartTour();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C6F432] text-[#0B0B0C] text-xs font-semibold hover:bg-[#d4f75c] transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Start Guided Walkthrough</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onEditProfile();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0B0B0C] text-zinc-200 border border-white/15 hover:border-white/30 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#C6F432]" />
              <span>Edit Study Profile</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
