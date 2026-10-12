// 주간호 하나의 국내 항목 순서를 바꾼다. 번호가 바뀌어 링크가 다른 항목을 가리키는 일을 막는다.
//
//   node scripts/renumber-week.mjs <WEEK> <새 순서> [--dry-run] [--world]
//   node scripts/renumber-week.mjs 2026-W17 5,1,4,2,3 --dry-run
//
// 새 순서는 옛 번호를 새 자리 순으로 적는다. 5,1,4,2,3 은 새 1번이 옛 5번이라는 뜻이다.
// 1. content/week/<WEEK>.md 의 "## 국내" 와 content/en/week/<WEEK>.md 의 "## Korea" 에서
//    "### N. 제목" 묶음의 순서를 바꾸고 번호를 1부터 다시 단다. 다른 구획은 손대지 않는다.
// 2. content/ 아래 모든 원고에서 그 주의 국내 앵커를 가리키는 링크
//    ([W17 국내 3](../../week/2026-W17/#korea-3), [W17 Korea 3](...)) 의 앵커 번호와 링크 글자의
//    번호를 함께 고친다. 다른 주, 해외(#world-)·AI(#ai-) 링크는 그대로다.
// 3. data/runs/<WEEK>.json 의 selection.korea 에서 rank 가 있는 항목의 rank 를 새 순위로 바꾸고
//    원래 순위를 rank_was 에 둔다(이미 있으면 두어서 다시 돌려도 처음 순위가 남는다). replaces 는
//    옛 순위를 가리키는 기록이라 그대로 둔다.
// 4. 고친 한국어 원고에 영문판이 있으면 영문판 source 를 새 원본 해시로 바꾼다. 해시는
//    en-fill.mjs·build-checks.mjs 와 같은 식(원본 파일 바이트의 sha256 앞 12자리)이다.
//    원래부터 source 가 원본과 맞지 않던 영문판은 그대로 두고 알린다(이미 밀린 번역을 덮지 않는다).
// --dry-run 은 바꿀 내용만 보이고 쓰지 않는다. 바뀐 링크마다 "파일: 링크 글자 → 가리키는 제목"을
// 찍어 사람이 글자·앵커·제목이 맞는지 볼 수 있게 한다.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// 기본은 국내다. 명령줄의 --world 는 해외 항목에 같은 일을 한다.
let SECTION = { ko: "국내", en: "Korea" };
let GROUP_WORD = /(국내|Korea) (\d+)$/;
let KEY = "korea";
export function useSection(key) {
  if (key === "world") [SECTION, GROUP_WORD, KEY] = [{ ko: "해외", en: "World" }, /(해외|World) (\d+)$/, "world"];
  else [SECTION, GROUP_WORD, KEY] = [{ ko: "국내", en: "Korea" }, /(국내|Korea) (\d+)$/, "korea"];
}

// en-fill.mjs·build-checks.mjs 와 같은 원본 지문.
export const sourceHash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);

// "5,1,4,2,3" → [5,1,4,2,3]. 1..n 이 한 번씩 있어야 한다.
export function parseOrder(text, n) {
  const order = String(text).split(",").map((s) => s.trim());
  if (!order.every((s) => /^\d+$/.test(s))) throw new Error(`순서는 쉼표로 나눈 숫자다: ${text}`);
  const nums = order.map(Number);
  if (n !== undefined && nums.length !== n) throw new Error(`순서의 수(${nums.length})가 국내 항목 수(${n})와 다르다`);
  const sorted = [...nums].sort((a, b) => a - b);
  if (!sorted.every((v, i) => v === i + 1)) throw new Error(`순서는 1..${nums.length} 이 한 번씩이어야 한다: ${text}`);
  return nums;
}

// 원고에서 구획 하나를 찾아 [앞, 머리말, 묶음들, 뒤] 로 나눈다. 묶음은 "### N. 제목" 부터다.
export function splitSection(text, name) {
  const lines = text.split(/(?<=\n)/);
  const start = lines.findIndex((l) => l.replace(/\n$/, "").trimEnd() === `## ${name}`);
  if (start < 0) throw new Error(`"## ${name}" 구획이 없다`);
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end);
  const blocks = [];
  let pre = [];
  for (const l of body) {
    if (/^### /.test(l)) blocks.push([l]);
    else if (blocks.length) blocks.at(-1).push(l);
    else pre.push(l);
  }
  const items = blocks.map((b) => {
    const m = b[0].match(/^### (\d+)\.\s*(.*?)\s*$/);
    if (!m) throw new Error(`"## ${name}" 의 소제목 형식이 "### N. 제목" 이 아니다: ${b[0].trim()}`);
    return { num: Number(m[1]), title: m[2], text: b.join("") };
  });
  items.forEach((it, i) => {
    if (it.num !== i + 1) throw new Error(`"## ${name}" 의 번호가 1부터 차례가 아니다(${i + 1}번 자리에 ${it.num})`);
  });
  return {
    before: lines.slice(0, start + 1).join(""),
    pre: pre.join(""),
    items,
    after: lines.slice(end).join(""),
  };
}

// 구획의 묶음 순서를 바꾼다. 묶음 사이의 빈 줄은 자리에 붙어 있으므로 새 자리의 것을 쓴다.
export function reorderSection(text, name, order) {
  const s = splitSection(text, name);
  if (order.length !== s.items.length) throw new Error(`"## ${name}" 항목 수(${s.items.length})가 순서의 수(${order.length})와 다르다`);
  const core = (t) => t.replace(/\n+$/, "");
  const tail = (t) => t.slice(core(t).length);
  const out = order.map((old, i) => {
    const it = s.items[old - 1];
    const body = core(it.text).replace(/^### \d+\./, `### ${i + 1}.`);
    return body + tail(s.items[i].text);
  });
  return { text: s.before + s.pre + out.join("") + s.after, titles: s.items.map((it) => it.title) };
}

// 그 주의 국내 앵커를 가리키는 링크를 찾는다. self 면 같은 원고 안의 "](#korea-N)" 도 본다.
function linkRe(week, self) {
  const w = week.replace(/[-]/g, "\\-");
  // ../../week/2026-W17/ (분기호·연간호), ../2026-W17/ (다른 주간호) 를 모두 받는다.
  const path = `(?:[^)\\s]*\\/)?${w}\\/?`;
  return new RegExp(`\\[([^\\]]*)\\]\\((${self ? `(?:${path})?` : path})#${KEY}-(\\d+)\\)`, "g");
}

// 링크를 새 번호로 고친다. 고친 링크와 고치지 않은(번호가 같은) 링크를 함께 돌려준다.
export function rewriteLinks(text, week, newOf, { self = false } = {}) {
  const links = [];
  const out = text.replace(linkRe(week, self), (whole, label, path, n) => {
    const oldN = Number(n), newN = newOf[oldN];
    if (newN === undefined) {
      links.push({ label, oldN, newN: oldN, newLabel: label, changed: false, warn: `#${KEY}-${oldN} 은 없는 항목이다` });
      return whole;
    }
    const m = label.match(GROUP_WORD);
    let newLabel = label, warn;
    if (m && Number(m[2]) === oldN) newLabel = label.replace(GROUP_WORD, `${m[1]} ${newN}`);
    else warn = `링크 글자 "${label}" 에 앵커와 같은 번호(국내/Korea ${oldN})가 없어 글자는 그대로 둔다`;
    const changed = newN !== oldN || newLabel !== label;
    links.push({ label, oldN, newN, newLabel, changed, warn, old: whole, now: `[${newLabel}](${path}#${KEY}-${newN})` });
    return `[${newLabel}](${path}#${KEY}-${newN})`;
  });
  return { text: out, links };
}

// selection.korea 의 rank 를 바꾼다. 바뀐 것이 없으면 null.
export function rerankRun(raw, newOf) {
  const data = JSON.parse(raw);
  const korea = data.selection?.[KEY];
  if (!Array.isArray(korea)) return { text: null, changes: [] };
  if (Object.entries(newOf).every(([o, n]) => Number(o) === n)) return { text: null, changes: [] };
  const changes = [];
  const items = korea.map((it) => {
    if (typeof it.rank !== "number") return it;
    const newRank = newOf[it.rank];
    if (newRank === undefined) throw new Error(`run 기록의 rank ${it.rank} 가 국내 항목 수를 넘는다`);
    // rank 바로 뒤에 rank_was 를 둔다. 이미 있으면 처음 순위를 지킨다.
    const out = {};
    for (const [k, v] of Object.entries(it)) {
      if (k === "rank_was") continue;
      out[k] = k === "rank" ? newRank : v;
      if (k === "rank") out.rank_was = "rank_was" in it ? it.rank_was : it.rank;
    }
    changes.push({ topic: it.topic, from: it.rank, to: newRank, rank_was: out.rank_was });
    return out;
  });
  data.selection[KEY] = items;
  const text = JSON.stringify(data, null, 2) + "\n";
  return { text: text === raw ? null : text, changes };
}

function mdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? mdFiles(join(dir, e.name)) : e.name.endsWith(".md") ? [join(dir, e.name)] : []);
}

// 계획을 세운다(쓰지 않는다). writes 는 경로 → 새 내용이다.
export function planRenumber({ root, week, orderText }) {
  if (!/^\d{4}-W\d{2}$/.test(week)) throw new Error(`주 형식은 2026-W17 이다: ${week}`);
  const content = join(root, "content");
  const koPath = join(content, "week", `${week}.md`), enPath = join(content, "en", "week", `${week}.md`);
  if (!existsSync(koPath)) throw new Error(`${relative(root, koPath)} 가 없다`);
  const hasEn = existsSync(enPath);
  const original = new Map();
  const read = (p) => {
    if (!original.has(p)) original.set(p, readFileSync(p, "utf8"));
    return original.get(p);
  };

  const koItems = splitSection(read(koPath), SECTION.ko).items;
  const enItems = hasEn ? splitSection(read(enPath), SECTION.en).items : null;
  if (enItems && enItems.length !== koItems.length)
    throw new Error(`국내 항목 수가 한·영 원고에서 다르다(한 ${koItems.length}, 영 ${enItems.length})`);
  const order = parseOrder(orderText, koItems.length);
  const newOf = Object.fromEntries(order.map((old, i) => [old, i + 1]));

  const next = new Map();
  next.set(koPath, reorderSection(read(koPath), SECTION.ko, order).text);
  if (hasEn) next.set(enPath, reorderSection(read(enPath), SECTION.en, order).text);

  // 전 제목은 원래 원고에서, 후 제목은 순서를 바꾼 새 원고를 다시 읽어서 찾는다.
  const newKo = splitSection(next.get(koPath), SECTION.ko).items;
  const newEn = hasEn ? splitSection(next.get(enPath), SECTION.en).items : null;
  const titleOf = (file, n, when) => {
    const en = file.startsWith(join(content, "en") + "/");
    const items = when === "before" ? (en ? enItems : koItems) : (en ? newEn : newKo);
    return items?.[n - 1]?.title ?? "?";
  };

  const links = [];
  const ownFiles = new Set([koPath, enPath]);
  for (const file of mdFiles(content)) {
    const cur = next.get(file) ?? read(file);
    const r = rewriteLinks(cur, week, newOf, { self: ownFiles.has(file) });
    if (!r.links.length) continue;
    for (const l of r.links)
      links.push({ ...l, file: relative(root, file), before: titleOf(file, l.oldN, "before"), after: titleOf(file, l.newN, "after") });
    if (r.text !== cur) next.set(file, r.text);
  }

  // 영문판 source. 고친 한국어 원고마다 짝 영문판을 본다.
  const hashes = [], warnings = links.filter((l) => l.warn).map((l) => `${l.file}: ${l.warn}`);
  for (const [file, text] of [...next]) {
    const rel = relative(content, file);
    if (rel.startsWith("en/") || text === read(file)) continue;
    const en = join(content, "en", rel);
    if (!existsSync(en)) continue;
    const enText = next.get(en) ?? read(en);
    const m = enText.match(/^---\n[\s\S]*?^source: *(\S*) *$/m);
    const was = sourceHash(Buffer.from(read(file))), now = sourceHash(Buffer.from(text));
    if (!m) { warnings.push(`${relative(root, en)}: 프론트매터에 source 가 없어 그대로 둔다`); continue; }
    if (m[1] !== was) { warnings.push(`${relative(root, en)}: source(${m[1]})가 원래부터 원본(${was})과 달라 그대로 둔다. 번역을 맞춘 뒤 ${now} 로 바꾼다`); continue; }
    next.set(en, enText.replace(/^source: *\S* *$/m, `source: ${now}`));
    hashes.push({ file: relative(root, en), from: was, to: now });
  }

  const runPath = join(root, "data", "runs", `${week}.json`);
  let ranks = [];
  if (existsSync(runPath)) {
    const r = rerankRun(read(runPath), newOf);
    ranks = r.changes;
    if (r.text) next.set(runPath, r.text);
  } else warnings.push(`${relative(root, runPath)} 가 없어 순위 기록은 건너뛴다`);

  const writes = new Map([...next].filter(([p, t]) => t !== read(p)));
  return { week, order, koItems, enItems, links, hashes, ranks, warnings, writes };
}

export function report(plan, { dryRun, root }) {
  const out = [];
  const { order, koItems, enItems } = plan;
  out.push(`${plan.week} ${SECTION.ko} 새 순서${dryRun ? " (dry-run, 쓰지 않음)" : ""}:`);
  order.forEach((old, i) =>
    out.push(`  ${i + 1}. ← 옛 ${old}. ${koItems[old - 1].title}${enItems ? ` / ${enItems[old - 1].title}` : ""}`));
  const changed = plan.links.filter((l) => l.changed), same = plan.links.filter((l) => !l.changed);
  out.push(`\n링크: 고침 ${changed.length}, 그대로 ${same.length}`);
  for (const l of changed) {
    out.push(`  ${l.file}: ${l.old} → ${l.now}`);
    out.push(`    가리키는 항목: 전 "${l.before}" / 후 "${l.after}"${l.before === l.after ? "" : "  ← 다름!"}`);
  }
  out.push(`\n확인 (고친 뒤 링크 글자 → 가리키는 제목):`);
  for (const l of plan.links) out.push(`  ${l.file}: ${l.newLabel} → ${l.after}${l.changed ? "" : " (그대로)"}`);
  if (plan.ranks.length) {
    out.push(`\n순위 기록 (data/runs/${plan.week}.json):`);
    for (const r of plan.ranks) out.push(`  rank ${r.from} → ${r.to} (rank_was ${r.rank_was}) ${r.topic}`);
  }
  for (const h of plan.hashes) out.push(`\n${h.file}: source ${h.from} → ${h.to}`);
  if (plan.warnings.length) out.push(`\n경고:\n  ${plan.warnings.join("\n  ")}`);
  out.push(`\n${dryRun ? "바뀔" : "바꾼"} 파일 ${plan.writes.size}개${plan.writes.size ? ":\n  " + [...plan.writes.keys()].map((p) => relative(root, p)).join("\n  ") : ""}`);
  return out.join("\n");
}

export function renumberWeek({ root, week, orderText, dryRun = false }) {
  const plan = planRenumber({ root, week, orderText });
  if (!dryRun) for (const [p, t] of plan.writes) writeFileSync(p, t);
  return { plan, text: report(plan, { dryRun, root }) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  if (args.includes("--world")) useSection("world");
  const [week, orderText] = args.filter((a) => !a.startsWith("--"));
  if (!week || !orderText) {
    console.error("사용법: node scripts/renumber-week.mjs <WEEK> <새 순서, 예: 5,1,4,2,3> [--dry-run] [--world]");
    process.exit(1);
  }
  try {
    console.log(renumberWeek({ root: fileURLToPath(new URL("..", import.meta.url)), week, orderText, dryRun }).text);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
