"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { BranchDetail, BranchSummary, CloseOutcome, ScanOutcome } from "@/lib/pack";
import { stationId, useEvidenceRecorder } from "@/components/use-evidence-recorder";

type Feedback = { tone: "ok" | "warn" | "info"; text: string; shortages?: CloseOutcome["shortages"] };

const SCANNER_NAME_KEY = "gv-pack-scanner-name";
const RESULT_LABEL: Record<string, string> = {
  counted: "นับแล้ว",
  over: "เกิน PO",
  unknown: "ไม่อยู่ใน PO",
  ambiguous: "ไม่ชัดเจน",
  closed: "สาขาปิดแล้ว",
  held: "มีคนอื่นทำอยู่",
  removed: "นำออกแล้ว",
};
const BRANCH_POLL_MS = 5000;
const noSubscribe = () => () => {};

// Short high beep = counted; two low buzzes = anything that was not counted.
// Generated with Web Audio so no sound files or libraries are needed.
let audioContext: AudioContext | null = null;
function playTone(kind: "ok" | "warn") {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
    const ctx = audioContext;
    const beep = (start: number, frequency: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "ok" ? "sine" : "square";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    if (kind === "ok") beep(0, 1320, 0.09);
    else {
      beep(0, 220, 0.18);
      beep(0.24, 180, 0.22);
    }
  } catch {
    // Sound is a nice-to-have; colour feedback still works without it.
  }
}

const NAME_EVENT = "gv-pack-scanner-name-change";
function subscribeScannerName(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(NAME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(NAME_EVENT, onChange);
  };
}
function readScannerName(): string {
  try {
    return window.localStorage.getItem(SCANNER_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function playComplete() {
  try {
    audioContext ??= new AudioContext();
    const ctx = audioContext;
    [880, 1175, 1568].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14);
      osc.stop(ctx.currentTime + i * 0.14 + 0.22);
    });
  } catch {
    // colour feedback still shows completion
  }
}

/**
 * Says the scan result out loud in Thai so the packer need not look at the screen.
 * A new announcement cuts off the previous one, so fast scanning always hears the latest.
 * Uses a Thai voice when the computer has one (Windows: the Thai speech pack).
 */
function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "th-TH";
    const thai = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("th"));
    if (thai) utterance.voice = thai;
    utterance.rate = 1.15;
    synth.speak(utterance);
  } catch {
    // the beep and colour still tell the result
  }
}

/** What to say for one scan: the piece count, or what went wrong. */
function scanAnnouncement(outcome: ScanOutcome, line: { scanned: number; required: number } | undefined, isBranchComplete: boolean): string {
  switch (outcome.result) {
    case "counted":
      if (isBranchComplete) return "ครบทุกรายการแล้ว";
      if (line && line.scanned >= line.required) return `${line.scanned} ครบ`;
      return line ? String(line.scanned) : "นับแล้ว";
    case "over":
      return "เกิน";
    case "unknown":
      // Right product but the system barcode instead of the customer's sticker.
      return outcome.message.includes("สติกเกอร์") ? "ติดสติกเกอร์บาร์โค้ดก่อน" : "ผิดรุ่น";
    case "ambiguous":
      return "บาร์โค้ดซ้ำ ไม่นับ";
    case "held":
      return "มีคนอื่นทำอยู่";
    case "closed":
      return "บันทึกแล้ว ยิงไม่ได้";
    default:
      return "ไม่นับ";
  }
}

function summarize(detail: BranchDetail): BranchSummary {
  return {
    branch: detail.branch,
    branchName: detail.branchName,
    poNumber: detail.poNumber,
    trb: detail.trb,
    required: detail.lines.reduce((n, l) => n + l.required, 0),
    scanned: detail.lines.reduce((n, l) => n + l.scanned, 0),
    isClosed: detail.isClosed,
    claimedBy: detail.claimedBy,
    claimStation: detail.claimStation,
  };
}

type PackScannerProps = {
  jobId: string;
  sourceFile: string;
  customer: string;
  initialBranches: BranchSummary[];
  /** Rendered inside a retailer tool's iframe: hide the site header and the job-list link. */
  embedded?: boolean;
};

export function PackScanner({ jobId, sourceFile, customer, initialBranches, embedded = false }: PackScannerProps) {
  const [branches, setBranches] = useState(initialBranches);
  const [branchFilter, setBranchFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<BranchDetail | null>(null);
  const [isLoadingBranch, setIsLoadingBranch] = useState(false);
  const scannerName = useSyncExternalStore(subscribeScannerName, readScannerName, () => "");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastPart, setLastPart] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<{ model: string; barcode: string; result: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [reopenReason, setReopenReason] = useState("");
  /** Why the last branch pick was refused (someone else is packing it). */
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  /** "แก้ไขจำนวน" mode: each line shows a button to take one piece back out. */
  const [isEditingQty, setIsEditingQty] = useState(false);
  const myStation = useSyncExternalStore(noSubscribe, stationId, () => "");

  const scanInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    status: recorderStatus,
    scanCameras,
    selectCamera,
    pickFolder,
    confirm: confirmRecorder,
    start: startRecording,
    stop: stopRecording,
    setOverlay,
    clipReference,
    attachPreview,
  } = useEvidenceRecorder();
  const queueRef = useRef<{ barcode: string; at: number }[]>([]);
  const isDrainingRef = useRef(false);
  const selectedRef = useRef<string | null>(null);

  const focusScanInput = useCallback(() => {
    requestAnimationFrame(() => scanInputRef.current?.focus());
  }, []);

  // Keep the scan box focused: the USB scanner types into whatever has focus, so
  // only other text fields (name, reopen reason, branch search) may take it.
  useEffect(() => {
    const onFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement;
        const isTypingElsewhere =
          active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
        if (isTypingElsewhere) return;
        const scanBox = scanInputRef.current;
        (scanBox && !scanBox.disabled ? scanBox : searchInputRef.current)?.focus();
      }, 0);
    };
    document.addEventListener("focusout", onFocusOut);
    return () => document.removeEventListener("focusout", onFocusOut);
  }, []);

  const applyDetail = useCallback((next: BranchDetail | null) => {
    if (!next) return;
    setDetail(next);
    setBranches((list) => list.map((b) => (b.branch === next.branch ? summarize(next) : b)));
  }, []);

  const api = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`/api/pack/jobs/${jobId}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${response.status}`);
      return data as T;
    },
    [jobId],
  );

  const selectBranch = useCallback(
    async (branch: string) => {
      if (queueRef.current.length) return; // finish pending scans for the current branch first
      if (!scannerName) {
        setBlockedNotice("พิมพ์ชื่อผู้สแกนที่มุมขวาบนก่อนเลือกสาขา");
        playTone("warn");
        return;
      }
      setIsLoadingBranch(true);
      try {
        // Taking the branch is what marks it as "being packed" for every other station.
        const data = await api<{ detail: BranchDetail }>(`/branches/${encodeURIComponent(branch)}/claim`, {
          method: "POST",
          body: JSON.stringify({ stationId: stationId(), scannedBy: scannerName }),
        });
        selectedRef.current = branch;
        setSelected(branch);
        setFeedback(null);
        setLastPart(null);
        setLastScan(null);
        setReopenReason("");
        setBlockedNotice(null);
        setIsEditingQty(false);
        applyDetail(data.detail);
        setBranches((list) =>
          list.map((b) =>
            b.branch === branch || b.claimStation !== data.detail.claimStation || !data.detail.claimStation
              ? b
              : { ...b, claimedBy: null, claimStation: null },
          ),
        );
      } catch (error) {
        setBlockedNotice(error instanceof Error ? error.message : "เปิดสาขาไม่สำเร็จ");
        playTone("warn");
      } finally {
        setIsLoadingBranch(false);
        focusScanInput();
      }
    },
    [api, applyDetail, focusScanInput, scannerName],
  );

  const refreshBranches = useCallback(async () => {
    try {
      const data = await api<{ branches: BranchSummary[] }>("/branches");
      setBranches(data.branches);
      return data.branches;
    } catch {
      return null; // keep showing the last list; the next poll retries
    }
  }, [api]);

  // Other stations take, scan and close branches too: poll so every list shows who is packing what.
  // The first answer also reopens the branch this station was holding (e.g. after a reload).
  const hasResumedRef = useRef(false);
  useEffect(() => {
    if (!scannerName || !myStation) return;
    let isActive = true;
    const tick = async () => {
      const list = await refreshBranches();
      if (!isActive || !list || hasResumedRef.current) return;
      hasResumedRef.current = true;
      const mine = list.find((b) => b.claimStation === myStation && !b.isClosed);
      if (mine && !selectedRef.current) void selectBranch(mine.branch);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), BRANCH_POLL_MS);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [myStation, refreshBranches, scannerName, selectBranch]);

  const leaveSelectedBranch = async () => {
    const branch = selectedRef.current;
    if (!branch || queueRef.current.length) return;
    try {
      await api(`/branches/${encodeURIComponent(branch)}/release`, {
        method: "POST",
        body: JSON.stringify({ stationId: stationId(), scannedBy: scannerName }),
      });
      selectedRef.current = null;
      setSelected(null);
      setDetail(null);
      setFeedback(null);
      setLastScan(null);
      await refreshBranches();
    } catch (error) {
      setFeedback({ tone: "warn", text: error instanceof Error ? error.message : "ออกจากสาขาไม่สำเร็จ" });
    }
  };

  // Scans are sent one at a time in the order they were read, so a burst from the
  // scanner can't race itself; the server additionally row-locks each line.
  const drainQueue = useCallback(async () => {
    if (isDrainingRef.current) return;
    isDrainingRef.current = true;
    try {
      while (queueRef.current.length) {
        const branch = selectedRef.current;
        const { barcode, at } = queueRef.current[0];
        if (!branch) break;
        try {
          const outcome = await api<ScanOutcome>(`/branches/${encodeURIComponent(branch)}/scans`, {
            method: "POST",
            body: JSON.stringify({ barcode, scannedBy: scannerName, stationId: stationId(), ...clipReference(at) }),
          });
          applyDetail(outcome.detail);
          setLastPart(outcome.part);
          const line = outcome.detail?.lines.find((l) => l.part === outcome.part);
          setLastScan({
            model: line ? `${line.sku ?? line.part} · ${line.description}` : outcome.result === "unknown" ? "ไม่อยู่ใน PO" : (outcome.part ?? "-"),
            barcode,
            result: `${RESULT_LABEL[outcome.result] ?? outcome.result}${line ? ` ${line.scanned}/${line.required}` : ""}`,
          });
          const isCounted = outcome.result === "counted";
          const isBranchComplete = Boolean(outcome.detail && outcome.detail.lines.every((l) => l.scanned >= l.required));
          setFeedback({
            tone: isCounted ? "ok" : "warn",
            text: `${barcode} · ${outcome.message}${isCounted && isBranchComplete ? " · ครบทุกรายการแล้ว กด บันทึกครบแพ็คแล้ว ได้" : ""}`,
          });
          if (isCounted && isBranchComplete) playComplete();
          else playTone(isCounted ? "ok" : "warn");
          speak(scanAnnouncement(outcome, line, isBranchComplete));
        } catch (error) {
          setFeedback({ tone: "warn", text: `${barcode} · ส่งผลสแกนไม่สำเร็จ: ${error instanceof Error ? error.message : "ไม่ทราบสาเหตุ"} — ยิงใหม่อีกครั้ง` });
          playTone("warn");
          speak("ส่งไม่สำเร็จ ยิงใหม่");
        }
        queueRef.current.shift();
        setPendingCount(queueRef.current.length);
      }
    } finally {
      isDrainingRef.current = false;
    }
  }, [api, applyDetail, scannerName, clipReference]);

  const onScanKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const barcode = event.currentTarget.value.trim();
    event.currentTarget.value = "";
    if (!barcode || !selectedRef.current) return;
    const isProductHere = detail?.lines.some((l) => l.barcodes.includes(barcode));
    const target = isProductHere ? undefined : findBranchByReference(barcode);
    if (target && target !== selectedRef.current) {
      void selectBranch(target);
      return;
    }
    // Epoch ms of the keystroke itself (not of when the request is sent) for the clip offset.
    queueRef.current.push({ barcode, at: performance.timeOrigin + event.timeStamp });
    setPendingCount(queueRef.current.length);
    void drainQueue();
  };

  const saveScannerName = (value: string) => {
    const name = value.trim();
    if (!name || name === scannerName) return;
    try {
      window.localStorage.setItem(SCANNER_NAME_KEY, name);
    } catch {
      // ignore: private mode keeps the name for this page only via the event below
    }
    window.dispatchEvent(new Event(NAME_EVENT));
    focusScanInput();
  };

  /** "บันทึกครบแพ็คแล้ว": stored on the server, so it survives a refresh and shows on every station. */
  const savePacked = async (branch: string) => {
    if (!scannerName) {
      setBlockedNotice("พิมพ์ชื่อผู้สแกนที่มุมขวาบนก่อนบันทึก");
      playTone("warn");
      return;
    }
    const isSelected = branch === selectedRef.current;
    try {
      const outcome = await api<CloseOutcome>(`/branches/${encodeURIComponent(branch)}/close`, {
        method: "POST",
        body: JSON.stringify({ closedBy: scannerName, stationId: stationId() }),
      });
      if (isSelected) {
        applyDetail(outcome.detail);
        setFeedback({ tone: outcome.isClosed ? "ok" : "warn", text: outcome.isClosed ? "บันทึกครบแพ็คแล้ว" : outcome.message, shortages: outcome.shortages });
      } else if (!outcome.isClosed) {
        setBlockedNotice(`${branch}: ${outcome.message}`);
      } else {
        setBlockedNotice(null);
      }
      if (outcome.isClosed) {
        playComplete();
        speak("บันทึกครบแพ็คแล้ว");
        void refreshBranches(); // the branch was released for the next one
      } else {
        playTone("warn");
        const missing = outcome.shortages.reduce((n, s) => n + s.missing, 0);
        speak(missing ? `ยังขาด ${missing} ชิ้น` : "บันทึกไม่ได้");
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "บันทึกไม่สำเร็จ";
      if (isSelected) setFeedback({ tone: "warn", text });
      else setBlockedNotice(`${branch}: ${text}`);
      playTone("warn");
    }
    focusScanInput();
  };

  const removePiece = async (line: BranchDetail["lines"][number]) => {
    const branch = selectedRef.current;
    if (!branch || queueRef.current.length) return;
    try {
      const outcome = await api<{ message: string; part: string | null; detail: BranchDetail | null }>(
        `/branches/${encodeURIComponent(branch)}/remove`,
        { method: "POST", body: JSON.stringify({ lineId: line.id, stationId: stationId(), scannedBy: scannerName }) },
      );
      applyDetail(outcome.detail);
      setLastPart(outcome.part);
      const left = outcome.detail?.lines.find((l) => l.id === line.id)?.scanned ?? 0;
      // Shown on screen and burnt into the evidence video like a scan.
      setLastScan({ model: `${line.sku ?? line.part} · ${line.description}`, barcode: "นำออก 1 ชิ้น", result: `เหลือ ${left}/${line.required}` });
      setFeedback({ tone: "info", text: outcome.message });
      speak(`นำออก เหลือ ${left}`);
    } catch (error) {
      setFeedback({ tone: "warn", text: error instanceof Error ? error.message : "แก้จำนวนไม่สำเร็จ" });
      playTone("warn");
    }
    focusScanInput();
  };

  /** "แก้ไข" on a saved branch: open it and put the cursor in the reason box. */
  const reopenInputRef = useRef<HTMLInputElement>(null);
  const wantsReasonFocusRef = useRef(false);
  const editPacked = async (branch: string) => {
    wantsReasonFocusRef.current = true;
    await selectBranch(branch);
  };
  // The reason box only exists once the saved branch has rendered, so focus it from here.
  useEffect(() => {
    if (!wantsReasonFocusRef.current || !detail?.isClosed) return;
    wantsReasonFocusRef.current = false;
    reopenInputRef.current?.scrollIntoView({ block: "center" });
    reopenInputRef.current?.focus();
  }, [detail]);

  const reopenSelectedBranch = async () => {
    if (!selected) return;
    if (!reopenReason.trim()) {
      setFeedback({ tone: "warn", text: "ต้องกรอกเหตุผลก่อนแก้ไข" });
      return;
    }
    try {
      const data = await api<{ detail: BranchDetail }>(`/branches/${encodeURIComponent(selected)}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reopenedBy: scannerName, stationId: stationId(), reason: reopenReason.trim() }),
      });
      applyDetail(data.detail);
      setReopenReason("");
      setFeedback({ tone: "info", text: "ยกเลิก 'ครบแพ็คแล้ว' แล้ว สแกนต่อได้" });
    } catch (error) {
      setFeedback({ tone: "warn", text: error instanceof Error ? error.message : "แก้ไขไม่สำเร็จ" });
    }
    focusScanInput();
  };

  const findBranchByReference = (value: string) => {
    const v = value.trim().toUpperCase();
    return branches.find((b) =>
      [b.branch, ...(b.poNumber ?? "").split(", "), ...(b.trb ?? "").split(", ")].some((ref) => ref && ref.toUpperCase() === v),
    )?.branch;
  };

  const visibleBranches = useMemo(() => {
    const q = branchFilter.trim().toLowerCase();
    return q
      ? branches.filter((b) => `${b.branch} ${b.branchName} ${b.poNumber ?? ""} ${b.trb ?? ""}`.toLowerCase().includes(q))
      : branches;
  }, [branches, branchFilter]);

  const total = detail ? summarize(detail) : null;
  const totalDone = branches.filter((b) => b.isClosed).length;
  const isHeldByOther = (b: BranchSummary) => Boolean(b.claimStation && b.claimStation !== myStation && !b.isClosed);
  const statusCounts = {
    held: branches.filter(isHeldByOther).length,
    closed: totalDone,
    complete: branches.filter((b) => !b.isClosed && b.scanned >= b.required).length,
    inProgress: branches.filter((b) => !b.isClosed && b.scanned > 0 && b.scanned < b.required).length,
    notStarted: branches.filter((b) => !b.isClosed && b.scanned === 0).length,
  };
  const canScan = Boolean(selected && detail && !detail.isClosed && scannerName && !isLoadingBranch);

  const recordingBranch = detail && !detail.isClosed ? detail.branch : null;
  // Clip file names carry the PO number (TRB only when the bill has no PO); both already start with "PO"/"TRB".
  const recordingReference = detail?.poNumber ?? detail?.trb ?? "";
  const isRecorderReady = Boolean(
    recorderStatus.folderName && !recorderStatus.needsFolderPermission && recorderStatus.cameraId && recorderStatus.isConfirmed,
  );
  const cameraLabel = recorderStatus.cameras.find((c) => c.id === recorderStatus.cameraId)?.label ?? "";
  useEffect(() => {
    if (recordingBranch && isRecorderReady) void startRecording({ branch: recordingBranch, reference: recordingReference });
    // Leave the post-confirm live preview running; only end a real recording.
    else if (recorderStatus.isRecording) void stopRecording();
    // Restart only when the branch (or recorder readiness) changes — not on every scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingBranch, isRecorderReady, recorderStatus.cameraId]);

  useEffect(() => {
    if (!detail) return;
    const t = summarize(detail);
    setOverlay(
      [
        `${detail.branch} ${detail.branchName}`,
        [detail.poNumber ? `PO ${detail.poNumber}` : "", detail.trb ? `TRB ${detail.trb}` : "", `ผู้สแกน ${scannerName || "-"}`, `${t.scanned}/${t.required}`]
          .filter(Boolean)
          .join(" · "),
        feedback?.text ?? "",
      ],
      feedback?.tone ?? "info",
      lastScan ? [`รุ่น: ${lastScan.model}`, `บาร์โค้ด: ${lastScan.barcode}  ·  ${lastScan.result}`] : [],
    );
  }, [detail, feedback, lastScan, scannerName, setOverlay]);

  // The scan box is disabled while a branch loads, so focusing it from the click
  // handler is too early; focus it the moment it becomes usable instead.
  useEffect(() => {
    if (canScan) scanInputRef.current?.focus();
  }, [canScan, selected]);

  return (
    // Fills the screen below the site header (or the whole frame inside a tool) and never scrolls
    // as a page: each column scrolls on its own, so the camera stays in view while scanning.
    <main className="flex flex-col gap-2 px-3 py-2 lg:h-[calc(100dvh-var(--sticky-top-offset,0px))] lg:overflow-hidden">
      {/* Inside a retailer tool the tool already provides the header and job list. */}
      {embedded && <style>{"[data-site-chrome]{display:none}"}</style>}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-3">
          {!embedded && (
            <Link href="/pack" className="shrink-0 text-sm text-muted underline">
              ‹ งานสแกนทั้งหมด
            </Link>
          )}
          <h1 className="shrink-0 text-lg font-semibold">ยิงสแกนลงลัง · {customer}</h1>
          <span className="truncate text-sm text-muted">{sourceFile}</span>
          <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-sm">
            ครบแพ็คแล้ว <b>{totalDone}</b> / {branches.length} สาขา
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            ผู้สแกน
            <input
              key={scannerName}
              defaultValue={scannerName}
              onKeyDown={(e) => e.key === "Enter" && saveScannerName(e.currentTarget.value)}
              onBlur={(e) => saveScannerName(e.currentTarget.value)}
              placeholder="พิมพ์ชื่อ"
              className={
                "h-9 w-36 rounded-[8px] border bg-surface px-2 text-base text-ink outline-none focus:border-accent " +
                (scannerName ? "border-line" : "border-amber-500 ring-2 ring-amber-300")
              }
            />
          </label>
          <a href={`/api/pack/jobs/${jobId}/report`} className="inline-flex h-9 items-center rounded-[8px] border border-line px-3 text-sm">
            ส่งออกรายงาน
          </a>
        </div>
      </header>

      {blockedNotice ? (
        <p role="alert" className="rounded-[10px] bg-red-600 px-4 py-2 text-base font-semibold text-white">
          {blockedNotice}
        </p>
      ) : null}
      {!scannerName ? (
        <p className="rounded-[10px] border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          พิมพ์ชื่อผู้สแกนที่มุมขวาบนก่อนเริ่มสแกน (ระบบจำไว้ในเครื่องนี้)
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_minmax(340px,32%)]">
        {/* ── Bills / branches ── */}
        <aside className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-[10px] border border-line bg-surface p-2.5 max-lg:max-h-[60vh]">
          <input
            type="search"
            value={branchFilter}
            ref={searchInputRef}
            onChange={(e) => setBranchFilter(e.target.value)}
            onKeyDown={(e) => {
              // Typing or scanning a branch / PO / bill number and pressing Enter jumps straight to that branch.
              if (e.key !== "Enter") return;
              const target = findBranchByReference(e.currentTarget.value) ?? (visibleBranches.length === 1 ? visibleBranches[0].branch : undefined);
              if (target) {
                setBranchFilter("");
                void selectBranch(target);
              }
            }}
            placeholder="ค้นหา สาขา / PO / เลขบิล แล้ว Enter"
            className="h-9 rounded-[8px] border border-line px-2.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm border border-line bg-surface" />ยังไม่ยิง {statusCounts.notStarted}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" />กำลังยิง {statusCounts.inProgress}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-600" />ครบ {statusCounts.complete}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-neutral-500" />ครบแพ็คแล้ว {statusCounts.closed}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-600" />คนอื่นทำ {statusCounts.held}</span>
          </div>
          <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-0.5">
            {visibleBranches.map((b) => {
              const isComplete = b.scanned >= b.required;
              const isStarted = b.scanned > 0;
              const heldByOther = isHeldByOther(b);
              const isMine = Boolean(b.claimStation && b.claimStation === myStation && !b.isClosed);
              // Row colour = status at a glance: grey packed, red someone else, green complete, amber in progress.
              const statusClass = b.isClosed
                ? "border-l-neutral-500 bg-neutral-200/70 text-neutral-500"
                : heldByOther
                  ? "cursor-not-allowed border-l-rose-600 bg-rose-50"
                  : isComplete
                    ? "border-l-emerald-600 bg-emerald-50"
                    : isStarted
                      ? "border-l-amber-500 bg-amber-50"
                      : "border-l-transparent hover:bg-neutral-100";
              return (
                <li
                  key={b.branch}
                  className={"flex flex-col gap-1 rounded-[8px] border-l-4 px-2 py-1.5 " + statusClass + (b.branch === selected ? " ring-2 ring-accent" : "")}
                >
                  <button type="button" onClick={() => void selectBranch(b.branch)} className="flex w-full items-center justify-between gap-2 text-left">
                    <span className="min-w-0">
                      <span className="block font-mono text-sm font-semibold">{b.branch}</span>
                      <span className="block truncate text-xs text-muted">{b.branchName}</span>
                      <span className="block truncate font-mono text-[11px] text-muted">{b.trb ? `TRB ${b.trb}` : b.poNumber ? `PO ${b.poNumber}` : ""}</span>
                      {heldByOther ? (
                        <span className="block truncate text-xs font-semibold text-rose-700">🔒 {b.claimedBy} กำลังทำ</span>
                      ) : isMine ? (
                        <span className="block truncate text-xs font-semibold text-accent">● เครื่องนี้กำลังทำ</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="font-mono text-sm">
                        {b.scanned}/{b.required}
                      </span>
                      {b.isClosed ? (
                        <span className="rounded bg-neutral-900 px-1.5 text-[11px] text-white">✓ ครบแพ็คแล้ว</span>
                      ) : isComplete ? (
                        <span className="rounded bg-emerald-600 px-1.5 text-[11px] text-white">ครบ</span>
                      ) : isStarted ? (
                        <span className="rounded bg-amber-500 px-1.5 text-[11px] text-white">กำลังยิง</span>
                      ) : null}
                    </span>
                  </button>
                  {b.isClosed ? (
                    <button
                      type="button"
                      onClick={() => void editPacked(b.branch)}
                      className="self-end rounded-[6px] border border-line bg-surface px-2 py-0.5 text-xs text-ink"
                    >
                      แก้ไข
                    </button>
                  ) : isComplete && !heldByOther ? (
                    <button
                      type="button"
                      onClick={() => void savePacked(b.branch)}
                      className="self-end rounded-[6px] bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      บันทึกครบแพ็คแล้ว
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── The bill being packed ── */}
        <section className="flex min-h-0 min-w-0 flex-col gap-2">
          {!selected ? (
            <p className="flex flex-1 items-center justify-center rounded-[10px] border border-line bg-surface px-4 py-16 text-center text-lg text-muted">
              เลือกสาขา / บิลจากรายการด้านซ้าย หรือยิงเลขบิลที่ช่องค้นหา
            </p>
          ) : (
            <>
              <div className="flex shrink-0 flex-col gap-2 rounded-[10px] border border-line bg-surface p-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-muted">
                      {selected}
                      {detail?.poNumber ? ` · PO ${detail.poNumber}` : ""}
                      {detail?.trb ? ` · TRB ${detail.trb}` : ""}
                    </p>
                    <p className="truncate text-lg font-semibold">{detail?.branchName ?? "…"}</p>
                  </div>
                  <p className={"shrink-0 font-mono text-5xl font-bold leading-none " + (total && total.scanned >= total.required ? "text-accent" : "text-ink")}>
                    {total ? `${total.scanned}/${total.required}` : "…"}
                  </p>
                </div>
                <input
                  id="scan-input"
                  aria-label="ช่องยิงบาร์โค้ด"
                  ref={scanInputRef}
                  autoFocus
                  autoComplete="off"
                  disabled={!canScan}
                  onKeyDown={onScanKeyDown}
                  placeholder={
                    detail?.isClosed
                      ? "สาขานี้บันทึกครบแพ็คแล้ว — กดแก้ไขถ้าต้องยิงเพิ่ม"
                      : canScan
                        ? `พร้อมสแกน — ยิงบาร์โค้ดสินค้า${pendingCount > 1 ? ` (รอส่ง ${pendingCount - 1})` : ""}`
                        : "เลือกสาขาและพิมพ์ชื่อผู้สแกนก่อน"
                  }
                  className="h-14 rounded-[10px] border-2 border-accent bg-surface px-4 font-mono text-2xl outline-none disabled:border-line disabled:bg-neutral-100"
                />
                {feedback ? (
                  <div
                    role="status"
                    className={
                      "max-h-40 overflow-y-auto rounded-[10px] px-4 py-2.5 text-lg font-semibold " +
                      (feedback.tone === "ok" ? "bg-accent text-white" : feedback.tone === "warn" ? "bg-red-600 text-white" : "bg-accent-soft text-accent")
                    }
                  >
                    {feedback.text}
                    {feedback.shortages?.length ? (
                      <ul className="mt-1 list-disc pl-6 text-base font-normal">
                        {feedback.shortages.map((s) => (
                          <li key={s.part}>
                            {s.part} {s.description} — ขาด {s.missing} ชิ้น
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-[10px] border border-line bg-surface">
                <table className="w-full text-left text-base">
                  <thead className="sticky top-0 bg-neutral-100 text-sm text-muted">
                    <tr>
                      <th className="px-3 py-2">สินค้า</th>
                      <th className="px-3 py-2">บาร์โค้ด</th>
                      <th className="px-3 py-2 text-right">ต้องการ</th>
                      <th className="px-3 py-2 text-right">สแกนแล้ว</th>
                      <th className="px-3 py-2">สถานะ</th>
                      {isEditingQty && !detail?.isClosed ? <th className="px-3 py-2 text-right">แก้จำนวน</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.lines.map((line) => {
                      const missing = line.required - line.scanned;
                      return (
                        <tr key={line.id} className={"border-t border-line " + (line.part === lastPart ? "bg-accent-soft" : "")}>
                          <td className="px-3 py-1.5">
                            <span className="font-mono text-xs text-muted">{line.part}</span>
                            <span className="block text-sm">{line.description}</span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-sm">{line.barcodes.join(", ")}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{line.required}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-semibold">{line.scanned}</td>
                          <td className="px-3 py-1.5">
                            {missing <= 0 ? <span className="font-semibold text-accent">✓ ครบ</span> : <span className="font-semibold text-red-600">ขาด {missing}</span>}
                          </td>
                          {isEditingQty && !detail?.isClosed ? (
                            <td className="px-3 py-1.5 text-right">
                              <button
                                type="button"
                                disabled={line.scanned === 0 || !canScan}
                                onClick={() => void removePiece(line)}
                                className="h-8 whitespace-nowrap rounded-[8px] border border-red-600 px-2.5 text-sm font-semibold text-red-600 disabled:border-line disabled:text-muted"
                              >
                                − นำออก 1
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {detail?.isClosed ? (
                  <>
                    <span className="rounded-[10px] bg-neutral-900 px-3 py-2 text-sm text-white">
                      ✓ ครบแพ็คแล้ว{detail.closedBy ? ` · บันทึกโดย ${detail.closedBy}` : ""}
                    </span>
                    <input
                      ref={reopenInputRef}
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="เหตุผลที่ต้องแก้ไข (บังคับ)"
                      className="h-10 min-w-[240px] flex-1 rounded-[10px] border border-line bg-surface px-3 text-base outline-none focus:border-accent"
                    />
                    <button type="button" onClick={() => void reopenSelectedBranch()} className="h-10 rounded-[10px] border border-ink px-4 text-sm">
                      แก้ไข (ยกเลิกครบแพ็ค)
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => void savePacked(detail?.branch ?? "")} className="h-10 rounded-[10px] bg-accent px-5 text-base font-medium text-white">
                    บันทึกครบแพ็คแล้ว
                  </button>
                )}
                {detail && !detail.isClosed ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingQty((v) => !v)}
                    className={
                      "h-10 rounded-[10px] border px-4 text-sm font-medium " +
                      (isEditingQty ? "border-red-600 bg-red-600 text-white" : "border-ink text-ink")
                    }
                  >
                    {isEditingQty ? "เสร็จสิ้นแก้ไขจำนวน" : "แก้ไขจำนวน"}
                  </button>
                ) : null}
                {detail && !detail.isClosed ? (
                  <button type="button" onClick={() => void leaveSelectedBranch()} className="h-10 rounded-[10px] border border-line px-4 text-sm text-muted">
                    ออกจากสาขานี้ (ให้คนอื่นทำต่อ)
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>

        {/* ── Evidence camera: always on screen ── */}
        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[10px] border border-line bg-surface p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">กล้องบันทึกหลักฐาน</span>
            {recorderStatus.isRecording ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" /> REC
              </span>
            ) : (
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-muted">ยังไม่บันทึก</span>
            )}
          </div>
          <div ref={attachPreview} hidden={!recorderStatus.isRecording && !recorderStatus.isPreviewing} className="w-full shrink-0" />
          {!recorderStatus.isRecording && !recorderStatus.isPreviewing ? (
            <div className="flex aspect-video w-full shrink-0 items-center justify-center rounded-[10px] bg-neutral-900 px-4 text-center text-sm text-neutral-300">
              {isRecorderReady ? "กล้องพร้อม — จะเริ่มบันทึกเมื่อเปิดสาขา" : "ยังไม่ได้ตั้งค่ากล้อง — ตั้งค่าด้านล่าง"}
            </div>
          ) : null}
          {recorderStatus.fileName ? <p className="truncate font-mono text-[11px] text-muted">กำลังบันทึก: {recorderStatus.fileName}</p> : null}
          {!recorderStatus.isRecording && recorderStatus.savedFile ? (
            <p className="truncate text-xs font-semibold text-emerald-700">✓ บันทึกคลิปแล้ว: {recorderStatus.savedFile}</p>
          ) : null}
          {recorderStatus.error ? <p className="text-sm text-red-600">{recorderStatus.error}</p> : null}
          {isRecorderReady && !recorderStatus.error ? (
            <p className="truncate text-xs text-emerald-700">
              ✓ {cameraLabel} → โฟลเดอร์ {recorderStatus.folderName}
            </p>
          ) : null}

          {/* Settings fold away once the camera is confirmed, leaving the picture as the main thing. */}
          <details key={isRecorderReady ? "ready" : "setup"} open={!isRecorderReady} className="rounded-[8px] border border-line px-2.5 py-1.5">
            <summary className="cursor-pointer text-sm font-medium">ตั้งค่ากล้อง</summary>
            <div className="mt-2 flex flex-col gap-2">
              <select
                value={recorderStatus.cameraId}
                onChange={(e) => selectCamera(e.target.value)}
                className="h-9 rounded-[8px] border border-line bg-surface px-2 text-sm"
                aria-label="เลือกกล้อง"
              >
                {recorderStatus.cameras.length ? null : <option value="">ยังไม่พบกล้อง</option>}
                {recorderStatus.cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void scanCameras()} className="h-9 rounded-[8px] border border-line px-3 text-sm">
                  ค้นหากล้อง
                </button>
                <button type="button" onClick={() => void pickFolder()} className="h-9 min-w-0 truncate rounded-[8px] border border-line px-3 text-sm">
                  {recorderStatus.folderName ? `โฟลเดอร์: ${recorderStatus.folderName}` : "เลือกโฟลเดอร์เก็บวิดีโอ"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void confirmRecorder()}
                className={`h-9 rounded-[8px] px-3 text-sm font-semibold text-white ${isRecorderReady ? "bg-neutral-500" : "bg-accent"}`}
              >
                {isRecorderReady ? "ทดสอบกล้องอีกครั้ง" : "ยืนยันการตั้งค่ากล้อง"}
              </button>
              {!isRecorderReady ? (
                <p className="text-xs text-amber-700">เลือกกล้องและโฟลเดอร์ แล้วกดยืนยัน — สแกนได้ตามปกติแม้ยังไม่บันทึก</p>
              ) : null}
            </div>
          </details>

          {detail?.recentEvents.length ? (
            <div className="min-h-0">
              <p className="mb-1 text-xs font-medium text-muted">ยิงล่าสุดในสาขานี้</p>
              <ul className="flex flex-col gap-0.5 text-xs">
                {detail.recentEvents.map((e, i) => (
                  <li key={i} className={e.result === "counted" ? "" : "text-red-600"}>
                    {new Date(e.scannedAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })} · {e.barcode} · {RESULT_LABEL[e.result] ?? e.result}
                    {e.part ? ` · ${e.part}` : ""}
                    {e.scannedBy ? ` · ${e.scannedBy}` : ""}
                    {e.clipOffsetSec !== null
                      ? ` · คลิป ${String(Math.floor(e.clipOffsetSec / 60)).padStart(2, "0")}:${String(Math.floor(e.clipOffsetSec % 60)).padStart(2, "0")}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
