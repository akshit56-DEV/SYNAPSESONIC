"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ChevronUp, Hand, Power, Volume2, VolumeX, X } from "lucide-react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { handPointer, type GestureActions } from "./hand-pointer";
import "./camera-control.css";

const wasm =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

interface CameraControlProps extends GestureActions {
  onActive: (v: boolean) => void;
  isARMode?: boolean;
}

export function CameraControl(props: CameraControlProps) {
  const { isARMode = false, ...gestureProps } = props;
  const [open, setOpen] = useState(false),
    [phase, setPhase] = useState<"off" | "loading" | "live">("off"),
    [hint, setHint] = useState("Camera offline"),
    [message, setMessage] = useState(""),
    [muted, setMuted] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    generation = useRef(0),
    cleanup = useRef(() => {}),
    actions = useRef(gestureProps);
  useEffect(() => {
    actions.current = gestureProps;
  }, [gestureProps]);
  function stop() {
    generation.current++;
    cleanup.current();
    cleanup.current = () => {};
    setPhase("off");
    setHint("Camera offline");
    actions.current.onActive(false);
  }
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      generation.current++;
      cleanup.current();
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  
  // Auto-start in AR mode, stop when leaving AR mode
  useEffect(() => {
    if (isARMode && phase === "off") {
      start();
    } else if (!isARMode && phase !== "off") {
      stop();
    }
    return () => {
      if (isARMode) stop();
    };
  }, [isARMode]);

  async function start() {
    stop();
    const token = generation.current,
      valid = () => generation.current === token,
      el = video.current!,
      layer = overlay.current!;
    let model: HandLandmarker | undefined,
      stream: MediaStream | undefined,
      raf = 0;
    setPhase("loading");
    setMessage("");
    setHint("Starting camera…");
    cleanup.current = () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      el.pause();
      el.srcObject = null;
      model?.close();
    };
    const fail = (text: string) => {
      if (valid()) {
        stop();
        setMessage(text);
      }
    };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Error();
      // Lower resolution for AR mode to maintain FPS
      const videoConstraints = isARMode
        ? { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } }
        : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } };
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      if (!valid()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream
        .getVideoTracks()[0]
        .addEventListener(
          "ended",
          () => fail("Camera disconnected. Use the simulator or reconnect."),
          { once: true },
        );
      el.srcObject = stream;
      await el.play();
      if (!valid()) return;
      // Stream + playback are live now — clear the "Starting camera…" hint.
      setHint("");
      const { FilesetResolver, HandLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      const files = await FilesetResolver.forVisionTasks(wasm);
      if (!valid()) return;
      model = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/hand_landmarker.task" },
        runningMode: "VIDEO",
        numHands: 1,
      });
      if (!valid()) {
        model.close();
        return;
      }
      layer.width = el.videoWidth;
      layer.height = el.videoHeight;
      const frame = handPointer(layer, () => actions.current, setHint);
      setPhase("live");
      actions.current.onActive(true);
      let last = 0,
        prev = -1;
      // Throttle to ~15 FPS in AR mode
      const detectInterval = isARMode ? 66 : 70;
      function detect(now: number) {
        if (!valid()) return;
        try {
          if (
            el.readyState >= 2 &&
            now - last > detectInterval &&
            prev !== el.currentTime
          ) {
            prev = el.currentTime;
            last = now;
            frame(
              model!.detectForVideo(el, now).landmarks?.[0],
              now,
              layer.width / layer.height,
            );
          }
          raf = requestAnimationFrame(detect);
        } catch {
          fail("Tracking interrupted. Retry or use the simulator.");
        }
      }
      raf = requestAnimationFrame(detect);
    } catch {
      fail("Camera unavailable. Check permission or use the simulator.");
    }
  }

  // In AR mode, always start camera automatically
  useEffect(() => {
    if (isARMode && phase === "off") {
      start();
    }
    return () => {
      if (isARMode) stop();
    };
  }, [isARMode]);

  // In AR mode, render full-screen video feed
  if (isARMode) {
    return (
      <>
        {/* Full-screen webcam feed */}
        <video
          ref={video}
          muted
          playsInline
          autoPlay
          className="ar-webcam-video"
          aria-hidden="true"
          style={{
            display: 'block',
            opacity: 1,
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            zIndex: 0,
          }}
        />
        <canvas
          ref={overlay}
          className="ar-hand-overlay"
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 5,
            pointerEvents: 'none',
          }}
        />
        
        {/* Mute Toggle */}
        <button
          className={`ar-mute-toggle ${muted ? 'muted' : ''}`}
          onClick={() => setMuted(!muted)}
          aria-label={muted ? "Unmute spatial audio" : "Mute spatial audio"}
          style={{
            position: 'fixed',
            bottom: 100,
            right: 24,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: 'rgba(11, 11, 12, 0.9)',
            border: '1px solid rgba(198, 244, 50, 0.3)',
            borderRadius: 10,
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.15s ease',
          }}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          <span>{muted ? "Muted" : "Audio On"}</span>
        </button>

        {/* Docked controls (collapsed by default in AR mode) */}
        <aside className="cam-dock" style={{ position: 'fixed', bottom: 240, left: 24, zIndex: 30 }}>
          <button
            className="cam-toggle"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            style={{
              background: 'rgba(11, 11, 12, 0.9)',
              border: '1px solid rgba(198, 244, 50, 0.3)',
              borderRadius: 10,
              padding: '10px 13px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <Camera size={16} style={{ color: 'var(--lime)' }} />
            <span>Hand Controls</span>
            <ChevronUp size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          <section className="cam-guide" hidden={!open} aria-label="Spatial input" style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            width: 'min(270px, 89vw)',
            maxHeight: '65svh',
            overflow: 'auto',
            padding: 13,
            background: 'rgba(11, 11, 12, 0.95)',
            border: '1px solid rgba(198, 244, 50, 0.3)',
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
          }}>
            <small style={{ font: '9px monospace', letterSpacing: '1.3px', color: '#bbbfb7' }}>
              SPATIAL INPUT <b style={{ color: 'var(--lime)' }}> / 01</b>
            </small>
            <div className="cam-feed" style={{
              position: 'relative',
              aspectRatio: '1.8',
              overflow: 'hidden',
              background: '#0b0b0c',
              margin: '9px 0',
              border: '1px solid rgba(198, 244, 50, 0.3)',
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
            }}>
              <video
                ref={video}
                muted
                playsInline
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  inset: 0,
                  objectFit: 'contain',
                  transform: 'scaleX(-1)',
                }}
              />
              <canvas ref={overlay} hidden={phase !== "live"} aria-hidden="true" style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                inset: 0,
                objectFit: 'contain',
                transform: 'scaleX(-1)',
              }} />
              {phase !== "live" && <Hand size={27} />}
              <span style={{
                position: 'absolute',
                bottom: 5,
                left: 7,
                background: 'rgba(17,17,18,0.7)',
                padding: '2px 5px',
                font: '10px monospace',
                color: '#e0e3d8',
              }}>
                {hint}
              </span>
            </div>
            <button className="cam-action" onClick={phase === "off" ? start : stop} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              background: 'var(--lime)',
              color: '#111',
              width: '100%',
              padding: 6,
              borderRadius: 4,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}>
              <Power size={12} />
              {phase === "off" ? "Enable Camera" : phase === "loading" ? "Cancel" : "Stop Camera"}
            </button>
            {message && <p role="status" style={{ color: '#f7b5ad', fontSize: 11, marginTop: 8 }}>{message}</p>}
            <div className="sim" style={{ borderTop: '1px solid #343731', marginTop: 11, paddingTop: 9 }}>
              <small style={{ color: '#bbbfb7', font: '9px monospace', letterSpacing: '1px' }}>GESTURE SIMULATOR</small>
              <p style={{ fontSize: 11, color: '#b9bdb3', margin: '6px 0' }}>Palm orbits. Pinch selects. Hold 1–4 to answer.</p>
              <div style={{ display: 'flex', gap: 4 }}>
                {["Palm", "Pinch", "A", "B", "C", "D"].map((s, i) => (
                  <button
                    key={s}
                    aria-label={`Simulate ${s}`}
                    onClick={() => {
                      if (i === 0) props.orbit(35, 5);
                      else if (i === 1) props.pinch();
                      else props.answer(i - 2);
                      setHint(`Simulated · ${s}`);
                    }}
                    style={{
                      flex: 1,
                      border: '1px solid #43473e',
                      borderRadius: 4,
                      padding: '5px 3px',
                      background: 'transparent',
                      color: '#fff',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </>
    );
  }

  // Standard mode (Study Terrarium) - docked PiP
  return (
    <aside className="cam-dock">
      <button
        className="cam-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Camera size={16} />
        <span>Hand controls</span>
        <ChevronUp size={13} />
      </button>
      <section className="cam-guide" hidden={!open} aria-label="Spatial input">
        <small>
          SPATIAL INPUT <b>/ 01</b>
        </small>
        <div className="cam-feed">
          <video
            muted
            playsInline
            ref={video}
            aria-label="Local webcam preview"
          />
          <canvas ref={overlay} hidden={phase !== "live"} aria-hidden="true" />
          {phase !== "live" && <Hand size={27} />}
          <span>{hint}</span>
        </div>
        <button className="cam-action" onClick={phase === "off" ? start : stop}>
          <Power size={12} />
          {phase === "off"
            ? "Enable camera"
            : phase === "loading"
              ? "Cancel"
              : "Stop camera"}
        </button>
        {message && <p role="status">{message}</p>}
        <div className="sim">
          <small>GESTURE SIMULATOR</small>
          <p>Palm orbits. Pinch selects. Hold 1–4 to answer.</p>
          <div>
            {["Palm", "Pinch", "A", "B", "C", "D"].map((s, i) => (
              <button
                key={s}
                aria-label={`Simulate ${s}`}
                onClick={() => {
                  if (i === 0) props.orbit(35, 5);
                  else if (i === 1) props.pinch();
                  else props.answer(i - 2);
                  setHint(`Simulated · ${s}`);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>
    </aside>
  );
}
