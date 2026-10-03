// 주간호 본문의 수치가 그 항목의 출처 원문에 있는지 본다. 못 찾은 수치만 목록으로 낸다.
// 틀렸다는 뜻이 아니다. 원문에서 다시 확인할 곳을 좁혀 주는 경고이고, 늘 exit 0 이다.
//
//   node scripts/check-figures.mjs content/week/2026-W40.md
//   node scripts/check-figures.mjs --cache <dir> content/week/*.md   # 받은 원문을 저장해 두고 다시 쓴다
//
// 항목의 출처 원문 가운데 하나에라도 같은 값이 있으면 찾은 것으로 본다. 표기는 값으로 맞춘다
// (1조 2천억 = 1.2조 = 1.2 trillion = $1.2tn, 2,000 = 2000, Twenty-two = 22). 원문 값을 적힌 자리에서
// 반올림하거나 끝자리를 버린 값도 찾은 것으로 본다(6.12% → 6.1%, 742조7573억 → 742조).
// 날짜(N월·N일)·연도(YYYY년)·시각은 3.4 절에서 따로 보므로 세지 않는다. 한 자리 수는 원문이
// "두 명"처럼 글자로 쓰는 일이 많아 세지 않는다.
// 출처 여러 건의 수를 더하거나 뺀 값, 단위를 바꾼 값은 원문에 없으므로 늘 걸린다. 계산이 맞는지 본다.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fetchArticle } from "./article.mjs";

const args = process.argv.slice(2);
const ci = args.indexOf("--cache");
const cacheDir = ci >= 0 ? args.splice(ci, 2)[1] : null;
const files = args;
if (!files.length) {
  console.error("사용법: node scripts/check-figures.mjs [--cache <dir>] <주간호 md...>");
  process.exit(2);
}
if (cacheDir) mkdirSync(cacheDir, { recursive: true });

// ---------- 수치 읽기 ----------

const BIG = { 만: 1e4, 억: 1e8, 조: 1e12 };
const SMALL = { 천: 1e3, 백: 1e2 };
const EN = { hundred: 1e2, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const SHORT = { k: 1e3, m: 1e6, bn: 1e9, b: 1e9, tn: 1e12, t: 1e12 };
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
// 한국어 수 한 덩어리. "1천220억", "25만2천756", "1조 2천억", "3천 5백" 을 하나로 읽는다.
const KO_PART = String.raw`${NUM}(?:[천백] ?${NUM})*[천백]?`;
const KO_PHRASE = new RegExp(String.raw`${KO_PART}(?:[조억만](?: ?${KO_PART})?)*`, "g");
const EN_ATOM = new RegExp(String.raw`([$£€]\s?)?(${NUM})(?:\s?(hundred|thousand|million|billion|trillion)\b|(bn|tn|[kmbt])\b)?`, "gi");
// 법 조항의 "조". 금액이나 수량 단위가 뒤에 오지 않는 "N조" 는 조항 번호로 본다(투표권법 2조, 조약 5조).
const UNIT_AFTER = /^\s?(원|달러|엔|위안|유로|파운드|루피|개|명|배럴|톤|건|주|규모|대)/;

const num = (s) => Number(s.replace(/,/g, ""));

// 값과 적힌 자리. 적힌 자리는 마지막으로 적은 숫자의 자리다(742조 → 1조, 1조 2천억 → 1천억, 2,000 → 1).
function koValue(raw) {
  let total = 0, cur = 0, step = 1, last = 1;
  for (const [, n, small, big] of raw.matchAll(/([\d,]+(?:\.\d+)?)([천백])?|([조억만])/g)) {
    if (big) { total += (cur || 1) * BIG[big]; cur = 0; step = last * BIG[big]; last = step; }
    else {
      cur += num(n) * (SMALL[small] ?? 1);
      last = 10 ** -(n.split(".")[1]?.length ?? 0) * (SMALL[small] ?? 1);
      step = last;
    }
  }
  return { value: total + cur, step };
}

function koFigures(text) {
  return [...text.matchAll(KO_PHRASE)].map((m) => {
    const raw = m[0].trimEnd();
    const f = { start: m.index, end: m.index + raw.length, raw, digits: raw.match(/[\d.,]+/)[0], ...koValue(raw), big: /[조억만천백]/.test(raw) };
    if (/^[\d,]+조$/.test(raw) && !UNIT_AFTER.test(text.slice(f.end, f.end + 4))) {
      f.value = num(raw.slice(0, -1));
      f.step = 1;
      f.big = false;
    }
    return f;
  });
}

// $400m, £750m, 1.2bn, 1M tokens, A95B 같은 줄임 표기도 읽는다. 소문자 m·k·b·t 는 통화 기호가 붙을 때만
// 단위로 본다(136m 는 미터다).
function enFigures(text) {
  return [...text.matchAll(EN_ATOM)].map((m) => {
    const short = m[4];
    const unit = short && (m[1] || /^(bn|tn)$/i.test(short) || short === short.toUpperCase()) ? SHORT[short.toLowerCase()] : 1;
    return { value: num(m[2]) * (EN[m[3]?.toLowerCase()] ?? unit) };
  });
}

// 영어 기사는 수를 글자로 쓰기도 한다(seven million barrels, per million tokens, Twenty-two, half a million,
// five decades). 로마 숫자(Leo XIV)도 읽는다.
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const WORD = String.raw`(?:${Object.keys(TENS).join("|")})(?:-(?:${ONES.slice(1, 10).join("|")}))?|${ONES.join("|")}|a|half a`;
const EN_WORD = new RegExp(String.raw`\b(${WORD})\b(?:\s(hundred|thousand|million|billion|trillion|decades?)\b)?`, "gi");
function wordValue(w) {
  w = w.toLowerCase();
  if (w === "a") return 1;
  if (w === "half a") return 0.5;
  const [t, o] = w.split("-");
  return TENS[t] !== undefined ? TENS[t] + (o ? ONES.indexOf(o) : 0) : ONES.indexOf(t);
}
const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const roman = (r) => [...r].reduce((n, c, i) => n + (ROMAN[c] < (ROMAN[r[i + 1]] ?? 0) ? -ROMAN[c] : ROMAN[c]), 0);
const wordValues = (text) => [
  ...[...text.matchAll(EN_WORD)].map((m) => wordValue(m[1]) * (m[2] ? (EN[m[2].toLowerCase()] ?? 10) : 1)),
  ...[...text.matchAll(/\b(?:hundred|thousand|million|billion|trillion|decade)\b/gi)].map((m) => EN[m[0].toLowerCase()] ?? 10),
  ...[...text.matchAll(/\b[A-Z][a-z]+ ([IVXLC]{2,7})\b/g)].map((m) => roman(m[1])),
];

// 원문에 나온 값 전부. 한국어와 영어 표기를 둘 다 읽는다.
const valuesIn = (text) =>
  new Set([...koFigures(text).map((f) => f.value), ...enFigures(text).map((f) => f.value), ...wordValues(text)]);

// 본문에서 대조할 수치. 날짜·연도·시각·한 자리 수는 뺀다.
function itemFigures(text) {
  return koFigures(text).filter((f) => {
    const after = text.slice(f.end, f.end + 2);
    const before = text.slice(Math.max(0, f.start - 1), f.start);
    if (/^[월일]/.test(after) && !f.big) return false;
    if (/^년/.test(after) && f.value >= 1900 && f.value <= 2100) return false;
    if (/^시(?!간)/.test(after) || (/^분/.test(after) && /\d시 ?$/.test(text.slice(Math.max(0, f.start - 4), f.start)))) return false;
    if (/[\w.-]/.test(before)) return false; // 모델명·버전(GPT-5.1, A100)의 일부
    if (/[A-Za-z]\s$/.test(text.slice(Math.max(0, f.start - 2), f.start))) return false; // Opus 5.5, Gemini 3
    if (f.value < 10 && !f.big && !f.digits.includes(".") && !/^\s?%/.test(after)) return false;
    return true;
  });
}

const APPROX_BEFORE = /(약|대략|거의|최대|최소|무려)\s?$/;
// 단위를 사이에 둬도 본다(10조 원 안팎, 500건 넘게, 1300㎞ 넘게).
const APPROX_AFTER = /^(대|\s?[가-힣㎞㎜%]{0,3}\s?(가량|여|쯤|안팎|남짓|이상|이하|넘|미만|가까))/;

// 값이 같거나, 원문 값을 적힌 자리에서 반올림하거나 끝자리를 버리면 같을 때 찾은 것으로 본다
// (6.12% → 6.1%, 742조7573억 → 742조). "약·가량·넘게" 가 붙은 수는 끝의 0 을 뺀 자리로 본다(약 50 → 10 단위, 1300㎞ 넘게 → 100 단위).
function found(f, text, values) {
  if (values.has(f.value)) return true;
  const approx = APPROX_BEFORE.test(text.slice(Math.max(0, f.start - 4), f.start)) ||
    APPROX_AFTER.test(text.slice(f.end, f.end + 8));
  let step = f.step;
  if (approx) {
    while (Number.isInteger(f.value / (step * 10)) && step * 10 <= f.value) step *= 10;
  }
  const eps = step / 1e6;
  for (const v of values) {
    if (Math.abs(v - f.value) <= step / 2 + eps) return true;
    if (v >= f.value - eps && v < f.value + step - eps) return true;
  }
  return false;
}

// ---------- 발행물 읽기 ----------

function items(md) {
  const out = [];
  for (const sec of md.split(/^## /m).slice(1)) {
    const group = sec.split("\n")[0].trim();
    for (const it of sec.split(/^### /m).slice(1)) {
      const lines = it.split("\n");
      const title = lines[0].trim();
      const src = lines.find((l) => /\*\*출처\*\*/.test(l)) ?? "";
      const urls = [...src.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
      const body = [title.replace(/^\d+\.\s*/, ""), ...lines.slice(1).filter((l) => !/\*\*(날짜|출처)\*\*/.test(l))]
        .join("\n").replace(/\*\*[^*]+\*\*:\s?/g, "");
      out.push({ group, title, urls, body });
    }
  }
  return out;
}

// ---------- 원문 받기 ----------

const key = (url) => createHash("sha1").update(url).digest("hex");
async function load(url) {
  const path = cacheDir && join(cacheDir, key(url) + ".json");
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  let r;
  try {
    r = { ok: true, text: (await fetchArticle(url)).all };
  } catch (e) {
    r = { ok: false, why: e.message };
  }
  if (path) writeFileSync(path, JSON.stringify(r));
  return r;
}

// 호스트마다 셋, 전체 열둘까지 동시에 받는다. 한 언론사에 몰아 보내면 막힌다(check-links.mjs 와 같다).
async function loadAll(urls) {
  const queue = [...new Set(urls)];
  const busy = {};
  const result = new Map();
  await new Promise((done) => {
    let active = 0;
    const next = () => {
      if (!queue.length && !active) return done();
      while (active < 12) {
        const i = queue.findIndex((u) => (busy[new URL(u).host] ?? 0) < 3);
        if (i < 0) break;
        const url = queue.splice(i, 1)[0];
        const host = new URL(url).host;
        busy[host] = (busy[host] ?? 0) + 1;
        active++;
        load(url).then((r) => {
          result.set(url, r);
          busy[host]--;
          active--;
          next();
        });
      }
    };
    next();
  });
  return result;
}

// ---------- 실행 ----------

const docs = files.map((f) => ({ file: f, items: items(readFileSync(f, "utf8")) }));
const pages = await loadAll(docs.flatMap((d) => d.items.flatMap((it) => it.urls)));

let total = 0, missing = 0, blind = 0;
for (const d of docs) {
  const lines = [];
  for (const it of d.items) {
    const got = it.urls.map((u) => pages.get(u)).filter((p) => p.ok);
    const figs = itemFigures(it.body);
    if (!figs.length) continue;
    total += figs.length;
    if (!got.length) {
      blind += figs.length;
      lines.push(`  ${it.group} ${it.title}\n    원문을 하나도 받지 못해 수치 ${figs.length}개를 확인하지 못했다`);
      continue;
    }
    const values = valuesIn(got.map((p) => p.text).join("\n"));
    const miss = figs.filter((f) => !found(f, it.body, values));
    if (!miss.length) continue;
    missing += miss.length;
    const ctx = (f) => it.body.slice(Math.max(0, f.start - 18), f.end + 12).replace(/\s+/g, " ");
    lines.push(`  ${it.group} ${it.title}  (원문 ${got.length}/${it.urls.length})`);
    for (const f of miss) lines.push(`    ${f.raw.padEnd(10)} …${ctx(f)}…`);
  }
  if (lines.length) console.log(`== ${d.file}\n${lines.join("\n")}`);
}
console.log(`\n수치 ${total}개 중 원문에서 못 찾음 ${missing}개, 원문을 못 받아 확인 못 함 ${blind}개`);
