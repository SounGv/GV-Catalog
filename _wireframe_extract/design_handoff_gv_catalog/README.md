# Handoff: GV Catalog

## Overview
GV Catalog is an internal catalog for Gadget Villa's warehouse receiving staff. It lets staff search a SKU (Fantech / UGREEN) and instantly compare the factory-shipped package against reference "prototype" photos, since packaging (box vs. bag, hangtab, labels, barcodes) can drift between production lots. Admins manage product data, reference photos, and receiving-discrepancy reports.

No prices, no cart, no purchasing — this is a receiving/QC reference tool only.

## About the Design Files
The files in this bundle (`GV Catalog.dc.html` and assets) are **design references built in HTML** — a clickable prototype showing intended layout, copy, and interaction flow. They are not production code. The task is to **recreate this design in whatever stack Cursor is building the real app in** (recommended: React/Next.js or similar, with a real backend — see Data Model below), using the target codebase's own component/styling conventions, not by embedding or lightly adapting this HTML file.

`GV Catalog.dc.html` is a single streaming "Design Component" file (custom internal format — treat it purely as an HTML/CSS/JS reference to read, not a library to import). Open it in a browser to click through the live prototype.

## Fidelity
Mixed:
- **Catalog list page** and **SKU detail page** (SKU 75628 fully populated): **high-fidelity** — recreate pixel-close, colors/type/spacing as specified below.
- **Manage Products page**, **Report List page**, **Import Excel modal**, **Add Product / Add Image modals**: **low-fidelity wireframes** — the prototype shows required fields, layout structure and flow, but treat exact spacing/visuals as a guide, not a spec. Apply your own component library's styling.

## Screens / Views

### 1. Catalog (home) — high-fidelity
**Purpose**: Land here, search/filter, open a SKU to compare photos.
**Layout**: Single column, max-width ~1180px inside the device frame in the prototype (real app: normal responsive page). Top: nav bar. Below: large search input (46px tall) with a search icon, then a row of brand filter buttons (ทั้งหมด / UGREEN / Fantech) + an optional category disclosure toggle aligned right. Result count line. Then a responsive card grid: `repeat(auto-fill, minmax(200px,1fr))`, `gap:16px` (compact tweak: `minmax(150px,1fr)`, `gap:10px`).
**Components**:
- Search input: full width, `height:46px`, `padding-left:42px` for icon, placeholder "ค้นหา SKU, ชื่อ, รุ่น หรือค่าบาร์โค้ด". Filters by SKU, name, model, or GTIN substring, case-insensitive.
- Brand filter buttons: 3 buttons (ทั้งหมด/UGREEN/Fantech), active = filled/primary style, inactive = secondary/outline.
- Category toggle: ghost button "หมวดหมู่ (ไม่บังคับ) ▾", expands a wrapping row of category chips (derived from data, optional filter — never required).
- Product card: white card, `border-radius` per design system, `box-shadow` sm. Square-ish image area (background `var(--color-neutral-100)`), product photo `object-fit:contain` with ~10px inset, or "ไม่มีรูป" placeholder text if no photo. Below: brand tag, SKU (monospace, bold, ~17px), product name (2-line clamp), a status tag, and a full-width primary button "ดูสินค้าและแพ็กเกจ". Entire card and button open the detail page for that SKU.
- Status tags (see Design Tokens > status below).
- Result cap: catalog has ~2,900 SKUs from the merchant export — cap rendered cards to ~60 with a note "แสดง 60 รายการแรก พิมพ์ค้นหาเพื่อดูรายการที่ต้องการ" when more match. In the real app, paginate or virtualize instead of a hard cap.
- Empty state ("ค้นหาไม่พบ"): centered text, no results illustration needed — keep it plain per the "no filler" content rule.

### 2. SKU Detail — high-fidelity
**Purpose**: Compare today's factory shipment against the accepted reference photos/specs for one SKU.
**Layout**: Single column. Top: "‹ กลับแค็ตตาล็อก" ghost button (back nav). Then SKU + product name heading row, tag row (brand / category / model / color), then a stat block (background surface, shadow-sm, padding) showing GTIN in large monospace (~26px) next to a short freeform "ลักษณะแพ็กเกจ" (package note, e.g. "กล่องขาว–เขียว มีหูแขวน").
**Package photos**: grid of 6 angles — หน้า (front), หลัง (back), บาร์โค้ด (barcode side), ฉลากไทย (Thai label side), บน/หูแขวน (top/hangtab), ล่าง (bottom). Each is a square image slot with a caption below. Tapping opens a **zoom modal** (see Modals). This 6-angle set is fixed per the brief — don't collapse it into tabs.
**Unit photo**: separate single square slot for "รูปตัวสินค้าและอุปกรณ์ภายใน" (the device itself + included accessories), kept visually separate from the 6 package angles.
**Checkpoints**: bulleted list, "จุดสังเกตที่ต้องดู" — free text list (e.g. "มีหูแขวนกระดาษสีเขียว", "สติ๊กเกอร์รับประกัน 2 ปี สีเหลือง–ดำ มุมขวาบนด้านหน้า", "ฉลากภาษาไทย GV", GTIN vs S/N caveat).
**GTIN/barcode check**: a small "compare" panel — text input (placeholder "สแกนหรือกรอกเลขบาร์โค้ด") + "ตรวจสอบ" button, comparing input to the SKU's GTIN. Outputs one of: บาร์โค้ดตรง (match) / บาร์โค้ดไม่ตรง (mismatch) / ยังไม่มีข้อมูล (empty input). **Important**: label this clearly as "GTIN ตรง = เลขตรงกันเท่านั้น ไม่ได้แปลว่าสินค้าผ่าน QC ทั้งล็อต" — do not let a GTIN match imply lot-level QC pass anywhere in the UI copy.
**Actions row**: "ของที่รับมาไม่ตรงรูป" (opens Report modal, styled as a warning/danger outline action — this is the primary "something's wrong" CTA), "คัดลอกลิงก์สินค้า" (copies a deep link to this SKU — the app must support direct linking per-SKU, e.g. `/sku/75628`), and an admin-only "+ เพิ่มรูป" (opens Add Image modal).
**History**: collapsible "ประวัติแพ็กเกจ ▸" — when a SKU has had multiple accepted packaging variants over time, list them here (thumbnail + label + date), current one tagged "ใช้งานอยู่". Never auto-pick "latest lot" as canonical — each variant must be explicitly reviewed/accepted by an admin. When only one variant exists, show that plainly.

### 3. Manage Products — low-fidelity (admin only)
Table: SKU, ชื่อสินค้า, แบรนด์, หมวดหมู่, ความพร้อมของรูป (status tag), แก้ไข action. Top-right actions: "นำเข้า Excel" and "+ เพิ่มสินค้า". Status must distinguish **"มีภาพแล้ว"** (has at least one photo) from **"ตรวจยืนยันต้นแบบแล้ว"** (an admin has explicitly verified the photo set as the accepted reference) — these are different states, don't conflate them.

### 4. Report List — low-fidelity (admin only)
List of receiving-discrepancy reports: SKU, ล็อต/เลขรับเข้า, ผู้แจ้ง, วันที่, ประเภทปัญหา, สถานะ. Filter: รอตรวจ / ตรวจแล้ว (segmented). Opening a report shows the reference photo(s) side-by-side with the photo(s) the receiving staff attached, plus a notes/resolution field for the admin. **Empty state when there are no reports yet: plain "ยังไม่มีรายการแจ้งความต่างในขณะนี้" message — never fabricate sample rows or counts.**

## Modals
1. **Zoom** — full-size/zoomable view of one package photo, for reading small print on labels/barcodes.
2. **Report discrepancy** ("ของที่รับมาไม่ตรงรูป") — fields: lot/receiving number, issue type (segmented: กล่อง/หูแขวน / ฉลาก/บาร์โค้ด / อื่นๆ), free-text detail, multi-photo attach of what was actually received. Submits against the current SKU.
3. **Package history** — see Detail page History section above.
4. **Add/Edit product & photos** (admin) — SKU, GTIN, name, model, color, brand, category fields; multi-file photo attach where **each photo is tagged with its angle** (หน้า/หลัง/บน/ล่าง/etc, not a generic gallery); optional checkpoint notes.
   - **Photo intake controls (functional requirement, not just visual)**: on every photo upload in this modal, give the admin two real choices:
     a. **Background removal**: segmented choice "ลบพื้นหลังออโต้" (auto-remove background via an image-processing service) vs. "ไม่ลบ" (keep original background). Default: auto.
     b. **Auto box measurement**: a toggle "วัดขนาดกล่องอัตโนมัติจากรูป". When on, run an auto-measurement pass on the uploaded photo (computer-vision estimate against a reference scale/marker, or a manual-correction fallback) and pre-fill **width, length, height (cm), and weight (g)** fields — each remaining editable before save. The prototype shows this as a red-outline overlay on the photo (see reference sketches the user provided) plus 4 numeric fields; replicate the overlay-plus-editable-fields pattern, not just raw text fields.
5. **Import Excel** (admin) — 4-step flow: เลือกไฟล์ (pick file) → ตรวจคอลัมน์ (validate columns against expected schema) → ดูตัวอย่างรายการเพิ่ม/อัปเดต/ข้อมูลที่ต้องตรวจ (preview: new rows / rows to update / rows needing manual review, e.g. duplicate SKU or missing GTIN) → ยืนยันนำเข้า (confirm import). Never skip the preview step — imports must be reviewable before committing.

## Interactions & Behavior
- Product card / "ดูสินค้าและแพ็กเกจ" → navigate to `/sku/:sku` (deep-linkable).
- "‹ กลับแค็ตตาล็อก" → back to catalog, preserving prior search/filter state if feasible.
- Search is client-debounced substring match across SKU, name, model, GTIN.
- Brand filter and category filter are independent, both optional, combine with AND.
- "คัดลอกลิงก์สินค้า" → copy current SKU's canonical URL to clipboard, small toast confirmation.
- Toasts: bottom-center, dark pill, auto-dismiss ~2.2s — used for "บันทึกการแจ้งความต่างแล้ว", "บันทึกรูปแล้ว", "คัดลอกลิงก์สินค้าแล้ว", "บันทึกสินค้าแล้ว".
- Responsive: catalog and detail pages must work at both desktop and mobile widths — cards reflow to 1–2 columns on mobile, all tap targets ≥44px, body text ≥16px.

## State Management (conceptual — adapt to your stack)
- Current page/route, selected SKU, search query, brand filter, category filter (open/selected).
- Active modal (zoom / report / addImage / addProduct / importExcel / none) + its step (import wizard step 0–3).
- Per-SKU: GTIN-check input + result (match/mismatch/empty).
- Photo intake state per upload: background-removal choice, auto-measure toggle, measured W/L/H/weight (editable).
- Server-side (real backend, not in this prototype): products, photo sets (with angle + verified-status per photo/set), package history versions, discrepancy reports (with status), Excel import jobs/audit log.

## Data Model (inferred from the merchant Excel export + brief)
Product: `sku` (string, PK), `name` (string — the merchant's raw listing name, often needs a cleaner display name), `brand` (UGREEN | Fantech | other), `category` (string, optional/free), `gtin` (string, may be blank), `model`, `color`. Photo: belongs to a product + a package-history version, has an `angle` enum (front/back/top/bottom/side1/side2/barcode/thai-label as used, extend as needed), a `verified` boolean separate from mere existence, and now also `width/length/height/weight` capture metadata plus which background-removal mode was used. Discrepancy report: `sku`, `lot`, `reporterName`, `date`, `issueType`, `detail`, `photos[]`, `status` (pending/reviewed), `resolutionNotes`.

## Design Tokens
- Colors: background `#eef1ee`, surface `#ffffff`, text `#152018`, accent (dark green) `#215e42` with tonal ramp 100→900 (`#eaf5ee` → `#0b2519`), neutral ramp `#fbfcfb` (100) → `#232722` (900).
- Status tag colors: neutral tag = ค้นหาไม่พบ/รอตรวจยืนยันต้นแบบ/ยังไม่มีข้อมูล; outline tag = ยังไม่มีรูปสินค้า/บาร์โค้ดไม่ตรง/เกิดข้อผิดพลาด; accent (filled) tag = ตรวจยืนยันต้นแบบแล้ว/บาร์โค้ดตรง/แนบรูปสำเร็จ.
- Typography: Sarabun (Thai-friendly), weights 400/500/600/700. Body ≥16px, SKU/GTIN figures in monospace for scan-ability.
- Radius: ~8-10px on cards/inputs/images. Shadows: sm `0 1px 2px rgba(21,32,24,.08)`, md `0 4px 14px rgba(21,32,24,.12)`, lg `0 16px 40px rgba(21,32,24,.20)`.
- Spacing: generous section gaps (~40-64px between major sections), 12-16px internal card padding.

## Assets
- `gv-logo.png` — Gadget Villa logo, used in the nav bar (~30px tall).
- Product photos in the prototype are linked to the merchant's existing remote image URLs (Shopee/BigSeller CDN) as placeholders — the real app needs its own photo storage/CDN.
- SKU 75628 reference photos (front/back/barcode/Thai-label/top-hangtab/bottom) are referenced by filename only in the prototype (`82744_0(1).jpg` etc.) — actual image files were not provided; treat as placeholders to be filled by admins.

## Files
- `GV Catalog.dc.html` — the full clickable prototype (all 4 pages, wireframes, sitemap, modals). Open in a browser to review.
- `gv-logo.png` — logo asset used in the nav.
