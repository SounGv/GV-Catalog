"use client";

import { useEffect } from "react";

/** Registers the service worker that makes the site installable as an app (production only, so dev reloads stay fresh). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // the site still works as a normal web page
    });
  }, []);
  return null;
}
