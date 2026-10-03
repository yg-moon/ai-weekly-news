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
import { found, itemFigures, valuesIn } from "./figures.mjs";

const args = process.argv.slice(2);
const ci = args.indexOf("--cache");
const cacheDir = ci >= 0 ? args.splice(ci, 2)[1] : null;
const files = args;
if (!files.length) {
  console.error("사용법: node scripts/check-figures.mjs [--cache <dir>] <주간호 md...>");
  process.exit(2);
}
if (cacheDir) mkdirSync(cacheDir, { recursive: true });

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
