"use client";

import { useCallback, useEffect, useState } from "react";
import { listProductPhotosAction, uploadProductPhotoQuietAction } from "@/app/admin/products/photos-actions";
import { PACKAGE_ANGLES, UNIT_ANGLE, type PhotoAngle } from "@/lib/photo-angles";
import { useCamera } from "@/components/use-camera";
import { BoxMeasurePanel } from "@/components/box-measure-panel";
import { useBoxLock } from "@/components/use-box-lock";

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
  const { attachVideo, ...camera } = useCamera();
  const [mode, setMode] = useState<"photo" | "measure">("photo");
  const [query, setQuery] = useState(initialSku);
  const [found, setFound] = useState<FoundProduct[]>([]);
  const [product, setProduct] = useState<FoundProduct | null>(null);
  const [photos, setPhotos] = useState<Saved>({});
  const [lots, setLots] = useState<Saved>({});
  const [angle, setAngle] = useState<PhotoAngle>("front");
  const [lot, setLot] = useState("");
  const [still, setStill] = useState<{ blob: Blob; url: string } | null>(null);
  const [zoom, setZoom] = useState(1); // digital zoom for the barcode close-up
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Live edge lock in the photo view too: outline the box and show its size while aiming.
  const lock = useBoxLock(camera.frame, mode === "photo" && !still);
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
  }, [setProduct, setFound, setQuery, setMessage, setPhotos, setLots, setAngle, setLot]);

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
    if (product || text.length < 2) return; // the list is hidden in this case (see below)
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
    // the barcode angle is a wide strip (2:1) and can be zoomed; every other angle is the square frame
    const blob = await camera.snap(angle === "barcode" ? { aspect: 2, zoom, maxSide: 2400, enhance: true } : { square: true, maxSide: 2400, enhance: true });
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
      setZoom(1);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  const replacing = Boolean(photos[angle]);
  const doneCount = ANGLES.filter((item) => photos[item.id]).length;
  const wide = angle === "barcode";
  const angleLabel = ANGLES.find((item) => item.id === angle)?.label ?? angle;

  const cameraSelect =
    camera.devices.length > 1 ? (
      <label className="flex items-center gap-2 text-sm text-muted">
        กล้อง
        <select
          value={camera.deviceId}
          onChange={(event) => camera.chooseDevice(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-2 text-sm text-ink"
        >
          {camera.devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `กล้อง ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  return (
    <div className="flex flex-col gap-3 pb-20">
      <section className="flex flex-col gap-2">
        {product ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-base leading-tight font-bold text-ink">{product.sku}</p>
              <p className="truncate text-xs text-muted">{product.name}</p>
            </div>
            <span className="shrink-0 rounded-full bg-accent-soft px-2.5 text-xs font-bold text-accent tabular-nums">
              {doneCount}/{ANGLES.length} มุม
            </span>
            <button
              type="button"
              onClick={() => {
                setProduct(null);
                setPhotos({});
                setLots({});
                setStill(null);
                setMode("photo");
              }}
              className="min-h-11 shrink-0 px-1.5 text-sm font-semibold text-accent"
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
            {found.length > 0 && query.trim().length >= 2 ? (
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

      {product && mode === "measure" ? (
        <>
          {cameraSelect}
          {camera.error ? <p className="rounded-[10px] bg-red-50 p-3 text-sm text-red-700">{camera.error}</p> : null}
          <BoxMeasurePanel key={product.sku} camera={camera} attachVideo={attachVideo} sku={product.sku} />
        </>
      ) : null}

      {product && mode === "photo" ? (
        <>
          <section className="flex flex-col gap-2">
            {/* The saved photo is exactly what shows inside this frame: square, or a wide strip (2:1) for the barcode close-up. */}
            <div className={`relative mx-auto w-full max-w-[640px] overflow-hidden rounded-2xl bg-black ${wide ? "aspect-[2/1]" : "aspect-square"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {still ? <img src={still.url} alt="รูปที่ถ่าย" className="h-full w-full object-cover" /> : null}
              <video
                ref={attachVideo}
                playsInline
                muted
                style={{ transform: wide && zoom > 1 ? `scale(${zoom})` : undefined }}
                className={`h-full w-full object-cover ${still ? "hidden" : ""}`}
              />
              {!still && !camera.error ? (
                wide ? (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-[8%] top-[16%] bottom-[24%] rounded-lg border-[3px] border-dashed border-[#cdeb03]" />
                ) : (
                  <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
                    <g stroke="white" strokeOpacity="0.35" strokeWidth="0.3" fill="none">
                      <path d="M33.3 0V100M66.6 0V100M0 33.3H100M0 66.6H100" />
                    </g>
                    <g stroke="#cdeb03" strokeWidth="0.8" fill="none" strokeLinecap="round">
                      <path d="M8 18V8H18M82 8H92V18M92 82V92H82M18 92H8V82" />
                    </g>
                  </svg>
                )
              ) : null}
              {!still && !wide && lock.detection && lock.frameSize ? (
                <svg
                  viewBox={(() => {
                    const side = Math.min(lock.frameSize.w, lock.frameSize.h);
                    return `${(lock.frameSize.w - side) / 2} ${(lock.frameSize.h - side) / 2} ${side} ${side}`;
                  })()}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  <polygon
                    points={lock.detection.corners.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={lock.locked ? "rgba(205,235,3,0.12)" : "none"}
                    stroke={lock.locked ? "#cdeb03" : "#ffffff"}
                    strokeWidth={lock.locked ? 2.5 : 1.5}
                    strokeDasharray={lock.locked ? undefined : "6 4"}
                  />
                </svg>
              ) : null}
              <span className="absolute top-2.5 left-2.5 rounded-full bg-black/65 px-2.5 text-xs font-bold text-white">มุม: {angleLabel}</span>
              {!still && !wide && lock.detection ? (
                <span
                  className={`absolute top-2.5 right-2.5 rounded-lg px-2.5 py-1 font-mono text-sm font-semibold tabular-nums ${
                    lock.locked ? "bg-[#cdeb03] text-ink" : "bg-black/70 text-white"
                  }`}
                >
                  {lock.locked ? "● " : ""}
                  {lock.detection.longCm.toFixed(1)} × {lock.detection.shortCm.toFixed(1)} cm
                </span>
              ) : null}
              {wide && !still && !camera.error ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs font-bold text-white [text-shadow:0_1px_3px_#000]">
                  ถ่ายใกล้ๆ ให้บาร์โค้ดเต็มกรอบ เห็นตัวเลขใต้เส้นชัด
                </span>
              ) : null}
              {camera.error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#2b3338] p-5 text-center text-white">
                  <p className="font-semibold">เปิดกล้องไม่ได้</p>
                  <p className="text-sm">{camera.error}</p>
                  <button type="button" onClick={() => camera.chooseDevice(camera.deviceId)} className="min-h-11 rounded-[10px] bg-[#cdeb03] px-5 text-sm font-bold text-ink">
                    ลองอีกครั้ง
                  </button>
                </div>
              ) : null}
            </div>

            {wide && !still && !camera.error ? (
              <div role="group" aria-label="ซูม" className="flex justify-center gap-2">
                {[1, 2, 3].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZoom(z)}
                    aria-pressed={zoom === z}
                    className={`min-h-11 min-w-16 rounded-full border px-3 text-sm font-semibold ${zoom === z ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink"}`}
                  >
                    {z}×
                  </button>
                ))}
              </div>
            ) : null}

            {!still && !wide && lock.detection ? (
              <p className="text-center text-xs text-muted">
                ขนาดมุมขวาบนคือ ยาว × กว้าง ของด้านที่เห็น{" "}
                <button type="button" onClick={() => setMode("measure")} className="font-semibold text-accent underline">
                  ไปวัดขนาดกล่อง
                </button>
              </p>
            ) : null}
            {camera.resolution && Math.max(camera.resolution.width, camera.resolution.height) < 1920 && !still ? (
              <p className="text-xs text-amber-700">
                กล้องส่งภาพแค่ {camera.resolution.width}×{camera.resolution.height} ภาพจึงไม่คมเท่าที่ควร ลองเลือกกล้องอีกตัวในแท็บ ตั้งค่า
              </p>
            ) : null}
          </section>

          <ul role="group" aria-label="เลือกมุม" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {ANGLES.map((item) => (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAngle(item.id);
                    setZoom(1);
                    setStill(null);
                  }}
                  aria-pressed={angle === item.id}
                  className={
                    "min-h-11 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap " +
                    (angle === item.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink")
                  }
                >
                  {photos[item.id] ? "✓ " : ""}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>

          {replacing ? <p className="text-xs text-amber-700">มุมนี้มีรูปอยู่แล้ว ถ้าบันทึกจะแทนที่รูปเดิม</p> : null}

          {message ? (
            <p role="status" className={`rounded-[10px] px-3 py-2 text-sm font-semibold ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
              {message.ok ? "✓ " : ""}
              {message.text}
            </p>
          ) : null}

          {still ? (
            <div className="flex gap-3">
              <button type="button" onClick={() => setStill(null)} disabled={busy} className="min-h-12 flex-[0.7] rounded-xl border border-line bg-surface text-[15px] font-semibold disabled:opacity-50">
                ถ่ายใหม่
              </button>
              <button type="button" onClick={() => void save()} disabled={busy} className="min-h-12 flex-1 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50">
                {busy ? "กำลังบันทึก…" : `บันทึก มุม${angleLabel}`}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => void snap()} disabled={Boolean(camera.error)} className="min-h-12 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50">
              ถ่ายรูป · มุม{angleLabel}
            </button>
          )}
        </>
      ) : null}

      {product ? (
        <nav aria-label="เมนูหลัก" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom,0px)]">
          <div className="mx-auto grid max-w-3xl grid-cols-3">
            {(
              [
                ["photo", "ถ่ายรูป", "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"],
                ["measure", "วัดขนาด", "M3 17 17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2"],
                ["settings", "ตั้งค่า", "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"],
              ] as const
            ).map(([id, text, icon]) => {
              const active = id === "settings" ? settingsOpen : !settingsOpen && mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (id === "settings") setSettingsOpen(true);
                    else {
                      setMode(id);
                      setSettingsOpen(false);
                    }
                  }}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active ? "text-accent" : "text-muted"}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px] fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={icon} />
                  </svg>
                  <span className={active ? "border-b-[3px] border-accent pb-px" : ""}>{text}</span>
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}

      {settingsOpen ? (
        <>
          <button type="button" aria-label="ปิด" onClick={() => setSettingsOpen(false)} className="fixed inset-0 z-30 bg-black/40" />
          <div role="dialog" aria-label="ตั้งค่า" className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-3xl flex-col gap-3 rounded-t-[20px] bg-surface p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
            <h2 className="text-base font-semibold">ตั้งค่า</h2>
            <label className="flex flex-col gap-1 text-sm text-muted">
              เลข lot (ถ้ามี)
              <input
                value={lot}
                onChange={(event) => setLot(event.target.value)}
                maxLength={60}
                placeholder={lots[angle] ?? "เช่น GTE160726"}
                className="min-h-11 rounded-[10px] border border-line bg-surface px-3 text-[15px] text-ink"
              />
            </label>
            {cameraSelect}
            <p className="text-xs text-muted">
              วิธีถ่าย: วางสินค้ากลางกรอบให้เต็มกรอบพอดี พื้นหลังเรียบ แสงสม่ำเสมอ ภาพที่บันทึกคือส่วนในกรอบ ถ้าวางกล่องบนแผ่นรองสีฟ้า กล้องจะล็อกขอบกล่องและบอกขนาดให้เอง
            </p>
            <button type="button" onClick={() => setSettingsOpen(false)} className="min-h-12 rounded-xl bg-accent text-[15px] font-bold text-white">
              เสร็จ
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
