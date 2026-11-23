/**
 * Match customer packing-list / PO lines to GV Catalog SKUs.
 * Customer codes and names often differ from ours — try SKU, GTIN,
 * retailer barcodes, then fuzzy name tokens.
 */
(function (global) {
  const STOP = new Set(["AND", "OR", "THE", "WITH", "FOR", "PCS", "PC", "SET", "USB", "TYPE", "CABLE", "BLACK", "WHITE", "สี", "รุ่น", "สินค้า"]);

  function norm(v) {
    return String(v || "")
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[–—]/g, "-")
      .replace(/[^0-9A-Zก-๙\s\-_/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(v) {
    return new Set(
      norm(v)
        .split(/[\s\-_/\.]+/)
        .filter((t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t)),
    );
  }

  function tokenScore(a, b) {
    const A = tokens(a);
    const B = tokens(b);
    if (!A.size || !B.size) return 0;
    let hit = 0;
    for (const t of A) if (B.has(t)) hit++;
    return (2 * hit) / (A.size + B.size);
  }

  function buildIndex(rows) {
    const bySku = new Map();
    const byCode = new Map();
    const list = [];
    for (const r of rows || []) {
      const sku = String(r.sku || "").trim();
      if (!sku) continue;
      const item = {
        sku,
        name: String(r.name || "").trim(),
        brand: String(r.brand || "").trim(),
        gtin: String(r.gtin || "").trim(),
        retailerBarcodes: r.retailerBarcodes || {},
      };
      bySku.set(norm(sku), item);
      list.push(item);
      const codes = [item.gtin, ...Object.values(item.retailerBarcodes)];
      for (const c of codes) {
        const k = norm(c);
        if (k) byCode.set(k, item);
      }
    }
    return { bySku, byCode, list };
  }

  function matchLine(index, rawSku, rawName) {
    const skuKey = norm(rawSku);
    const name = String(rawName || "").trim();
    if (skuKey && index.bySku.has(skuKey)) {
      const hit = index.bySku.get(skuKey);
      return { status: "exact", conf: 0.99, sku: hit.sku, name: hit.name, reason: "SKU ตรงกับแค็ตตาล็อก" };
    }
    if (skuKey && index.byCode.has(skuKey)) {
      const hit = index.byCode.get(skuKey);
      return { status: "barcode", conf: 0.97, sku: hit.sku, name: hit.name, reason: "บาร์โค้ดลูกค้าตรงกับระบบ" };
    }
    if (name && index.bySku.has(norm(name))) {
      const hit = index.bySku.get(norm(name));
      return { status: "exact", conf: 0.95, sku: hit.sku, name: hit.name, reason: "ชื่อตรงกับ SKU ในระบบ" };
    }

    const query = `${rawSku || ""} ${name}`.trim();
    if (!query) return { status: "none", conf: 0, sku: "", name: name || rawSku || "", reason: "ไม่มีข้อความให้จับคู่", alts: [] };

    let best = [];
    for (const item of index.list) {
      let score = Math.max(tokenScore(query, item.name), tokenScore(query, item.sku), tokenScore(query, `${item.brand} ${item.name}`));
      if (skuKey && norm(item.name).includes(skuKey)) score = Math.max(score, 0.82);
      if (skuKey && norm(item.sku).includes(skuKey) && skuKey.length >= 4) score = Math.max(score, 0.88);
      if (score >= 0.45) best.push({ score, item });
    }
    best.sort((a, b) => b.score - a.score);
    best = best.slice(0, 5);
    if (!best.length) return { status: "none", conf: 0.2, sku: "", name: name || rawSku || "", reason: "ไม่พบในแค็ตตาล็อก — เลือกเอง", alts: [] };

    const top = best[0];
    const second = best[1]?.score || 0;
    if (top.score >= 0.78 && top.score - second >= 0.08) {
      return {
        status: "fuzzy",
        conf: Math.min(0.93, 0.55 + top.score * 0.4),
        sku: top.item.sku,
        name: top.item.name,
        reason: `จับคู่ชื่อใกล้เคียง (${Math.round(top.score * 100)}%)`,
        alts: best.slice(1).map((x) => x.item),
      };
    }
    return {
      status: "ambiguous",
      conf: Math.min(0.75, top.score),
      sku: top.item.sku,
      name: top.item.name,
      reason: "ใกล้เคียงหลายรุ่น — ตรวจเลือก",
      alts: best.map((x) => x.item),
    };
  }

  /** Turn OCR / plain text into rough packing-list lines. */
  function parseTextLines(text) {
    const lines = [];
    const raw = String(text || "")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (const line of raw) {
      if (/^(no\.?|item|#|sku|รหัส|รายการ|product|description|qty|จำนวน)/i.test(line) && line.length < 40) continue;
      if (/^(page|หน้า|total|รวม|grand)/i.test(line)) continue;

      // e.g. "1 ABC-123 Product name .... 12" or "SKU123 ชื่อสินค้า 10"
      let m = line.match(/^(\d{1,3})[.)\s]+(.+?)\s+(\d{1,5})\s*$/);
      if (!m) m = line.match(/^([A-Z0-9][A-Z0-9._\-\/]{2,})\s+(.+?)\s+(\d{1,5})\s*$/i);
      if (!m) m = line.match(/^(.+?)\s+[xX×]\s*(\d{1,5})\s*$/);
      if (m) {
        if (m.length === 4 && /^\d{1,3}$/.test(m[1])) {
          const mid = m[2].trim();
          const skuHit = mid.match(/^([A-Z0-9][A-Z0-9._\-\/]{2,})\s+(.+)$/i);
          lines.push({
            sku: skuHit ? skuHit[1] : "",
            name: skuHit ? skuHit[2] : mid,
            qty: Number(m[3]) || 1,
            conf: 0.7,
          });
        } else if (m.length === 4) {
          lines.push({ sku: m[1], name: m[2], qty: Number(m[3]) || 1, conf: 0.72 });
        } else {
          lines.push({ sku: "", name: m[1], qty: Number(m[2]) || 1, conf: 0.65 });
        }
        continue;
      }

      const qtyOnly = line.match(/(.+?)\s+(\d{1,4})\s*(?:ชิ้น|pcs|pc|ea)?$/i);
      const code = line.match(/\b([A-Z]{1,6}[-_]?\d{3,}[A-Z0-9_-]*|\d{8,14})\b/i);
      if (qtyOnly && (code || qtyOnly[1].length >= 8)) {
        lines.push({
          sku: code ? code[1] : "",
          name: qtyOnly[1].replace(code ? code[0] : "", "").trim() || qtyOnly[1],
          qty: Number(qtyOnly[2]) || 1,
          conf: 0.6,
        });
      }
    }

    // Dedupe near-identical rows
    const seen = new Set();
    return lines.filter((l) => {
      const k = `${norm(l.sku)}|${norm(l.name)}|${l.qty}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 80);
  }

  function enrichLines(index, lines) {
    return (lines || []).map((line) => {
      const hit = matchLine(index, line.sku, line.name);
      return {
        customerSku: line.sku || "",
        customerName: line.name || line.sku || "",
        qty: Number(line.qty) > 0 ? Number(line.qty) : 1,
        sku: hit.sku || "",
        name: hit.name || line.name || line.sku || "",
        conf: hit.conf || line.conf || 0.5,
        matchStatus: hit.status,
        matchReason: hit.reason || "",
        alts: hit.alts || [],
      };
    });
  }

  global.PoMatch = { buildIndex, matchLine, parseTextLines, enrichLines, norm };
})(window);
