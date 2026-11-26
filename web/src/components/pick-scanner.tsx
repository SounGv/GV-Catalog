"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PickDetail, PickItem, PickOutcome } from "@/lib/pick";
import { announce, preloadThaiVoice, type Announcement } from "@/components/thai-voice";

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
    <main className="mx-auto flex max-w-[640px] flex-col gap-3 px-4 py-4">
      <div className="rounded-xl bg-[#18364c] p-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold">สแกนหยิบ · {detail.customer}</h1>
          <Link href="/pack" className="text-sm text-white/80 underline">
            งานทั้งหมด
          </Link>
        </div>
        <p className="truncate text-sm text-white/80">{detail.title || detail.sourceFile}</p>
        <p className="mt-1 text-sm tabular-nums">
          หยิบแล้ว {detail.picked.toLocaleString("th-TH")} / {detail.required.toLocaleString("th-TH")} ชิ้น · ครบ {doneCount}/{detail.items.length} รายการ
          {detail.short ? ` · ขาด ${detail.short}` : ""}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full bg-[#7dd3a8] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {!name ? (
        <form
          className="flex gap-2 rounded-xl border border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="ชื่อคนหยิบ"
            className="min-h-12 flex-1 rounded-lg border-2 border-accent px-3 text-base"
            autoFocus
          />
          <button className="min-h-12 rounded-lg bg-accent px-4 font-semibold text-white">เริ่มหยิบ</button>
        </form>
      ) : null}

      {allDone ? (
        <div className="rounded-xl border-2 border-accent bg-accent-soft p-4 text-center">
          <p className="text-lg font-bold text-accent">✓ หยิบครบทุกรายการแล้ว</p>
          {detail.short ? <p className="text-sm text-amber-800">มีของขาด {detail.short} ชิ้น — ดูรายการสีเหลืองด้านล่าง</p> : null}
          <Link href={`/pack/${detail.jobId}`} className="mt-3 inline-flex min-h-12 items-center rounded-lg bg-accent px-5 font-semibold text-white">
            ไปยิงสแกนลงลัง →
          </Link>
        </div>
      ) : current ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm text-muted">ไปที่ตำแหน่ง</p>
              <p className="font-mono text-3xl font-extrabold tracking-wide text-[#18364c]">{current.positions[0]?.position ?? "ไม่มีตำแหน่ง"}</p>
              {current.positions.length > 1 ? (
                <p className="text-xs text-muted">มีที่อื่นด้วย: {current.positions.slice(1, 4).map((p) => `${p.position} (${p.qty})`).join(", ")}</p>
              ) : null}
            </div>
            {current.positions[0] ? <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-muted tabular-nums">สต็อก {current.positions[0].qty}</span> : null}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
              {current.imageUrl ? <Image src={current.imageUrl} alt="" fill sizes="80px" className="object-contain p-1" /> : null}
            </div>
            <div className="min-w-0">
              <p className="font-mono text-2xl font-bold">{current.key}</p>
              <p className="line-clamp-2 text-sm text-muted">{current.name}</p>
            </div>
          </div>
          <p className="mt-3 text-center tabular-nums">
            <span className="text-6xl font-extrabold">{current.picked}</span>
            <span className="text-2xl text-muted"> / {current.required - current.short} ชิ้น</span>
          </p>
        </div>
      ) : null}

      {feedback ? <p className={`rounded-xl px-4 py-3 font-semibold ${toneClass[feedback.tone]}`}>{feedback.text}</p> : null}

      {name && !allDone ? (
        <form
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
            placeholder="ยิงบาร์โค้ดสินค้าที่นี่"
            aria-label="ช่องยิงบาร์โค้ด"
            className="min-h-14 w-full rounded-xl border-2 border-accent px-4 text-lg"
          />
        </form>
      ) : null}

      {name && current && !allDone ? (
        <div className="grid grid-cols-3 gap-2">
          <button disabled={busy} onClick={() => onAction("manual", current)} className="min-h-12 rounded-lg border border-line bg-surface font-semibold">
            ใส่จำนวนเอง
          </button>
          <button disabled={busy} onClick={() => onAction("short", current)} className="min-h-12 rounded-lg border border-amber-400 bg-surface font-semibold text-amber-800">
            ของไม่พอ
          </button>
          <button disabled={busy || current.picked < 1} onClick={() => onAction("undo", current)} className="min-h-12 rounded-lg border border-line bg-surface font-semibold disabled:opacity-40">
            ย้อน 1
          </button>
        </div>
      ) : null}

      <ul className="flex flex-col gap-1.5">
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
                className={`grid w-full grid-cols-[96px_1fr_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                  item.short ? "border-amber-400 bg-amber-50" : current?.key === item.key ? "border-2 border-accent bg-surface" : "border-line bg-surface"
                } ${done && !item.short ? "opacity-55" : ""}`}
              >
                <span className="font-mono">{item.positions[0]?.position ?? "—"}</span>
                <span className="truncate font-mono">
                  {item.key}
                  {item.short ? <span className="ml-1 font-sans text-amber-800">ขาด {item.short}</span> : null}
                </span>
                <span className="font-semibold tabular-nums">
                  {done && !item.short ? "✓ " : ""}
                  {item.picked}/{item.required}
                </span>
              </button>
              {item.short && name ? (
                <button type="button" onClick={() => onAction("unshort", item)} className="ml-3 text-xs text-accent underline">
                  ยกเลิกของขาด (เติมของแล้ว)
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {name ? (
        <p className="text-center text-sm text-muted">
          คนหยิบ: {name} ·{" "}
          <button type="button" className="underline" onClick={() => {
              setNameDraft(name);
              setName("");
            }}>
            เปลี่ยนชื่อ
          </button>
        </p>
      ) : null}
    </main>
  );
}
