"use client";

import { useEffect, useRef, useState } from "react";
import {
  getProductBoxSizeAction,
  saveProductBoxSizeAction,
  uploadProductPhotoQuietAction,
} from "@/app/admin/products/photos-actions";
import { calibrateCamera, distanceCm, solveBoxSize, type BoxDetection } from "@/lib/box-measure";
import { useBoxLock } from "@/components/use-box-lock";
import { useDeviceLevel } from "@/components/use-device-level";
import { readScale, writeScale } from "@/lib/camera-scale";
import type { useCamera } from "@/components/use-camera";

type Camera = Omit<ReturnType<typeof useCamera>, "attachVideo">;
type Step = "flat" | "side" | "calibrate" | "done";
type Size = { lengthCm: number; widthCm: number; heightCm: number };
type Saved = { lengthCm: number | null; widthCm: number | null; heightCm: number | null };
/** The flat shot: its reading plus a sharp still to draw the size on. */
type FlatShot = { detection: BoxDetection; frame: { w: number; h: number }; still: Blob | null };

const LEVEL_OK_DEG = 3;
const cm = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toFixed(1));

/** Draws the measured size onto the flat photo: outline, side lengths and the full size underneath. */
async function drawDimensions(shot: FlatShot, size: Size, sku: string): Promise<Blob | null> {
  if (!shot.still) return null;
  const bitmap = await createImageBitmap(shot.still);
  const bar = Math.round(bitmap.height * 0.12);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height + bar;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const k = bitmap.width / shot.frame.w;
  const [tl, tr, br, bl] = shot.detection.corners.map((p) => ({ x: p.x * k, y: p.y * k }));
  ctx.lineWidth = Math.max(3, Math.round(bitmap.width / 300));
  ctx.strokeStyle = "#cdeb03";
  ctx.beginPath();
  [tl, tr, br, bl, tl].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();

  const font = Math.round(bitmap.width / 26);
  ctx.font = `700 ${font}px "Noto Sans Thai", "IBM Plex Sans Thai", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = (text: string, x: number, y: number, angle: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const w = ctx.measureText(text).width + font;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(-w / 2, -font * 0.75, w, font * 1.5);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  const along = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    return angle;
  };
  const topIsLong = Math.hypot(tr.x - tl.x, tr.y - tl.y) >= Math.hypot(bl.x - tl.x, bl.y - tl.y);
  label(`${topIsLong ? "ยาว" : "กว้าง"} ${cm(topIsLong ? size.lengthCm : size.widthCm)} cm`, (tl.x + tr.x) / 2, (tl.y + tr.y) / 2, along(tl, tr));
  label(`${topIsLong ? "กว้าง" : "ยาว"} ${cm(topIsLong ? size.widthCm : size.lengthCm)} cm`, (tr.x + br.x) / 2, (tr.y + br.y) / 2, along(tr, br));
  label(`สูง ${cm(size.heightCm)} cm`, (tl.x + tr.x + br.x + bl.x) / 4, (tl.y + tr.y + br.y + bl.y) / 4, 0);

  ctx.fillStyle = "#17364d";
  ctx.fillRect(0, bitmap.height, canvas.width, bar);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(bar * 0.36)}px "Noto Sans Thai", "IBM Plex Sans Thai", sans-serif`;
  ctx.fillText(`${sku} · ยาว ${cm(size.lengthCm)} × กว้าง ${cm(size.widthCm)} × สูง ${cm(size.heightCm)} cm`, canvas.width / 2, bitmap.height + bar / 2);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

/**
 * Measures a box with the phone (or a fixed camera) held over the blue cutting mat.
 * Takes the photos by itself once the box is locked and the phone is level:
 * lying flat, then standing on its side. The camera's distance in each photo comes
 * from the grid size, after a one-time calibration per camera with one tape-measured box.
 */
export function BoxMeasurePanel({
  camera,
  attachVideo,
  sku,
}: {
  camera: Camera;
  attachVideo: (element: HTMLVideoElement | null) => void;
  sku: string;
}) {
  const [step, setStep] = useState<Step>("flat");
  const [flat, setFlat] = useState<FlatShot | null>(null);
  const [side, setSide] = useState<BoxDetection | null>(null);
  const [notFlipped, setNotFlipped] = useState(false);
  const [scale, setScale] = useState(0);
  const [tapeLength, setTapeLength] = useState("");
  const [tapeHeight, setTapeHeight] = useState("");
  const [calibrationError, setCalibrationError] = useState("");
  const [roundUp, setRoundUp] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const capturing = useRef(false);

  const lock = useBoxLock(camera.frame, step === "flat" || step === "side");
  const level = useDeviceLevel();
  const levelOk =
    level.supported === false ||
    (level.supported === true && Math.abs(level.x) < LEVEL_OK_DEG && Math.abs(level.y) < LEVEL_OK_DEG);

  useEffect(() => {
    void getProductBoxSizeAction(sku).then(setSaved);
  }, [sku]);

  // The calibration belongs to the camera in use.
  useEffect(() => {
    const timer = setTimeout(() => setScale(readScale(camera.deviceId)), 0);
    return () => clearTimeout(timer);
  }, [camera.deviceId]);

  const snapRef = useRef(camera.snap);
  useEffect(() => {
    snapRef.current = camera.snap;
  });

  async function takeShot(force = false) {
    const detection = lock.detection;
    if (!detection || !lock.frameSize || capturing.current || (!force && !levelOk)) return;
    if (step === "flat") {
      capturing.current = true;
      try {
        const still = await snapRef.current({ square: false, maxSide: 1600, enhance: true });
        setFlat({ detection, frame: lock.frameSize, still });
        navigator.vibrate?.(80);
        lock.reset();
        setStep("side");
      } finally {
        // A failed snap must not leave the flag set, or auto-capture would never fire again until a reload.
        capturing.current = false;
      }
    } else if (step === "side" && flat) {
      const same =
        Math.abs(detection.longCm - flat.detection.longCm) < 0.6 && Math.abs(detection.shortCm - flat.detection.shortCm) < 0.6;
      if (same) {
        setNotFlipped(true);
        return;
      }
      setNotFlipped(false);
      setSide(detection);
      navigator.vibrate?.([60, 60, 60]);
      setStep(scale ? "done" : "calibrate");
    }
  }

  // Take the photo by itself once the box is locked and the phone is level.
  const takeShotRef = useRef(takeShot);
  useEffect(() => {
    takeShotRef.current = takeShot;
  });
  useEffect(() => {
    if (lock.locked && levelOk && (step === "flat" || step === "side")) void takeShotRef.current();
  }, [lock.locked, levelOk, step, lock.detection]);

  const raw =
    flat && side && scale
      ? solveBoxSize(
          { longCm: flat.detection.longCm, shortCm: flat.detection.shortCm, distanceCm: distanceCm(flat.detection, scale) },
          { longCm: side.longCm, shortCm: side.shortCm, distanceCm: distanceCm(side, scale) },
        )
      : null;
  const shown: Size | null = raw
    ? roundUp
      ? { lengthCm: Math.ceil(raw.lengthCm), widthCm: Math.ceil(raw.widthCm), heightCm: Math.ceil(raw.heightCm) }
      : {
          lengthCm: Math.round(raw.lengthCm * 10) / 10,
          widthCm: Math.round(raw.widthCm * 10) / 10,
          heightCm: Math.round(raw.heightCm * 10) / 10,
        }
    : null;

  // Picture with the size drawn on, rebuilt when the numbers change.
  const shownKey = shown ? `${shown.lengthCm}|${shown.widthCm}|${shown.heightCm}` : "";
  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  });
  useEffect(() => {
    const size = shownRef.current;
    if (!flat || !size || step !== "done") return;
    let cancelled = false;
    void drawDimensions(flat, size, sku).then((blob) => {
      if (cancelled || !blob) return;
      setPreview((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [shownKey, step, flat, sku]);

  function calibrate() {
    if (!flat) return;
    const value = calibrateCamera(flat.detection, Number(tapeLength), Number(tapeHeight));
    if (!value) {
      setCalibrationError("ตัวเลขไม่เข้ากับรูป — ตรวจว่าใส่ ยาว (ด้านยาวที่สุด) และ สูง ของกล่องใบนี้ถูกต้อง แล้วลองใหม่");
      return;
    }
    writeScale(camera.deviceId, value);
    setScale(value);
    setCalibrationError("");
    setStep("done");
  }

  function restart() {
    setFlat(null);
    setSide(null);
    setNotFlipped(false);
    setMessage(null);
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    lock.reset();
    setStep("flat");
  }

  function recalibrate() {
    writeScale(camera.deviceId, 0);
    setScale(0);
    setTapeLength("");
    setTapeHeight("");
    setStep("calibrate");
  }

  async function save() {
    if (!shown) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await saveProductBoxSizeAction(sku, shown);
      if (!result.ok) {
        setMessage({ ok: false, text: result.error ?? "บันทึกไม่สำเร็จ" });
        return;
      }
      if (preview) {
        const formData = new FormData();
        formData.set("photo", new File([preview.blob], `${sku}-dimensions.jpg`, { type: "image/jpeg" }));
        formData.set("backgroundRemoval", "none");
        const upload = await uploadProductPhotoQuietAction(sku, "dimensions", formData);
        if (!upload.ok) {
          setSaved(await getProductBoxSizeAction(sku));
          setMessage({ ok: false, text: `บันทึกขนาดแล้ว แต่รูปบอกขนาดไม่สำเร็จ: ${upload.error ?? ""}` });
          return;
        }
      }
      setSaved(await getProductBoxSizeAction(sku));
      setMessage({ ok: true, text: `บันทึกขนาดและรูปบอกขนาดของ ${sku} แล้ว` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  const aiming = step === "flat" || step === "side";
  const aspect = camera.resolution ? camera.resolution.width / camera.resolution.height : 3 / 4;
  const corners = lock.detection?.corners ?? null;
  const stepIndex = step === "flat" ? 0 : step === "side" ? 1 : 2;
  const dot = (v: number) => Math.max(-16, Math.min(16, v * 1.6));
  const checks = [
    { ok: Boolean(lock.detection), text: "เห็นแผ่นรองรอบกล่องทุกด้าน" },
    { ok: lock.locked, text: "ล็อกขอบกล่องได้" },
    ...(level.supported ? [{ ok: levelOk, text: "ถือมือถือให้ตรง (จุดเขียวอยู่กลางวง)" }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      {aiming ? (
        <>
          <div>
            <p className="text-xs font-bold text-accent">ขั้น {stepIndex + 1}/3</p>
            <p className="text-base leading-snug font-bold text-ink">
              {step === "flat" ? "วางกล่องนอนราบกลางแผ่นรองสีฟ้า" : "พลิกกล่องตั้งข้าง (ด้านบางลงพื้น)"}
            </p>
            <p className="text-xs text-muted">
              {step === "flat" ? "ไม่ต้องกดปุ่ม ครบเงื่อนไขแล้วระบบถ่ายให้เอง" : "วางกลางแผ่นรองเหมือนเดิม ระบบถ่ายให้เองอีกครั้ง"}
            </p>
          </div>

          {level.needsPermission ? (
            <button type="button" onClick={level.requestPermission} className="min-h-11 rounded-[10px] border border-line bg-surface text-sm">
              เปิดตัววัดระดับมือถือ
            </button>
          ) : null}

          <div className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: String(aspect) }}>
            <video ref={attachVideo} playsInline muted className="h-full w-full object-contain" />
            {corners && lock.frameSize ? (
              <svg viewBox={`0 0 ${lock.frameSize.w} ${lock.frameSize.h}`} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
                <polygon
                  points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={lock.locked ? "rgba(205,235,3,0.12)" : "none"}
                  stroke={lock.locked ? "#cdeb03" : "#ffffff"}
                  strokeWidth={lock.locked ? 3 : 1.5}
                  strokeDasharray={lock.locked ? undefined : "6 4"}
                />
              </svg>
            ) : null}
            <span className={`absolute top-2.5 left-2.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${lock.locked ? "bg-[#cdeb03] text-ink" : "bg-black/60 text-white"}`}>
              {lock.locked ? (levelOk ? "● ล็อกแล้ว · กำลังถ่าย" : "● ล็อกแล้ว · ถือให้ตรง") : lock.detection ? "กำลังล็อกขอบ…" : "กำลังหากล่อง…"}
            </span>
            {level.supported ? (
              <span className="absolute top-2 right-2 block h-10 w-10 rounded-full border-2 border-white bg-black/30" aria-label="วัดระดับ">
                <span
                  className={`absolute top-1/2 left-1/2 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${levelOk ? "bg-[#cdeb03]" : "bg-amber-400"}`}
                  style={{ marginLeft: dot(level.x), marginTop: dot(level.y) }}
                />
              </span>
            ) : null}
            {lock.failure ? (
              <p className="absolute inset-x-2 bottom-2 rounded-[10px] bg-amber-300/95 p-2 text-center text-sm font-semibold text-ink">{lock.failure}</p>
            ) : null}
            {lock.detection ? (
              <span className="absolute right-2 bottom-2 rounded-lg bg-black/70 px-2.5 py-1 font-mono text-sm text-white tabular-nums">
                {cm(lock.detection.longCm)} × {cm(lock.detection.shortCm)} cm
              </span>
            ) : null}
          </div>

          {notFlipped ? (
            <p className="rounded-[10px] bg-red-50 p-2.5 text-sm text-red-700">ยังไม่ได้พลิกกล่อง ขนาดเหมือนรูปแรก ให้พลิกกล่องตั้งข้างก่อน</p>
          ) : null}

          <ul className="flex flex-wrap gap-1.5">
            {checks.map((check) => (
              <li
                key={check.text}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${check.ok ? "border-green-200 bg-green-50 font-semibold text-green-800" : "border-line bg-surface text-muted"}`}
              >
                <span className={check.ok ? "" : "text-amber-600"}>{check.ok ? "✓ " : "● "}</span>
                {check.text}
              </li>
            ))}
          </ul>

          {lock.locked && !levelOk ? (
            <button type="button" onClick={() => void takeShot(true)} className="min-h-11 rounded-[10px] border border-line bg-surface text-sm font-semibold">
              ถ่ายเลย (ไม่รอวัดระดับ)
            </button>
          ) : null}
          {step === "side" ? (
            <button type="button" onClick={restart} className="min-h-11 text-sm text-muted underline">
              เริ่มใหม่จากรูปแรก
            </button>
          ) : null}
        </>
      ) : null}

      {step === "calibrate" ? (
        <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5">
          <div>
            <p className="text-xs font-bold text-accent">ขั้น 3/3</p>
            <h3 className="text-base leading-snug font-bold">ครั้งแรกของเครื่องนี้: ใส่ขนาดที่วัดด้วยตลับเมตร</h3>
            <p className="text-xs text-muted">ทำครั้งเดียว ครั้งต่อไประบบวัดให้เองทั้งหมด</p>
          </div>
          <BoxSidesPicture />
          {saved?.lengthCm && saved.heightCm ? (
            <button
              type="button"
              onClick={() => {
                setTapeLength(String(saved.lengthCm));
                setTapeHeight(String(saved.heightCm));
              }}
              className="min-h-11 self-start rounded-[10px] border-[1.5px] border-dashed border-accent bg-accent-soft px-3 text-sm font-semibold text-accent"
            >
              ใช้ขนาดเดิมในระบบ ({cm(saved.lengthCm)} × {cm(saved.heightCm)})
            </button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              ยาว (cm)
              <input
                type="number"
                inputMode="decimal"
                step={0.1}
                value={tapeLength}
                onChange={(event) => setTapeLength(event.target.value)}
                className="min-h-12 w-full min-w-0 rounded-[10px] border border-line px-3 text-right text-base text-ink tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              สูง (cm)
              <input
                type="number"
                inputMode="decimal"
                step={0.1}
                value={tapeHeight}
                onChange={(event) => setTapeHeight(event.target.value)}
                className="min-h-12 w-full min-w-0 rounded-[10px] border border-line px-3 text-right text-base text-ink tabular-nums"
              />
            </label>
          </div>
          {calibrationError ? <p className="text-sm text-red-700">{calibrationError}</p> : null}
          <button
            type="button"
            onClick={calibrate}
            disabled={!Number(tapeLength) || !Number(tapeHeight)}
            className="min-h-12 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50"
          >
            คำนวณขนาด
          </button>
        </section>
      ) : null}

      {step === "done" && shown && raw ? (
        <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5">
          <h3 className="text-base font-bold">ขนาดกล่อง {sku}</h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview.url} alt="รูปบอกขนาดกล่อง" className="w-full rounded-[10px]" /> : null}
          <div className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["ยาว", shown.lengthCm, saved?.lengthCm],
                ["กว้าง", shown.widthCm, saved?.widthCm],
                ["สูง", shown.heightCm, saved?.heightCm],
              ] as const
            ).map(([text, value, before]) => (
              <div key={text} className="rounded-[10px] bg-bg p-2">
                <p className="font-mono text-xl font-bold text-ink tabular-nums">{roundUp ? value.toFixed(0) : cm(value)}</p>
                <p className="text-xs text-muted">{text} (cm)</p>
                <p className="text-xs text-muted">เดิม {cm(before)}</p>
              </div>
            ))}
          </div>
          {raw.mismatchCm > 0.5 ? (
            <p className="rounded-[10px] bg-amber-50 p-2.5 text-xs text-amber-800">
              2 รูปให้ค่าไม่ตรงกัน {raw.mismatchCm.toFixed(1)} cm ถือกล้องให้ตรงแล้ววัดใหม่ หรือปรับเทียบกล้องใหม่
            </p>
          ) : null}
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            ปัดขึ้นเป็น cm เต็ม (ใช้กับขนส่ง)
            <input type="checkbox" checked={roundUp} onChange={(event) => setRoundUp(event.target.checked)} className="h-5 w-5 accent-[#185c45]" />
          </label>
          <button type="button" onClick={() => void save()} disabled={busy} className="min-h-12 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50">
            {busy ? "กำลังบันทึก…" : "บันทึกขนาด + รูปบอกขนาด"}
          </button>
          <button type="button" onClick={restart} disabled={busy} className="min-h-11 rounded-xl border border-line text-sm font-semibold">
            วัดใหม่
          </button>
          <p className="text-center text-xs text-muted">
            คลาดเคลื่อนได้ราว 2–3 mm เมื่อถือกล้องตรง ·{" "}
            <button type="button" onClick={recalibrate} disabled={busy} className="min-h-8 underline">
              ปรับเทียบกล้องใหม่
            </button>
          </p>
        </section>
      ) : null}

      {message ? (
        <p role="status" className={`rounded-[10px] px-3 py-2 text-sm font-semibold ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {message.ok ? "✓ " : ""}
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Which two sides to measure with the tape: the longest side and the thinnest one (the height when lying flat). */
export function BoxSidesPicture() {
  return (
    <svg viewBox="0 0 260 132" role="img" aria-label="กล่อง: ยาว คือด้านยาวที่สุด สูง คือด้านที่บางที่สุด" className="mx-auto w-full max-w-[260px]">
      <g fill="none" stroke="#18232b" strokeWidth="2">
        <path d="M30 48h140l30-22H60z" fill="#f1dcc0" />
        <path d="M30 48v52h140V48" fill="#e8c9a0" />
        <path d="M170 48l30-22v52l-30 22" fill="#d9b88a" />
      </g>
      <g stroke="#185c45" strokeWidth="2.5" fill="none">
        <path d="M30 112h140M30 108v8M170 108v8M212 26v52M208 26h8M208 78h8" />
      </g>
      <text x="100" y="129" textAnchor="middle" fontSize="12" fill="#185c45" fontWeight="700">ยาว (ด้านยาวสุด)</text>
      <text x="236" y="56" textAnchor="middle" fontSize="12" fill="#185c45" fontWeight="700">สูง</text>
    </svg>
  );
}
