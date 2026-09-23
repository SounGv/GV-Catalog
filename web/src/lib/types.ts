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
};

export type CatalogQuery = {
  q: string;
  brand: "" | "UGREEN" | "Fantech";
  category: string;
};
