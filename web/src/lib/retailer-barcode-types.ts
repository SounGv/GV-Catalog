/**
 * Pure types/constants with no server-only imports (no `pg`) — kept
 * separate from barcodes.ts so client components (the row editor) can
 * import them without pulling the database pool into the browser bundle.
 */
export type RetailerBarcode = { retailer: string; barcode: string };

/** Suggested names for the admin form's datalist — free text underneath,
 * not a DB constraint, since new chains get added over time. */
export const SUGGESTED_RETAILERS = ["COM7", "IT City", "Jaymart", "AIS", "OfficeMate"] as const;
