// 주간호 본문이 그 항목의 출처 원문에 있는지 본다. 원문에서 다시 확인할 곳을 좁혀 주는 경고이고,
// 틀렸다는 뜻이 아니다. 늘 exit 0 이다. 셋을 낸다.
//
//   node scripts/check-figures.mjs content/week/2026-W40.md
//   node scripts/check-figures.mjs --cache <dir> content/week/*.md   # 받은 원문을 저장해 두고 다시 쓴다
//
// 1. 원문에서 못 찾은 수치. 항목의 출처 원문 가운데 하나에라도 같은 값이 있으면 찾은 것으로 본다. 표기는
//    값으로 맞춘다(1조 2천억 = 1.2조 = 1.2 trillion = $1.2tn, 2,000 = 2000, Twenty-two = 22). 원문 값을
//    적힌 자리에서 반올림하거나 끝자리를 버린 값도 찾은 것으로 본다(6.12% → 6.1%, 742조7573억 → 742조).
//    날짜(N월·N일)·연도(YYYY년)·시각은 3.4 절에서 따로 보므로 세지 않는다. 한 자리 수는 원문이
//    "두 명"처럼 글자로 쓰는 일이 많아 세지 않는다. 출처 여러 건의 수를 더하거나 뺀 값, 단위를 바꾼 값은
//    원문에 없으므로 늘 걸린다. 계산이 맞는지 본다.
// 2. 본문 밖에서만 찾은 것. 수치나 문장의 낱말이 원문 페이지 전체(관련기사 제목·많이 본 뉴스 포함)에는
//    있는데 기사 본문에는 없다. 그 칸들은 다른 기사다. 문장은 낱말 셋 이상(인용은 둘로 센다)이 그럴 때만
//    낸다. 2026-W15~W35 표본에서 이 기준의 오탐이 0건이었다. 본문 추출은 목록·표 안의 문장을 놓치기도 해서
//    찾았는지는 여전히 페이지 전체로 정한다. 본문이 없는 옛 캐시와 본문을 가려내지 못한 페이지는 보지 않는다.
// 3. 출처 누락 의심. 문장의 수치·낱말이 그 항목 원문에는 없고 같은 호 다른 항목의 원문 하나에 둘 이상
//    있으면 그 링크를 낸다. 그 호 원문 셋 이상에 나오는 흔한 말은 세지 않는다. 한국어 낱말은 항목 원문의
//    절반 넘게가 한국어일 때만 본다. 2026-W14~W39 에서 호당 0.7건이 걸렸고 절반이 실제로 출처가 빠졌었다.
//
// 받기는 했어도 글자가 500자보다 적은 원문은 받지 못한 것으로 친다. openai.com 은 응답은 오지만 본문을
// 스크립트로 그려 글자가 0자다.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fetchArticle } from "./article.mjs";
import { found, hasWord, itemFigures, pageText, sentences, valuesIn, weight, words } from "./figures.mjs";

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

const MIN_TEXT = 500;
const usable = (p) => p.ok && (p.text ?? "").length >= MIN_TEXT;

const key = (url) => createHash("sha1").update(url).digest("hex");
async function load(url) {
  const path = cacheDir && join(cacheDir, key(url) + ".json");
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  let r;
  try {
    // text 는 페이지 전체(all), body 는 본문만이다. 관련기사 칸은 받는 날마다 바뀌어서 받은 때를 함께 둔다.
    const a = await fetchArticle(url);
    r = { ok: true, text: a.all, body: a.body, date: a.date, fetchedAt: new Date().toISOString() };
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

// 대조에 쓰는 원문. 본문을 가려내지 못했거나(200자 이하) 옛 캐시라 본문이 없으면 body 를 null 로 둔다.
const prepared = new Map();
function prep(url) {
  if (!prepared.has(url)) {
    const p = pages.get(url);
    const body = p.body && p.body.length > 200 ? p.body : null;
    prepared.set(url, {
      url, all: pageText(p.text), allValues: valuesIn(p.text),
      body: body && pageText(body), bodyValues: body && valuesIn(body),
      ko: ((p.text.match(/[가-힣]/g) ?? []).length / p.text.length) > 0.3,
    });
  }
  return prepared.get(url);
}
const short = (s) => (s.length > 60 ? s.slice(0, 60) + "…" : s);

let total = 0, missing = 0, offFig = 0, blind = 0, offSent = 0, crossHits = 0;
for (const d of docs) {
  const lines = [];
  const issue = [...new Set(d.items.flatMap((it) => it.urls))].filter((u) => usable(pages.get(u))).map(prep);
  const common = new Map(); // 낱말이 그 호 원문 몇 건에 나오는가
  const spread = (w) => common.get(w.key) ?? common.set(w.key, issue.filter((p) => hasWord(w, p.all)).length).get(w.key);
  for (const it of d.items) {
    const got = it.urls.filter((u) => usable(pages.get(u))).map(prep);
    const empty = it.urls.filter((u) => pages.get(u).ok && !usable(pages.get(u)));
    const figs = itemFigures(it.body);
    total += figs.length;
    if (!got.length) {
      if (!figs.length) continue;
      blind += figs.length;
      const why = empty.length ? ` (빈 원문: ${empty.join(" ")})` : "";
      lines.push(`  ${it.group} ${it.title}\n    원문을 하나도 받지 못해 수치 ${figs.length}개를 확인하지 못했다${why}`);
      continue;
    }
    const out = [];
    const ctx = (f) => it.body.slice(Math.max(0, f.start - 18), f.end + 12).replace(/\s+/g, " ");

    // 1·2. 수치
    const values = valuesIn(got.map((p) => p.all.text).join("\n"));
    const bodied = got.filter((p) => p.body);
    for (const f of figs) {
      if (!found(f, it.body, values)) { missing++; out.push(`    ${f.raw.padEnd(10)} …${ctx(f)}…`); }
      else if (bodied.length === got.length && !bodied.some((p) => found(f, it.body, p.bodyValues))) {
        offFig++; out.push(`    ${f.raw.padEnd(10)} …${ctx(f)}…  (본문 밖에서만 찾음)`);
      }
    }

    // 2·3. 문장
    const koOwn = got.filter((p) => p.ko).length * 2 > got.length;
    const others = issue.filter((p) => !it.urls.includes(p.url));
    for (const s of sentences(it.body)) {
      if (bodied.length === got.length) {
        const off = words(s, { nouns: true }).filter((w) => !got.some((p) => hasWord(w, p.body)) && got.some((p) => hasWord(w, p.all)));
        if (weight(off) >= 3) { offSent++; out.push(`    본문 밖에서만 찾음: 「${short(s)}」 ← ${off.map((w) => w.text).join(", ")}`); }
      }
      const ev = new Map(); // 다른 항목 원문 → 그 원문에만 있는 증거
      const add = (p, e) => (ev.get(p) ?? ev.set(p, []).get(p)).push(e);
      for (const f of itemFigures(s)) {
        if (got.some((p) => found(f, s, p.allValues))) continue;
        for (const p of others) if (found(f, s, p.allValues)) add(p, { kind: "figure", text: f.raw });
      }
      for (const w of words(s)) {
        if (w.kind === "ko" && !koOwn) continue;
        if (got.some((p) => hasWord(w, p.all))) continue;
        const n = spread(w);
        if (n === 0 || n > 2) continue;
        for (const p of others) if (hasWord(w, p.all)) add(p, w);
      }
      const best = [...ev].sort((a, b) => weight(b[1]) - weight(a[1]))[0];
      if (best && weight(best[1]) >= 2) {
        crossHits++;
        out.push(`    출처 누락 의심 — ${best[0].url}\n      「${short(s)}」 ← ${best[1].map((w) => w.text).join(", ")}`);
      }
    }
    if (!out.length) continue;
    const note = empty.length ? `, 빈 원문 ${empty.length}건` : "";
    lines.push(`  ${it.group} ${it.title}  (원문 ${got.length}/${it.urls.length}${note})`, ...out);
  }
  if (lines.length) console.log(`== ${d.file}\n${lines.join("\n")}`);
}
console.log(`\n수치 ${total}개 중 원문에서 못 찾음 ${missing}개, 본문 밖에서만 찾음 ${offFig}개, 원문을 못 받아 확인 못 함 ${blind}개`);
console.log(`문장: 본문 밖에서만 찾음 ${offSent}개, 출처 누락 의심 ${crossHits}개`);
