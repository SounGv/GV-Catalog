"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = {
  new (opts?: { formats?: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

const WANTED = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code", "data_matrix"];
/** Auto mode: the same barcode counts again only after it left the picture this long (next piece). */
const SAME_CODE_GAP_MS = 700;
const NEXT_CODE_MS = 400;
/** Tap mode: a code seen this recently counts at once; otherwise the button waits this long for one. */
const FRESH_MS = 600;
const WAIT_MS = 1500;
const AUTO_KEY = "gv-camera-auto-scan";

/**
 * Full-screen phone-camera barcode reader (Chrome on Android has the built-in BarcodeDetector,
 * so no extra library). Default: aim, then press the big สแกน button — one press = one piece.
 * "อัตโนมัติ" counts every piece that passes under the camera without pressing.
 */
export function CameraBarcodeSheet({
  onDetected,
  onClose,
  status,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
  /** Last scan result line, shown over the picture so the picker never has to close the camera. */
  status?: { tone: "ok" | "warn" | "bad"; text: string } | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handler = useRef(onDetected);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [seenCode, setSeenCode] = useState("");
  const [hint, setHint] = useState("");
  const [auto, setAuto] = useState(() => {
    try {
      return window.localStorage.getItem(AUTO_KEY) === "1";
    } catch {
      return false;
    }
  });
  const autoRef = useRef(auto);
  const seen = useRef({ code: "", at: 0 });
  const waiting = useRef(0);

  useEffect(() => {
    handler.current = onDetected;
  }, [onDetected]);

  const fire = useCallback((code: string) => {
    navigator.vibrate?.(60);
    setFlash(true);
    setTimeout(() => setFlash(false), 250);
    setHint("");
    handler.current(code);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let lastAt = 0;
    let lastCode = "";
    let lastSeenAt = 0;
    let shown = "";

    (async () => {
      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (!Ctor) {
        setError("เครื่องนี้สแกนด้วยกล้องไม่ได้ — เปิดด้วย Chrome บน Android หรือใช้ปุ่มสแกนของเครื่อง PDA");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("เปิดกล้องไม่ได้ (ต้องเปิดผ่าน https)");
        return;
      }
      const supported = (await Ctor.getSupportedFormats?.().catch(() => [] as string[])) ?? [];
      const formats = WANTED.filter((f) => supported.includes(f));
      const detector = new Ctor(formats.length ? { formats } : undefined);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (cause) {
        const name = cause instanceof DOMException ? cause.name : "";
        setError(name === "NotAllowedError" ? "ยังไม่ได้อนุญาตให้ใช้กล้อง — กดอนุญาตที่แถบด้านบนของเบราว์เซอร์แล้วลองใหม่" : "เปิดกล้องไม่ได้ ลองปิดแอปอื่นที่ใช้กล้องอยู่");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { focusMode?: string[] };
      if (caps.focusMode?.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setReady(true);

      const tick = async () => {
        if (cancelled) return;
        if (video.readyState >= 2) {
          const found = await detector.detect(video).catch(() => []);
          const code = found[0]?.rawValue?.trim() ?? "";
          const now = Date.now();
          if (code) seen.current = { code, at: now };
          // Show what the camera reads right now (only re-render when it changes).
          const visible = code || (now - seen.current.at < FRESH_MS ? seen.current.code : "");
          if (visible !== shown) {
            shown = visible;
            setSeenCode(visible);
          }
          if (code && !cancelled) {
            if (waiting.current && now < waiting.current) {
              // The สแกน button was pressed before a code was in view: take the first one that shows up.
              waiting.current = 0;
              fire(code);
            } else if (autoRef.current) {
              const stillSamePiece = code === lastCode && now - lastSeenAt < SAME_CODE_GAP_MS;
              if (code === lastCode) lastSeenAt = now;
              if (!stillSamePiece && now - lastAt > NEXT_CODE_MS) {
                lastAt = now;
                lastCode = code;
                lastSeenAt = now;
                fire(code);
              }
            }
          }
          if (waiting.current && now >= waiting.current) {
            waiting.current = 0;
            setHint("ยังไม่เจอบาร์โค้ด — เล็งให้อยู่ในกรอบ ห่างประมาณ 1 คืบ แล้วกดอีกครั้ง");
          }
        }
        timer = setTimeout(tick, 100);
      };
      void tick();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [fire]);

  const scanNow = () => {
    const { code, at } = seen.current;
    if (code && Date.now() - at < FRESH_MS) {
      seen.current = { code: "", at: 0 }; // the next press needs a fresh read
      fire(code);
      return;
    }
    waiting.current = Date.now() + WAIT_MS;
    setHint("กำลังหาบาร์โค้ด…");
  };

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    autoRef.current = next;
    try {
      window.localStorage.setItem(AUTO_KEY, next ? "1" : "0");
    } catch {
      /* private mode: setting just isn't remembered */
    }
  };

  const tone = { ok: "bg-[#1a7f4e]", warn: "bg-amber-600", bad: "bg-red-600" };
  const bottomLine = hint || status?.text || "";
  const bottomClass = hint ? "bg-black/75" : status ? tone[status.tone] : "";

  return (
    <div role="dialog" aria-modal="true" aria-label="สแกนบาร์โค้ดด้วยกล้อง" className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* aiming box */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className={`h-[28%] w-[82%] rounded-2xl border-[3px] transition-colors ${
              flash ? "border-[#cdeb03] bg-[#cdeb03]/20" : seenCode ? "border-[#cdeb03]" : "border-white/80"
            }`}
          >
            <div className="mt-[14%] h-0.5 w-full bg-[#cdeb03] shadow-[0_0_12px_#cdeb03]" />
          </div>
        </div>
        {error ? (
          <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl bg-white p-4 text-center text-sm font-semibold text-red-700">{error}</p>
        ) : (
          <div className="absolute inset-x-0 top-3 flex flex-col items-center gap-2 px-4">
            <p className="text-center text-sm text-white/90 drop-shadow">
              {auto ? "อัตโนมัติ: นับทุกชิ้นที่ผ่านกล้อง — ยกออกแล้วเล็งชิ้นถัดไป" : "เล็งบาร์โค้ดในกรอบ แล้วกด สแกน — กด 1 ครั้ง = 1 ชิ้น"}
            </p>
            {seenCode ? <p className="rounded-full bg-[#cdeb03] px-3 py-1 font-mono text-sm font-bold text-[#131516]">เจอ {seenCode}</p> : null}
          </div>
        )}
        {!error && bottomLine ? <p className={`absolute inset-x-3 bottom-3 rounded-xl px-3 py-2 text-sm font-semibold text-white ${bottomClass}`}>{bottomLine}</p> : null}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-[#18232b] px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <button type="button" onClick={onClose} className="h-12 justify-self-start rounded-xl px-3 text-sm font-semibold text-white">
          ปิดกล้อง
        </button>
        <button
          type="button"
          onClick={scanNow}
          disabled={!ready || auto}
          aria-label="สแกน"
          className="grid h-20 w-20 place-items-center rounded-full border-4 border-white/30 bg-[#cdeb03] text-base font-bold text-[#131516] active:scale-95 disabled:opacity-40"
        >
          สแกน
        </button>
        <button
          type="button"
          onClick={toggleAuto}
          aria-pressed={auto}
          className={`h-12 justify-self-end rounded-xl px-3 text-sm font-semibold ${auto ? "bg-[#cdeb03] text-[#131516]" : "border border-white/30 text-white"}`}
        >
          อัตโนมัติ {auto ? "เปิด" : "ปิด"}
        </button>
      </div>
    </div>
  );
}
