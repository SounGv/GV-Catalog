export type Brand = "UGREEN" | "Fantech" | "Other";

export type Product = {
  sku: string;
  name: string;
  brand: Brand;
  category: string | null;
  gtin: string | null;
  model: string | null;
  color: string | null;
  imageUrl: string | null;
  weightG: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  productType: string | null;
  spu: string | null;
  createdAt: string | null;
  needsReview: string[];
  /** Free-text note an admin sets whenever the current incoming lot's
   * package differs from before (see current_lot_updated_at). */
  currentLotNote: string | null;
  currentLotUpdatedAt: string | null;
};

export type CatalogQuery = {
  q: string;
  brand: "" | "UGREEN" | "Fantech";
  /** Zero or more — matches ANY selected category (OR), like the Excel-style checklist filter it's modeled on. */
  category: string[];
  /** 1-indexed. Carried through skuHref too, so "‹ กลับแค็ตตาล็อก" returns to the page the staff was actually on. */
  page: number;
};
