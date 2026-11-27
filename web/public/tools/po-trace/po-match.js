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
    // Model index: every SKU segment ("FAN-KEY-MK921-BK-BK-BR" → MK921, BK, BR …) points at its items,
    // so a customer line that only says "MK921" finds the whole MK921 family.
    const bySeg = new Map();
    for (const item of list) {
      for (const seg of skuSegments(item.sku)) {
        if (!bySeg.has(seg)) bySeg.set(seg, []);
        bySeg.get(seg).push(item);
      }
    }
    return { bySku, byCode, list, bySeg };
  }

  /* ---------- model + attribute matching ---------- */

  const COLOR_WORDS = {
    BLACK: "BLACK", BK: "BLACK", BLK: "BLACK",
    WHITE: "WHITE", WH: "WHITE", WHT: "WHITE",
    GRAY: "GRAY", GREY: "GRAY", GY: "GRAY", GRY: "GRAY",
    BLUE: "BLUE", BL: "BLUE", BLU: "BLUE",
    PINK: "PINK", PK: "PINK", PNK: "PINK",
    RED: "RED", PURPLE: "PURPLE", GREEN: "GREEN", YELLOW: "YELLOW", ORANGE: "ORANGE",
    SILVER: "SILVER", GOLD: "GOLD", BROWN: "BROWN", PR: "PURPLE",
  };
  /** Two-colour SKU segment, main colour first: WHPR → [WHITE, PURPLE], PRWH → [PURPLE, WHITE]. */
  function segColors(seg) {
    for (const cut of [2, 3]) {
      const a = COLOR_WORDS[seg.slice(0, cut)];
      const b = COLOR_WORDS[seg.slice(cut)];
      if (a && b && seg.length - cut >= 2) return [a, b];
    }
    return null;
  }
  // Words that sit before "(X-SW)" but are not a switch name: "WIRELESS (BROWN-SW)".
  const NOT_SWITCH = new Set(["WIRELESS", "MECHANICAL", "MAGNETIC", "GAMING", "KEYBOARD", "EDITION", "PRO"]);
  const COMBO_COLORS = { BLACKPINK: ["BLACK", "PINK"] };
  // Product type word in a PO line → the type segment of a Fantech SKU (FAN-<TYPE>-…).
  const TYPE_WORDS = {
    KEYBOARD: "KEY", K8: "KEY", MOUSE: "MOU", OPT: "MOU", HEADSET: "HES", SPK: "SPK", SPEAKER: "SPK",
    PAD: "PAD", MOUSEPAD: "PAD", CONTROLLER: "JOY", JOY: "JOY", MIC: "MIC", MICROPHONE: "MIC", CREATOR: "MIC",
  };
  const OCR_FIX = { GEARS: "GEAR5" };
  const UNIT = /^(\d+(M|W|Y|K|P|HZ|MAH|CM|MM|GB|TB|CH|IN|PORTS?)|V\d|\d+K\d+HZ|\d{1,4})$/;

  function skuSegments(sku) {
    return norm(sku).split(/[\s\-_/]+/).filter(Boolean);
  }

  function words(text) {
    return norm(text)
      .replace(/\b([A-Z]{1,4})-(\d{2,4})\b/g, "$1$2") // GS-203 → GS203, CM-400 → CM400
      .split(/[^0-9A-Z]+/)
      .filter(Boolean)
      .map((w) => OCR_FIX[w] || w);
  }

  /** Colour, switch and other words of a PO line or a catalog name. */
  function attrs(text) {
    let t = norm(text).replace(/&/g, " ");
    const sw = new Set();
    const order = [];
    t = t.replace(/\b([A-Z]+(?:\s+[A-Z]+)?)\s*-?\s*(?:SW|SV|SWITCH)\b/g, (_, name) => {
      const n = name.trim().split(/\s+/);
      if (n.length === 1) {
        sw.add(COLOR_WORDS[n[0]] || n[0]);
        return " ";
      }
      // two words: "WIRELESS BROWN-SW" → switch BROWN; "WHITE TARO SWITCH" → switch TARO, colour WHITE stays;
      // "BERRY FROST-SW" → switch "BERRY FROST"
      if (COLOR_WORDS[n[1]]) {
        sw.add(COLOR_WORDS[n[1]]);
        // JIB writes the named switch before its type: "TARO (BLUE-SW)" — TARO is the switch too.
        if (!COLOR_WORDS[n[0]] && !NOT_SWITCH.has(n[0])) sw.add(n[0]);
        return ` ${n[0]} `;
      }
      if (COLOR_WORDS[n[0]]) {
        sw.add(n[1]);
        return ` ${n[0]} `;
      }
      sw.add(n.join(" "));
      return " ";
    });
    const colors = new Set();
    const rest = new Set();
    for (const w of words(t)) {
      if (COMBO_COLORS[w]) COMBO_COLORS[w].forEach((c) => colors.add(c));
      else if (COLOR_WORDS[w] && w.length >= 3) {
        colors.add(COLOR_WORDS[w]);
        order.push(COLOR_WORDS[w]);
      } else rest.add(w);
    }
    return { colors, sw, rest, order };
  }

  function queryType(ws) {
    for (const w of ws) if (TYPE_WORDS[w]) return TYPE_WORDS[w];
    return "";
  }

  function scoreCandidate(q, item, modelHits) {
    const segs = skuSegments(item.sku);
    const a = attrs(item.name);
    // Colours from the name; fall back to SKU segments when the name gives none (WHPR, BKPK …).
    // When the name names a switch, the last SKU segment is that switch (…-GEAR5-WH = white switch), not a colour.
    if (!a.colors.size)
      for (const s of a.sw.size ? segs.slice(0, -1) : segs) {
        if (COLOR_WORDS[s]) a.colors.add(COLOR_WORDS[s]);
        else segColors(s)?.forEach((c) => a.colors.add(c));
      }
    // Which colour comes first matters for two-tone items (WHITE&PURPLE ≠ PURPLE-WHITE); the SKU segment is the authority.
    const pair = segs.map(segColors).find(Boolean) || (a.order.length >= 2 ? a.order : null);
    let score = 3 * modelHits;
    let conflict = false;
    // A UGREEN number is the SKU itself: a colour word that differs ("Black" vs "Alu Gray") is the
    // customer's description, not a different product.
    const numericExact = /^\d{5}[A-Z]{0,2}$/.test(item.sku) && q.models.has(norm(item.sku));
    if (q.colors.size && a.colors.size && !numericExact) {
      let hit = 0;
      for (const c of q.colors) if (a.colors.has(c)) hit++;
      if (hit) score += 2 * hit;
      else {
        score -= 2;
        conflict = true;
      }
    }
    if (pair && q.order.length >= 2 && new Set(q.order).has(pair[1])) score += q.order[0] === pair[0] ? 1.5 : -1.5;
    if (q.sw.size && a.sw.size) {
      const same = [...q.sw].some((s) => a.sw.has(s));
      if (same) score += 2;
      else {
        score -= 3;
        conflict = true;
      }
    }
    const nameWords = new Set([...words(item.name), ...segs]);
    for (const w of q.rest) if (w.length >= 3 && !UNIT.test(w) && nameWords.has(w)) score += 1;
    // SKU parts this line says nothing about (another character, colour or edition) count against it.
    for (const s of segs.slice(2)) {
      if (q.models.has(s) || q.rest.has(s)) continue;
      // OCR glues words together ("ONE PIECELUFFY"): a 4+ letter SKU part inside the squashed line still counts.
      if (s.length >= 4 && /[A-Z]{3}/.test(s) && q.compact.includes(s)) {
        score += 1;
        continue;
      }
      if (COLOR_WORDS[s]) {
        if (!q.colors.size) score -= 0.25;
        continue;
      }
      score -= 0.5;
    }
    const t = segs[0] === "FAN" ? segs[1] : "";
    if (q.type && t && q.type !== t) score -= 3;
    if (/^GIFT|KEYCAP/.test(norm(item.sku)) || /รอตั้งชื่อ/.test(item.name)) score -= 3;
    if (/!!!/.test(item.name)) score -= 1; // marked as old / discontinued in the catalog
    return { score, conflict };
  }

  function matchByModel(index, rawSku, rawName) {
    const text = `${rawName || ""}`;
    const ws = words(text);
    const models = new Set();
    const cands = new Map();
    const add = (item, hits) => cands.set(item.sku, { item, hits: Math.max(hits, cands.get(item.sku)?.hits || 0) });

    // UGREEN-style numeric model (20162, 45297C) — the SKU itself, then its packaging variants.
    for (const w of ws) {
      if (!/^\d{5}[A-Z]{0,2}$/.test(w)) continue;
      const exact = index.bySku.get(w);
      if (exact) {
        models.add(w);
        add(exact, 2);
        continue;
      }
      const family = index.list.filter((i) => norm(i.sku).startsWith(w));
      if (family.length) {
        models.add(w);
        family.forEach((i) => add(i, 1));
      }
    }
    // Letter+digit model codes (MK921, WG9RD, HG30, GS203, X16) matched against SKU segments.
    for (const w of ws) {
      if (!/[A-Z]/.test(w) || !/\d/.test(w) || UNIT.test(w) || w.length > 14) continue;
      const items = index.bySeg.get(w);
      if (!items || items.length > 60) continue;
      models.add(w);
      items.forEach((i) => add(i, 1));
    }
    // Photo OCR swaps look-alike characters (MK895 read as MK395). When no model code is found,
    // try one look-alike swap per code and keep it only if it lands on exactly one known model.
    // A guessed model is never auto-confirmed: staff check it.
    let ocrGuess = "";
    if (!cands.size) {
      const LOOK = { 3: "8", 8: "3B", B: "8", 0: "OD", O: "0", D: "0", 1: "IL", I: "1", L: "1", 5: "S", S: "5", 6: "G", G: "6", 2: "Z", Z: "2" };
      for (const w of ws) {
        if (!/[A-Z]/.test(w) || !/\d/.test(w) || UNIT.test(w) || w.length < 3 || w.length > 14) continue;
        const found = new Set();
        for (let i = 0; i < w.length; i++)
          for (const ch of LOOK[w[i]] || "") {
            const v = w.slice(0, i) + ch + w.slice(i + 1);
            if (index.bySeg.has(v) && index.bySeg.get(v).length <= 60) found.add(v);
          }
        if (found.size === 1) {
          const v = [...found][0];
          models.add(v);
          ocrGuess = `อ่านได้ ${w} น่าจะเป็น ${v}`;
          index.bySeg.get(v).forEach((i) => add(i, 1));
        }
      }
    }
    if (!cands.size) return null;

    const q = { ...attrs(text), models, type: queryType(ws), compact: norm(text).replace(/[^0-9A-Z]/g, "") };
    for (const m of models) q.rest.delete(m);
    const ranked = [...cands.values()]
      .map(({ item, hits }) => {
        // count every model code of the line this item carries (MK889PRO + AME)
        const segs = new Set(skuSegments(item.sku));
        const n = Math.max(hits, [...models].filter((m) => segs.has(m)).length);
        return { item, ...scoreCandidate(q, item, n) };
      })
      .sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const second = ranked[1];
    const margin = second ? top.score - second.score : 99;
    if (!top.conflict && margin >= 0.7 && !ocrGuess) {
      return {
        status: "model",
        conf: Math.min(0.96, 0.8 + margin / 20),
        sku: top.item.sku,
        name: top.item.name,
        reason: `รุ่น ${[...models].join(" ")}${q.colors.size ? " · สี " + [...q.colors].join("/") : ""}${q.sw.size ? " · สวิตช์ " + [...q.sw].join("/") : ""}`,
        alts: ranked.slice(1, 5).map((x) => x.item),
      };
    }
    return {
      status: "ambiguous",
      conf: 0.6,
      sku: top.conflict ? "" : top.item.sku,
      name: top.item.name,
      reason:
        (ocrGuess ? ocrGuess + " · " : "") +
        (top.conflict
          ? `รุ่น ${[...models].join(" ")} ไม่มี${q.sw.size ? " สวิตช์ " + [...q.sw].join("/") : " สี/แบบนี้"} ในแค็ตตาล็อก — เลือกเอง (ระบบจะจำรหัสนี้)`
          : `รุ่น ${[...models].join(" ")} มีหลายแบบ — ตรวจเลือก`),
      alts: ranked.slice(0, 6).map((x) => x.item),
    };
  }

  function matchLine(index, rawSku, rawName) {
    const skuKey = norm(rawSku);
    // Photo OCR reads a 1 at the end of a model code as "!" (WMCX0! → WMCX01).
    const name = String(rawName || "").replace(/([A-Z]\d*)!(?=[^!]|$)/gi, "$11").trim();
    if (skuKey && index.bySku.has(skuKey)) {
      const hit = index.bySku.get(skuKey);
      return { status: "exact", conf: 0.99, sku: hit.sku, name: hit.name, reason: "SKU ตรงกับแค็ตตาล็อก" };
    }
    if (skuKey && index.byCode.has(skuKey)) {
      const hit = index.byCode.get(skuKey);
      // A remembered customer code can be wrong (saved against the wrong model once). When the line's own
      // name clearly points at another SKU, trust the name and make staff confirm — confirming remaps the code.
      const byName = name ? matchByModel(index, rawSku, name) : null;
      const nameSkus = byName ? [byName.sku, ...(byName.alts || []).map((a) => a.sku)] : [];
      const contradicts = byName && ((byName.status === "model" && byName.sku !== hit.sku) || !nameSkus.includes(hit.sku));
      if (contradicts) {
        return {
          status: "ambiguous",
          conf: 0.6,
          sku: byName.sku,
          name: byName.name,
          reason: `รหัสลูกค้า ${rawSku} เคยผูกกับ ${hit.sku} แต่ชื่อในใบตรงกับ ${byName.sku || "รุ่นอื่น"} — ตรวจแล้วยืนยัน`,
          alts: [hit, ...(byName.alts || [])],
        };
      }
      return { status: "barcode", conf: 0.97, sku: hit.sku, name: hit.name, reason: "บาร์โค้ดลูกค้าตรงกับระบบ" };
    }
    if (name && index.bySku.has(norm(name))) {
      const hit = index.bySku.get(norm(name));
      return { status: "exact", conf: 0.95, sku: hit.sku, name: hit.name, reason: "ชื่อตรงกับ SKU ในระบบ" };
    }

    const byModel = matchByModel(index, rawSku, name);
    if (byModel) return byModel;

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
