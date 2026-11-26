"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PickDetail, PickItem, PickOutcome } from "@/lib/pick";
import { announce, preloadThaiVoice, type Announcement } from "@/components/thai-voice";
import { useHardwareScan } from "@/components/use-hardware-scan";
import { CameraBarcodeSheet } from "@/components/camera-barcode-sheet";

// Same name key as /pack, so a picker who also packs types their name once.
const NAME_KEY = "gv-pack-scanner-name";
const POLL_MS = 8000;

type Feedback = { tone: "ok" | "warn" | "bad"; text: string };

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
    // colour feedback still works without sound
  }
  if (kind === "warn") navigator.vibrate?.(250);
}

const readName = () => {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

const noSubscribe = () => () => {};

const left = (i: PickItem) => i.required - i.picked - i.short;
const isDone = (i: PickItem) => left(i) <= 0;

function voiceFor(outcome: PickOutcome, item: PickItem | undefined): Announcement {
  if (outcome.result === "counted" && item) {
    if (isDone(item)) return { parts: [item.picked, "krob"], text: `${item.picked} ครบ` };
    return { parts: [item.picked], text: String(item.picked) };
  }
  if (outcome.result === "over") return { parts: ["over"], text: "เกิน" };
  if (outcome.result === "wrong" || outcome.result === "unknown") return { parts: ["wrong"], text: "ผิดรุ่น" };
  return { parts: ["not-counted"], text: "ไม่นับ" };
}

export function PickScanner({ initial }: { initial: PickDetail }) {
  const [detail, setDetail] = useState(initial);
  const storedName = useSyncExternalStore(noSubscribe, readName, () => "");
  const [nameOverride, setName] = useState<string | null>(null);
  const name = nameOverride ?? storedName;
  const [nameDraft, setNameDraft] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    preloadThaiVoice();
  }, []);

  // Other pickers may work the same job: refresh while idle.
  useEffect(() => {
    const t = setInterval(async () => {
      if (busy || document.hidden) return;
      const res = await fetch(`/api/pick/${detail.jobId}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setDetail(await res.json());
    }, POLL_MS);
    return () => clearInterval(t);
  }, [busy, detail.jobId]);

  const current = detail.items.find((i) => i.key === focusKey && !isDone(i)) ?? detail.items.find((i) => !isDone(i)) ?? null;
  const allDone = detail.items.length > 0 && detail.items.every(isDone);
  const doneCount = detail.items.filter(isDone).length;

  useEffect(() => {
    inputRef.current?.focus();
  }, [current?.key, name]);

  async function send(body: Record<string, unknown>) {
    if (!name) {
      setFeedback({ tone: "bad", text: "ใส่ชื่อคนหยิบก่อน" });
      return null;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/pick/${detail.jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, pickedBy: name }),
      });
      const data = (await res.json().catch(() => ({}))) as PickOutcome & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.detail) setDetail(data.detail);
      return data;
    } catch (error) {
      playTone("warn");
      setFeedback({ tone: "bad", text: `ส่งไม่สำเร็จ — ${(error as Error).message} ลองใหม่` });
      return null;
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function onScan(barcode: string) {
    const outcome = await send({ action: "scan", barcode });
    if (!outcome) return;
    const item = outcome.detail?.items.find((i) => i.key === outcome.key);
    const ok = outcome.result === "counted";
    playTone(ok ? "ok" : "warn");
    void announce(voiceFor(outcome, item));
    let text = outcome.message;
    if (ok && item && current && item.key !== current.key) {
      text += ` · รุ่นนี้อยู่ ${item.positions[0]?.position ?? "ไม่มีตำแหน่ง"} (นับให้แล้ว)`;
    }
    if (ok && item && isDone(item)) {
      const next = outcome.detail?.items.find((i) => !isDone(i));
      text += next ? ` → ไปต่อ ${next.positions[0]?.position ?? next.key}` : " → ครบทุกรายการแล้ว";
      setFocusKey(null);
    }
    setFeedback({ tone: ok ? "ok" : outcome.result === "over" ? "warn" : "bad", text });
  }

  // PDA side-button scans land here even when the scan box lost focus.
  useHardwareScan((code) => void onScan(code), { enabled: Boolean(name) && !allDone && !busy, scanInput: inputRef });

  async function onAction(action: "manual" | "short" | "unshort" | "undo", item: PickItem) {
    let qty: number | undefined;
    if (action === "manual") {
      const raw = window.prompt(`ใส่จำนวนที่หยิบเพิ่ม ${item.key} (เหลือ ${left(item)})`, String(left(item)));
      if (raw == null) return;
      qty = Number(raw);
    }
    if (action === "short" && !window.confirm(`บันทึกของขาด ${item.key} ${left(item)} ชิ้น?`)) return;
    const outcome = await send({ action, key: item.key, qty });
    if (!outcome) return;
    const ok = outcome.result !== "rejected";
    playTone(ok ? "ok" : "warn");
    setFeedback({ tone: ok ? (action === "short" ? "warn" : "ok") : "bad", text: outcome.message });
  }

  function saveName() {
    const n = nameDraft.trim();
    if (!n) return;
    try {
      window.localStorage.setItem(NAME_KEY, n);
    } catch {
      // name still works for this visit
    }
    setName(n);
  }

  const toneClass = { ok: "bg-accent-soft text-accent", warn: "bg-amber-100 text-amber-800", bad: "bg-red-100 text-red-700" };
  const pct = detail.required ? Math.round(((detail.picked + detail.short) / detail.required) * 100) : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-[560px] flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <Link href="/pack?s=picking" aria-label="กลับไปรายการ PO" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="text-base font-bold">สแกนหยิบ</h1>
            <p className="truncate text-xs text-muted">
              {detail.title || detail.sourceFile} · {detail.customer}
              {name ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setNameDraft(name);
                      setName("");
                    }}
                  >
                    {name} ✎
                  </button>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 pt-1.5 pb-2 text-xs text-muted tabular-nums">
          <span>
            {detail.picked.toLocaleString("th-TH")}/{detail.required.toLocaleString("th-TH")} ชิ้น
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full bg-[#1a7f4e] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <span>
            {doneCount}/{detail.items.length} SKU{detail.short ? ` · ขาด ${detail.short}` : ""}
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-2 px-3 pt-2 pb-6">
        {!name ? (
          <form
            className="flex gap-1.5 rounded-xl bg-surface p-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="ชื่อคนหยิบ"
              aria-label="ชื่อคนหยิบ"
              className="h-11 min-w-0 flex-1 rounded-xl border-2 border-accent px-3 text-base"
              autoFocus
            />
            <button className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white">เริ่มหยิบ</button>
          </form>
        ) : null}

        {allDone ? (
          <div className="rounded-xl border-2 border-accent bg-accent-soft p-3 text-center">
            <p className="text-base font-bold text-accent">✓ หยิบครบทุกรายการแล้ว</p>
            {detail.short ? <p className="text-xs text-amber-800">มีของขาด {detail.short} ชิ้น — ดูแถวสีเหลืองด้านล่าง</p> : null}
            <Link href={`/pack/${detail.jobId}`} className="mt-2 inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-white">
              ไปยิงสแกนลงลัง →
            </Link>
          </div>
        ) : current ? (
          <div className="rounded-[14px] bg-[#18232b] px-3 py-2.5 text-white">
            <div className="flex items-center justify-between gap-2 text-xs text-[#d6e3ec]">
              <span>ไปที่ตำแหน่ง</span>
              <b className="font-mono text-[22px] tracking-wide text-[#cdeb03]">{current.positions[0]?.position ?? "ไม่มีตำแหน่ง"}</b>
            </div>
            {current.positions[0] ? (
              <p className="text-right text-[11px] text-[#9fb0bd] tabular-nums">
                สต็อก {current.positions[0].qty}
                {current.positions.length > 1 ? ` · ที่อื่น: ${current.positions.slice(1, 3).map((p) => `${p.position} (${p.qty})`).join(", ")}` : ""}
              </p>
            ) : null}
            <div className="mt-1.5 flex items-center gap-2.5">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-white">
                {current.imageUrl ? <Image src={current.imageUrl} alt="" fill sizes="56px" className="object-contain p-0.5" /> : null}
              </div>
              <div className="min-w-0 flex-1 leading-snug">
                <p className="truncate font-mono text-sm font-bold">{current.key}</p>
                <p className="line-clamp-2 text-xs text-[#9fb0bd]">{current.name}</p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <b className="text-[26px] leading-none">
                  {current.picked}/{current.required - current.short}
                </b>
                <span className="block text-xs text-[#9fb0bd]">เหลือ {left(current)}</span>
              </div>
            </div>
          </div>
        ) : null}

        {name && !allDone ? (
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const v = inputRef.current?.value.trim() ?? "";
              if (inputRef.current) inputRef.current.value = "";
              if (v) void onScan(v);
            }}
          >
            <input
              ref={inputRef}
              inputMode="none"
              autoComplete="off"
              placeholder="ยิงบาร์โค้ด / ปุ่มสแกนข้างเครื่อง"
              aria-label="ช่องยิงบาร์โค้ด"
              className="h-11 min-w-0 flex-1 rounded-xl border-2 border-accent bg-surface px-3 text-base"
            />
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              aria-label="สแกนด้วยกล้องมือถือ"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 9v6M10 9v6M13 9v6M17 9v6" />
              </svg>
            </button>
          </form>
        ) : null}

        {feedback ? <p className={`rounded-[10px] px-2.5 py-1.5 text-[13px] font-semibold ${toneClass[feedback.tone]}`}>{feedback.text}</p> : null}

        {name && current && !allDone ? (
          <div className="grid grid-cols-3 gap-1.5">
            <button disabled={busy} onClick={() => onAction("manual", current)} className="h-10 rounded-[10px] border border-line bg-surface text-xs font-semibold">
              ใส่จำนวนเอง
            </button>
            <button disabled={busy} onClick={() => onAction("short", current)} className="h-10 rounded-[10px] border border-red-300 bg-surface text-xs font-semibold text-red-700">
              ของไม่พอ
            </button>
            <button disabled={busy || current.picked < 1} onClick={() => onAction("undo", current)} className="h-10 rounded-[10px] border border-line bg-surface text-xs font-semibold disabled:opacity-40">
              ย้อน 1
            </button>
          </div>
        ) : null}

        <div className="mt-1 flex justify-between px-0.5 text-[13px] font-semibold text-muted">
          <span>รายการตามทางเดิน</span>
          <span className="font-normal">แตะเพื่อเลือก</span>
        </div>
        <ul className="flex flex-col gap-1">
          {detail.items.map((item) => {
            const done = isDone(item);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    setFocusKey(item.key);
                    inputRef.current?.focus();
                  }}
                  className={`grid min-h-11 w-full grid-cols-[72px_1fr_auto] items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-xs ${
                    item.short ? "border border-amber-400 bg-amber-50" : current?.key === item.key ? "bg-surface outline-2 outline-accent" : "bg-surface"
                  } ${done && !item.short ? "opacity-55" : ""}`}
                >
                  <span className="font-mono font-bold">{item.positions[0]?.position ?? "—"}</span>
                  <span className="truncate">
                    <span className="font-mono">{item.key}</span>
                    {item.short ? <span className="ml-1 text-amber-800">ขาด {item.short}</span> : null}
                  </span>
                  <span className={`font-semibold tabular-nums ${done && !item.short ? "text-[#1a7f4e]" : ""}`}>
                    {done && !item.short ? "✓ " : ""}
                    {item.picked}/{item.required}
                  </span>
                </button>
                {item.short && name ? (
                  <button type="button" onClick={() => onAction("unshort", item)} className="ml-2 min-h-8 text-xs text-accent underline">
                    ยกเลิกของขาด (เติมของแล้ว)
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      {cameraOpen && name && !allDone ? (
        <CameraBarcodeSheet onDetected={(code) => void onScan(code)} onClose={() => setCameraOpen(false)} status={feedback} />
      ) : null}
    </main>
  );
}
