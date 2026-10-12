"use client";

import { useEffect, useRef, useState } from "react";
import { detectBox, type BoxDetection, type DetectFailure } from "@/lib/box-measure";

const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];

/** What to tell staff when the box cannot be locked. */
export function boxLockHint(failure: DetectFailure): string {
  if (failure.reason === "touches-edge") {
    const angle = Math.atan2(failure.toward.y, failure.toward.x);
    const arrow = ARROWS[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
    return `${arrow} กล่องเลยขอบแผ่นรอง — เลื่อนกล่องไปทาง ${arrow} ให้อยู่บนแผ่นรองทั้งใบ`;
  }
  return BOX_LOCK_HINT[failure.reason];
}

const BOX_LOCK_HINT: Record<string, string> = {
  "no-mat": "ไม่เห็นแผ่นรองสีฟ้า — วางกล่องบนแผ่นรองและให้แผ่นรองเต็มภาพ",
  "no-box": "ยังหากล่องไม่เจอ — วางกล่องกลางแผ่นรอง ให้มีแผ่นรองล้อมรอบทุกด้าน",
  "no-grid": "อ่านเส้นตารางบนแผ่นรองไม่ได้ — เพิ่มแสงหรือเลื่อนกล้องให้เห็นเส้นตารางชัดขึ้น",
};

/**
 * Looks for the box on the blue mat a few times a second while `enabled`.
 * "locked" once three readings in a row agree within 5 mm; the reading shown is their average.
 */
export function useBoxLock(frame: (maxSide: number) => ImageData | null, enabled: boolean) {
  const [detection, setDetection] = useState<BoxDetection | null>(null);
  const [failure, setFailure] = useState("");
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [locked, setLocked] = useState(false);
  const history = useRef<BoxDetection[]>([]);
  const grabFrame = useRef(frame);
  useEffect(() => {
    grabFrame.current = frame;
  });

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const image = grabFrame.current(480);
      if (!image) return;
      setFrameSize({ w: image.width, h: image.height });
      const result = detectBox(image);
      if ("reason" in result) {
        history.current = [];
        setDetection(null);
        setLocked(false);
        setFailure(boxLockHint(result));
        return;
      }
      setFailure("");
      const recent = [...history.current, result].slice(-3);
      history.current = recent;
      const mean = (pick: (d: BoxDetection) => number) => recent.reduce((sum, d) => sum + pick(d), 0) / recent.length;
      setDetection({
        ...result,
        longCm: mean((d) => d.longCm),
        shortCm: mean((d) => d.shortCm),
        gridPx: mean((d) => d.gridPx),
      });
      setLocked(
        recent.length === 3 &&
          recent.every((d) => Math.abs(d.longCm - result.longCm) < 0.5 && Math.abs(d.shortCm - result.shortCm) < 0.5),
      );
    }, 400);
    return () => clearInterval(timer);
  }, [enabled]);

  /** Start a fresh lock (e.g. after the box was turned over). */
  function reset() {
    history.current = [];
    setLocked(false);
  }

  return { detection, failure, frameSize, locked, reset };
}
