"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { handPointer, type GestureActions } from "./hand-pointer";

const wasm =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

export type CameraPhase = "off" | "loading" | "live";

export interface ARCameraHandle {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  phase: CameraPhase;
  hint: string;
  message: string;
  start: () => void;
  stop: () => void;
  pinch: (x?: number, y?: number) => void;
  answer: (i: number) => void;
  orbit: (dx: number, dy: number) => void;
  onActive?: (v: boolean) => void;
}

/**
 * Owns the webcam + MediaPipe hand-tracking pipeline and exposes the
 * live `<video>`/`<canvas>` refs plus gesture callbacks. No rendering.
 */
export function useARCamera(props: GestureActions): ARCameraHandle {
  const video = useRef<HTMLVideoElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    generation = useRef(0),
    cleanup = useRef(() => {}),
    actions = useRef(props);
  actions.current = props;
  const [phase, setPhase] = useState<CameraPhase>("off"),
    [hint, setHint] = useState("Camera offline"),
    [message, setMessage] = useState("");

  function stop() {
    generation.current++;
    cleanup.current();
    cleanup.current = () => {};
    setPhase("off");
    setHint("Camera offline");
    (actions.current as any).onActive?.(false);
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
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
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
      setHint("");
      const { FilesetResolver, HandLandmarker } = await import(
        "@mediapipe/tasks-vision",
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
      (actions.current as any).onActive?.(true);
      let last = 0,
        prev = -1;
      // Throttle to ~15 FPS to keep the AR overlay responsive.
      const detectInterval = 66;
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

  return {
    videoRef: video,
    overlayRef: overlay,
    phase,
    hint,
    message,
    start,
    stop,
    pinch: (x, y) => actions.current.pinch(x, y),
    answer: (i) => actions.current.answer(i),
    orbit: (dx, dy) => actions.current.orbit(dx, dy),
    onActive: (v) => (actions.current as any).onActive?.(v),
  };
}