"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = {
  new (opts?: { formats?: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

const WANTED = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code", "data_matrix"];
/** A piece held under the camera is read many times a second; wait before counting the next one. */
const COOLDOWN_MS = 1200;

/**
 * Full-screen phone-camera barcode reader (Chrome on Android has the built-in BarcodeDetector,
 * so no extra library). Stays open for repeated scans — each read calls onDetected — until closed.
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
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    handler.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let lastAt = 0;

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

      const tick = async () => {
        if (cancelled) return;
        if (video.readyState >= 2 && Date.now() - lastAt > COOLDOWN_MS) {
          const found = await detector.detect(video).catch(() => []);
          const code = found[0]?.rawValue?.trim();
          if (code && !cancelled) {
            lastAt = Date.now();
            navigator.vibrate?.(60);
            setFlash(true);
            setTimeout(() => setFlash(false), 250);
            handler.current(code);
          }
        }
        timer = setTimeout(tick, 120);
      };
      void tick();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const tone = { ok: "bg-[#1a7f4e]", warn: "bg-amber-600", bad: "bg-red-600" };

  return (
    <div role="dialog" aria-modal="true" aria-label="สแกนบาร์โค้ดด้วยกล้อง" className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* aiming box */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className={`h-[28%] w-[82%] rounded-2xl border-[3px] transition-colors ${flash ? "border-[#cdeb03] bg-[#cdeb03]/20" : "border-white/80"}`}>
            <div className="mt-[14%] h-0.5 w-full bg-[#cdeb03] shadow-[0_0_12px_#cdeb03]" />
          </div>
        </div>
        {error ? (
          <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl bg-white p-4 text-center text-sm font-semibold text-red-700">{error}</p>
        ) : (
          <p className="absolute inset-x-0 top-4 text-center text-sm text-white/90 drop-shadow">เล็งบาร์โค้ดให้อยู่ในกรอบ · สแกนต่อได้เรื่อย ๆ</p>
        )}
        {status && !error ? (
          <p className={`absolute inset-x-3 bottom-3 rounded-xl px-3 py-2 text-sm font-semibold text-white ${tone[status.tone]}`}>{status.text}</p>
        ) : null}
      </div>
      <button type="button" onClick={onClose} className="h-16 bg-[#18232b] text-base font-semibold text-white">
        ปิดกล้อง
      </button>
    </div>
  );
}
