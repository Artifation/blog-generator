"use client";

import * as React from "react";
import { patchSiteAction } from "~/lib/actions/sites";
import type { UpdateSiteInput } from "~/lib/sites";
import { toast } from "sonner";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface UseAutoSaveArgs<T extends UpdateSiteInput> {
  siteId: string;
  /** Logical card name — used in toast errors so user knows which card failed. */
  cardKey: string;
  /** Current values of the fields in this card. */
  values: T;
}

interface UseAutoSaveResult {
  status: SaveStatus;
  /** Call from onBlur of any input in the card. Saves if dirty. */
  flush: () => Promise<void>;
}

const SAVED_VISIBLE_MS = 1500;

export function useAutoSave<T extends UpdateSiteInput>({
  siteId,
  cardKey,
  values,
}: UseAutoSaveArgs<T>): UseAutoSaveResult {
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const valuesRef = React.useRef(values);
  const lastSavedRef = React.useRef(JSON.stringify(values));
  const abortRef = React.useRef<AbortController | null>(null);
  const savedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync with latest values.
  React.useEffect(() => {
    valuesRef.current = values;
    if (JSON.stringify(values) !== lastSavedRef.current) {
      setStatus((s) => (s === "saving" ? s : "dirty"));
    }
  }, [values]);

  const flush = React.useCallback(async () => {
    const serialized = JSON.stringify(valuesRef.current);
    if (serialized === lastSavedRef.current) return;

    // Cancel any in-flight save.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }

    setStatus("saving");
    try {
      const result = await patchSiteAction(siteId, valuesRef.current);
      if (ctrl.signal.aborted) return;
      if (result.ok) {
        lastSavedRef.current = serialized;
        setStatus("saved");
        // After SAVED_VISIBLE_MS, fade back to idle (unless user typed again).
        savedTimerRef.current = setTimeout(() => {
          setStatus((s) => (s === "saved" ? "idle" : s));
          savedTimerRef.current = null;
        }, SAVED_VISIBLE_MS);
      } else {
        setStatus("error");
        toast.error(`${cardKey}: ${result.error}`);
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setStatus("error");
      toast.error(`${cardKey}: ${(err as Error).message}`);
    }
  }, [siteId, cardKey]);

  // Cleanup savedTimerRef on unmount.
  React.useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Beforeunload guard: warn user if dirty or saving.
  React.useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (status === "dirty" || status === "saving") {
        e.preventDefault();
        // Modern browsers ignore the message but still show their own prompt.
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  return { status, flush };
}
