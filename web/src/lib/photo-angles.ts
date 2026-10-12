// Safe to import from client components (no database access here).
export const PACKAGE_ANGLES = [
  { id: "front", label: "หน้า" },
  { id: "back", label: "หลัง" },
  { id: "barcode", label: "บาร์โค้ด" },
  { id: "thai_label", label: "ฉลากภาษาไทย (อย./ผู้นำเข้า)" },
  { id: "top", label: "บน/หูแขวน" },
  { id: "bottom", label: "ล่าง" },
] as const;

export const UNIT_ANGLE = { id: "unit", label: "รูปตัวสินค้าและอุปกรณ์ภายใน" } as const;

export type PhotoAngle = (typeof PACKAGE_ANGLES)[number]["id"] | typeof UNIT_ANGLE.id;

const VALID_ANGLES = new Set<string>([...PACKAGE_ANGLES.map((a) => a.id), UNIT_ANGLE.id]);

export function isPhotoAngle(value: string): value is PhotoAngle {
  return VALID_ANGLES.has(value);
}

