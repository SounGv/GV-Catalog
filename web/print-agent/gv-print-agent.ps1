# GV print agent (Windows PowerShell, nothing to install): same job as gv-print-agent.mjs.
# The sticker / carton-label page draws each label as a 1-bit picture and posts it to http://127.0.0.1:9101/print;
# this script wraps it in TSPL with the exact label SIZE and GAP, so every job (also the first label after the paper
# was torn off) starts on the label edge, and writes it to the Windows printer as RAW data. Listens on this computer only.
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$Port = if ($env:GV_PRINT_PORT) { [int]$env:GV_PRINT_PORT } else { 9101 }
$Printers = @{ 'TSC TE210' = 'tspl' }
$Direction = '1,0'   # a real test print on the TSC TE210 came out turned 180 degrees with 0,0
$Invert = $true      # page sends 1 = black, TSPL BITMAP wants 0 = black
$OriginOk = { param($o) $o -match '^http://localhost(:\d+)?$' -or $o -match '^https://gv-catalog[a-z0-9-]*\.vercel\.app$' }

Add-Type -AssemblyName System.Web.Extensions
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class GvRawPrn {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr h, int l, [In] DOCINFO d);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
 public static void Invert(byte[] b) { for (int i = 0; i < b.Length; i++) b[i] ^= 0xff; }
 public static string Send(string printer, byte[] bytes) {
  IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "OpenPrinter failed " + Marshal.GetLastWin32Error();
  var d = new DOCINFO(); d.pDocName = "GV sticker"; d.pDataType = "RAW";
  if (StartDocPrinter(h, 1, d) == 0) { ClosePrinter(h); return "StartDoc failed " + Marshal.GetLastWin32Error(); }
  StartPagePrinter(h); int w; bool ok = WritePrinter(h, bytes, bytes.Length, out w); EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h);
  return ok && w == bytes.Length ? "OK" : "WritePrinter failed " + Marshal.GetLastWin32Error();
 }
}
"@

# Start with Windows: put a shortcut to GV-Print.bat in this user's Startup folder (once).
try {
  $bat = Join-Path $PSScriptRoot 'GV-Print.bat'
  $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'GV print agent.lnk'
  if (-not $env:GV_PRINT_DRYRUN -and (Test-Path $bat) -and -not (Test-Path $lnk)) {
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    $s.TargetPath = $bat; $s.WorkingDirectory = $PSScriptRoot; $s.WindowStyle = 7; $s.Save()
    Write-Host 'ตั้งให้เปิดเองทุกครั้งที่เปิดคอมแล้ว (ลบได้ที่ shell:startup)'
  }
} catch { Write-Host "ตั้งเปิดอัตโนมัติไม่สำเร็จ: $_" }

$json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = [int]::MaxValue
$enc = [Text.Encoding]::ASCII
$calibrated = @{}

function Build-Tspl($jobs, $w, $h, $g, $printer) {
  $key = "$printer|${w}x$h|$g"; $cal = -not $calibrated.ContainsKey($key); $calibrated[$key] = $true
  $ms = New-Object IO.MemoryStream
  $head = "SIZE $w mm,$h mm`r`nGAP $g mm,0 mm`r`n" + $(if ($cal) { "GAPDETECT`r`n" } else { '' }) + "DIRECTION $Direction`r`nREFERENCE 0,0`r`nSET TEAR ON`r`n"
  $b = $enc.GetBytes($head); $ms.Write($b, 0, $b.Length)
  foreach ($j in $jobs) {
    $bits = [Convert]::FromBase64String([string]$j['data']); $jw = [int]$j['w']; $jh = [int]$j['h']; $wb = $jw / 8
    if ($jw % 8 -or $bits.Length -ne $wb * $jh) { throw 'bad bitmap' }
    if ($Invert) { [GvRawPrn]::Invert($bits) }
    $copies = [Math]::Max(1, [Math]::Min(20000, [int]$j['copies']))
    $b = $enc.GetBytes("CLS`r`nBITMAP 0,0,$wb,$jh,0,"); $ms.Write($b, 0, $b.Length)
    $ms.Write($bits, 0, $bits.Length)
    $b = $enc.GetBytes("`r`nPRINT $copies,1`r`n"); $ms.Write($b, 0, $b.Length)
  }
  return $ms.ToArray()
}

function Send-Reply($stream, $code, $headers, $body) {
  $text = @{ 200 = 'OK'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 500 = 'Server Error' }[$code]
  $bytes = if ($body -ne $null) { [Text.Encoding]::UTF8.GetBytes($body) } else { [byte[]]@() }
  $h = "HTTP/1.1 $code $text`r`nConnection: close`r`nContent-Length: $($bytes.Length)`r`n"
  if ($body -ne $null) { $h += "Content-Type: application/json; charset=utf-8`r`n" }
  foreach ($k in $headers.Keys) { $h += "${k}: $($headers[$k])`r`n" }
  $hb = $enc.GetBytes($h + "`r`n"); $stream.Write($hb, 0, $hb.Length)
  if ($bytes.Length) { $stream.Write($bytes, 0, $bytes.Length) }
}

$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } catch { Write-Host "เปิดพอร์ต $Port ไม่ได้ — โปรแกรมพิมพ์ GV อาจเปิดอยู่แล้วในอีกหน้าต่าง"; exit 1 }
Write-Host "GV print agent ready on http://127.0.0.1:$Port · printers: $($Printers.Keys -join ', ')"
Write-Host 'เปิดหน้าต่างนี้ค้างไว้ตอนพิมพ์'

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 15000
    $s = $client.GetStream()
    # headers
    $hdr = New-Object IO.MemoryStream; $last4 = 0
    while ($true) { $c = $s.ReadByte(); if ($c -lt 0) { break }; $hdr.WriteByte([byte]$c); $last4 = (($last4 -shl 8) -bor $c) -band 0xFFFFFFFF; if ($last4 -eq 0x0D0A0D0A -or $hdr.Length -gt 65536) { break } }
    $lines = $enc.GetString($hdr.ToArray()) -split "`r`n"
    $method, $url = ($lines[0] -split ' ')[0, 1]
    $H = @{}; foreach ($l in $lines[1..($lines.Length - 1)]) { $i = $l.IndexOf(':'); if ($i -gt 0) { $H[$l.Substring(0, $i).Trim().ToLower()] = $l.Substring($i + 1).Trim() } }
    $origin = $H['origin']; $ok = $origin -and (& $OriginOk $origin)
    $cors = @{}
    if ($ok) { $cors = @{ 'Access-Control-Allow-Origin' = $origin; 'Vary' = 'Origin'; 'Access-Control-Allow-Headers' = 'content-type'; 'Access-Control-Allow-Methods' = 'GET,POST,OPTIONS'; 'Access-Control-Allow-Private-Network' = 'true' } }
    if ($method -eq 'OPTIONS') { Send-Reply $s $(if ($ok) { 204 } else { 403 }) $cors $null }
    elseif ($origin -and -not $ok) { Send-Reply $s 403 @{} '{"error":"origin not allowed"}' }
    elseif ($method -eq 'GET' -and $url -eq '/ping') { Send-Reply $s 200 $cors ('{"ok":true,"printers":' + $json.Serialize(@($Printers.Keys)) + '}') }
    elseif ($method -eq 'POST' -and $url -eq '/print') {
      $len = [int]$H['content-length']
      if ($len -le 0 -or $len -gt 80000000) { Send-Reply $s 400 $cors '{"error":"bad job"}' }
      else {
        $buf = New-Object byte[] $len; $got = 0
        while ($got -lt $len) { $n = $s.Read($buf, $got, $len - $got); if ($n -le 0) { break }; $got += $n }
        try {
          $b = $json.DeserializeObject([Text.Encoding]::UTF8.GetString($buf, 0, $got))
          $pr = [string]$b['printer']; $w = [double]$b['widthMm']; $h = [double]$b['heightMm']; $g = [double]$b['gapMm']; $jobs = @($b['jobs'])
          if (-not $Printers.ContainsKey($pr)) { Send-Reply $s 400 $cors ($json.Serialize(@{ error = "ยังไม่รองรับเครื่อง $pr" })) }
          elseif (-not ($w -gt 10 -and $w -lt 120 -and $h -gt 5 -and $h -le 200 -and $g -ge 0 -and $g -lt 10) -or -not $jobs.Count) { Send-Reply $s 400 $cors '{"error":"bad job"}' }
          else {
            $data = Build-Tspl $jobs $w $h $g $pr
            # GV_PRINT_DRYRUN=<file>: write the TSPL to that file instead of the printer (testing)
            $result = if ($env:GV_PRINT_DRYRUN) { [IO.File]::WriteAllBytes($env:GV_PRINT_DRYRUN, $data); 'OK' } else { [GvRawPrn]::Send($pr, $data) }
            $n = 0; foreach ($j in $jobs) { $n += [int]$j['copies'] }
            Write-Host "$(Get-Date -Format HH:mm:ss) $pr ${w}x$h gap $g · $n ใบ -> $result"
            Send-Reply $s $(if ($result -eq 'OK') { 200 } else { 500 }) $cors ($json.Serialize(@{ result = $result }))
          }
        } catch { Send-Reply $s 400 $cors ($json.Serialize(@{ error = "$($_.Exception.Message)" })) }
      }
    }
    else { Send-Reply $s 404 $cors '{"error":"not found"}' }
  } catch { Write-Host "error: $_" } finally { $client.Close() }
}
