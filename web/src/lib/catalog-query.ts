import type { CatalogQuery } from "@/lib/types";

type SearchParamValue = string | string[] | undefined;

function first(value: SearchParamValue): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parseCatalogQuery(searchParams: {
  q?: SearchParamValue;
  brand?: SearchParamValue;
  category?: SearchParamValue;
}): CatalogQuery {
  const brandValue = first(searchParams.brand);
  const brand = brandValue === "UGREEN" || brandValue === "Fantech" ? brandValue : "";
  return {
    q: first(searchParams.q).trim(),
    brand,
    category: first(searchParams.category).trim(),
  };
}

export function catalogHref(query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.brand) params.set("brand", query.brand);
  if (query.category) params.set("category", query.category);
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

/** Encodes a SKU (which may itself contain "/") into path segments — shared by
 * every route keyed by a catch-all `[...sku]`, public or admin. */
function encodeSkuSegments(sku: string): string {
  return sku.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export function skuPath(sku: string): string {
  return `/sku/${encodeSkuSegments(sku)}`;
}

export function adminProductEditPath(sku: string): string {
  return `/admin/products/edit/${encodeSkuSegments(sku)}`;
}

export function skuHref(sku: string, query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.brand) params.set("brand", query.brand);
  if (query.category) params.set("category", query.category);
  const search = params.toString();
  const path = skuPath(sku);
  return search ? `${path}?${search}` : path;
}

export function skuFromSegments(segments: string[]): string {
  return segments
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}
