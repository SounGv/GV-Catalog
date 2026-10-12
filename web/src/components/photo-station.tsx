"use client";

import { useCallback, useEffect, useState } from "react";
import { listProductPhotosAction, uploadProductPhotoQuietAction } from "@/app/admin/products/photos-actions";
import { PACKAGE_ANGLES, UNIT_ANGLE, type PhotoAngle } from "@/lib/photo-angles";
import { useCamera } from "@/components/use-camera";
import { BoxMeasurePanel } from "@/components/box-measure-panel";

const ANGLES: { id: PhotoAngle; label: string }[] = [...PACKAGE_ANGLES, UNIT_ANGLE].map((angle) => ({
  id: angle.id,
  label: angle.id === "unit" ? "ตัวสินค้า" : angle.id === "thai_label" ? "ฉลากไทย" : angle.label,
}));

type FoundProduct = { sku: string; name: string; brand: string; gtin: string | null };
type Saved = Partial<Record<PhotoAngle, string>>;

function nextMissing(saved: Saved, after?: PhotoAngle): PhotoAngle {
  const start = after ? ANGLES.findIndex((angle) => angle.id === after) + 1 : 0;
  const order = [...ANGLES.slice(start), ...ANGLES.slice(0, start)];
  return (order.find((angle) => !saved[angle.id]) ?? ANGLES[0]).id;
}

/** Pick a model, take a photo, choose the angle and save: the photo goes straight into that model. */
export function PhotoStation({ initialSku }: { initialSku: string }) {
  const camera = useCamera();
  const [mode, setMode] = useState<"photo" | "measure">("photo");
  const [query, setQuery] = useState(initialSku);
  const [found, setFound] = useState<FoundProduct[]>([]);
  const [product, setProduct] = useState<FoundProduct | null>(null);
  const [photos, setPhotos] = useState<Saved>({});
  const [lots, setLots] = useState<Saved>({});
  const [angle, setAngle] = useState<PhotoAngle>("front");
  const [lot, setLot] = useState("");
  const [still, setStill] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadProduct = useCallback(async (picked: FoundProduct) => {
    setProduct(picked);
    setFound([]);
    setQuery("");
    setMessage(null);
    const state = await listProductPhotosAction(picked.sku);
    setPhotos(state.photos);
    setLots(state.lots);
    setAngle(nextMissing(state.photos));
    setLot(Object.values(state.lots)[0] ?? "");
  }, []);

  // ?sku= opens that model straight away.
  useEffect(() => {
    if (!initialSku) return;
    void (async () => {
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(initialSku)}`);
      const { products } = (await response.json()) as { products: FoundProduct[] };
      const exact = products.find((item) => item.sku === initialSku) ?? (products.length === 1 ? products[0] : null);
      if (exact) await loadProduct(exact);
    })();
  }, [initialSku, loadProduct]);

  useEffect(() => {
    const text = query.trim();
    if (product || text.length < 2) {
      setFound([]);
      return;
    }
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(text)}`);
      const data = (await response.json()) as { products: FoundProduct[] };
      setFound(data.products);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, product]);

  useEffect(() => {
    return () => {
      if (still) URL.revokeObjectURL(still.url);
    };
  }, [still]);

  async function snap() {
    const blob = await camera.snap({ square: true, maxSide: 2400, enhance: true });
    if (blob) {
      setMessage(null);
      setStill({ blob, url: URL.createObjectURL(blob) });
    }
  }

  async function save() {
    if (!product || !still) return;
    setBusy(true);
    setMessage(null);
    const formData = new FormData();
    formData.set("photo", new File([still.blob], `${product.sku}-${angle}.jpg`, { type: "image/jpeg" }));
    formData.set("lot", lot);
    formData.set("backgroundRemoval", "none");
    try {
      const result = await uploadProductPhotoQuietAction(product.sku, angle, formData);
      if (!result.ok) {
        setMessage({ ok: false, text: result.error ?? "บันทึกไม่สำเร็จ" });
        return;
      }
      const state = await listProductPhotosAction(product.sku);
      setPhotos(state.photos);
      setLots(state.lots);
      const label = ANGLES.find((item) => item.id === angle)?.label ?? angle;
      setMessage({ ok: true, text: `บันทึกรูป ${label} ของ ${product.sku} แล้ว` });
      setStill(null);
      setAngle(nextMissing(state.photos, angle));
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  const replacing = Boolean(photos[angle]);
  const doneCount = ANGLES.filter((item) => photos[item.id]).length;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        {product ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
            <div className="min-w-0">
              <p className="font-mono text-lg font-bold text-ink">{product.sku}</p>
              <p className="truncate text-sm text-muted">{product.name}</p>
              <p className="text-sm text-muted">แนบรูปแล้ว {doneCount}/{ANGLES.length} มุม</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setProduct(null);
                setPhotos({});
                setLots({});
                setStill(null);
              }}
              className="min-h-11 shrink-0 rounded-[10px] border border-line px-4 text-base"
            >
              เปลี่ยนรุ่น
            </button>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm text-muted">
              เลือกรุ่นที่จะถ่าย (พิมพ์ SKU ชื่อ หรือยิงบาร์โค้ด)
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                placeholder="เช่น 10212"
                className="min-h-[50px] rounded-[10px] border-2 border-line bg-surface px-3 text-base text-ink outline-none focus:border-accent"
              />
            </label>
            {found.length > 0 ? (
              <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
                {found.map((item) => (
                  <li key={item.sku} className="border-b border-line last:border-b-0">
                    <button type="button" onClick={() => void loadProduct(item)} className="flex min-h-12 w-full flex-col items-start px-3 py-2 text-left">
                      <span className="font-mono font-semibold text-ink">{item.sku}</span>
                      <span className="text-sm text-muted">{item.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim().length >= 2 ? (
              <p className="text-sm text-muted">ไม่พบรุ่นที่ค้นหา</p>
            ) : null}
          </>
        )}
      </section>

      {product ? (
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
          {(
            [
              ["photo", "ถ่ายรูปแพ็กเกจ"],
              ["measure", "วัดขนาดกล่อง (cm)"],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`min-h-11 rounded-[10px] text-base ${mode === id ? "bg-ink font-semibold text-white" : "text-ink"}`}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}

      {product && mode === "measure" ? (
        <>
          {camera.devices.length > 1 ? (
            <label className="flex items-center gap-2 text-sm text-muted">
              กล้อง
              <select
                value={camera.deviceId}
                onChange={(event) => camera.chooseDevice(event.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-2 text-base text-ink"
              >
                {camera.devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `กล้อง ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {camera.error ? <p className="rounded-[10px] bg-red-50 p-3 text-base text-red-700">{camera.error}</p> : null}
          <BoxMeasurePanel key={product.sku} camera={camera} sku={product.sku} />
        </>
      ) : null}

      {product && mode === "photo" ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">รูปนี้เป็นมุมไหน</h2>
            <ul className="flex flex-wrap gap-2">
              {ANGLES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setAngle(item.id)}
                    aria-pressed={angle === item.id}
                    className={
                      "min-h-11 rounded-full border px-4 text-base " +
                      (angle === item.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink")
                    }
                  >
                    {photos[item.id] ? "✓ " : ""}
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            <label className="flex flex-col gap-1 text-sm text-muted">
              เลข lot (ถ้ามี)
              <input
                value={lot}
                onChange={(event) => setLot(event.target.value)}
                maxLength={60}
                placeholder={lots[angle] ?? "เช่น GTE160726"}
                className="min-h-11 rounded-[10px] border border-line bg-surface px-3 text-base text-ink"
              />
            </label>
          </section>

          <section className="flex flex-col gap-3">
            {camera.devices.length > 1 ? (
              <label className="flex items-center gap-2 text-sm text-muted">
                กล้อง
                <select
                  value={camera.deviceId}
                  onChange={(event) => camera.chooseDevice(event.target.value)}
                  className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-2 text-base text-ink"
                >
                  {camera.devices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `กล้อง ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {camera.error ? <p className="rounded-[10px] bg-red-50 p-3 text-base text-red-700">{camera.error}</p> : null}

            {/* Square frame = the saved photo: what you see inside it is exactly what gets saved. */}
            <div className="relative mx-auto flex aspect-square w-full max-w-[640px] items-center justify-center overflow-hidden rounded-xl bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {still ? <img src={still.url} alt="รูปที่ถ่าย" className="h-full w-full object-cover" /> : null}
              <video ref={camera.videoRef} playsInline muted className={`h-full w-full object-cover ${still ? "hidden" : ""}`} />
              {!still ? (
                <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
                  <g stroke="white" strokeOpacity="0.35" strokeWidth="0.3" fill="none">
                    <path d="M33.3 0V100M66.6 0V100M0 33.3H100M0 66.6H100" />
                  </g>
                  <g stroke="#cdeb03" strokeWidth="0.8" fill="none" strokeLinecap="round">
                    <path d="M8 18V8H18M82 8H92V18M92 82V92H82M18 92H8V82" />
                  </g>
                </svg>
              ) : null}
              {camera.resolution && !still ? (
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                  {camera.resolution.width}×{camera.resolution.height}
                </span>
              ) : null}
            </div>
            {camera.resolution && camera.resolution.width < 1920 && !still ? (
              <p className="text-sm text-amber-700">
                กล้องส่งภาพแค่ {camera.resolution.width}×{camera.resolution.height} ภาพเลยไม่คมเท่าที่ควร ลองเลือกกล้องอีกตัวในช่อง กล้อง หรือต่อกล้องเข้าพอร์ต USB 3 (สีฟ้า)
              </p>
            ) : null}
            {!still ? <p className="text-center text-sm text-muted">วางสินค้ากลางกรอบ ให้เต็มกรอบพอดี ใช้พื้นหลังเรียบและแสงสว่างสม่ำเสมอ ภาพที่บันทึกคือส่วนในกรอบสี่เหลี่ยมนี้</p> : null}

            {replacing ? <p className="text-sm text-amber-700">มุมนี้มีรูปอยู่แล้ว ถ้าบันทึกจะแทนที่รูปเดิม</p> : null}

            {still ? (
              <div className="flex gap-3">
                <button type="button" onClick={() => setStill(null)} disabled={busy} className="min-h-12 flex-1 rounded-[10px] border border-line bg-surface text-base disabled:opacity-50">
                  ถ่ายใหม่
                </button>
                <button type="button" onClick={() => void save()} disabled={busy} className="min-h-12 flex-1 rounded-[10px] bg-accent text-base font-semibold text-white disabled:opacity-50">
                  {busy ? "กำลังบันทึก…" : `บันทึกเป็นมุม${ANGLES.find((item) => item.id === angle)?.label}`}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => void snap()} disabled={Boolean(camera.error)} className="min-h-12 rounded-[10px] bg-accent text-base font-semibold text-white disabled:opacity-50">
                ถ่ายรูป
              </button>
            )}

            {message ? (
              <p role="status" className={`rounded-[10px] p-3 text-base ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
                {message.ok ? "✓ " : ""}
                {message.text}
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
