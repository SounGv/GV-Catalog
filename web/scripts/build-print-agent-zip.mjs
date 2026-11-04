// Builds public/tools/print-agent/gv-print-agent.zip from print-agent/ so the download can never drift from the agent source.
// Runs before `next dev` and `next build` (predev / prebuild); the zip itself is not committed.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSZip = createRequire(import.meta.url)("jszip");
const zip = new JSZip();
for (const name of ["gv-print-agent.mjs", "start-agent.bat", "README.md"]) zip.file(`gv-print-agent/${name}`, readFileSync(path.join(root, "print-agent", name)));
const out = path.join(root, "public/tools/print-agent/gv-print-agent.zip");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("print agent zip written:", path.relative(root, out));
