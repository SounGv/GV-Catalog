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

  const JUNK_LINE =
    /(เครดิต|credit\s*\(?\s*day|ผู้สั่ง|ผู้ขอ|อ้างอิง|สถานที่จัดส่ง|supplier|gadget\s*villa|purchase\s*request|รายการสั่งซื้อ|ราคารวม|จำนวนเงิน|ก่อนvat|หลังvat|unit\s*price|grand\s*total|หน้า\s*\d|page\s*\d)/i;

  function isJunkName(name) {
    const n = String(name || "").trim();
    if (!n) return true;
    if (JUNK_LINE.test(n)) return true;
    if (/^(วัน|qty|จำนวน|รหัส|รายการ|product|description)$/i.test(n)) return true;
    if (n.length < 3) return true;
    // Pure money / date fragments
    if (/^[\d,.\s]+$/.test(n) && n.includes(",")) return true;
    return false;
  }

  function looksLikePrice(n) {
    const s = String(n);
    if (/^\d{1,3}(,\d{3})+(\.\d{2})?$/.test(s)) return true;
    if (/^\d+\.\d{2}$/.test(s) && Number(s) > 20) return true;
    return false;
  }

  function extractMeta(text) {
    const t = String(text || "");
    const po =
      (t.match(/\b(PR\d{8,})\b/i) || t.match(/\b(PO[-_]?\d{5,})\b/i) || t.match(/\b(QS\d{8,})\b/i) || [])[1] ||
      "";
    const date =
      (t.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/) || t.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/) || [])[1] ||
      "";
    let customer = "";
    if (/j\.?i\.?b|เจ\.?\s*ไอ\.?\s*บี|jib\s*computer/i.test(t)) customer = "JIB";
    else if (/jaymart/i.test(t)) customer = "Jaymart";
    else if (/it\s*city/i.test(t)) customer = "IT City";
    else if (/\bPR\d{8,}\b/i.test(t)) customer = "JIB"; // JIB PR forms commonly use PR########
    return { po: po.toUpperCase(), due: date, customer };
  }

  /**
   * JIB / similar PR photos: product code is often a 9–12 digit number
   * above or beside the English description; qty is a small integer, not a price.
   */
  function isModelFragmentQty(num, around) {
    // "2-Y", "2-SW", years like 2026
    if (Number(num) >= 1900 && Number(num) <= 2100) return true;
    if (new RegExp(String.raw`\b${num}\s*-\s*[A-Za-z]`, "i").test(around)) return true;
    if (new RegExp(String.raw`\b${num}\s*Y\b`, "i").test(around)) return true;
    return false;
  }

  function pickQty(after, sku) {
    const s = String(after || "");
    // Best: name … QTY then a money column
    let m = s.match(/([A-Za-z][\w\-\/\(\)\s.,]{6,}?)\s+(\d{1,4})\s+(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})\b/);
    if (m && !isModelFragmentQty(m[2], m[0]) && Number(m[2]) >= 1 && Number(m[2]) <= 5000) {
      return { name: m[1].replace(/\s+/g, " ").trim(), qty: Number(m[2]) };
    }
    // Next: strip money, then take last plausible integer
    const noMoney = s.replace(/\d{1,3}(?:,\d{3})+(?:\.\d{2})?/g, " ").replace(/\b\d+\.\d{2}\b/g, " ");
    const ints = [...noMoney.matchAll(/\b(\d{1,4})\b/g)].map((x) => ({ n: Number(x[1]), idx: x.index, raw: x[0] }));
    for (let i = ints.length - 1; i >= 0; i--) {
      const { n, idx } = ints[i];
      if (n === Number(sku)) continue;
      if (n < 1 || n > 5000) continue;
      if (isModelFragmentQty(n, noMoney.slice(Math.max(0, idx - 4), idx + 8))) continue;
      if (n === 60 && /เครดิต|credit/i.test(s) && !/[A-Z]{4,}/.test(s)) continue;
      const name = noMoney
        .slice(0, idx)
        .replace(/^\s*[-:.)]+\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
      return { name, qty: n };
    }
    return null;
  }

  function parseCodeBlocks(text) {
    const flat = String(text || "").replace(/\r/g, "\n");
    const lines = [];
    // Include following line(s) when OCR splits code and description
    const re = /\b(\d{9,12})\b([\s\S]{0,220}?)(?=\b\d{9,12}\b|$)/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(flat))) {
      const sku = m[1];
      if (seen.has(sku)) continue;
      if (/^0\d+/.test(sku)) continue;

      let after = m[2] || "";
      // Stop before footer totals
      after = after.split(/\n(?=จำนวนสั่งรวม|จำนวนเงิน|grand\s*total)/i)[0];
      const window = flat.slice(Math.max(0, m.index - 30), m.index + Math.min(m[0].length, 260));
      if (JUNK_LINE.test(window) && !/[A-Z]{4,}/.test(after)) continue;

      const picked = pickQty(after, sku);
      let name = picked?.name || "";
      let qty = picked?.qty || 0;

      if (!name) {
        name = after
          .replace(/^\s*[-:.)]+\s*/, "")
          .replace(/\s+\d{1,3}(?:,\d{3})+(?:\.\d{2})?.*$/gm, "")
          .replace(/\s+\d+\.\d{2}.*$/gm, "")
          .replace(/\s+/g, " ")
          .trim();
      }
      if (!name || isJunkName(name)) {
        if (!/^10\d{8}$/.test(sku) && !/^1\d{9,11}$/.test(sku)) continue;
        name = sku;
      }
      name = name.replace(new RegExp(`^${sku}\\s*`), "").trim() || name;
      if (!qty) qty = 1;
      if (isJunkName(name) && qty === 60) continue;

      seen.add(sku);
      lines.push({ sku, name, qty, conf: /[A-Z]{3,}/.test(name) ? 0.9 : 0.72 });
    }
    return lines;
  }

  /** Turn OCR / plain text into rough packing-list lines. */
  function parseTextLines(text) {
    const fromCodes = parseCodeBlocks(text);
    if (fromCodes.length >= 1) {
      // If we found real product-looking rows, prefer them
      const good = fromCodes.filter((l) => /[A-Za-z]{3,}/.test(l.name) || /^10\d{8}$/.test(l.sku));
      if (good.length) return good.slice(0, 80);
    }

    const lines = [];
    const raw = String(text || "")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (const line of raw) {
      if (isJunkName(line)) continue;
      if (/^(no\.?|item|#|sku|รหัส|รายการ|product|description|qty|จำนวน)/i.test(line) && line.length < 40) continue;
      if (/^(page|หน้า|total|รวม|grand)/i.test(line)) continue;

      let m = line.match(/^(\d{1,3})[.)\s]+(.+?)\s+(\d{1,5})\s*$/);
      if (!m) m = line.match(/^([A-Z0-9][A-Z0-9._\-\/]{2,})\s+(.+?)\s+(\d{1,5})\s*$/i);
      if (!m) m = line.match(/^(.+?)\s+[xX×]\s*(\d{1,5})\s*$/);
      if (m) {
        if (m.length === 4 && /^\d{1,3}$/.test(m[1])) {
          const mid = m[2].trim();
          if (isJunkName(mid)) continue;
          const skuHit = mid.match(/^([A-Z0-9][A-Z0-9._\-\/]{2,})\s+(.+)$/i);
          const qty = Number(m[3]) || 1;
          if (looksLikePrice(m[3])) continue;
          lines.push({
            sku: skuHit ? skuHit[1] : "",
            name: skuHit ? skuHit[2] : mid,
            qty,
            conf: 0.7,
          });
        } else if (m.length === 4) {
          if (isJunkName(m[2]) || looksLikePrice(m[3])) continue;
          lines.push({ sku: m[1], name: m[2], qty: Number(m[3]) || 1, conf: 0.72 });
        } else {
          if (isJunkName(m[1]) || looksLikePrice(m[2])) continue;
          lines.push({ sku: "", name: m[1], qty: Number(m[2]) || 1, conf: 0.65 });
        }
        continue;
      }

      const qtyOnly = line.match(/(.+?)\s+(\d{1,4})\s*(?:ชิ้น|pcs|pc|ea)?$/i);
      const code = line.match(/\b([A-Z]{1,6}[-_]?\d{3,}[A-Z0-9_-]*|\d{8,14})\b/i);
      if (qtyOnly && (code || qtyOnly[1].length >= 8)) {
        if (isJunkName(qtyOnly[1]) || looksLikePrice(qtyOnly[2])) continue;
        lines.push({
          sku: code ? code[1] : "",
          name: qtyOnly[1].replace(code ? code[0] : "", "").trim() || qtyOnly[1],
          qty: Number(qtyOnly[2]) || 1,
          conf: 0.6,
        });
      }
    }

    function looksLikeProduct(l) {
      if (/^\d{9,12}$/.test(String(l.sku || ""))) return true;
      const words = String(l.name || "").match(/[A-Za-z]{3,}/g) || [];
      return words.length >= 2;
    }

    const seen = new Set();
    const merged = [...fromCodes, ...lines].filter((l) => {
      if (isJunkName(l.name) && !l.sku) return false;
      if (!looksLikeProduct(l)) return false;
      const k = `${norm(l.sku)}|${norm(l.name)}|${l.qty}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return merged.slice(0, 80);
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

  global.PoMatch = { buildIndex, matchLine, parseTextLines, enrichLines, extractMeta, norm, isJunkName };
})(window);
