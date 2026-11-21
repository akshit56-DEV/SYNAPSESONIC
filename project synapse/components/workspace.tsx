"use client";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  AudioLines,
  Sprout,
  Hand,
  Upload,
  Timer,
  Bot,
  ChevronDown,
  Layers3,
  Plus,
  Trash2,
} from "lucide-react";
import { useRecall } from "./use-recall";
import { DeckImport } from "./deck-import";
import { useSynth } from "./use-synth";
import { ARBubbleSpace } from "./ar-bubble-space";
import { MicuTutorSpace } from "./micu-tutor-space";
import { makeDeck, samples, type Concept } from "./decks";
import type {
  ForgedSynapse,
  ForgedBridgePayload,
} from "./study-terrarium";

const StudyTerrarium = dynamic(
  () => import("./study-terrarium").then((mod) => mod.StudyTerrarium),
  {
    ssr: false,
    loading: () => (
      <div style={{ width: "100%", height: "100%", background: "#0B0B0C" }} />
    ),
  }
);

export interface SavedDeck {
  id: string;
  name: string;
  nodes: Concept[];
  forgedSynapses: ForgedSynapse[];
  day?: number;
  isBuiltIn?: boolean;
}

const STARTER_DECK_ID = "neural-networks";

function createStarterDeck(): SavedDeck {
  const base = makeDeck("Neural Networks", samples["Neural Networks"]);
  return {
    id: STARTER_DECK_ID,
    name: "Neural Networks",
    nodes: base.nodes,
    forgedSynapses: [],
    day: 0,
    isBuiltIn: true,
  };
}

const modes = [
  { name: "Learn with Micu", Icon: Bot },
  { name: "Study Terrarium", Icon: Sprout },
  { name: "Gesture Synth", Icon: Hand },
];

export default function Workspace() {
  const [mode, setMode] = useState(0),
    [importing, setImporting] = useState(false),
    [savedDecks, setSavedDecks] = useState<SavedDeck[]>([createStarterDeck()]),
    [activeDeckId, setActiveDeckId] = useState<string>(STARTER_DECK_ID),
    [deckMenuOpen, setDeckMenuOpen] = useState(false),
    [forgedSynapses, setForgedSynapses] = useState<ForgedSynapse[]>([]),
    [mounted, setMounted] = useState(false),
    deckMenuRef = useRef<HTMLDivElement>(null),
    r = useRecall(importing),
    synth = useSynth();

  // Active deck computed
  const activeDeck = useMemo(() => {
    return savedDecks.find((d) => d.id === activeDeckId) || savedDecks[0];
  }, [savedDecks, activeDeckId]);

  // Stop synth when leaving Gesture Synth mode
  useEffect(() => {
    if (mode !== 2) {
      synth.stop();
    }
  }, [mode, synth]);

  const isLearnMode = mode === 0;
  const isStudyMode = mode === 1;
  const isGestureMode = mode === 2;

  // ── 1. Restore from localStorage on mount (SSR safe) ────────────────────────
  useEffect(() => {
    setMounted(true);
    try {
      const raw = window.localStorage.getItem("synapsesonic_decks_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.decks) && parsed.decks.length > 0) {
          setSavedDecks(parsed.decks);
          const active =
            parsed.decks.find((d: SavedDeck) => d.id === parsed.activeDeckId) ||
            parsed.decks[0];
          setActiveDeckId(active.id);
          setForgedSynapses(active.forgedSynapses || []);
          r.load({ name: active.name, nodes: active.nodes });
          if (typeof active.day === "number") {
            r.setDay(active.day);
          }
          return;
        }
      }
    } catch {
      // Quiet fallback
    }
  }, []);

  // ── 2. Persist active deck mutations to savedDecks and localStorage ─────────
  useEffect(() => {
    if (!mounted || !activeDeckId || !r.deck?.nodes) return;
    setSavedDecks((prev) => {
      const updated = prev.map((d) => {
        if (d.id === activeDeckId) {
          return {
            ...d,
            name: r.deck.name,
            nodes: r.deck.nodes,
            forgedSynapses,
            day: r.day,
          };
        }
        return d;
      });
      try {
        window.localStorage.setItem(
          "synapsesonic_decks_v1",
          JSON.stringify({
            activeDeckId,
            decks: updated,
          })
        );
      } catch {
        // Quiet fallback
      }
      return updated;
    });
  }, [r.deck, forgedSynapses, r.day, activeDeckId, mounted]);

  // ── 3. Close Deck Menu on Click Outside ─────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        deckMenuRef.current &&
        !deckMenuRef.current.contains(event.target as Node)
      ) {
        setDeckMenuOpen(false);
      }
    }
    if (deckMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [deckMenuOpen]);

  // ── Deck Selection from Dropdown ───────────────────────────────────────────
  const handleSelectDeck = useCallback(
    (deck: SavedDeck) => {
      setActiveDeckId(deck.id);
      setForgedSynapses(deck.forgedSynapses || []);
      r.load({ name: deck.name, nodes: deck.nodes });
      r.setDay(deck.day || 0);
      setDeckMenuOpen(false);
    },
    [r]
  );

  // ── Delete Custom Deck ─────────────────────────────────────────────────────
  const handleDeleteDeck = useCallback(
    (e: React.MouseEvent, deckId: string) => {
      e.stopPropagation();
      setSavedDecks((prev) => {
        const filtered = prev.filter((d) => d.id !== deckId);
        if (filtered.length === 0) {
          const starter = createStarterDeck();
          filtered.push(starter);
        }
        if (activeDeckId === deckId) {
          const nextActive = filtered[0];
          setActiveDeckId(nextActive.id);
          setForgedSynapses(nextActive.forgedSynapses || []);
          r.load({ name: nextActive.name, nodes: nextActive.nodes });
          r.setDay(nextActive.day || 0);
        }
        try {
          window.localStorage.setItem(
            "synapsesonic_decks_v1",
            JSON.stringify({
              activeDeckId:
                activeDeckId === deckId ? filtered[0].id : activeDeckId,
              decks: filtered,
            })
          );
        } catch {
          // Quiet fallback
        }
        return filtered;
      });
    },
    [activeDeckId, r]
  );

  // ── Handle Successful PDF Import ───────────────────────────────────────────
  const handleDeckImportSuccess = useCallback(
    (importedDeck: { name: string; nodes: any[] }) => {
      const newId = `deck_${Date.now()}`;
      const newSaved: SavedDeck = {
        id: newId,
        name: importedDeck.name,
        nodes: importedDeck.nodes,
        forgedSynapses: [],
        day: 0,
        isBuiltIn: false,
      };
      setSavedDecks((prev) => {
        const next = [...prev, newSaved];
        try {
          window.localStorage.setItem(
            "synapsesonic_decks_v1",
            JSON.stringify({
              activeDeckId: newId,
              decks: next,
            })
          );
        } catch {
          // Quiet fallback
        }
        return next;
      });
      setActiveDeckId(newId);
      setForgedSynapses([]);
      r.load(importedDeck);
      r.setDay(0);
      setImporting(false);
    },
    [r]
  );

  // ── Shared Deck Callbacks for Cross-Tab Sync ────────────────────────────────
  const handleAddSubconcepts = useCallback(
    (parentId: string, newConcepts: any[]) => {
      const currentDeck = r.deck;
      const addedNodes = newConcepts.map((nc, idx) => ({
        id: nc.id || `${currentDeck.name}:sub:${Date.now()}:${idx}`,
        title: nc.title,
        summary: nc.summary,
        retention: 0,
        reviewDay: 0,
        lastReviewed: null,
        needsReview: false,
        parentId,
        quiz: nc.quiz || {
          question: nc.question || `What is the core principle of ${nc.title}?`,
          options: nc.options || ["Option A", "Option B", "Option C", "Option D"],
          correctIndex: nc.correctIndex ?? 0,
          explanation: nc.explanation || `${nc.title}: ${nc.summary}`,
        },
      }));

      const updatedDeck = {
        ...currentDeck,
        nodes: [...currentDeck.nodes, ...addedNodes],
      };
      r.load(updatedDeck);

      // Connect parent to newly added subconcepts as kind: 'branch', isCustom: false
      setForgedSynapses((prev) => [
        ...prev,
        ...addedNodes.map((an) => ({
          sourceId: parentId,
          targetId: an.id,
          label: "Sub-concept",
          kind: "branch" as const,
          isCustom: false,
        })),
      ]);
    },
    [r]
  );

  const handleForgeSynapse = useCallback(
    (
      sourceId: string,
      targetId: string,
      label: string,
      boostMastery: boolean = true,
      data?: ForgedBridgePayload
    ) => {
      setForgedSynapses((prev) => {
        const index = prev.findIndex(
          (s) =>
            (s.sourceId === sourceId && s.targetId === targetId) ||
            (s.sourceId === targetId && s.targetId === sourceId)
        );
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            label,
            kind: "forged",
            isCustom: true,
            data: data || updated[index].data,
          };
          return updated;
        }
        return [
          ...prev,
          {
            sourceId,
            targetId,
            label,
            kind: "forged",
            isCustom: true,
            data,
          },
        ];
      });

      if (boostMastery) {
        const currentDeck = r.deck;
        const updatedNodes = currentDeck.nodes.map((n) => {
          if (n.id === sourceId || n.id === targetId) {
            return {
              ...n,
              retention: Math.min(100, (n.retention || 0) + 15),
            };
          }
          return n;
        });
        r.load({ ...currentDeck, nodes: updatedNodes });
      }
    },
    [r]
  );

  const handleUpdateMastery = useCallback(
    (nodeId: string, newMastery: number) => {
      const currentDeck = r.deck;
      const updatedNodes = currentDeck.nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            retention: Math.max(0, Math.min(100, newMastery)),
          };
        }
        return n;
      });
      r.load({ ...currentDeck, nodes: updatedNodes });
    },
    [r]
  );

  const handleSelectConcept = useCallback(
    (indexOrId: number | string) => {
      if (typeof indexOrId === "number") {
        r.focusNode(indexOrId);
      } else {
        const idx = r.nodes.findIndex((n) => n.id === indexOrId);
        if (idx !== -1) r.focusNode(idx);
      }
    },
    [r]
  );

  const handleResetDay = useCallback(() => {
    r.setDay(0);
  }, [r]);

  return (
    <main className={`studio ${isGestureMode ? "gesture-mode" : ""}`}>
      <div className="floor" aria-hidden="true">
        <div />
      </div>

      <header
        className="topbar glass"
        style={{ position: "relative", zIndex: 60 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 className="brand flex items-center gap-3">
            <span className="brand-mark">
              <AudioLines size={23} strokeWidth={2.7} />
            </span>
            SynapseSonic
          </h1>

          {/* ── Top-Bar Deck Switcher Dropdown ────────────────────────────── */}
          <div ref={deckMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDeckMenuOpen((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 12px",
                borderRadius: 8,
                background: "rgba(24, 24, 27, 0.85)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#FAFAFA",
                fontSize: 12,
                fontWeight: 550,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(198, 244, 50, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
              }}
            >
              <Layers3 size={13} color="#C6F432" />
              <span
                style={{
                  maxWidth: 150,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeDeck?.name || r.deck.name}
              </span>
              <ChevronDown
                size={12}
                color="#A1A1AA"
                style={{
                  transform: deckMenuOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s ease",
                }}
              />
            </button>

            {deckMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  width: 270,
                  zIndex: 80,
                  background: "rgba(18, 18, 21, 0.96)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 14,
                  padding: "8px 6px",
                  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    color: "#71717A",
                    fontWeight: 700,
                    padding: "4px 8px 6px",
                    textTransform: "uppercase",
                  }}
                >
                  SAVED DECKS ({savedDecks.length})
                </div>

                <div
                  style={{
                    maxHeight: 220,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    scrollbarWidth: "none",
                  }}
                >
                  {savedDecks.map((d) => {
                    const isActive = d.id === activeDeckId;
                    const count = d.nodes.length;
                    const avgM = count
                      ? Math.round(
                          d.nodes.reduce(
                            (acc, n) => acc + (n.retention ?? 0),
                            0
                          ) / count
                        )
                      : 0;

                    return (
                      <div
                        key={d.id}
                        onClick={() => handleSelectDeck(d)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 8px",
                          borderRadius: 8,
                          background: isActive
                            ? "rgba(198, 244, 50, 0.12)"
                            : "transparent",
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive)
                            e.currentTarget.style.background =
                              "rgba(255, 255, 255, 0.05)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive)
                            e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {isActive && (
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: "#C6F432",
                                }}
                              />
                            )}
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: isActive ? 600 : 500,
                                color: isActive ? "#FAFAFA" : "#D4D4D8",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {d.name}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 10.5,
                              color: "#71717A",
                              marginLeft: isActive ? 12 : 0,
                            }}
                          >
                            {count} concepts · {avgM}% retention
                          </span>
                        </div>

                        {!d.isBuiltIn && (
                          <button
                            onClick={(e) => handleDeleteDeck(e, d.id)}
                            title="Delete deck"
                            style={{
                              background: "none",
                              border: "none",
                              color: "#71717A",
                              cursor: "pointer",
                              padding: "4px",
                              borderRadius: 4,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "#F87171";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "#71717A";
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div
                  style={{
                    height: 1,
                    background: "rgba(255, 255, 255, 0.08)",
                    margin: "4px 0",
                  }}
                />

                <button
                  onClick={() => {
                    setDeckMenuOpen(false);
                    setImporting(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 9px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "none",
                    color: "#C6F432",
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "rgba(198, 244, 50, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Plus size={13} />
                  <span>Import new PDF…</span>
                </button>
              </div>
            )}
          </div>
        </div>

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
        style={
          isGestureMode || isLearnMode || isStudyMode
            ? { gridTemplateColumns: "1fr", padding: 0 }
            : undefined
        }
      >
        {/* ── Gesture Synth (mode 2): full-width AR bubble space ─────────── */}
        {isGestureMode ? (
          <ARBubbleSpace
            recall={r}
            synthMuted={synth.muted}
            onToggleMute={synth.toggleMute}
          />
        ) : isLearnMode ? (
          /* ── Learn with Micu (mode 0): full-screen spatial tutor ────────── */
          <MicuTutorSpace
            recall={r}
            isUploadOpen={importing}
            onJumpToAR={() => {
              void synth.start();
              setMode(2);
            }}
          />
        ) : (
          /* ── Study Terrarium (mode 1): 3D Spatial Synthesis Engine ──────── */
          <StudyTerrarium
            deckTitle={r.deck.name}
            nodes={r.nodes}
            values={r.values}
            day={r.day}
            activeIndex={r.q}
            forgedSynapses={forgedSynapses}
            onSelectConcept={handleSelectConcept}
            onUpdateMastery={handleUpdateMastery}
            onAddSubconcepts={handleAddSubconcepts}
            onForgeSynapse={handleForgeSynapse}
            onResetDay={handleResetDay}
            onJumpToTutor={(idx) => {
              if (idx !== undefined) r.focusNode(idx);
              setMode(0);
            }}
            onJumpToAR={(idx) => {
              if (idx !== undefined) r.focusNode(idx);
              void synth.start();
              setMode(2);
            }}
          />
        )}
      </div>

      {importing && (
        <DeckImport
          load={handleDeckImportSuccess}
          close={() => setImporting(false)}
        />
      )}
    </main>
  );
}
