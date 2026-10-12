"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEVICE_KEY = "gv-photo-camera-device";

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

  /** Callback ref: the <video> may appear after the stream is already open (e.g. once a model is picked). */
  const videoRef = useCallback((element: HTMLVideoElement | null) => {
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
        const video: MediaTrackConstraints = { width: { ideal: 3840 }, height: { ideal: 2160 } };
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
        const active = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (active) setDeviceId(active);
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
    void start(readSavedDevice());
    return stop;
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

  /** Takes a JPEG still from the live picture, scaled so the long side is at most `maxSide` px. */
  function snap(maxSide = 2400): Promise<Blob | null> {
    const video = videoEl.current;
    if (!video || !video.videoWidth) return Promise.resolve(null);
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  }

  return { videoRef, devices, deviceId, error, chooseDevice, snap, stop };
}
