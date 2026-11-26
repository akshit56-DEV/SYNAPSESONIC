"use client";

import React, { useState } from "react";

interface GlareHoverProps {
  children: React.ReactNode;
  glareColor?: string;
  glareOpacity?: number;
  glareSize?: number;
  className?: string;
}

export function GlareHover({
  children,
  glareColor = "#C6F432",
  glareOpacity = 0.14,
  glareSize = 320,
  className = "",
}: GlareHoverProps) {
  const [coords, setCoords] = useState({ x: 50, y: 50, active: false });

  return (
    <div
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        setCoords({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          active: true,
        });
      }}
      onPointerLeave={() => setCoords((c) => ({ ...c, active: false }))}
      className={`relative overflow-hidden rounded-2xl ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300"
        style={{
          opacity: coords.active ? glareOpacity : 0,
          background: `radial-gradient(${glareSize}px circle at ${coords.x}px ${coords.y}px, ${glareColor}, transparent 65%)`,
        }}
      />
      {children}
    </div>
  );
}
