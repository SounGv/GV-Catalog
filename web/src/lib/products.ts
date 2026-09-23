import catalogProducts from "../../data/products.json";
import type { Brand, CatalogQuery, Product } from "@/lib/types";

const RESULT_CAP = 60;

type RawProduct = Omit<Product, "brand"> & { brand: string };

function asBrand(value: string): Brand {
  switch (value) {
    case "UGREEN":
    case "Fantech":
    case "Other":
      return value;
    default:
      return "Other";
  }
}

function asProduct(raw: RawProduct): Product {
  return {
    ...raw,
    brand: asBrand(raw.brand),
    category: raw.category || null,
    gtin: raw.gtin || null,
    model: raw.model || null,
    color: raw.color || null,
    imageUrl: raw.imageUrl || null,
    name: raw.name || "",
    sku: raw.sku,
    needsReview: raw.needsReview ?? [],
  };
}

const products: Product[] = (catalogProducts as RawProduct[]).map(asProduct);

const productsBySku = new Map(products.map((product) => [product.sku, product]));

const categories = [...new Set(products.flatMap((product) => (product.category ? [product.category] : [])))].sort(
  (left, right) => left.localeCompare(right, "en"),
);

export function listCategories(): string[] {
  return categories;
}

export function getProduct(sku: string): Product | undefined {
  return productsBySku.get(sku);
}

function matchesQuery(product: Product, q: string): boolean {
  if (!q) return true;
  const haystack = [product.sku, product.name, product.model, product.gtin]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();
  return haystack.includes(q);
}

export function filterProducts(query: CatalogQuery): { shown: Product[]; total: number } {
  const q = query.q.toLowerCase();
  const matched = products.filter((product) => {
    if (query.brand && product.brand !== query.brand) return false;
    if (query.category && product.category !== query.category) return false;
    return matchesQuery(product, q);
  });
  return { shown: matched.slice(0, RESULT_CAP), total: matched.length };
}

export { RESULT_CAP };
