"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  elapsedDaysSince,
  retentionAt,
  type Concept,
} from "@/components/decks";

export interface WeakConceptAlert {
  node: Concept;
  index: number;
  retention: number;
  daysElapsed: number;
}

interface UseDecayNotificationsOptions {
  nodes: Concept[];
  values: number[];
  enabled?: boolean;
  onFocusConcept: (conceptIndex: number) => void;
  onInAppToast?: (message: string, conceptIndex?: number) => void;
}

const REMINDER_PREF_KEY = "synapsesonic_reminders";
const COOLDOWN_KEY = "synapsesonic_decay_notif_ts";
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours anti-spam window

async function dispatchBrowserNotification(
  title: string,
  body: string,
  conceptIndex: number,
  onClickFocus: (idx: number) => void
): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission !== "granted") {
    return false;
  }

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, {
          body,
          icon: "/icon.svg",
          badge: "/icon.svg",
          tag: "synapsesonic-decay-alert",
          data: { conceptIndex },
        });
        return true;
      }
    }
  } catch {
    // Fallback cleanly to window.Notification
  }

  try {
    const n = new Notification(title, {
      body,
      icon: "/icon.svg",
      tag: "synapsesonic-decay-alert",
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {}
      onClickFocus(conceptIndex);
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function useDecayNotifications({
  nodes,
  values,
  enabled: profileEnabled,
  onFocusConcept,
  onInAppToast,
}: UseDecayNotificationsOptions) {
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default"
  );

  const onFocusRef = useRef(onFocusConcept);
  onFocusRef.current = onFocusConcept;
  const onToastRef = useRef(onInAppToast);
  onToastRef.current = onInAppToast;

  const weakConcepts = useMemo<WeakConceptAlert[]>(() => {
    return nodes
      .map((node, index) => {
        const retention = values[index] ?? retentionAt(node, 0);
        const daysElapsed = Math.floor(elapsedDaysSince(node));
        return { node, index, retention, daysElapsed };
      })
      .filter((item) => item.retention < 50 || item.daysElapsed >= 1)
      .sort((a, b) => a.retention - b.retention);
  }, [nodes, values]);

  const weakRef = useRef(weakConcepts);
  weakRef.current = weakConcepts;

  // Hydrate browser notification permission + persisted preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      setRemindersEnabled(false);
      return;
    }
    const perm = Notification.permission;
    setPermission(perm);
    const localPref =
      window.localStorage.getItem(REMINDER_PREF_KEY) === "true";
    const resolved =
      perm === "granted" && (profileEnabled === true || localPref);
    setRemindersEnabled(resolved);
  }, [profileEnabled]);

  // Listen for Service Worker notification clicks to jump straight to fading concept
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNAPSE_REVIEW_CONCEPT") {
        const idx =
          typeof event.data.conceptIndex === "number"
            ? event.data.conceptIndex
            : 0;
        onFocusRef.current(idx);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  const checkAndNotify = useCallback(async () => {
    if (typeof window === "undefined") return;
    const list = weakRef.current;
    if (!remindersEnabled || list.length === 0) return;

    const lastSent = Number(window.localStorage.getItem(COOLDOWN_KEY) || "0");
    if (Date.now() - lastSent < COOLDOWN_MS) return;

    const top = list[0];
    const body =
      list.length === 1
        ? `"${top.node.title}" is at ${top.retention}% mastery — review now.`
        : `${list.length} concepts are fading (lowest: "${top.node.title}" at ${top.retention}%).`;

    const fired = await dispatchBrowserNotification(
      "SynapseSonic Memory Decay Alert",
      body,
      top.index,
      (idx) => onFocusRef.current(idx)
    );
    if (fired) {
      window.localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    }
  }, [remindersEnabled]);

  // Check on load and every 60 seconds while workspace is open
  useEffect(() => {
    if (!remindersEnabled) return;
    void checkAndNotify();
    const id = window.setInterval(() => {
      void checkAndNotify();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [remindersEnabled, checkAndNotify, weakConcepts.length]);

  const toggleReminders = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      onToastRef.current?.("Browser notifications are not supported here");
      return false;
    }

    if (remindersEnabled) {
      window.localStorage.setItem(REMINDER_PREF_KEY, "false");
      setRemindersEnabled(false);
      onToastRef.current?.("Memory decay alerts muted");
      return false;
    }

    try {
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      setPermission(perm);

      if (perm === "granted") {
        window.localStorage.setItem(REMINDER_PREF_KEY, "true");
        setRemindersEnabled(true);
        onToastRef.current?.("Memory decay alerts enabled");
        await dispatchBrowserNotification(
          "SynapseSonic Alerts On",
          "We'll notify you when calendar decay drops concepts below 50%.",
          weakRef.current[0]?.index ?? 0,
          (idx) => onFocusRef.current(idx)
        );
        return true;
      }

      window.localStorage.setItem(REMINDER_PREF_KEY, "false");
      setRemindersEnabled(false);
      onToastRef.current?.("Allow notifications in browser settings to enable alerts");
      return false;
    } catch {
      onToastRef.current?.("Unable to request notification permission");
      return false;
    }
  }, [remindersEnabled]);

  const sendTestAlert = useCallback(async () => {
    const top = weakRef.current[0];
    const targetIdx = top?.index ?? 0;
    const title = "SynapseSonic Decay Alert (Demo)";
    const body = top
      ? `"${top.node.title}" faded to ${top.retention}% — click to review now.`
      : "Backpropagation faded to 42% mastery — click to review with Micu.";

    if (typeof window !== "undefined" && "Notification" in window) {
      let perm = Notification.permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }
      if (perm === "granted") {
        const sent = await dispatchBrowserNotification(
          title,
          body,
          targetIdx,
          (idx) => onFocusRef.current(idx)
        );
        if (sent) {
          onToastRef.current?.("Test OS alert sent", top ? targetIdx : undefined);
          return;
        }
      }
    }

    onToastRef.current?.(body, top ? targetIdx : undefined);
  }, []);

  return {
    weakConcepts,
    remindersEnabled,
    permission,
    toggleReminders,
    sendTestAlert,
  };
}
