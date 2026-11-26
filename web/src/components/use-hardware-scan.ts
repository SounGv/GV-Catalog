"use client";

import { useEffect, useRef } from "react";

/**
 * Catches barcodes from a handheld PDA's built-in scanner (side trigger button) even when the
 * scan box has lost focus — e.g. after tapping the item list or a dialog.
 *
 * Android PDAs (KC-PDA-F2 and similar) send a scan as fast keystrokes ending in Enter
 * ("keyboard output / keystroke" mode in the scanner settings app). Human typing is far slower,
 * so keys that arrive more than MAX_GAP_MS apart reset the buffer.
 *
 * Keys typed into another text field (picker name, quantity) are left alone, and so are keys
 * typed into the scan box itself — its own form already handles Enter.
 */
const MAX_GAP_MS = 60;
const MIN_LENGTH = 4;

export function useHardwareScan(onScan: (barcode: string) => void, opts: { enabled: boolean; scanInput: React.RefObject<HTMLInputElement | null> }) {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  const { enabled, scanInput } = opts;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target === scanInput.current) return;
      if (target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;

      const now = e.timeStamp;
      if (now - last > MAX_GAP_MS) buffer = "";
      last = now;

      if (e.key === "Enter" || e.key === "Tab") {
        const code = buffer.trim();
        buffer = "";
        if (code.length >= MIN_LENGTH) {
          e.preventDefault();
          handler.current(code);
          scanInput.current?.focus();
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) buffer += e.key;
    };

    // Coming back to the app (screen off/on, switching apps) puts the cursor back in the scan box.
    const refocus = () => {
      if (document.visibilityState === "visible") scanInput.current?.focus();
    };

    window.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", refocus);
    window.addEventListener("focus", refocus);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", refocus);
      window.removeEventListener("focus", refocus);
    };
  }, [enabled, scanInput]);
}
