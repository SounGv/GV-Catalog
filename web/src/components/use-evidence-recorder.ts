"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Packing-station evidence video, recorded in the browser and saved straight to
 * a folder on the station's own disk (Chrome File System Access API) — nothing
 * is uploaded.
 *
 * The camera frame is redrawn onto a canvas with a caption (date-time, branch,
 * PO/bill, last scan) so the footage explains itself. Data is appended to the
 * file every few seconds and the file is closed after each append, so a crash
 * or closed tab loses at most the last few seconds instead of the whole clip.
 */

type DirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};
type WritableFile = FileSystemWritableFileStream & { seek(position: number): Promise<void> };

const CAMERA_KEY = "gv-pack-camera-id";
const STATION_KEY = "gv-pack-station-id";
const DB_NAME = "gv-pack";
const STORE = "handles";
const FOLDER_KEY = "video-folder";
const FPS = 15;
const FLUSH_MS = 3000;

function openHandleStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function loadFolderHandle(): Promise<DirectoryHandle | null> {
  const db = await openHandleStore();
  return new Promise((resolve) => {
    const request = db.transaction(STORE).objectStore(STORE).get(FOLDER_KEY);
    request.onsuccess = () => resolve((request.result as DirectoryHandle) ?? null);
    request.onerror = () => resolve(null);
  });
}
async function saveFolderHandle(handle: DirectoryHandle): Promise<void> {
  const db = await openHandleStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, FOLDER_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function readLocal(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function stationId(): string {
  let id = readLocal(STATION_KEY);
  if (!id) {
    id = `PC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    writeLocal(STATION_KEY, id);
  }
  return id;
}

const safeName = (value: string) => value.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-+/g, "-").slice(0, 60);
function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export type OverlayTone = "ok" | "warn" | "info";
export type RecorderStatus = {
  isSupported: boolean;
  cameras: { id: string; label: string }[];
  cameraId: string;
  folderName: string | null;
  needsFolderPermission: boolean;
  isRecording: boolean;
  fileName: string | null;
  error: string | null;
};

export function useEvidenceRecorder() {
  const [status, setStatus] = useState<RecorderStatus>({
    isSupported: true,
    cameras: [],
    cameraId: "",
    folderName: null,
    needsFolderPermission: false,
    isRecording: false,
    fileName: null,
    error: null,
  });
  const patch = useCallback((next: Partial<RecorderStatus>) => setStatus((s) => ({ ...s, ...next })), []);

  const folderRef = useRef<DirectoryHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawTimerRef = useRef<number | null>(null);
  const overlayRef = useRef<{ lines: string[]; tone: OverlayTone }>({ lines: [], tone: "info" });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<{ fileName: string; startedAt: number } | null>(null);

  // --- file writing: buffered chunks appended + committed every few seconds ---
  const pendingRef = useRef<Blob[]>([]);
  const fileRef = useRef<{ handle: FileSystemFileHandle; size: number } | null>(null);
  const flushChainRef = useRef<Promise<void>>(Promise.resolve());
  const flushTimerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    flushChainRef.current = flushChainRef.current.then(async () => {
      const file = fileRef.current;
      const chunks = pendingRef.current.splice(0);
      if (!file || !chunks.length) return;
      const writable = (await file.handle.createWritable({ keepExistingData: true })) as WritableFile;
      await writable.seek(file.size);
      for (const chunk of chunks) {
        await writable.write(chunk);
        file.size += chunk.size;
      }
      await writable.close();
    }).catch((error: unknown) => {
      patch({ error: `บันทึกวิดีโอลงโฟลเดอร์ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}` });
    });
    return flushChainRef.current;
  }, [patch]);

  const scanCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !("showDirectoryPicker" in window) || typeof MediaRecorder === "undefined") {
      patch({ isSupported: false, error: "เบราว์เซอร์นี้บันทึกวิดีโอลงโฟลเดอร์ไม่ได้ — ใช้ Google Chrome บน Windows" });
      return;
    }
    try {
      // Device labels stay blank until the page has camera permission once.
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach((t) => t.stop());
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      const cameras = devices.map((d, i) => ({ id: d.deviceId, label: d.label || `กล้อง ${i + 1}` }));
      const saved = readLocal(CAMERA_KEY);
      const cameraId = cameras.some((c) => c.id === saved) ? saved : (cameras[0]?.id ?? "");
      patch({ cameras, cameraId, error: cameras.length ? null : "ไม่พบกล้องที่เครื่องนี้" });
    } catch (error) {
      patch({ error: `เปิดกล้องไม่ได้: ${error instanceof Error ? error.message : String(error)} — อนุญาตการใช้กล้องในเบราว์เซอร์` });
    }
  }, [patch]);

  const selectCamera = useCallback(
    (id: string) => {
      writeLocal(CAMERA_KEY, id);
      patch({ cameraId: id });
    },
    [patch],
  );

  const pickFolder = useCallback(async () => {
    try {
      const picker = (window as unknown as { showDirectoryPicker(o: object): Promise<DirectoryHandle> }).showDirectoryPicker;
      const handle = await picker({ id: "gv-pack-videos", mode: "readwrite" });
      folderRef.current = handle;
      await saveFolderHandle(handle);
      patch({ folderName: handle.name, needsFolderPermission: false, error: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      patch({ error: `เลือกโฟลเดอร์ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}` });
    }
  }, [patch]);

  // Chrome forgets folder write access between sessions; re-granting needs a click.
  const grantFolder = useCallback(async () => {
    const handle = folderRef.current;
    if (!handle) return;
    const state = await handle.requestPermission({ mode: "readwrite" });
    patch({ needsFolderPermission: state !== "granted" });
  }, [patch]);

  useEffect(() => {
    if (typeof window === "undefined" || !("indexedDB" in window)) return;
    let cancelled = false;
    void (async () => {
      const handle = await loadFolderHandle().catch(() => null);
      if (cancelled) return;
      if (handle) {
        folderRef.current = handle;
        const state = await handle.queryPermission({ mode: "readwrite" }).catch(() => "prompt" as PermissionState);
        if (!cancelled) patch({ folderName: handle.name, needsFolderPermission: state !== "granted" });
      }
      if (!cancelled) await scanCameras();
    })();
    return () => {
      cancelled = true;
    };
  }, [patch, scanCameras]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { lines, tone } = overlayRef.current;
    const now = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const text = [now, ...lines];
    const lineHeight = 30;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, 14 + lineHeight * text.length);
    ctx.font = "bold 24px sans-serif";
    text.forEach((line, i) => {
      const isLast = i === text.length - 1 && i > 0;
      ctx.fillStyle = isLast ? (tone === "ok" ? "#7CFC9A" : tone === "warn" ? "#FF7A7A" : "#FFFFFF") : "#FFFFFF";
      ctx.fillText(line, 14, 34 + i * lineHeight);
    });
  }, []);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (flushTimerRef.current !== null) window.clearInterval(flushTimerRef.current);
    flushTimerRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await flush();
    fileRef.current = null;
    sessionRef.current = null;
    if (drawTimerRef.current !== null) window.clearInterval(drawTimerRef.current);
    drawTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    patch({ isRecording: false, fileName: null });
  }, [flush, patch]);

  /** Starts a new clip for one branch session. Silently does nothing until camera + folder are ready. */
  const start = useCallback(
    async (label: { branch: string; reference: string }) => {
      await stop();
      const folder = folderRef.current;
      if (!folder || !status.cameraId) return;
      if ((await folder.queryPermission({ mode: "readwrite" })) !== "granted") {
        patch({ needsFolderPermission: true });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: status.cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        const video = (videoRef.current ??= document.createElement("video"));
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
        const canvas = (canvasRef.current ??= document.createElement("canvas"));
        canvas.width = settings.width ?? 1280;
        canvas.height = settings.height ?? 720;
        drawTimerRef.current = window.setInterval(draw, 1000 / FPS);

        const fileName = `${stamp(new Date())}_${safeName(label.branch)}_${safeName(label.reference || "ไม่มีเลข")}.webm`;
        const handle = await folder.getFileHandle(fileName, { create: true });
        fileRef.current = { handle, size: 0 };
        pendingRef.current = [];

        const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
        const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType, videoBitsPerSecond: 2_000_000 });
        recorder.ondataavailable = (event) => {
          if (event.data.size) pendingRef.current.push(event.data);
        };
        recorder.start(1000);
        recorderRef.current = recorder;
        flushTimerRef.current = window.setInterval(() => void flush(), FLUSH_MS);
        sessionRef.current = { fileName, startedAt: Date.now() };
        patch({ isRecording: true, fileName, error: null });
      } catch (error) {
        patch({ error: `เริ่มบันทึกวิดีโอไม่ได้: ${error instanceof Error ? error.message : String(error)}` });
        await stop();
      }
    },
    [draw, flush, patch, status.cameraId, stop],
  );

  const setOverlay = useCallback((lines: string[], tone: OverlayTone = "info") => {
    overlayRef.current = { lines, tone };
  }, []);

  /** Where "now" is in the current clip — sent with every scan so the report can point at the footage. */
  const clipReference = useCallback((at: number) => {
    const session = sessionRef.current;
    return session ? { videoFile: session.fileName, clipOffsetSec: Math.max(0, (at - session.startedAt) / 1000) } : { videoFile: null, clipOffsetSec: null };
  }, []);

  const attachPreview = useCallback((container: HTMLElement | null) => {
    if (!container) return;
    const canvas = (canvasRef.current ??= document.createElement("canvas"));
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.borderRadius = "10px";
    canvas.style.background = "#111";
    if (canvas.parentElement !== container) container.appendChild(canvas);
  }, []);

  // Commit what we have if the tab is closed mid-recording.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onUnload = () => {
      void stop();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [flush, stop]);

  useEffect(() => () => void stop(), [stop]);

  return { status, scanCameras, selectCamera, pickFolder, grantFolder, start, stop, setOverlay, clipReference, attachPreview };
}
