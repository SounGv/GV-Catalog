// GV print agent: lets the sticker page print straight to a label printer with the exact sticker size,
// so nothing is picked in Chrome's print dialog or in the driver's paper list.
// The page draws one row of stickers as a 1-bit picture; this program wraps it in TSPL (TSC's own language)
// and writes it to the Windows printer as RAW data. It only listens on this computer (127.0.0.1).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.GV_PRINT_PORT || 9101);
// printers this program knows how to talk to (Windows printer name -> language); others are refused so the page falls back to Chrome printing
const PRINTERS = { 'TSC TE210': 'tspl' };
const escRe = o => [...o].map(c => '.*+?^${}()|[]'.includes(c) || c === String.fromCharCode(92) ? String.fromCharCode(92) + c : c).join('');
const ORIGINS = [/^http:\/\/localhost(:\d+)?$/, /^https:\/\/gv-catalog[a-z0-9-]*\.vercel\.app$/, ...(process.env.GV_PRINT_ORIGINS || '').split(',').filter(Boolean).map(o => new RegExp('^' + escRe(o) + '$'))];
// BITMAP: some TSC firmware reads 0 as a printed dot (default), set GV_PRINT_INVERT=0 if a test print comes out inverted
const INVERT = process.env.GV_PRINT_INVERT !== '0';

const RAW_PS = `
param([string]$Printer,[string]$File)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class RawPrn {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr h, int l, [In] DOCINFO d);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
 public static string Send(string printer, byte[] bytes) {
  IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "OpenPrinter failed " + Marshal.GetLastWin32Error();
  var d = new DOCINFO(); d.pDocName = "GV sticker"; d.pDataType = "RAW";
  if (StartDocPrinter(h, 1, d) == 0) { ClosePrinter(h); return "StartDoc failed " + Marshal.GetLastWin32Error(); }
  StartPagePrinter(h); int w; bool ok = WritePrinter(h, bytes, bytes.Length, out w); EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h);
  return ok && w == bytes.Length ? "OK" : "WritePrinter failed " + Marshal.GetLastWin32Error();
 }
}
"@
Write-Output ([RawPrn]::Send($Printer, [System.IO.File]::ReadAllBytes($File)))
`;
const psFile = path.join(os.tmpdir(), 'gv-raw-print.ps1');
fs.writeFileSync(psFile, RAW_PS, 'utf8');

function sendRaw(printer, bytes) {
  const f = path.join(os.tmpdir(), `gv-job-${Date.now()}.bin`);
  fs.writeFileSync(f, bytes);
  return new Promise(resolve => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile, '-Printer', printer, '-File', f]);
    let out = ''; ps.stdout.on('data', d => out += d); ps.stderr.on('data', d => out += d);
    ps.on('close', () => { fs.rm(f, () => {}); resolve(out.trim().split(/\r?\n/).pop() || 'no answer'); });
  });
}

// The printer learns the real label length and gap (GAPDETECT) the first time a size is printed after this program starts,
// and whenever the size changes, so a roll change or a drifting sensor can't throw the rows off. GV_PRINT_AUTOCAL=0 turns it off.
const calibrated = new Map();
function tspl(job, widthMm, heightMm, gapMm, printer) {
  const key = `${printer}|${widthMm}x${heightMm}|${gapMm}`, cal = process.env.GV_PRINT_AUTOCAL !== '0' && !calibrated.has(key);
  if (cal) calibrated.set(key, Date.now());
  const parts = [Buffer.from(`SIZE ${widthMm} mm,${heightMm} mm\r\nGAP ${gapMm} mm,0 mm\r\n${cal ? 'GAPDETECT\r\n' : ''}DIRECTION 0,0\r\nREFERENCE 0,0\r\nSET TEAR ON\r\n`)];
  for (const j of job) {
    const bits = Buffer.from(j.data, 'base64'), wb = j.w / 8;
    if (j.w % 8 || bits.length !== wb * j.h) throw new Error('bad bitmap');
    if (INVERT) for (let i = 0; i < bits.length; i++) bits[i] ^= 0xff; // page sends 1 = black, TSPL wants 0 = black
    parts.push(Buffer.from(`CLS\r\nBITMAP 0,0,${wb},${j.h},0,`), bits, Buffer.from(`\r\nPRINT ${Math.max(1, Math.min(20000, j.copies | 0))},1\r\n`));
  }
  return Buffer.concat(parts);
}

const cors = (req, res) => {
  const o = req.headers.origin;
  if (o && ORIGINS.some(r => r.test(o))) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Private-Network', 'true'); // Chrome asks before an https page may call this computer
    return true;
  }
  return false;
};
const reply = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const ok = cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(ok ? 204 : 403); return res.end(); }
  if (!ok && req.headers.origin) return reply(res, 403, { error: 'origin not allowed' });
  if (req.method === 'GET' && req.url === '/ping') return reply(res, 200, { ok: true, printers: Object.keys(PRINTERS) });
  if (req.method === 'POST' && req.url === '/print') {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 30e6) req.destroy(); else chunks.push(c); });
    req.on('end', async () => {
      try {
        const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!PRINTERS[b.printer]) return reply(res, 400, { error: `ยังไม่รองรับเครื่อง ${b.printer}` });
        const w = Number(b.widthMm), h = Number(b.heightMm), g = Number(b.gapMm);
        if (!(w > 10 && w < 120 && h > 5 && h < 120 && g >= 0 && g < 10) || !Array.isArray(b.jobs) || !b.jobs.length) return reply(res, 400, { error: 'bad job' });
        const result = await sendRaw(b.printer, tspl(b.jobs, w, h, g, b.printer));
        console.log(new Date().toLocaleTimeString(), b.printer, `${w}x${h} gap ${g}`, b.jobs.reduce((a, j) => a + j.copies, 0), 'rows ->', result);
        reply(res, result === 'OK' ? 200 : 500, { result });
      } catch (e) { reply(res, 400, { error: String(e.message || e) }); }
    });
    return;
  }
  reply(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log(`GV print agent ready on http://127.0.0.1:${PORT} · printers: ${Object.keys(PRINTERS).join(', ')}`));
