"""Build a clean product data file for the Cursor team from BigSeller's SKU Merchant export.

Maps xlsx columns to the Product data model defined in
_wireframe_extract/design_handoff_gv_catalog/README.md ("Data Model" section).

model/color are intentionally left null: the source export has no discrete
columns for them and the raw name is too inconsistent to parse reliably
without guessing (see README: name "often needs a cleaner display name").
"""
import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
SRC_XLSX = ROOT / "SKU_Merchant20260922113856622.xlsx"
OUT_JSON = ROOT / "web" / "data" / "products.json"


def to_float_or_none(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def brand_of(sku, name):
    s = (sku or "").upper()
    n = (name or "").upper()
    if s.startswith("FAN-") or "FANTECH" in n:
        return "Fantech"
    if "UGREEN" in n or "UGREEN" in s:
        return "UGREEN"
    return "Other"


def main():
    wb = openpyxl.load_workbook(SRC_XLSX, read_only=False, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    headers = rows[0]
    idx = {h: i for i, h in enumerate(headers)}

    def col(r, name):
        return r[idx[name]]

    products = []
    counts = {"total": 0, "missing_gtin": 0, "missing_image": 0, "missing_category": 0, "other_brand": 0}

    for r in rows[1:]:
        sku = col(r, "เลข SKU")
        name = col(r, "ชื่อ SKU")
        category_raw = col(r, "หมวดหมู่")
        category = None if (not category_raw or category_raw == "ไม่มีหมวดหมู่") else category_raw
        gtin = col(r, "GTIN") or col(r, "บาร์โค้ด 1") or None
        image_url = col(r, "Image URL") or None
        brand = brand_of(sku, name)

        needs_review = []
        if not gtin:
            needs_review.append("missing_gtin")
            counts["missing_gtin"] += 1
        if not image_url:
            needs_review.append("missing_image")
            counts["missing_image"] += 1
        if category is None:
            counts["missing_category"] += 1
        if brand == "Other":
            counts["other_brand"] += 1

        products.append({
            "sku": sku,
            "name": name,
            "brand": brand,
            "category": category,
            "gtin": gtin,
            "model": None,
            "color": None,
            "imageUrl": image_url,
            "weightG": to_float_or_none(col(r, "น้ำหนักสุทธิ(g)")),
            "lengthCm": to_float_or_none(col(r, "ความยาว(cm)")),
            "widthCm": to_float_or_none(col(r, "ความกว้าง(cm)")),
            "heightCm": to_float_or_none(col(r, "ความสูง(cm)")),
            "productType": col(r, "ประเภทSKU") or None,
            "spu": col(r, "เลข SPU") or None,
            "createdAt": col(r, "เวลาสร้าง") or None,
            "needsReview": needs_review,
        })
        counts["total"] += 1

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    print("TOTAL", counts["total"])
    print("MISSING_GTIN", counts["missing_gtin"])
    print("MISSING_IMAGE", counts["missing_image"])
    print("MISSING_CATEGORY", counts["missing_category"])
    print("OTHER_BRAND", counts["other_brand"])
    print("WROTE", OUT_JSON)


if __name__ == "__main__":
    main()
