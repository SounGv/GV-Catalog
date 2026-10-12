"use client";

import { useEffect, useState } from "react";
import { useCamera } from "@/components/use-camera";

type CameraCaptureProps = {
  /** Shown in the title, e.g. the photo angle ("หน้า"). */
  label: string;
  onCapture: (file: File) => void;
  onClose: () => void;
};

/** Full-screen camera for filling one photo slot: take, check, use or retake. */
export function CameraCapture({ label, onCapture, onClose }: CameraCaptureProps) {
  const { attachVideo, ...camera } = useCamera();
  const [still, setStill] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    return () => {
      if (still) URL.revokeObjectURL(still.url);
    };
  }, [still]);

  async function snap() {
    const blob = await camera.snap();
    if (blob) setStill({ blob, url: URL.createObjectURL(blob) });
  }

  function useStill() {
    if (!still) return;
    onCapture(new File([still.blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
    camera.stop();
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`ถ่ายรูป ${label}`} className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">ถ่ายรูป: {label}</h2>
          <button
            type="button"
            onClick={() => {
              camera.stop();
              onClose();
            }}
            className="min-h-11 rounded-[10px] border border-white/40 px-4"
          >
            ปิด
          </button>
        </div>

        {camera.devices.length > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            กล้อง
            <select
              value={camera.deviceId}
              onChange={(event) => camera.chooseDevice(event.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-[10px] bg-white px-2 text-base text-black"
            >
              {camera.devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `กล้อง ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {camera.error ? <p className="rounded-[10px] bg-red-600 p-3 text-base">{camera.error}</p> : null}

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {still ? <img src={still.url} alt="รูปที่ถ่าย" className="max-h-full max-w-full object-contain" /> : null}
          <video
            ref={attachVideo}
            playsInline
            muted
            className={`max-h-full max-w-full object-contain ${still ? "hidden" : ""}`}
          />
        </div>

        <div className="flex gap-3">
          {still ? (
            <>
              <button type="button" onClick={() => setStill(null)} className="min-h-12 flex-1 rounded-[10px] border border-white/40 text-base">
                ถ่ายใหม่
              </button>
              <button type="button" onClick={useStill} className="min-h-12 flex-1 rounded-[10px] bg-accent text-base font-semibold text-white">
                ใช้รูปนี้
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={snap}
              disabled={Boolean(camera.error)}
              className="min-h-12 flex-1 rounded-[10px] bg-accent text-base font-semibold text-white disabled:opacity-50"
            >
              ถ่ายรูป
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
