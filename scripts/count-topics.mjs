// 사안별 보도량을 센다. 사안 묶기는 사람이 정규식으로 하고, 세기는 이 도구가 한다.
// 정기 발행과 백필이 같은 셈을 쓰게 한다. RUNBOOK_WEEKLY 2절·4절 참고.
//
//   node scripts/count-topics.mjs /tmp/<WEEK> <사안정의.json> [--detail] [--exclude <정규식>]
//
// 입력 폴더는 collect-headlines 출력(front.md, domestic.md, world.md, aimedia.md)이다.
// 사안 정의는 JSON 배열이다. pattern·exclude 는 제목에 거는 정규식(대소문자 무시)이다.
//   [{ "field": "korea|world|ai", "topic": "사안 이름", "pattern": "정규식", "exclude": "선택" }]
// .tsv 도 받는다(사안<TAB>정규식[<TAB>제외], 분야는 korea). 실험 data 의 topics.tsv 형식이다.
//
// 출력(stdout)은 selection.json 에 그대로 옮길 수 있는 분야별 목록이다. 큰 순서로 정렬한다.
// korea  days·outlets = 1면(front)에 실린 날 수·신문 수. 창은 수집기가 정해 front.md 에 담은 그대로다.
//        click = [날, 곳] 네이버 랭킹(domestic). yna = 신문 없는 날 연합 주요뉴스에 걸린 건수(참고).
//        articles = 1면 기사 수(참고).
// world  outlets = (날짜, 매체) 쌍의 수 — 해외 보도량 그 자체다. Wikipedia 항목은 인용 URL 의
//        도메인마다, Guardian 은 기사 수와 관계없이 하루 1곳이다. 위키가 인용한 Guardian 도
//        같은 날이면 한 쌍이다. days = 걸린 날 수. media = 서로 다른 매체 수, articles = 걸린 항목 수(참고).
// ai     days·outlets = aimedia 에 걸린 날 수·매체 수. articles = 기사 수(참고).
// --detail 은 사안마다 걸린 제목을 stderr 로 낸다(F 1면, Y 연합, C 클릭, W 위키, G Guardian, A 매체).
// 오탐은 정의의 exclude 나 --exclude(모든 사안에 적용)로 뺀다.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 헤드라인 파일 하나를 항목 목록으로 바꾼다. 파일 안의 "# <소스>" 머리가 소스를 정하고,
// 없으면 fallback(파일 이름)을 쓴다. 항목: { source, kind, day, outlet, title, urls }
export function parseHeadlines(text, fallback) {
  const out = [];
  let source = fallback;
  let day = null;
  let group = null;
  let last = null;
  for (const line of text.split("\n")) {
    let m;
    if ((m = line.match(/^# (\w+)\s*$/))) {
      source = m[1];
      day = group = last = null;
    } else if ((m = line.match(/^## (\d{4}-\d\d-\d\d)/))) {
      day = m[1];
      group = last = null;
    } else if (line.startsWith("### ")) {
      group = line.slice(4).trim();
      last = null;
    } else if (line.startsWith("- ") && group) {
      const it = itemOf(source, day, group, line.slice(2).trim());
      if (it) out.push((last = it));
      else last = null;
    } else if (last && /^\s+https?:\/\//.test(line)) {
      last.urls.push(line.trim());
    }
  }
  return out;
}

function itemOf(source, day, group, title) {
  const g = group.match(/^(\d{4}-\d\d-\d\d)\b(?:\s*\([^)]*\))?\s*·\s*(.+)$/);
  const base = { source, title, urls: [] };
  if (source === "domestic") return day ? { ...base, kind: "click", day, outlet: group } : null;
  if (!g) return null;
  const [, d, rest] = g;
  if (source === "front") {
    if (/연합뉴스 주요뉴스/.test(rest)) return { ...base, kind: "yna", day: d, outlet: "연합뉴스" };
    return { ...base, kind: "front", day: d, outlet: rest.replace(/\s*A1$/, "") };
  }
  if (source === "world") {
    if (rest === "The Guardian") return { ...base, kind: "guardian", day: d, outlet: "theguardian.com" };
    return { ...base, kind: "wiki", day: d, outlet: null };
  }
  if (source === "aimedia") return { ...base, kind: "aimedia", day: d, outlet: rest };
  return null;
}

// 인용 URL 의 매체 이름. www·edition 같은 머리를 떼고 등록 도메인만 남긴다.
export function outletOf(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const parts = host.split(".");
  const n = /^(co|com|org|net|gov|ac|or|ne|go)$/.test(parts.at(-2) ?? "") && parts.at(-1).length === 2 ? 3 : 2;
  return parts.slice(-n).join(".");
}

// 사안 정의 파일을 읽는다. JSON 배열, 또는 실험 형식의 TSV.
export function parseDefs(text, name = "") {
  const defs = name.endsWith(".tsv")
    ? text.split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => {
        const [topic, pattern, exclude] = l.split("\t");
        return { field: "korea", topic: topic.trim(), pattern: pattern?.trim(), exclude: exclude?.trim() || undefined };
      })
    : JSON.parse(text);
  if (!Array.isArray(defs)) throw new Error("사안 정의는 배열이어야 한다");
  for (const d of defs) {
    if (!["korea", "world", "ai"].includes(d.field)) throw new Error(`"${d.topic}" 의 field 가 korea|world|ai 가 아니다`);
    if (!d.topic || !d.pattern) throw new Error(`topic 과 pattern 이 필요하다: ${JSON.stringify(d)}`);
  }
  return defs;
}

const KINDS = { korea: ["front", "yna", "click"], world: ["wiki", "guardian"], ai: ["aimedia"] };
const size = (field, t) => (field === "korea" ? [t.outlets, t.days, t.click[1], t.click[0]] : [t.outlets, t.days]);

// 사안마다 센다. 반환: { result: { korea, world, ai }, hits: [{ field, topic, items }] }
export function countTopics(items, defs, { exclude } = {}) {
  const global = exclude ? new RegExp(exclude, "i") : null;
  const result = { korea: [], world: [], ai: [] };
  const hits = [];
  for (const d of defs) {
    const re = new RegExp(d.pattern, "i");
    const ex = d.exclude ? new RegExp(d.exclude, "i") : null;
    // The Verge 사이트맵은 같은 기사를 한 날에 두 번 싣기도 한다. 같은 날·매체·제목은 한 건이다.
    const seen = new Set();
    const hit = items.filter((i) => {
      if (!KINDS[d.field].includes(i.kind) || !re.test(i.title) || ex?.test(i.title) || global?.test(i.title)) return false;
      const key = `${i.kind}\t${i.day}\t${i.outlet}\t${i.title}`;
      return !seen.has(key) && seen.add(key);
    });
    hits.push({ field: d.field, topic: d.topic, items: hit });
    const of = (kind) => hit.filter((i) => i.kind === kind);
    const distinct = (list, key) => new Set(list.map(key)).size;
    if (d.field === "korea") {
      const f = of("front"), c = of("click");
      result.korea.push({
        topic: d.topic,
        days: distinct(f, (i) => i.day),
        outlets: distinct(f, (i) => i.outlet),
        click: [distinct(c, (i) => i.day), distinct(c, (i) => i.outlet)],
        yna: of("yna").length,
        articles: f.length,
      });
    } else if (d.field === "world") {
      const pairs = new Set();
      for (const i of hit) {
        const names = i.kind === "guardian" ? [i.outlet] : i.urls.map(outletOf).filter(Boolean);
        for (const o of names) pairs.add(`${i.day}\t${o}`);
      }
      result.world.push({
        topic: d.topic,
        days: distinct(hit, (i) => i.day),
        outlets: pairs.size,
        media: new Set([...pairs].map((p) => p.split("\t")[1])).size,
        articles: hit.length,
      });
    } else {
      result.ai.push({ topic: d.topic, days: distinct(hit, (i) => i.day), outlets: distinct(hit, (i) => i.outlet), articles: hit.length });
    }
  }
  for (const [field, list] of Object.entries(result))
    list.sort((a, b) => {
      const x = size(field, a), y = size(field, b);
      const k = x.findIndex((v, j) => v !== y[j]);
      return k < 0 ? 0 : y[k] - x[k];
    });
  return { result, hits };
}

const MARK = { front: "F", yna: "Y", click: "C", wiki: "W", guardian: "G", aimedia: "A" };
export function formatDetail(hits) {
  const order = Object.keys(MARK);
  return hits
    .map(({ field, topic, items }) => {
      const lines = [...items]
        .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.day.localeCompare(b.day))
        .map((i) => {
          const who = i.kind === "wiki" ? [...new Set(i.urls.map(outletOf).filter(Boolean))].join(",") || "(인용 없음)" : i.outlet;
          return `  ${MARK[i.kind]} ${i.day.slice(5).replace("-", "")} ${who} ${i.title}`;
        });
      return [`## ${field} ${topic} (${items.length}건)`, ...lines].join("\n");
    })
    .join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ei = args.indexOf("--exclude");
  const exclude = ei >= 0 ? args[ei + 1] : undefined;
  const [dir, defsFile] = args.filter((a, i) => !a.startsWith("--") && !(ei >= 0 && i === ei + 1));
  if (!dir || !defsFile) {
    console.error("usage: node scripts/count-topics.mjs /tmp/<WEEK> <사안정의.json|.tsv> [--detail] [--exclude <정규식>]");
    process.exit(1);
  }
  const items = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => parseHeadlines(readFileSync(join(dir, f), "utf8"), f.replace(/\.md$/, "")));
  const defs = parseDefs(readFileSync(defsFile, "utf8"), defsFile);
  // 셀 원천이 없으면 0 으로 나온다. 0 을 '보도 없음'으로 읽지 않게 알린다.
  const need = { front: "korea", click: "korea", wiki: "world", aimedia: "ai" };
  for (const [kind, field] of Object.entries(need))
    if (defs.some((d) => d.field === field) && !items.some((i) => i.kind === kind))
      console.error(`경고: ${dir} 에 ${kind} 항목이 없다. ${field} 의 그 값은 0 으로 나온다.`);
  const { result, hits } = countTopics(items, defs, { exclude });
  if (args.includes("--detail")) console.error(formatDetail(hits));
  // 사안 하나를 한 줄로 낸다. selection.json 에 줄째 옮기기 쉽다.
  const block = (list) => (list.length ? `[\n${list.map((t) => `  ${JSON.stringify(t)}`).join(",\n")}\n ]` : "[]");
  console.log(`{\n${Object.entries(result).map(([f, l]) => ` "${f}": ${block(l)}`).join(",\n")}\n}`);
}
