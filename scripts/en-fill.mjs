// 영문 원고를 마무리한다. node scripts/en-fill.mjs <week|quarter|year> <ID>
// 1. 출처·근거 줄 자리(SRC, BASIS)를 한국어 원본의 줄로 채운다. 한국 매체는 영문 이름으로,
//    근거 링크 이름의 분야는 영문으로 바꾼다(W35 국내 3 → W35 Korea 3).
// 2. 링크 주소 밖의 곧은 따옴표를 둥근 따옴표로 바꾼다.
// 3. 프론트매터의 source 를 한국어 원본의 sha256 앞 12자리로 쓴다.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { OUTLETS_EN } from "./outlets-en.mjs";

const [kind, id] = process.argv.slice(2);
if (!["week", "quarter", "year"].includes(kind) || !id) {
  console.error("사용법: node scripts/en-fill.mjs <week|quarter|year> <ID>");
  process.exit(1);
}
const koPath = `content/${kind}/${id}.md`, enPath = `content/en/${kind}/${id}.md`;
const koRaw = readFileSync(koPath);
let en = readFileSync(enPath, "utf8");

const lines = koRaw.toString().split("\n").filter((l) => /^- \*\*(출처|근거)\*\*: /.test(l))
  .map((l) => l.replace(/^- \*\*[^*]+\*\*: /, "")
    .replace(/\[([^\]]+)\]/g, (_, t) => `[${OUTLETS_EN[t] ?? t.replace("국내", "Korea").replace("해외", "World")}]`));
const slots = (en.match(/\b(SRC|BASIS)\b/g) ?? []).length;
if (slots !== lines.length) {
  console.error(`자리 수(${slots})가 원본의 출처·근거 줄 수(${lines.length})와 다르다`);
  process.exit(1);
}
for (const l of lines) en = en.replace(/\b(SRC|BASIS)\b/, () => l);

const curl = (text) => text.split(/(\]\([^)]*\))/).map((part) => part.startsWith("](") ? part
  : part.replace(/(^|[\s(\[—–-])"/g, "$1“").replace(/"/g, "”").replace(/'/g, "’")).join("");
const m = en.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!m) { console.error("프론트매터가 없다"); process.exit(1); }
const hash = createHash("sha256").update(koRaw).digest("hex").slice(0, 12);
const head = /^source:/m.test(m[1]) ? m[1].replace(/^source:.*$/m, `source: ${hash}`) : `${m[1]}\nsource: ${hash}`;
writeFileSync(enPath, `---\n${head}\n---\n${curl(m[2])}`);
console.log(`${enPath}: 출처·근거 ${lines.length}줄, source ${hash}`);
