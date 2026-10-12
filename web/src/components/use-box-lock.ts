"use client";

import { useEffect, useRef, useState } from "react";
import { detectBox, type BoxDetection, type DetectFailure } from "@/lib/box-measure";

const EDGE_TEXT = { left: "ซ้าย", right: "ขวา", top: "บน", bottom: "ล่าง" } as const;
const AWAY_ARROW = { left: "→", right: "←", top: "↓", bottom: "↑" } as const;

/** What to tell staff when the box cannot be locked. */
export function boxLockHint(failure: DetectFailure): string {
  if (failure.reason === "touches-edge") {
    const sides = failure.edges.map((edge) => EDGE_TEXT[edge]).join(" ");
    const arrows = failure.edges.map((edge) => AWAY_ARROW[edge]).join(" ");
    return `${arrows}  กล่องชนขอบด้าน${sides} — เลื่อนกล่องเข้ากลางแผ่นรอง หรือยกกล้องให้สูงขึ้น`;
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
 * "locked" once three readings in a row agree within 3 mm.
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
      setDetection(result);
      const recent = [...history.current, result].slice(-3);
      history.current = recent;
      setLocked(
        recent.length === 3 &&
          recent.every((d) => Math.abs(d.longCm - result.longCm) < 0.3 && Math.abs(d.shortCm - result.shortCm) < 0.3),
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
