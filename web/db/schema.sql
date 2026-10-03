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

-- Free-text note an admin updates whenever the physical package changes
-- between incoming lots even though the barcode stayed the same (e.g. box
-- got noticeably thinner) — lets receiving staff see "this lot is expected
-- to look different" instead of filing an unnecessary discrepancy report.
ALTER TABLE products ADD COLUMN IF NOT EXISTS current_lot_note text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS current_lot_updated_at timestamptz;

-- Pieces per carton, sourced from the merchant SKU export's "Carton" unit
-- conversion rule — used for warehouse packing/labeling (e.g. the box-label
-- print tool). Null means unknown, not zero.
ALTER TABLE products ADD COLUMN IF NOT EXISTS qty_per_carton integer;

-- Alternate barcodes some big offline retail chains (COM7, IT City, Jaymart,
-- AIS, OfficeMate, etc.) require printed on the package before shipment,
-- distinct from the default barcode in products.gtin. `retailer` is free
-- text (not a CHECK enum) since new chains get added over time without a
-- migration; the admin UI offers the common names as suggestions only.
CREATE TABLE IF NOT EXISTS product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL REFERENCES products (sku) ON DELETE CASCADE,
  retailer text NOT NULL,
  barcode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sku, retailer)
);

CREATE INDEX IF NOT EXISTS product_barcodes_sku_idx ON product_barcodes (sku);

-- The catalog and admin product search both do `column ILIKE '%term%'`,
-- which a plain btree index can't help with (no fixed prefix to seek on) —
-- it falls back to a full table scan on every keystroke-triggered search as
-- the table grows. pg_trgm's GIN indexes make ILIKE substring matches use an
-- index scan instead.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS products_sku_trgm_idx ON products USING gin (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_model_trgm_idx ON products USING gin (model gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_gtin_trgm_idx ON products USING gin (gtin gin_trgm_ops);

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
  -- Which choice the admin made on that upload (README's photo-intake
  -- requirement) — kept for reference, not re-derived from the image.
  background_removed boolean NOT NULL DEFAULT false,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sku, angle)
);

-- Migrating an already-created table: CREATE TABLE IF NOT EXISTS above won't
-- add a column to a table that already exists, so add it explicitly.
ALTER TABLE product_photos ADD COLUMN IF NOT EXISTS background_removed boolean NOT NULL DEFAULT false;

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

-- Packaging-supply stock (warranty/MOK stickers, pouches, hooks, tape...) with a
-- photo and a current quantity per item. `qty` is the live number; every change
-- is also appended to sticker_stock_log so "who/when/how much" stays traceable.
CREATE TABLE IF NOT EXISTS stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  detail text,
  image_url text,
  qty integer NOT NULL DEFAULT 0,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sticker_stock_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id uuid NOT NULL REFERENCES stickers (id) ON DELETE CASCADE,
  qty_before integer NOT NULL,
  qty_after integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sticker_stock_log_sticker_idx ON sticker_stock_log (sticker_id, created_at DESC);

DROP TRIGGER IF EXISTS stickers_set_updated_at ON stickers;
CREATE TRIGGER stickers_set_updated_at
  BEFORE UPDATE ON stickers
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Scan-to-pack: staff scan each unit against one branch's share of a customer PO
-- file before it goes into the carton. "Scanned" is never stored as a number —
-- it is always count(scan_events WHERE result = 'counted') per pack line, so the
-- total can't drift from the audit trail.
CREATE TABLE IF NOT EXISTS pack_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer text NOT NULL,
  source_file text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pack_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES pack_jobs (id) ON DELETE CASCADE,
  branch text NOT NULL,
  branch_name text NOT NULL DEFAULT '',
  po_number text,
  trb text,
  part text NOT NULL,
  sku text,
  description text NOT NULL DEFAULT '',
  -- Barcodes that count for this line: the customer's barcode when the PO has one,
  -- otherwise the system GTIN. `gtin` is kept only to explain a rejected scan.
  barcodes text[] NOT NULL,
  gtin text,
  qty_required integer NOT NULL CHECK (qty_required > 0)
);
CREATE INDEX IF NOT EXISTS pack_lines_job_branch_idx ON pack_lines (job_id, branch);

CREATE TABLE IF NOT EXISTS scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES pack_jobs (id) ON DELETE CASCADE,
  branch text NOT NULL,
  barcode text NOT NULL,
  pack_line_id uuid REFERENCES pack_lines (id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('counted', 'over', 'unknown', 'ambiguous')),
  scanned_by text,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  station_id text,
  clip_offset_sec numeric
);
CREATE INDEX IF NOT EXISTS scan_events_job_branch_idx ON scan_events (job_id, branch, scanned_at DESC);
CREATE INDEX IF NOT EXISTS scan_events_counted_idx ON scan_events (pack_line_id) WHERE result = 'counted';

-- A branch is closed while it has a closure row with reopened_at IS NULL.
CREATE TABLE IF NOT EXISTS branch_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES pack_jobs (id) ON DELETE CASCADE,
  branch text NOT NULL,
  closed_by text,
  closed_at timestamptz NOT NULL DEFAULT now(),
  reopened_by text,
  reopened_at timestamptz,
  reopen_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS branch_closures_one_open_idx ON branch_closures (job_id, branch) WHERE reopened_at IS NULL;

-- Evidence video recorded at the packing station: the file name (saved on the
-- station's own disk) and the second within it at which this barcode was read.
ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS video_file text;
