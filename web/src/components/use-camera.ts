"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEVICE_KEY = "gv-photo-camera-device";

type SnapOptions = {
  /** Crop the centre square (what the square viewfinder shows). */
  square?: boolean;
  /** Longest side of the saved photo, in px. */
  maxSide?: number;
  /** Mild auto contrast and sharpening, for a cleaner product-shot look. */
  enhance?: boolean;
};

/** Unsharp mask: adds back a little of the difference between the picture and a blurred copy. */
function sharpen(canvas: HTMLCanvasElement, amount: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const blurred = document.createElement("canvas");
  blurred.width = width;
  blurred.height = height;
  const blurCtx = blurred.getContext("2d");
  if (!blurCtx) return;
  blurCtx.filter = "blur(1.5px)";
  blurCtx.drawImage(canvas, 0, 0);
  const original = ctx.getImageData(0, 0, width, height);
  const soft = blurCtx.getImageData(0, 0, width, height).data;
  const px = original.data;
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = px[i + c] + amount * (px[i + c] - soft[i + c]);
      px[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  ctx.putImageData(original, 0, 0);
}

function readSavedDevice(): string {
  try {
    return localStorage.getItem(DEVICE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Opens a camera into a <video> (webcam, USB document camera such as the
 * Hikvision DS-UVC-S228A Pro, or a phone camera) and takes still photos from it.
 * Needs HTTPS or localhost. The chosen camera is remembered per browser.
 */
export function useCamera() {
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [resolution, setResolution] = useState<{ width: number; height: number } | null>(null);

  /** Callback ref: the <video> may appear after the stream is already open (e.g. once a model is picked). */
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoEl.current = element;
    if (element && streamRef.current) {
      element.srcObject = streamRef.current;
      void element.play().catch(() => undefined);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (wantedDevice: string) => {
      stop();
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("เบราว์เซอร์นี้เปิดกล้องไม่ได้ (ต้องเปิดผ่าน https)");
        return;
      }
      try {
        const video: MediaTrackConstraints = { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } };
        if (wantedDevice) video.deviceId = { exact: wantedDevice };
        else video.facingMode = { ideal: "environment" };
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        streamRef.current = stream;
        if (videoEl.current) {
          videoEl.current.srcObject = stream;
          await videoEl.current.play().catch(() => undefined);
        }
        // Device names are only readable after permission has been granted.
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((device) => device.kind === "videoinput"));
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings();
        if (settings?.deviceId) setDeviceId(settings.deviceId);
        if (settings?.width && settings.height) setResolution({ width: settings.width, height: settings.height });
        // Keep the picture sharp: continuous autofocus where the camera supports it.
        const caps = (track?.getCapabilities?.() ?? {}) as { focusMode?: string[] };
        if (caps.focusMode?.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
        }
      } catch (cause) {
        const name = cause instanceof DOMException ? cause.name : "";
        setError(
          name === "NotAllowedError"
            ? "ยังไม่ได้อนุญาตให้ใช้กล้อง — กดไอคอนกล้องที่แถบที่อยู่ของเบราว์เซอร์แล้วเลือก อนุญาต"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "ไม่พบกล้องที่เลือก — เสียบกล้องแล้วเลือกใหม่ในช่อง กล้อง"
              : "เปิดกล้องไม่สำเร็จ ลองเลือกกล้องตัวอื่น หรือปิดโปรแกรมอื่นที่ใช้กล้องอยู่",
        );
      }
    },
    [stop],
  );

  useEffect(() => {
    // started on the next tick so the first state updates do not happen inside the effect itself
    const timer = setTimeout(() => void start(readSavedDevice()), 0);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [start, stop]);

  function chooseDevice(next: string) {
    setDeviceId(next);
    try {
      localStorage.setItem(DEVICE_KEY, next);
    } catch {
      // remembering the camera is only a convenience
    }
    void start(next);
  }

  /** Takes a JPEG still, using the camera's own full-resolution photo mode when it has one. */
  async function snap({ square = false, maxSide = 2400, enhance = true }: SnapOptions = {}): Promise<Blob | null> {
    const video = videoEl.current;
    if (!video || !video.videoWidth) return null;
    let source: CanvasImageSource = video;
    let width = video.videoWidth;
    let height = video.videoHeight;

    const track = streamRef.current?.getVideoTracks()[0];
    const ImageCaptureClass = (window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => {
      getPhotoCapabilities: () => Promise<{ imageWidth?: { max: number }; imageHeight?: { max: number } }>;
      takePhoto: (settings?: { imageWidth?: number; imageHeight?: number }) => Promise<Blob>;
    } }).ImageCapture;
    if (track && ImageCaptureClass) {
      try {
        const capture = new ImageCaptureClass(track);
        const caps = await capture.getPhotoCapabilities().catch(() => null);
        const photo = await capture
          .takePhoto(caps?.imageWidth && caps.imageHeight ? { imageWidth: caps.imageWidth.max, imageHeight: caps.imageHeight.max } : undefined)
          .catch(() => capture.takePhoto());
        const bitmap = await createImageBitmap(photo);
        // Only trust it when it shows the same view as the preview and is not smaller.
        const sameView = Math.abs(bitmap.width / bitmap.height - video.videoWidth / video.videoHeight) < 0.05;
        if (sameView && bitmap.width >= video.videoWidth) {
          source = bitmap;
          width = bitmap.width;
          height = bitmap.height;
        }
      } catch {
        // fall back to a frame from the live picture
      }
    }

    const cropSide = Math.min(width, height);
    const sw = square ? cropSide : width;
    const sh = square ? cropSide : height;
    const sx = square ? (width - cropSide) / 2 : 0;
    const sy = square ? (height - cropSide) / 2 : 0;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (enhance) ctx.filter = "contrast(1.06) saturate(1.05) brightness(1.02)";
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";
    if (enhance) sharpen(canvas, 0.6);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  }

  /** The current live picture, scaled down for analysis (null until the camera is running). */
  function frame(maxSide = 400): ImageData | null {
    const video = videoEl.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  return { attachVideo, devices, deviceId, error, resolution, chooseDevice, snap, frame, stop };
}
