"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import {
  AudioLines,
  Sprout,
  Hand,
  Upload,
  Timer,
  ArrowUpRight,
  Crosshair,
  Box,
  Bot,
} from "lucide-react";
import { QuizInspector } from "./quiz-inspector";
import { useRecall } from "./use-recall";
import { NeuralSpace } from "./neural-space";
import { Telemetry } from "./telemetry";
import { CameraControl } from "./camera-control";
import { DeckImport } from "./deck-import";
import { useSynth } from "./use-synth";
import { ARBubbleSpace } from "./ar-bubble-space";
import { MicuTutorSpace } from "./micu-tutor-space";

const modes = [
  { name: "Learn with Micu", Icon: Bot },
  { name: "Study Terrarium", Icon: Sprout },
  { name: "Gesture Synth", Icon: Hand },
];

export default function Workspace() {
  const [mode, setMode] = useState(0),
    [importing, setImporting] = useState(false),
    [active, setActive] = useState(false),
    r = useRecall(importing),
    synth = useSynth(),
    view = useRef({ yaw: 0, pitch: 0 });

  // Stop synth when leaving Gesture Synth mode
  useEffect(() => {
    if (mode !== 2) {
      synth.stop();
    }
  }, [mode, synth]);

  function pinch(x?: number, y?: number) {
    if (importing) return;
    const pins = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-node]"),
    );
    if (!pins.length) return;
    let i = r.q;
    if (x !== undefined && y !== undefined) {
      let best = Infinity;
      for (const pin of pins) {
        const b = pin.getBoundingClientRect(),
          d = Math.hypot(
            x * innerWidth - b.left - b.width / 2,
            y * innerHeight - b.top - b.height / 2,
          );
        if (d < best) {
          best = d;
          i = Number(pin.dataset.node);
        }
      }
    }
    r.focusNode(i);
  }

  const isLearnMode = mode === 0;
  const isStudyMode = mode === 1;
  const isGestureMode = mode === 2;

  return (
    <main className={`studio ${isGestureMode ? "gesture-mode" : ""}`}>
      <div className="floor" aria-hidden="true">
        <div />
      </div>

      <header className="topbar glass">
        <h1 className="brand flex items-center gap-3">
          <span className="brand-mark">
            <AudioLines size={23} strokeWidth={2.7} />
          </span>
          SynapseSonic
        </h1>
        <nav aria-label="Workspace mode" className="mode-nav">
          {modes.map(({ name, Icon }, i) => (
            <button
              key={name}
              aria-pressed={mode === i}
              onClick={() => {
                if (mode !== i) {
                  if (i === 2) void synth.start();
                  else synth.stop();
                  setMode(i);
                }
              }}
            >
              <Icon size={16} />
              {name}
            </button>
          ))}
        </nav>

        {/* Time-Decay slider - Hidden in Learn with Micu mode */}
        {!isLearnMode && (
          <div className="decay">
            <label
              htmlFor="decay"
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-1.5">
                <Timer size={13} />
                Time-Decay
              </span>
              <output htmlFor="decay">{r.day}d</output>
            </label>
            <input
              id="decay"
              type="range"
              min="0"
              max="60"
              value={r.day}
              style={{
                background: `linear-gradient(to right,var(--lime) ${(r.day / 60) * 100}%,#37383a 0)`,
              }}
              onChange={(e) => r.setDay(+e.target.value)}
            />
          </div>
        )}

        <button className="upload" onClick={() => setImporting(true)}>
          <Upload size={15} />
          Upload PDF
        </button>
      </header>

      <div
        className="workbody"
        style={isGestureMode || isLearnMode ? { gridTemplateColumns: "1fr", padding: 0 } : undefined}
      >
        {/* ── Gesture Synth (mode 2): full-width AR bubble space ─────────── */}
        {isGestureMode ? (
          <ARBubbleSpace
            recall={r}
            synthMuted={synth.muted}
            onToggleMute={synth.toggleMute}
          />
        ) : isLearnMode ? (
          /* ── Learn with Micu (mode 0): full-screen distraction-free tutor ─ */
          <MicuTutorSpace recall={r} />
        ) : (
          <>
            <section className="context">
              <span className="eyebrow flex items-center gap-2">
                <i className="dot" />
                WORKSPACE ONLINE
              </span>
              <h2>{modes[mode].name} workspace</h2>
              <span className="context-sub flex items-center gap-2">
                <Box size={14} />
                {r.deck.name}
                <span className="slash">/</span>
                {r.nodes.length} nodes
              </span>
              <p className="field-instruction">
                {isStudyMode
                  ? "Select a node from the neural field to begin a 30-second recall quiz."
                  : "Orbit the field. Select a node to learn with Micu."}
              </p>
            </section>

            {/* Neural Space */}
            <NeuralSpace
              recall={r}
              mode={mode}
              view={view}
              aim={synth.aim}
              level={synth.level}
            />

            {/* Inspector Panel */}
            {(isLearnMode || r.panel) && (
              <QuizInspector recall={r} blocked={importing} mode={mode} />
            )}

            {!isLearnMode && !r.panel && (
              <button className="reopen glass" onClick={r.next}>
                <Crosshair size={15} />
                {isStudyMode ? "Start Recall" : "Start Recall"}
                <ArrowUpRight size={13} />
              </button>
            )}

            {/* Telemetry */}
            <Telemetry values={r.values} active={active} />

            {/* Camera Control - only in Study Terrarium */}
            {isStudyMode && (
              <CameraControl
                orbit={(x, y) => {
                  if (!importing) {
                    view.current.yaw += x * 0.008;
                    view.current.pitch = Math.max(
                      -1.3,
                      Math.min(1.3, view.current.pitch + y * 0.008),
                    );
                  }
                }}
                aim={synth.aim}
                pinch={pinch}
                answer={r.answer}
                onActive={setActive}
              />
            )}
          </>
        )}
      </div>

      <footer className="statusbar flex items-center justify-between">
        <span className="flex items-center gap-2">
          <i className="dot" />
          {isGestureMode ? "AR Spatial Mode Active" : isLearnMode ? "Spatial Tutor Active" : "System operational"}
        </span>
        <span>
          SYNAPSESONIC <b>/</b> ENGINE V1.0
        </span>
      </footer>

      {importing && (
        <DeckImport load={r.load} close={() => setImporting(false)} />
      )}
    </main>
  );
}
