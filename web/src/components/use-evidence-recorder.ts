"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Packing-station evidence video, recorded in the browser and saved straight to
 * a folder on the station's own disk (Chrome File System Access API) — nothing
 * is uploaded.
 *
 * The camera frame is redrawn onto a canvas with a caption (date-time, branch,
 * PO/bill, last scan) so the footage explains itself. One clip per bill: the
 * file stays open and each second of video is appended in order, then it is
 * closed when the bill is saved or left. Appending to an open file avoids
 * re-copying the whole clip on every write, which used to back up and keep the
 * camera running after the bill was saved. A crash loses only the clip in progress.
 */

type DirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};

const CAMERA_KEY = "gv-pack-camera-id";
/** Camera id the station last confirmed with the confirm button; recording waits for it. */
const CONFIRMED_KEY = "gv-pack-camera-confirmed";
const STATION_KEY = "gv-pack-station-id";
const DB_NAME = "gv-pack";
const STORE = "handles";
const FOLDER_KEY = "video-folder";
const FPS = 15;

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
  /** Live camera view shown after confirming, before any branch is recording. */
  isPreviewing: boolean;
  isConfirmed: boolean;
  fileName: string | null;
  /** Last clip whose file finished closing on disk — shown so the packer sees it was saved. */
  savedFile: string | null;
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
    isPreviewing: false,
    isConfirmed: false,
    fileName: null,
    savedFile: null,
    error: null,
  });
  const patch = useCallback((next: Partial<RecorderStatus>) => setStatus((s) => ({ ...s, ...next })), []);

  const folderRef = useRef<DirectoryHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawTimerRef = useRef<number | null>(null);
  const overlayRef = useRef<{ lines: string[]; tone: OverlayTone; highlight: string[] }>({ lines: [], tone: "info", highlight: [] });
  const recorderRef = useRef<MediaRecorder | null>(null);
  /** The clip being recorded: its open file and the queue of writes into it, in order. */
  const clipRef = useRef<{ fileName: string; startedAt: number; writable: FileSystemWritableFileStream; writes: Promise<void> } | null>(null);
  const reportWriteError = useCallback(
    (error: unknown) => patch({ error: `บันทึกวิดีโอลงโฟลเดอร์ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}` }),
    [patch],
  );

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
      patch({
        cameras,
        cameraId,
        isConfirmed: Boolean(cameraId) && readLocal(CONFIRMED_KEY) === cameraId,
        error: cameras.length ? null : "ไม่พบกล้องที่เครื่องนี้",
      });
    } catch (error) {
      patch({ error: `เปิดกล้องไม่ได้: ${error instanceof Error ? error.message : String(error)} — อนุญาตการใช้กล้องในเบราว์เซอร์` });
    }
  }, [patch]);

  const selectCamera = useCallback(
    (id: string) => {
      writeLocal(CAMERA_KEY, id);
      // A different camera has to be confirmed again before recording uses it.
      patch({ cameraId: id, isConfirmed: Boolean(id) && readLocal(CONFIRMED_KEY) === id });
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
    const { lines, tone, highlight } = overlayRef.current;
    const scale = canvas.width / 1280;
    const now = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const text = [now, ...lines.filter(Boolean)];
    const lineHeight = 36 * scale;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, 16 * scale + lineHeight * text.length);
    ctx.font = `bold ${Math.round(28 * scale)}px sans-serif`;
    text.forEach((line, i) => {
      const isLast = i === text.length - 1 && i > 0;
      ctx.fillStyle = isLast ? (tone === "ok" ? "#7CFC9A" : tone === "warn" ? "#FF7A7A" : "#FFFFFF") : "#FFFFFF";
      ctx.fillText(line, 14 * scale, 38 * scale + i * lineHeight);
    });
    // Last scanned model + barcode: large red text on a light band so the footage is easy to check later.
    if (highlight.length) {
      const bigLine = 56 * scale;
      const top = canvas.height - (20 * scale + bigLine * highlight.length);
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillRect(0, top, canvas.width, canvas.height - top);
      ctx.font = `bold ${Math.round(44 * scale)}px sans-serif`;
      ctx.fillStyle = "#D10000";
      highlight.forEach((line, i) => ctx.fillText(line, 16 * scale, top + 48 * scale + i * bigLine, canvas.width - 32 * scale));
    }
  }, []);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    const clip = clipRef.current;
    recorderRef.current = null;
    clipRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      // The final chunk arrives (and is queued for writing) before "stop" fires.
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    // Camera off at once; the file finishes closing in the background.
    if (drawTimerRef.current !== null) window.clearInterval(drawTimerRef.current);
    drawTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    patch({ isRecording: false, isPreviewing: false, fileName: null });
    if (clip) {
      await clip.writes
        .then(() => clip.writable.close())
        .then(() => patch({ savedFile: clip.fileName }))
        .catch(reportWriteError);
    }
  }, [patch, reportWriteError]);

  const openCamera = useCallback(
    async (cameraId: string) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
    },
    [draw],
  );

  /** Confirm button: checks camera + folder access now (while the user is clicking) and shows the live view. */
  const confirm = useCallback(async () => {
    const folder = folderRef.current;
    const cameraId = status.cameraId;
    if (!cameraId) return patch({ error: "ยังไม่ได้เลือกกล้อง — กด ค้นหากล้อง ก่อน" });
    if (!folder) return patch({ error: "ยังไม่ได้เลือกโฟลเดอร์เก็บวิดีโอ" });
    try {
      if ((await folder.requestPermission({ mode: "readwrite" })) !== "granted") {
        return patch({ needsFolderPermission: true, error: "ยังไม่ได้อนุญาตให้บันทึกลงโฟลเดอร์" });
      }
      if (!recorderRef.current) {
        await stop();
        await openCamera(cameraId);
        patch({ isPreviewing: true });
      }
      writeLocal(CONFIRMED_KEY, cameraId);
      patch({ isConfirmed: true, needsFolderPermission: false, error: null });
    } catch (error) {
      await stop();
      patch({ isConfirmed: false, error: `เปิดกล้องไม่ได้: ${error instanceof Error ? error.message : String(error)}` });
    }
  }, [openCamera, patch, status.cameraId, stop]);

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
        await openCamera(status.cameraId);
        const canvas = canvasRef.current!;

        const fileName = `${stamp(new Date())}_${safeName(label.branch)}_${safeName(label.reference || "ไม่มีเลข")}.webm`;
        const handle = await folder.getFileHandle(fileName, { create: true });
        const clip = { fileName, startedAt: Date.now(), writable: await handle.createWritable(), writes: Promise.resolve() };

        const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
        const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType, videoBitsPerSecond: 2_000_000 });
        recorder.ondataavailable = (event) => {
          if (!event.data.size) return;
          const data = event.data;
          clip.writes = clip.writes.then(() => clip.writable.write(data)).catch(reportWriteError);
        };
        recorder.start(1000);
        clip.startedAt = Date.now(); // clip offsets count from the first recorded frame
        recorderRef.current = recorder;
        clipRef.current = clip;
        patch({ isRecording: true, fileName, error: null });
      } catch (error) {
        patch({ error: `เริ่มบันทึกวิดีโอไม่ได้: ${error instanceof Error ? error.message : String(error)}` });
        await stop();
      }
    },
    [openCamera, patch, reportWriteError, status.cameraId, stop],
  );

  const setOverlay = useCallback((lines: string[], tone: OverlayTone = "info", highlight: string[] = []) => {
    overlayRef.current = { lines, tone, highlight };
  }, []);

  /** Where "now" is in the current clip — sent with every scan so the report can point at the footage. */
  const clipReference = useCallback((at: number) => {
    const session = clipRef.current;
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

  // Try to close the clip's file if the tab is closed mid-recording.
  useEffect(() => {
    const onUnload = () => {
      void stop();
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [stop]);

  useEffect(() => () => void stop(), [stop]);

  return { status, scanCameras, selectCamera, pickFolder, grantFolder, confirm, start, stop, setOverlay, clipReference, attachPreview };
}
