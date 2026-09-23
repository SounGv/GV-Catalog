import ExcelJS from "exceljs";
import type { Brand } from "@/lib/types";

/** Columns the BigSeller "SKU Merchant" export must have — same mapping as
 * the original build_catalog_data.py, kept in sync so a re-export from the
 * merchant portal imports the same way whether run offline or in-app. */
const REQUIRED_COLUMNS = ["เลข SKU", "ชื่อ SKU"] as const;
const OPTIONAL_COLUMNS = [
  "หมวดหมู่",
  "GTIN",
  "บาร์โค้ด 1",
  "Image URL",
  "น้ำหนักสุทธิ(g)",
  "ความยาว(cm)",
  "ความกว้าง(cm)",
  "ความสูง(cm)",
  "ประเภทSKU",
  "เลข SPU",
  "เวลาสร้าง",
] as const;

export type ImportRow = {
  sku: string;
  name: string;
  brand: Brand;
  category: string | null;
  gtin: string | null;
  imageUrl: string | null;
  weightG: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  productType: string | null;
  spu: string | null;
  createdAt: string | null;
  needsReview: string[];
};

export type ParsedImport = {
  rows: ImportRow[];
  missingColumns: string[];
};

function toFloatOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function brandOf(sku: string, name: string): Brand {
  const s = sku.toUpperCase();
  const n = name.toUpperCase();
  if (s.startsWith("FAN-") || n.includes("FANTECH")) return "Fantech";
  if (n.includes("UGREEN") || s.includes("UGREEN")) return "UGREEN";
  return "Other";
}

/** Parses an uploaded BigSeller SKU Merchant .xlsx into rows ready to preview/import. */
export async function parseImportWorkbook(buffer: Buffer): Promise<ParsedImport> {
  const workbook = new ExcelJS.Workbook();
  // exceljs ships its own (older) Buffer type declaration that no longer
  // structurally matches @types/node's current Buffer — a type-only mismatch,
  // not a runtime one, since it's the same Buffer at runtime.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], missingColumns: [...REQUIRED_COLUMNS] };

  const headerRow = sheet.getRow(1);
  const headerToCol = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value ?? "").trim();
    if (header) headerToCol.set(header, colNumber);
  });

  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headerToCol.has(col));
  if (missingColumns.length > 0) return { rows: [], missingColumns };

  const allColumns = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
  const missingOptional = allColumns.filter((col) => !headerToCol.has(col));

  function cell(row: ExcelJS.Row, name: string): unknown {
    const colNumber = headerToCol.get(name);
    if (!colNumber) return null;
    return row.getCell(colNumber).value;
  }

  const rows: ImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const sku = toStringOrNull(cell(row, "เลข SKU"));
    if (!sku) continue; // blank trailing rows

    const name = toStringOrNull(cell(row, "ชื่อ SKU")) ?? "";
    const categoryRaw = toStringOrNull(cell(row, "หมวดหมู่"));
    const category = categoryRaw === "ไม่มีหมวดหมู่" ? null : categoryRaw;
    const gtin = toStringOrNull(cell(row, "GTIN")) ?? toStringOrNull(cell(row, "บาร์โค้ด 1"));
    const imageUrl = toStringOrNull(cell(row, "Image URL"));

    const needsReview: string[] = [];
    if (!gtin) needsReview.push("missing_gtin");
    if (!imageUrl) needsReview.push("missing_image");

    rows.push({
      sku,
      name,
      brand: brandOf(sku, name),
      category,
      gtin,
      imageUrl,
      weightG: toFloatOrNull(cell(row, "น้ำหนักสุทธิ(g)")),
      lengthCm: toFloatOrNull(cell(row, "ความยาว(cm)")),
      widthCm: toFloatOrNull(cell(row, "ความกว้าง(cm)")),
      heightCm: toFloatOrNull(cell(row, "ความสูง(cm)")),
      productType: toStringOrNull(cell(row, "ประเภทSKU")),
      spu: toStringOrNull(cell(row, "เลข SPU")),
      createdAt: toStringOrNull(cell(row, "เวลาสร้าง")),
      needsReview,
    });
  }

  return { rows, missingColumns: missingOptional };
}
