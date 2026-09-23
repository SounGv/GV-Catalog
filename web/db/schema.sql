-- GV Catalog schema.
-- Run via `npm run db:migrate` (web/db/migrate.mjs). Safe to re-run: every
-- statement is idempotent (CREATE TABLE/INDEX IF NOT EXISTS).

-- gen_random_uuid() lives here on older Postgres; harmless no-op on versions
-- (16+) that already ship it in core.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS products (
  sku text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT 'Other' CHECK (brand IN ('UGREEN', 'Fantech', 'Other')),
  category text,
  gtin text,
  model text,
  color text,
  image_url text,
  weight_g numeric,
  length_cm numeric,
  width_cm numeric,
  height_cm numeric,
  product_type text,
  spu text,
  -- Original merchant "created" timestamp from the BigSeller export; kept as text
  -- since the source gives no timezone and we only ever display it, never sort by it.
  merchant_created_at text,
  needs_review text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_brand_idx ON products (brand);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);

-- Reference package photos per SKU: the fixed 6-angle set
-- (front/back/barcode/thai_label/top/bottom) plus a separate "unit" photo of
-- the device itself. One current photo per (sku, angle) — re-uploading
-- replaces it; no version history yet (see README's "package history" note
-- for a possible later addition).
CREATE TABLE IF NOT EXISTS product_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL REFERENCES products (sku) ON DELETE CASCADE,
  angle text NOT NULL CHECK (angle IN ('front', 'back', 'barcode', 'thai_label', 'top', 'bottom', 'unit')),
  url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sku, angle)
);

-- Receiving-discrepancy reports ("ของที่รับมาไม่ตรงรูป") filed by warehouse staff
-- against a SKU, reviewed by an admin. Report photo attachments are still
-- deferred (separate from the package reference photos above).
CREATE TABLE IF NOT EXISTS discrepancy_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL REFERENCES products (sku) ON DELETE CASCADE,
  lot text,
  reporter_name text NOT NULL,
  issue_type text NOT NULL CHECK (issue_type IN ('box_or_hangtab', 'label_or_barcode', 'other')),
  detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS discrepancy_reports_sku_idx ON discrepancy_reports (sku);
CREATE INDEX IF NOT EXISTS discrepancy_reports_status_idx ON discrepancy_reports (status);

-- Holds one parsed-but-not-yet-committed Excel upload between the "preview"
-- and "confirm" steps of Import Excel. Needed because the app runs on
-- Vercel serverless: there is no shared disk between the upload request and
-- the later confirm request, so the parsed rows have to live somewhere both
-- requests can reach — here, instead of a local temp file.
CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  rows jsonb NOT NULL,
  insert_count int NOT NULL,
  update_count int NOT NULL,
  review_skus text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

-- Keeps `updated_at` honest on every UPDATE, regardless of which admin code path
-- performed it — a trigger can't be forgotten the way a manual `SET updated_at`
-- in each query can.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
