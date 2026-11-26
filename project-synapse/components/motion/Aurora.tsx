"use client";

import React, { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Color, Triangle } from "ogl";

export interface AuroraProps {
  colorStops?: [string, string, string] | string[];
  direction?: "top" | "bottom";
  mouseInteraction?: boolean;
  blend?: number;
  amplitude?: number;
  speed?: number;
  dpr?: number;
  className?: string;
}

const VERT = /* glsl */ `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAmplitude;
  uniform vec3 uColorStops[3];
  uniform vec2 uResolution;
  uniform float uBlend;
  uniform float uFlipY;
  uniform vec2 uMouse;

  vec3 permute(vec3 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
  }

  float snoise(vec2 v) {
    const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
    );
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0)
    );
    vec3 m = max(
      0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
      0.0
    );
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  struct ColorStop {
    vec3 color;
    float position;
  };

  vec3 colorRamp(ColorStop[3] colors, float factor) {
    int index = 0;
    if (factor >= colors[1].position) index = 1;
    ColorStop cur = colors[0];
    ColorStop nxt = colors[1];
    if (index == 1) {
      cur = colors[1];
      nxt = colors[2];
    }
    float range = max(0.0001, nxt.position - cur.position);
    float t = clamp((factor - cur.position) / range, 0.0, 1.0);
    return mix(cur.color, nxt.color, t);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    if (uFlipY > 0.5) {
      uv.y = 1.0 - uv.y;
    }

    ColorStop stops[3];
    stops[0] = ColorStop(uColorStops[0], 0.0);
    stops[1] = ColorStop(uColorStops[1], 0.5);
    stops[2] = ColorStop(uColorStops[2], 1.0);

    float factor = clamp(uv.x + (uMouse.x - 0.5) * 0.18, 0.0, 1.0);
    vec3 rampColor = colorRamp(stops, factor);

    float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
    height += (uMouse.y - 0.5) * 0.15;
    height = exp(height);
    height = (uv.y * 2.0 - height + 0.22);
    float intensity = 0.58 * height;

    float midPoint = 0.22;
    float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
    vec3 auroraColor = intensity * rampColor;

    gl_FragColor = vec4(auroraColor * auroraAlpha, auroraAlpha * 0.42);
  }
`;

export function Aurora({
  colorStops = ["#C6F432", "#10B981", "#5227FF"],
  direction = "top",
  mouseInteraction = true,
  blend = 0.5,
  amplitude = 1.0,
  speed = 0.65,
  dpr = 2,
  className = "",
}: AuroraProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const colorsKey = colorStops.join(",");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;

    const isMobile = window.innerWidth < 768;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Simplify on mobile (< 768px) or reduced-motion for battery & FPS
    if (isMobile || reducedMotion) {
      return;
    }

    let renderer: Renderer | null = null;
    try {
      renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        dpr: Math.min(window.devicePixelRatio || 1, dpr),
      });
    } catch {
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.width = "100%";
    gl.canvas.style.height = "100%";
    gl.canvas.style.display = "block";
    gl.canvas.style.pointerEvents = "none";
    container.appendChild(gl.canvas);

    const parsedStops = [0, 1, 2].map((i) => {
      const hex = colorStops[i] || colorStops[0] || "#C6F432";
      const c = new Color(hex);
      return [c.r, c.g, c.b];
    });

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: amplitude },
        uColorStops: { value: parsedStops },
        uResolution: { value: [container.clientWidth || 1280, container.clientHeight || 720] },
        uBlend: { value: blend },
        uFlipY: { value: direction === "top" ? 1.0 : 0.0 },
        uMouse: { value: [0.5, 0.5] },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      if (!renderer || !container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
    };

    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(container);
    window.addEventListener("resize", resize);
    resize();

    const onMouseMove = (e: MouseEvent) => {
      if (!mouseInteraction) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    if (mouseInteraction) {
      window.addEventListener("mousemove", onMouseMove, { passive: true });
    }

    let rafId = 0;
    const renderFrame = (t: number) => {
      program.uniforms.uTime.value = t * 0.001 * speed;
      program.uniforms.uMouse.value = [mouseRef.current.x, mouseRef.current.y];
      renderer?.render({ scene: mesh });
      rafId = requestAnimationFrame(renderFrame);
    };
    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
      if (mouseInteraction) {
        window.removeEventListener("mousemove", onMouseMove);
      }
      if (gl.canvas.parentNode === container) {
        container.removeChild(gl.canvas);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorsKey, direction, mouseInteraction, blend, amplitude, speed, dpr]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
    >
      {/* Mobile / reduced-motion lightweight radial gradient fallback */}
      <div
        className="md:hidden absolute inset-0"
        style={{
          background:
            direction === "top"
              ? "radial-gradient(ellipse 85% 42% at 50% 0%, rgba(198,244,50,0.22), rgba(16,185,129,0.12) 45%, rgba(82,39,255,0.08) 70%, transparent 90%)"
              : "radial-gradient(ellipse 85% 42% at 50% 100%, rgba(198,244,50,0.22), rgba(16,185,129,0.12) 45%, rgba(82,39,255,0.08) 70%, transparent 90%)",
        }}
      />
    </div>
  );
}
