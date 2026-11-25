"use client";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  Sprout,
  Hand,
  Upload,
  Timer,
  Bot,
  ChevronDown,
  Layers3,
  Plus,
  Trash2,
  Cloud,
  CloudOff,
  Home,
  LogOut,
  LogIn,
  HelpCircle,
  Compass,
  SlidersHorizontal,
} from "lucide-react";
import { useRecall } from "./use-recall";
import { DeckImport } from "./deck-import";
import { useSynth } from "./use-synth";
import { ARBubbleSpace } from "./ar-bubble-space";
import { MicuTutorSpace } from "./micu-tutor-space";
import { BrandLogo } from "./brand-logo";
import { LatticeLoader } from "./motion/LatticeLoader";
import { OnboardingStepper } from "./onboarding-stepper";
import { WorkspaceTour } from "./workspace-tour";
import { WorkspaceHelpModal } from "./workspace-help-modal";
import { makeDeck, samples, type Concept } from "./decks";
import type {
  ForgedSynapse,
  ForgedBridgePayload,
} from "./study-terrarium";
import {
  supabase,
  fetchUserDecks,
  upsertUserDeck,
  deleteUserDeck,
  signOut,
  signInWithGoogle,
  type RemoteDeckRow,
} from "@/lib/supabase";
import {
  DEFAULT_USER_PROFILE,
  loadLocalProfile,
  saveLocalProfile,
  syncProfileToSupabase,
  type UserStudyProfile,
} from "@/lib/user-profile";

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
const GUEST_STORAGE_KEY = "synapsesonic_decks_guest";
const LEGACY_STORAGE_KEY = "synapsesonic_decks_v1";

function getStorageKey(userId?: string | null): string {
  return userId ? `synapsesonic_decks_${userId}` : GUEST_STORAGE_KEY;
}

function readStoredDecks(key: string): {
  activeDeckId?: string;
  decks: SavedDeck[];
} | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.decks) && parsed.decks.length > 0) {
      return { activeDeckId: parsed.activeDeckId, decks: parsed.decks };
    }
  } catch {
    // Quiet fallback
  }
  return null;
}

function writeStoredDecks(
  key: string,
  activeDeckId: string,
  decks: SavedDeck[]
) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ activeDeckId, decks }));
  } catch {
    // Quiet fallback
  }
}

function clearGuestStorage() {
  try {
    window.localStorage.removeItem(GUEST_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Quiet fallback
  }
}

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

function mergeDecks(
  localDecks: SavedDeck[],
  remoteRows: RemoteDeckRow[]
): SavedDeck[] {
  const byId = new Map<string, SavedDeck>();
  for (const d of localDecks) {
    byId.set(d.id, d);
  }

  for (const row of remoteRows) {
    const remoteNodes = Array.isArray(row.nodes) ? row.nodes : [];
    const remoteEdges = Array.isArray(row.edges) ? row.edges : [];
    const local = byId.get(row.id);

    if (!local) {
      byId.set(row.id, {
        id: row.id,
        name: row.title || "Untitled Deck",
        nodes: remoteNodes,
        forgedSynapses: remoteEdges,
        day: 0,
        isBuiltIn: row.id === STARTER_DECK_ID,
      });
      continue;
    }

    // Merge nodes preferring higher retention
    const nodeMap = new Map<string, Concept>();
    for (const ln of local.nodes) {
      nodeMap.set(ln.id, ln);
    }
    for (const rn of remoteNodes) {
      const existing = nodeMap.get(rn.id);
      if (!existing) {
        nodeMap.set(rn.id, rn);
      } else {
        const localRet = existing.retention ?? 0;
        const remoteRet = rn.retention ?? 0;
        if (remoteRet > localRet) {
          nodeMap.set(rn.id, rn);
        }
      }
    }

    // Union forged synapses without duplicates
    const edgeList: ForgedSynapse[] = [...(local.forgedSynapses || [])];
    for (const re of remoteEdges) {
      const dup = edgeList.some(
        (le) =>
          (le.sourceId === re.sourceId && le.targetId === re.targetId) ||
          (le.sourceId === re.targetId && le.targetId === re.sourceId)
      );
      if (!dup) edgeList.push(re);
    }

    byId.set(row.id, {
      ...local,
      name: local.name || row.title,
      nodes: Array.from(nodeMap.values()),
      forgedSynapses: edgeList,
    });
  }

  return Array.from(byId.values());
}

const modes = [
  { name: "Learn with Micu", Icon: Bot, tourId: "tab-micu" },
  { name: "Study Terrarium", Icon: Sprout, tourId: "tab-terrarium" },
  { name: "Gesture Synth", Icon: Hand, tourId: "tab-ar" },
];

export default function Workspace() {
  const [mode, setMode] = useState(0),
    [importing, setImporting] = useState(false),
    [savedDecks, setSavedDecks] = useState<SavedDeck[]>([createStarterDeck()]),
    [activeDeckId, setActiveDeckId] = useState<string>(STARTER_DECK_ID),
    [deckMenuOpen, setDeckMenuOpen] = useState(false),
    [forgedSynapses, setForgedSynapses] = useState<ForgedSynapse[]>([]),
    [hasHydrated, setHasHydrated] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [syncStatus, setSyncStatus] = useState<
      "idle" | "syncing" | "synced" | "error"
    >("idle"),
    [accountMenuOpen, setAccountMenuOpen] = useState(false),
    [studyProfile, setStudyProfile] = useState<UserStudyProfile | null>(null),
    [onboardingOpen, setOnboardingOpen] = useState(false),
    [tourActive, setTourActive] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [toastMessage, setToastMessage] = useState<string | null>(null),
    deckMenuRef = useRef<HTMLDivElement>(null),
    accountMenuRef = useRef<HTMLDivElement>(null),
    savedDecksRef = useRef<SavedDeck[]>(savedDecks),
    activeDeckIdRef = useRef<string>(activeDeckId),
    userRef = useRef<User | null>(user),
    cloudReadyRef = useRef(false),
    lastSyncedUserIdRef = useRef<string | null>(null),
    toastTimerRef = useRef<number | null>(null),
    pendingStartAfterTourRef = useRef<UserStudyProfile["preferredStart"] | null>(
      null
    ),
    r = useRecall(importing),
    synth = useSynth();

  savedDecksRef.current = savedDecks;
  activeDeckIdRef.current = activeDeckId;
  userRef.current = user;

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

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

  const applyStoredDecks = useCallback(
    (stored: { activeDeckId?: string; decks: SavedDeck[] } | null) => {
      if (stored && stored.decks.length > 0) {
        setSavedDecks(stored.decks);
        const active =
          stored.decks.find((d) => d.id === stored.activeDeckId) ||
          stored.decks[0];
        setActiveDeckId(active.id);
        setForgedSynapses(active.forgedSynapses || []);
        r.load({ name: active.name, nodes: active.nodes });
        r.setDay(typeof active.day === "number" ? active.day : 0);
        return;
      }
      const starter = createStarterDeck();
      setSavedDecks([starter]);
      setActiveDeckId(STARTER_DECK_ID);
      setForgedSynapses([]);
      r.load({ name: starter.name, nodes: starter.nodes });
      r.setDay(0);
    },
    [r]
  );

  // ── 1. Atomic Auth & Local/Cloud Deck Hydration ───────────────────────────
  useEffect(() => {
    let cancelled = false;

    function cleanOAuthHash() {
      if (typeof window === "undefined") return;
      const hash = window.location.hash;
      const search = window.location.search;
      if (
        hash === "#" ||
        hash.includes("access_token") ||
        hash.includes("refresh_token") ||
        search.includes("code=")
      ) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    async function syncDecksForUser(currentUser: User) {
      if (cancelled || lastSyncedUserIdRef.current === currentUser.id) return;
      lastSyncedUserIdRef.current = currentUser.id;
      cloudReadyRef.current = false;
      setSyncStatus("syncing");

      const { data: remoteRows, error } = await fetchUserDecks(currentUser.id);
      if (cancelled) return;
      if (error) {
        setSyncStatus("error");
        cloudReadyRef.current = true;
        return;
      }

      // Scope exclusively to this user's storage + any non-starter guest decks from an anonymous session
      const userKey = getStorageKey(currentUser.id);
      const userLocal = readStoredDecks(userKey)?.decks || [];
      const guestOnlyCustom = (
        readStoredDecks(GUEST_STORAGE_KEY)?.decks || []
      ).filter((d) => !d.isBuiltIn);

      const baseLocal =
        userLocal.length > 0
          ? mergeDecks(userLocal, [])
          : [createStarterDeck()];
      const combinedLocal =
        guestOnlyCustom.length > 0
          ? [...baseLocal, ...guestOnlyCustom.filter((gd) => !baseLocal.some((bd) => bd.id === gd.id))]
          : baseLocal;

      const merged = mergeDecks(combinedLocal, remoteRows);
      const storedActiveId = readStoredDecks(userKey)?.activeDeckId;
      const targetActive =
        merged.find((d) => d.id === storedActiveId) ||
        merged.find((d) => d.id === activeDeckIdRef.current) ||
        merged[0];

      setSavedDecks(merged);
      if (targetActive) {
        setActiveDeckId(targetActive.id);
        setForgedSynapses(targetActive.forgedSynapses || []);
        r.load({ name: targetActive.name, nodes: targetActive.nodes });
        r.setDay(typeof targetActive.day === "number" ? targetActive.day : 0);
      }

      writeStoredDecks(userKey, targetActive?.id || STARTER_DECK_ID, merged);
      if (guestOnlyCustom.length > 0) {
        clearGuestStorage();
      }

      for (const d of merged) {
        if (cancelled) return;
        await upsertUserDeck(currentUser.id, {
          id: d.id,
          title: d.name,
          nodes: d.nodes,
          edges: d.forgedSynapses || [],
        });
      }

      if (!cancelled) {
        cloudReadyRef.current = true;
        setSyncStatus("synced");
      }
    }

    if (!supabase) {
      const guestStored =
        readStoredDecks(GUEST_STORAGE_KEY) || readStoredDecks(LEGACY_STORAGE_KEY);
      applyStoredDecks(guestStored);
      setHasHydrated(true);
      return;
    }

    // CRITICAL: Register onAuthStateChange synchronously BEFORE getSession()
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        const nextUser = session?.user ?? null;
        // Synchronously update user state first (never await inside callback)
        setUser(nextUser);

        if (
          nextUser &&
          (event === "INITIAL_SESSION" ||
            event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED")
        ) {
          cleanOAuthHash();
          const cachedUserDecks = readStoredDecks(getStorageKey(nextUser.id));
          if (cachedUserDecks) {
            applyStoredDecks(cachedUserDecks);
          }
          setHasHydrated(true);
          window.setTimeout(() => {
            if (!cancelled) void syncDecksForUser(nextUser);
          }, 0);
        } else if (event === "SIGNED_OUT") {
          cloudReadyRef.current = false;
          lastSyncedUserIdRef.current = null;
          setSyncStatus("idle");
          setHasHydrated(true);
        } else if (!nextUser && event === "INITIAL_SESSION") {
          const guestStored =
            readStoredDecks(GUEST_STORAGE_KEY) ||
            readStoredDecks(LEGACY_STORAGE_KEY);
          applyStoredDecks(guestStored);
          setHasHydrated(true);
        }
      }
    );

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const sessionUser = data.session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser) {
          cleanOAuthHash();
          const cachedUserDecks = readStoredDecks(getStorageKey(sessionUser.id));
          if (cachedUserDecks) {
            applyStoredDecks(cachedUserDecks);
          }
          setHasHydrated(true);
          window.setTimeout(() => {
            if (!cancelled) void syncDecksForUser(sessionUser);
          }, 0);
        } else {
          const guestStored =
            readStoredDecks(GUEST_STORAGE_KEY) ||
            readStoredDecks(LEGACY_STORAGE_KEY);
          applyStoredDecks(guestStored);
          setHasHydrated(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          applyStoredDecks(readStoredDecks(GUEST_STORAGE_KEY));
          setHasHydrated(true);
        }
      });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Persist active deck mutations to scoped localStorage ────────────────
  useEffect(() => {
    if (!hasHydrated || !activeDeckId || !r.deck?.nodes) return;
    const storageKey = getStorageKey(user?.id);
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
      writeStoredDecks(storageKey, activeDeckId, updated);
      return updated;
    });
  }, [r.deck, forgedSynapses, r.day, activeDeckId, hasHydrated, user]);

  // ── 3. Close Deck & Account Menus on Click Outside ─────────────────────────
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        deckMenuRef.current &&
        !deckMenuRef.current.contains(event.target as Node)
      ) {
        setDeckMenuOpen(false);
      }
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    }
    if (deckMenuOpen || accountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [deckMenuOpen, accountMenuOpen]);

  // ── 4. Debounced Cloud Sync on Active Deck Mutations ───────────────────────
  useEffect(() => {
    if (
      !hasHydrated ||
      !user ||
      !cloudReadyRef.current ||
      !activeDeckId ||
      !r.deck?.nodes
    ) {
      return;
    }

    setSyncStatus("syncing");
    const timer = window.setTimeout(() => {
      void upsertUserDeck(user.id, {
        id: activeDeckId,
        title: r.deck.name,
        nodes: r.deck.nodes,
        edges: forgedSynapses,
      }).then(({ error }) => {
        setSyncStatus(error ? "error" : "synced");
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [r.deck, forgedSynapses, r.day, activeDeckId, user, hasHydrated]);

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
        writeStoredDecks(
          getStorageKey(userRef.current?.id),
          activeDeckId === deckId ? filtered[0].id : activeDeckId,
          filtered
        );
        return filtered;
      });
      if (user) {
        void deleteUserDeck(user.id, deckId);
      }
    },
    [activeDeckId, r, user]
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
        writeStoredDecks(getStorageKey(userRef.current?.id), newId, next);
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
      const existingIds = new Set(currentDeck.nodes.map((n) => n.id));
      const addedNodes = newConcepts.map((nc, idx) => {
        let id = nc.id || `${currentDeck.name}:sub:${Date.now()}:${idx}`;
        if (existingIds.has(id)) {
          id = `${id}-${Date.now()}-${idx}`;
        }
        existingIds.add(id);
        return {
          id,
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
        };
      });

      const updatedDeck = {
        ...currentDeck,
        nodes: [...currentDeck.nodes, ...addedNodes],
      };
      r.load(updatedDeck);

      // Connect parent to newly added subconcepts as kind: 'branch', isCustom: false
      setForgedSynapses((prev) => {
        const next = [...prev];
        addedNodes.forEach((an) => {
          const exists = next.some(
            (s) =>
              (s.sourceId === parentId && s.targetId === an.id) ||
              (s.sourceId === an.id && s.targetId === parentId)
          );
          if (!exists) {
            next.push({
              sourceId: parentId,
              targetId: an.id,
              label: "Sub-concept",
              kind: "branch" as const,
              isCustom: false,
            });
          }
        });
        return next;
      });
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

  const deduplicatedNodes = useMemo(() => {
    const seen = new Set<string>();
    return r.nodes.filter((n) => {
      if (!n || !n.id || seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }, [r.nodes]);

  // ── 5. Load Study Profile & Trigger First-Time Onboarding ─────────────────
  useEffect(() => {
    if (!hasHydrated) return;

    const remoteMeta = user?.user_metadata?.synapse_profile as
      | Partial<UserStudyProfile>
      | undefined;
    const localProf = loadLocalProfile(user?.id);

    let resolved: UserStudyProfile | null = null;
    if (remoteMeta && typeof remoteMeta === "object" && remoteMeta.onboardingCompleted) {
      resolved = {
        ...DEFAULT_USER_PROFILE,
        ...remoteMeta,
      };
      saveLocalProfile(resolved, user?.id);
    } else if (localProf) {
      resolved = localProf;
    }

    setStudyProfile(resolved);

    if (!resolved || !resolved.onboardingCompleted) {
      const timer = window.setTimeout(() => {
        setOnboardingOpen(true);
      }, 350);
      return () => window.clearTimeout(timer);
    }
  }, [hasHydrated, user]);

  // ── 6. Keyboard Shortcuts (1 / 2 / 3 / ? / Escape) ───────────────────────
  useEffect(() => {
    if (!hasHydrated) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Escape") {
        setHelpOpen(false);
        setAccountMenuOpen(false);
        setDeckMenuOpen(false);
        return;
      }

      if (e.key === "?" && !onboardingOpen && !tourActive) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      if (onboardingOpen || importing || tourActive || helpOpen) return;

      if (e.key === "1") {
        synth.stop();
        setMode(0);
      } else if (e.key === "2") {
        synth.stop();
        setMode(1);
      } else if (e.key === "3") {
        void synth.start();
        setMode(2);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasHydrated, onboardingOpen, importing, tourActive, helpOpen, synth]);

  const handleOnboardingComplete = useCallback(
    (profile: UserStudyProfile, startTour: boolean) => {
      saveLocalProfile(profile, userRef.current?.id);
      setStudyProfile(profile);
      void syncProfileToSupabase(profile);
      setOnboardingOpen(false);

      if (startTour) {
        if (
          profile.preferredStart === "ar" ||
          profile.preferredStart === "upload"
        ) {
          pendingStartAfterTourRef.current = profile.preferredStart;
        } else if (profile.preferredStart === "micu") {
          synth.stop();
          setMode(0);
        } else {
          synth.stop();
          setMode(1);
        }
        showToast(`Workspace calibrated for ${profile.name}`);
        setTourActive(true);
        return;
      }

      if (profile.preferredStart === "micu") {
        synth.stop();
        setMode(0);
      } else if (profile.preferredStart === "terrarium") {
        synth.stop();
        setMode(1);
      } else if (profile.preferredStart === "ar") {
        void synth.start();
        setMode(2);
      } else if (profile.preferredStart === "upload") {
        setImporting(true);
      }

      showToast(`Workspace calibrated for ${profile.name}`);
    },
    [synth, showToast]
  );

  const handleOnboardingSkip = useCallback(() => {
    const fallbackName =
      studyProfile?.name ||
      String(
        userRef.current?.user_metadata?.full_name ||
          userRef.current?.email?.split("@")[0] ||
          "Learner"
      );
    const skippedProfile: UserStudyProfile = {
      ...(studyProfile || DEFAULT_USER_PROFILE),
      name: fallbackName,
      onboardingCompleted: true,
    };
    saveLocalProfile(skippedProfile, userRef.current?.id);
    setStudyProfile(skippedProfile);
    void syncProfileToSupabase(skippedProfile);
    setOnboardingOpen(false);
  }, [studyProfile]);

  const handleHighlightTabDuringTour = useCallback(
    (tab: "micu" | "terrarium" | "ar") => {
      // Never activate webcam during tour — only switch non-camera tabs or highlight tab button
      if (tab === "micu") {
        synth.stop();
        setMode(0);
      } else if (tab === "terrarium") {
        synth.stop();
        setMode(1);
      }
    },
    [synth]
  );

  const markTourCompleted = useCallback(() => {
    const updated: UserStudyProfile = {
      ...(studyProfile || DEFAULT_USER_PROFILE),
      tourCompleted: true,
    };
    saveLocalProfile(updated, userRef.current?.id);
    setStudyProfile(updated);
    void syncProfileToSupabase(updated);

    const pending = pendingStartAfterTourRef.current;
    pendingStartAfterTourRef.current = null;
    if (pending === "ar") {
      void synth.start();
      setMode(2);
    } else if (pending === "upload") {
      setImporting(true);
    }
  }, [studyProfile, synth]);

  const handleSignOut = useCallback(async () => {
    setAccountMenuOpen(false);
    setOnboardingOpen(false);
    setTourActive(false);
    setHelpOpen(false);
    cloudReadyRef.current = false;
    lastSyncedUserIdRef.current = null;
    setSyncStatus("idle");
    setUser(null);

    // Clear guest storage and reset React deck state immediately so private decks never leak across accounts
    clearGuestStorage();
    const starter = createStarterDeck();
    setSavedDecks([starter]);
    setActiveDeckId(STARTER_DECK_ID);
    setForgedSynapses([]);
    r.load({ name: starter.name, nodes: starter.nodes });
    r.setDay(0);
    setStudyProfile(loadLocalProfile(null));

    await signOut();
  }, [r]);

  if (!hasHydrated) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          background: "#0B0B0C",
          display: "grid",
          placeItems: "center",
        }}
      >
        <LatticeLoader size={30} label="Loading Workspace" />
      </div>
    );
  }

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
          <Link
            href="/"
            className="brand flex items-center"
            style={{ textDecoration: "none", color: "inherit" }}
            title="Back to SynapseSonic Home"
          >
            <BrandLogo size="sm" />
          </Link>

          {/* ── Top-Bar Deck Switcher Dropdown ────────────────────────────── */}
          <div
            ref={deckMenuRef}
            data-tour="deck-switcher"
            style={{ position: "relative" }}
          >
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
          {modes.map(({ name, Icon, tourId }, i) => (
            <button
              key={name}
              data-tour={tourId}
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

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="upload" onClick={() => setImporting(true)}>
            <Upload size={15} />
            Upload PDF
          </button>

          {/* ── Quick Help Button (?) ──────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Shortcuts & Gesture Legend (?)"
            aria-label="Shortcuts and Gesture Legend"
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "rgba(24, 24, 27, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#A1A1AA",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(198, 244, 50, 0.45)";
              e.currentTarget.style.color = "#C6F432";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
              e.currentTarget.style.color = "#A1A1AA";
            }}
          >
            <HelpCircle size={15} />
          </button>

          {/* ── Account / Cloud Sync & Controls Pill ───────────────────── */}
          {hasHydrated && (
            <div
              ref={accountMenuRef}
              data-tour="account-pill"
              style={{ position: "relative" }}
            >
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: user ? "5px 10px 5px 6px" : "7px 11px",
                  borderRadius: 999,
                  background: "rgba(24, 24, 27, 0.9)",
                  border: "1px solid rgba(255, 255, 255, 0.14)",
                  color: "#FAFAFA",
                  fontSize: 12,
                  fontWeight: 550,
                  cursor: "pointer",
                  transition: "border-color 0.15s ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor =
                    "rgba(198, 244, 50, 0.45)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    "rgba(255, 255, 255, 0.14)";
                }}
                title={user?.email || "Account & Workspace Controls"}
              >
                {user ? (
                  <>
                    {user.user_metadata?.avatar_url ? (
                      <img
                        src={String(user.user_metadata.avatar_url)}
                        alt="User avatar"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "rgba(198, 244, 50, 0.16)",
                          border: "1px solid rgba(198, 244, 50, 0.4)",
                          color: "#C6F432",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        {(
                          studyProfile?.name?.[0] ||
                          user.user_metadata?.full_name?.[0] ||
                          user.email?.[0] ||
                          "S"
                        ).toString()}
                      </span>
                    )}
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background:
                          syncStatus === "error"
                            ? "#F87171"
                            : syncStatus === "syncing"
                              ? "#E5A93C"
                              : "#C6F432",
                        boxShadow:
                          syncStatus === "error"
                            ? "0 0 6px #F87171"
                            : syncStatus === "syncing"
                              ? "0 0 6px #E5A93C"
                              : "0 0 6px #C6F432",
                      }}
                    />
                  </>
                ) : (
                  <>
                    <LogIn size={13} color="#C6F432" />
                    <span>{studyProfile?.name || "Sign in"}</span>
                  </>
                )}
                <ChevronDown
                  size={12}
                  color="#A1A1AA"
                  style={{
                    transform: accountMenuOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.15s ease",
                  }}
                />
              </button>

              {accountMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: 252,
                    zIndex: 90,
                    background: "rgba(18, 18, 21, 0.97)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 14,
                    padding: "10px 8px",
                    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.65)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <div style={{ padding: "4px 8px 8px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "#FAFAFA",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {studyProfile?.name
                          ? studyProfile.field
                            ? `${studyProfile.name} · ${studyProfile.field}`
                            : studyProfile.name
                          : user
                            ? String(
                                user.user_metadata?.full_name ||
                                  user.email ||
                                  "Learner"
                              )
                            : "Guest Workspace"}
                      </span>
                    </div>

                    {user?.email && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#71717A",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: 2,
                        }}
                      >
                        {user.email}
                      </div>
                    )}

                    {user ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 7,
                          fontSize: 11,
                          color:
                            syncStatus === "error"
                              ? "#F87171"
                              : syncStatus === "syncing"
                                ? "#E5A93C"
                                : "#C6F432",
                        }}
                      >
                        {syncStatus === "error" ? (
                          <CloudOff size={12} />
                        ) : (
                          <Cloud size={12} />
                        )}
                        <span>
                          {syncStatus === "error"
                            ? "Cloud sync paused"
                            : syncStatus === "syncing"
                              ? "Syncing decks…"
                              : "Cloud synced"}
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#71717A",
                          marginTop: 4,
                        }}
                      >
                        Local guest mode · Sign in to sync
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      height: 1,
                      background: "rgba(255, 255, 255, 0.08)",
                      margin: "2px 0",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setTourActive(true);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 8px",
                      borderRadius: 8,
                      background: "transparent",
                      border: "none",
                      color: "#D4D4D8",
                      fontSize: 12,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Compass size={13} color="#C6F432" />
                    <span>Replay Walkthrough</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setOnboardingOpen(true);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 8px",
                      borderRadius: 8,
                      background: "transparent",
                      border: "none",
                      color: "#D4D4D8",
                      fontSize: 12,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <SlidersHorizontal size={13} color="#C6F432" />
                    <span>Edit Study Profile</span>
                  </button>

                  <Link
                    href="/"
                    onClick={() => setAccountMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 8px",
                      borderRadius: 8,
                      color: "#D4D4D8",
                      fontSize: 12,
                      textDecoration: "none",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Home size={13} />
                    <span>Landing Page</span>
                  </Link>

                  <div
                    style={{
                      height: 1,
                      background: "rgba(255, 255, 255, 0.08)",
                      margin: "2px 0",
                    }}
                  />

                  {user ? (
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 8px",
                        borderRadius: 8,
                        background: "transparent",
                        border: "none",
                        color: "#FCA5A5",
                        fontSize: 12,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(248, 113, 113, 0.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <LogOut size={13} />
                      <span>Sign out</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void signInWithGoogle();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 8px",
                        borderRadius: 8,
                        background: "rgba(198, 244, 50, 0.1)",
                        border: "1px solid rgba(198, 244, 50, 0.3)",
                        color: "#C6F432",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(198, 244, 50, 0.18)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "rgba(198, 244, 50, 0.1)";
                      }}
                    >
                      <LogIn size={13} />
                      <span>Sign in with Google</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
            onForgeSynapse={handleForgeSynapse}
            onUpdateMastery={handleUpdateMastery}
            nodes={deduplicatedNodes}
            activeConceptId={r.nodes[r.q]?.id}
            deckTitle={r.deck.name}
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
            nodes={deduplicatedNodes}
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

      <OnboardingStepper
        open={onboardingOpen}
        initialProfile={studyProfile}
        defaultName={String(
          user?.user_metadata?.full_name ||
            user?.email?.split("@")[0] ||
            ""
        )}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />

      <WorkspaceTour
        active={tourActive}
        onHighlightTab={handleHighlightTabDuringTour}
        onFinish={() => {
          setTourActive(false);
          markTourCompleted();
          showToast("Guided walkthrough complete");
        }}
        onSkip={() => {
          setTourActive(false);
          markTourCompleted();
        }}
      />

      <WorkspaceHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onStartTour={() => setTourActive(true)}
        onEditProfile={() => setOnboardingOpen(true)}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 110,
            pointerEvents: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            padding: "10px 14px",
            borderRadius: 12,
            background: "rgba(20, 20, 22, 0.94)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(198, 244, 50, 0.38)",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
            color: "#FAFAFA",
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#C6F432",
              boxShadow: "0 0 8px #C6F432",
              flexShrink: 0,
            }}
          />
          <span>{toastMessage}</span>
        </div>
      )}
    </main>
  );
}
