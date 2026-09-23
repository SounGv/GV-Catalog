# gv_catalog_products.json — handoff notes

Source: `SKU_Merchant20260922113856622.xlsx` (BigSeller SKU Merchant export, 2,937 SKUs, pulled 2026-09-22).
The Next.js app reads `web/data/products.json`. `build_catalog_data.py` writes that file.
Field mapping follows the Product data model in `_wireframe_extract/design_handoff_gv_catalog/README.md` ("Data Model" section), plus a few extra columns the "Add Product" photo-intake modal can pre-fill.

## Field mapping
| Output field | Source | Notes |
|---|---|---|
| `sku` | เลข SKU | Primary key. No duplicates found in the export. |
| `name` | ชื่อ SKU | Raw merchant listing name — README flags this as often needing a cleaner display name; left as-is here. |
| `brand` | derived | `"UGREEN"` if SKU/name contains UGREEN, `"Fantech"` if SKU starts with `FAN-` or name contains Fantech, else `"Other"`. The source "แบรนด์" column is 100% blank across all 2,937 rows — not usable. |
| `category` | หมวดหมู่ | `null` when blank or `"ไม่มีหมวดหมู่"`. |
| `gtin` | GTIN, falls back to บาร์โค้ด 1 | `null` if both are blank. |
| `model`, `color` | — | Left `null` on purpose. The export has no discrete columns for these and the raw name isn't consistent enough to split reliably without guessing — flag for manual cleanup or Cursor-side parsing. |
| `imageUrl` | Image URL | Merchant CDN URL (Shopee/BigSeller), per README to be used only as a placeholder until real photos are added. |
| `weightG`, `lengthCm`, `widthCm`, `heightCm` | น้ำหนักสุทธิ(g), ความยาว/กว้าง/สูง(cm) | `null` when the source value is 0 or blank (0 isn't a real measurement here). |
| `productType`, `spu`, `createdAt` | ประเภทSKU, เลข SPU, เวลาสร้าง | Kept for reference; `spu` groups color/size variants of the same base product if needed later. |
| `needsReview` | derived | `"missing_gtin"` and/or `"missing_image"` flags — mirrors the Import Excel modal's "rows needing manual review" step. |

## Counts (of 2,937 rows)
- Missing GTIN (and no barcode fallback): 165
- Missing image URL: 128
- No category assigned: 948
- Brand resolved as "Other" (not UGREEN/Fantech): 438

## Not done here
- No image files were fetched or generated — `imageUrl` values are the merchant's existing remote URLs only, per the README's "placeholders" note.
- No model/color extraction — flagged above, not guessed.
- No import into any live system — this is a static handoff file only.
