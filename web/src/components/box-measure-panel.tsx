"use client";

import { useEffect, useState } from "react";
import { getProductBoxSizeAction, saveProductBoxSizeAction } from "@/app/admin/products/photos-actions";
import { correctForHeight, solveBoxSize } from "@/lib/box-measure";
import { useBoxLock } from "@/components/use-box-lock";
import type { useCamera } from "@/components/use-camera";

type Camera = Omit<ReturnType<typeof useCamera>, "attachVideo">;
type Shot = { longCm: number; shortCm: number };
type Step = "flat" | "side" | "done";

const CAMERA_HEIGHT_KEY = "gv-camera-height-cm";

function readCameraHeight(): string {
  try {
    return localStorage.getItem(CAMERA_HEIGHT_KEY) ?? "";
  } catch {
    return "";
  }
}

const cm = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toFixed(1));

/**
 * Auto-locks onto a box lying on the blue cutting mat and reads its size from
 * the mat's 10 mm grid. Two top-down shots: lying flat (width × length), then
 * standing on its side (height). Saves the result into the product's size.
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
  const [flat, setFlat] = useState<Shot | null>(null);
  const [side, setSide] = useState<Shot | null>(null);
  const [cameraHeight, setCameraHeight] = useState(readCameraHeight);
  const [saved, setSaved] = useState<{ lengthCm: number | null; widthCm: number | null; heightCm: number | null } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [typedHeight, setTypedHeight] = useState("");
  const { detection, failure, frameSize, locked, reset } = useBoxLock(camera.frame, step !== "done");

  useEffect(() => {
    void getProductBoxSizeAction(sku).then(setSaved);
  }, [sku]);

  function changeCameraHeight(value: string) {
    setCameraHeight(value);
    try {
      localStorage.setItem(CAMERA_HEIGHT_KEY, value);
    } catch {
      // only a convenience
    }
  }

  function useReading() {
    if (!detection || !locked) return;
    const shot = { longCm: detection.longCm, shortCm: detection.shortCm };
    if (step === "flat") {
      setFlat(shot);
      setStep("side");
    } else {
      setSide(shot);
      setStep("done");
    }
    reset();
  }

  const heightOfCamera = Number(cameraHeight) || 0;
  const manualHeight = Number(typedHeight) || 0;
  const result = !flat
    ? null
    : side
      ? solveBoxSize(flat, side, heightOfCamera)
      : step === "done" && manualHeight > 0
        ? {
            lengthCm: correctForHeight(flat.longCm, manualHeight, heightOfCamera),
            widthCm: correctForHeight(flat.shortCm, manualHeight, heightOfCamera),
            heightCm: manualHeight,
          }
        : null;

  async function save() {
    if (!result) return;
    setBusy(true);
    setMessage(null);
    const response = await saveProductBoxSizeAction(sku, {
      lengthCm: result.lengthCm,
      widthCm: result.widthCm,
      heightCm: result.heightCm,
    }).catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }));
    setBusy(false);
    if (!response.ok) {
      setMessage({ ok: false, text: response.error ?? "บันทึกไม่สำเร็จ" });
      return;
    }
    setSaved(await getProductBoxSizeAction(sku));
    setMessage({ ok: true, text: `บันทึกขนาดกล่องของ ${sku} แล้ว` });
  }

  function restart() {
    setFlat(null);
    setSide(null);
    setTypedHeight("");
    setStep("flat");
    setMessage(null);
  }

  const aspect = camera.resolution ? camera.resolution.width / camera.resolution.height : 16 / 9;
  const corners = detection?.corners ?? null;

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        <li className={`rounded-full px-3 py-1 ${step === "flat" ? "bg-ink text-white" : "bg-surface text-muted"}`}>
          {flat ? "✓ " : "1. "}วางกล่องนอนราบ
        </li>
        <li aria-hidden="true" className="font-bold text-ink">→</li>
        <li className={`rounded-full px-3 py-1 ${step === "side" ? "bg-ink text-white" : "bg-surface text-muted"}`}>
          {side ? "✓ " : "2. "}พลิกตั้งข้าง (วัดความสูง)
        </li>
        <li aria-hidden="true" className="font-bold text-ink">→</li>
        <li className={`rounded-full px-3 py-1 ${step === "done" ? "bg-ink text-white" : "bg-surface text-muted"}`}>บันทึกขนาด</li>
      </ol>

      {step !== "done" ? (
        <>
          <div className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-xl bg-black" style={{ aspectRatio: String(aspect) }}>
            <video ref={attachVideo} playsInline muted className="h-full w-full object-contain" />
            {corners && frameSize ? (
              <svg viewBox={`0 0 ${frameSize.w} ${frameSize.h}`} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
                <polygon
                  points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={locked ? "rgba(205,235,3,0.12)" : "none"}
                  stroke={locked ? "#cdeb03" : "#ffffff"}
                  strokeWidth={locked ? 2.5 : 1.5}
                  strokeDasharray={locked ? undefined : "6 4"}
                />
                {corners.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={4} fill={locked ? "#cdeb03" : "#ffffff"} />
                ))}
              </svg>
            ) : null}
            <span
              className={`absolute top-2 left-2 rounded-full px-3 py-1 text-sm font-semibold ${
                locked ? "bg-[#cdeb03] text-ink" : "bg-black/60 text-white"
              }`}
            >
              {locked ? "● ล็อกเป้าแล้ว" : detection ? "กำลังล็อกเป้า…" : "กำลังหากล่อง…"}
            </span>
            {detection ? (
              <span className="absolute right-2 bottom-2 rounded-lg bg-black/70 px-3 py-1.5 font-mono text-lg text-white tabular-nums">
                {cm(detection.longCm)} × {cm(detection.shortCm)} cm
              </span>
            ) : null}
          </div>
          {failure ? <p className="rounded-[10px] bg-amber-50 p-3 text-base text-amber-800">{failure}</p> : null}
          <p className="text-sm text-muted">
            {step === "flat"
              ? "วางกล่องนอนราบกลางแผ่นรองสีฟ้า ให้มีแผ่นรองล้อมรอบทุกด้าน กล้องมองตรงลงจากด้านบน รอจนขึ้น ล็อกเป้าแล้ว"
              : "พลิกกล่องตั้งข้าง (ด้านบางลงพื้น) กลางแผ่นรองเหมือนเดิม รอจนขึ้น ล็อกเป้าแล้ว ด้านสั้นที่เห็นคือความสูงของกล่อง"}
          </p>
          <button
            type="button"
            onClick={useReading}
            disabled={!locked}
            className="min-h-12 rounded-[10px] bg-accent text-base font-semibold text-white disabled:opacity-50"
          >
            {step === "flat" ? "ใช้ค่านี้ (กว้าง × ยาว)" : "ใช้ค่านี้ (ความสูง)"}
          </button>
          {step === "side" ? (
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm text-muted">
                หรือพิมพ์ความสูงที่วัดเอง (cm)
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  value={typedHeight}
                  onChange={(event) => setTypedHeight(event.target.value)}
                  className="min-h-11 rounded-[10px] border border-line bg-surface px-3 text-base text-ink"
                />
              </label>
              <button
                type="button"
                disabled={!manualHeight}
                onClick={() => setStep("done")}
                className="min-h-11 rounded-[10px] border border-line bg-surface px-4 text-base disabled:opacity-50"
              >
                ใช้ค่าที่พิมพ์
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <label className="flex flex-col gap-1 text-sm text-muted">
        ความสูงของกล้องจากแผ่นรอง (cm) — วัดครั้งเดียว ระบบจำไว้
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          value={cameraHeight}
          onChange={(event) => changeCameraHeight(event.target.value)}
          placeholder="เช่น 40"
          className="min-h-11 rounded-[10px] border border-line bg-surface px-3 text-base text-ink"
        />
      </label>
      {!heightOfCamera ? (
        <p className="text-sm text-amber-700">ยังไม่ได้ใส่ความสูงกล้อง ระบบจะวัดขนาดใหญ่กว่าจริงเล็กน้อย เพราะด้านบนของกล่องอยู่ใกล้กล้องกว่าแผ่นรอง</p>
      ) : null}

      {result ? (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
          <h3 className="text-base font-semibold">ขนาดกล่องที่วัดได้</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["ยาว", result.lengthCm, saved?.lengthCm],
              ["กว้าง", result.widthCm, saved?.widthCm],
              ["สูง", result.heightCm, saved?.heightCm],
            ].map(([label, value, before]) => (
              <div key={String(label)} className="rounded-[10px] bg-bg p-2">
                <p className="font-mono text-2xl font-bold text-ink tabular-nums">{cm(value as number)}</p>
                <p className="text-sm text-muted">{label} (cm)</p>
                <p className="text-xs text-muted">เดิม {cm(before as number | null)}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted">ค่าประมาณจากรูป คลาดเคลื่อนได้ราว 0.5 cm ควรเทียบกับตลับเมตรสัก 2 ถึง 3 กล่องก่อนใช้จริง</p>
          <div className="flex gap-3">
            <button type="button" onClick={restart} disabled={busy} className="min-h-12 flex-1 rounded-[10px] border border-line text-base disabled:opacity-50">
              วัดใหม่
            </button>
            <button type="button" onClick={() => void save()} disabled={busy} className="min-h-12 flex-1 rounded-[10px] bg-accent text-base font-semibold text-white disabled:opacity-50">
              {busy ? "กำลังบันทึก…" : "บันทึกขนาดลงสินค้า"}
            </button>
          </div>
        </section>
      ) : null}

      {message ? (
        <p role="status" className={`rounded-[10px] p-3 text-base ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {message.ok ? "✓ " : ""}
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
