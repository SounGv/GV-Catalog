"use client";

/**
 * Pre-recorded Thai voice for the scan screen, so every packing station speaks the same
 * without installing a Windows Thai voice. Clips live in public/sounds/th: the numbers
 * 0–500 plus the phrases below, generated once with edge-tts (th-TH-PremwadeeNeural).
 * Parts are played back to back ("3" + "ครบ"); a new announcement cuts off the last one.
 * Anything without a clip (a number above 500, a failed download) falls back to the
 * browser's own speech.
 */

export type VoicePhrase =
  | "krob"
  | "over"
  | "wrong"
  | "relabel"
  | "branch-complete"
  | "saved"
  | "still-short"
  | "pieces"
  | "removed-left"
  | "ambiguous"
  | "held"
  | "closed"
  | "send-failed"
  | "save-failed"
  | "counted"
  | "not-counted";

/** One spoken message: clip parts in order, and the same words as text for the fallback voice. */
export type Announcement = { parts: (VoicePhrase | number)[]; text: string };

const CLIP_BASE = "/sounds/th/";
const MAX_NUMBER_CLIP = 500;
const COMMON_CLIPS: (VoicePhrase | number)[] = [
  "krob", "over", "wrong", "relabel", "branch-complete", "saved", "still-short", "pieces", "removed-left",
  "ambiguous", "held", "closed", "send-failed", "save-failed", "counted", "not-counted",
  ...Array.from({ length: 51 }, (_, n) => n),
];

/** A decoded clip and the part of it that is actually speech (the files carry ~1 s of silence). */
type Clip = { buffer: AudioBuffer; start: number; end: number };

let context: AudioContext | null = null;
const buffers = new Map<string, Promise<Clip | null>>();
let playing: AudioBufferSourceNode[] = [];
let latest = 0;

function clipKey(part: VoicePhrase | number): string | null {
  if (typeof part !== "number") return part;
  return Number.isInteger(part) && part >= 0 && part <= MAX_NUMBER_CLIP ? String(part) : null;
}

function audio(): AudioContext {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

/** Finds where speech begins and ends so back-to-back parts sound like one sentence. */
function trimSilence(buffer: AudioBuffer): Clip {
  const samples = buffer.getChannelData(0);
  const threshold = 0.005; // low, so soft final consonants (บ, ด) are not cut off
  const pad = Math.round(buffer.sampleRate * 0.08);
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last--;
  if (first >= last) return { buffer, start: 0, end: buffer.duration };
  return {
    buffer,
    start: Math.max(0, first - pad) / buffer.sampleRate,
    end: Math.min(samples.length, last + pad) / buffer.sampleRate,
  };
}

function loadClip(key: string): Promise<Clip | null> {
  let pending = buffers.get(key);
  if (!pending) {
    pending = fetch(`${CLIP_BASE}${key}.mp3`)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      .then((data) => audio().decodeAudioData(data))
      .then(trimSilence)
      .catch(() => {
        buffers.delete(key); // try again next time
        return null;
      });
    buffers.set(key, pending);
  }
  return pending;
}

/** Downloads the everyday clips ahead of time so the first scans speak without delay. */
export function preloadThaiVoice() {
  for (const part of COMMON_CLIPS) {
    const key = clipKey(part);
    if (key) void loadClip(key);
  }
}

function speakWithBrowserVoice(text: string) {
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

export async function announce({ parts, text }: Announcement) {
  const ticket = ++latest;
  for (const source of playing) {
    try {
      source.stop();
    } catch {
      // already finished
    }
  }
  playing = [];
  window.speechSynthesis?.cancel();

  const keys = parts.map(clipKey);
  if (keys.some((k) => k === null)) return speakWithBrowserVoice(text);
  let clips: (Clip | null)[];
  try {
    clips = await Promise.all(keys.map((k) => loadClip(k as string)));
  } catch {
    return speakWithBrowserVoice(text);
  }
  if (ticket !== latest) return; // a newer scan already spoke
  if (clips.some((c) => !c)) return speakWithBrowserVoice(text);

  const ctx = audio();
  let at = ctx.currentTime + 0.02;
  for (const clip of clips as Clip[]) {
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(ctx.destination);
    source.start(at, clip.start, clip.end - clip.start);
    playing.push(source);
    at += clip.end - clip.start;
  }
}
