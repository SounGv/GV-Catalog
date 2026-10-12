"use client";

import { useEffect, useState } from "react";

type Level = {
  /** null = still finding out, false = no tilt sensor (desktop / USB camera). */
  supported: boolean | null;
  /** Tilt from lying flat, in degrees, along the two screen axes. */
  x: number;
  y: number;
  /** iPhone asks for permission from a button press. */
  needsPermission: boolean;
  requestPermission: () => void;
};

type OrientationWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };

/**
 * Phone tilt from the motion sensor, so photos for measuring are taken with the
 * phone held flat over the mat (a tilted photo stretches one side of the box).
 */
export function useDeviceLevel(): Level {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [granted, setGranted] = useState(false);
  // Some browsers (iPhone, newer Chrome) only send tilt readings after a button press grants it.
  // Until then the level is simply treated as unavailable, so measuring still works.
  const needsPermission =
    typeof window !== "undefined" &&
    typeof (window.DeviceOrientationEvent as OrientationWithPermission | undefined)?.requestPermission === "function" &&
    !granted &&
    supported !== true;

  useEffect(() => {
    let seen = false;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      seen = true;
      setSupported(true);
      setTilt({ x: event.gamma, y: event.beta });
    };
    window.addEventListener("deviceorientation", onOrientation);
    // No reading within a second: treat as a camera without a tilt sensor.
    const timer = setTimeout(() => {
      if (!seen) setSupported((current) => (current === true ? current : false));
    }, 1200);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      clearTimeout(timer);
    };
  }, [granted]);

  function requestPermission() {
    const api = window.DeviceOrientationEvent as OrientationWithPermission;
    void api.requestPermission?.().then((answer) => setGranted(answer === "granted"));
  }

  return { supported, x: tilt.x, y: tilt.y, needsPermission, requestPermission };
}
