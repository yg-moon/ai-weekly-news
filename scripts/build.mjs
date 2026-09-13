// content/week/*.md → site/
// 프론트매터는 평면 key: value 만 지원한다. 그 이상이 필요해지면 그때 파서를 바꾼다.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { marked } from "marked";

const ROOT = new URL("..", import.meta.url).pathname;
const CONTENT = join(ROOT, "content", "week");
const SITE = join(ROOT, "site");

const SITE_TITLE = "ai-weekly-news";
const SITE_TAGLINE = "지난 한 주에 실제로 있었던 일을 국내·해외·AI 각 5건으로 정리합니다.";
const REPO_URL = "https://github.com/yg-moon/ai-weekly-news";

// ---------- 파싱 ----------

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("frontmatter 가 없다");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

function loadWeeks() {
  return readdirSync(CONTENT)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { meta, body } = parseFrontmatter(readFileSync(join(CONTENT, f), "utf8"));
      const week = basename(f, ".md");
      if (meta.week !== week) throw new Error(`${f}: 파일명과 frontmatter week 가 다르다`);
      return { week, meta, body };
    })
    .sort((a, b) => (a.week < b.week ? 1 : -1)); // 최신순
}

// ---------- 표기 ----------

function koDate(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
}

function period(meta) {
  return `${koDate(meta.period_start)}–${koDate(meta.period_end)}`;
}

function counts(meta) {
  return `국내 ${meta.domestic} · 해외 ${meta.world} · AI ${meta.ai}`;
}

function pageTitle(w) {
  return `${w.week} 주간 브리핑 (${period(w.meta)})`;
}

// ---------- 레이아웃 ----------

const CSS = `
  :root { --bg:#fbfbfa; --surface:#fff; --text:#1a1a19; --muted:#6b6b66; --line:#e4e4e0; --accent:#1f5f4f; --radius:10px; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#17181a; --surface:#1f2023; --text:#ececeb; --muted:#9a9a95; --line:#313236; --accent:#6fbfa5; }
  }
  * { box-sizing:border-box; }
  body { margin:0; padding-block:2.5rem 4rem; padding-inline:20px; background:var(--bg); color:var(--text);
    font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;
    font-size:16px; line-height:1.75; -webkit-text-size-adjust:100%; word-break:keep-all; overflow-wrap:anywhere; }
  .wrap { max-width:42rem; margin:0 auto; }
  a { color:var(--accent); }
  header.site { border-bottom:1px solid var(--line); padding-bottom:1.5rem; margin-bottom:2rem; }
  header.site h1 { margin:0 0 .4rem; font-size:1.5rem; letter-spacing:-.02em; }
  header.site h1 a { color:inherit; text-decoration:none; }
  .tagline { margin:0 0 .75rem; color:var(--muted); }
  .badges { margin:0; display:flex; flex-wrap:wrap; gap:.4rem .6rem; }
  .badge { display:inline-block; padding:.1rem .55rem; border-radius:999px; border:1px solid var(--line); background:var(--surface); font-size:.75rem; color:var(--muted); white-space:nowrap; }
  .crumb { font-size:.875rem; color:var(--muted); margin:0 0 1.25rem; }
  .crumb a { text-decoration:none; }
  article h1 { font-size:1.35rem; letter-spacing:-.02em; margin:0 0 .25rem; }
  article .meta { color:var(--muted); font-size:.875rem; margin:0 0 2rem; }
  article h2 { font-size:1.15rem; margin:2.75rem 0 1rem; padding-bottom:.4rem; border-bottom:2px solid var(--accent); display:inline-block; }
  article h3 { font-size:1.02rem; margin:2rem 0 .6rem; line-height:1.5; }
  article ul { padding-left:1.1rem; margin:0 0 1rem; }
  article li { margin:.35rem 0; }
  article li strong { color:var(--text); }
  article p { margin:0 0 1rem; }
  article blockquote { margin:1.25rem 0; padding:.75rem 1rem; border-left:3px solid var(--line); background:var(--surface); color:var(--muted); font-size:.925rem; border-radius:0 var(--radius) var(--radius) 0; }
  article blockquote p { margin:0; }
  article code { font-size:.9em; background:var(--surface); border:1px solid var(--line); padding:0 .3em; border-radius:4px; }
  h2.list { font-size:1.05rem; margin:2rem 0 1rem; }
  .archive { list-style:none; margin:0; padding:0; }
  .archive li { border-bottom:1px solid var(--line); }
  .archive a { display:flex; flex-wrap:wrap; gap:.25rem .75rem; align-items:baseline; padding:.85rem .25rem; text-decoration:none; color:inherit; }
  .archive a:hover { background:var(--surface); }
  .archive .wk { font-weight:600; font-variant-numeric:tabular-nums; }
  .archive .period, .archive .counts { color:var(--muted); font-size:.875rem; }
  .archive .counts { margin-left:auto; }
  .empty { padding:1.5rem; border:1px dashed var(--line); border-radius:var(--radius); color:var(--muted); background:var(--surface); }
  footer { margin-top:3rem; padding-top:1.5rem; border-top:1px solid var(--line); font-size:.875rem; color:var(--muted); }
`;

function layout({ title, description, root, body }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="site">
  <h1><a href="${root}">${SITE_TITLE}</a></h1>
  <p class="tagline">${SITE_TAGLINE}</p>
  <p class="badges">
    <span class="badge">매주 월요일 오전 발행 (KST)</span>
    <span class="badge">AI 수집·요약 · 사람 검수</span>
  </p>
</header>
${body}
<footer>
  <p>최신 속보가 아니라 완결된 주간의 정리입니다. 주의 경계는 ISO 8601(월~일)을 따릅니다.<br>
  <a href="${REPO_URL}">GitHub 저장소</a></p>
</footer>
</div>
</body>
</html>
`;
}

function renderWeek(w) {
  const body = `
<p class="crumb"><a href="../../">← 전체 목록</a></p>
<article>
  <h1>${pageTitle(w)}</h1>
  <p class="meta">${counts(w.meta)} · ${koDate(w.meta.published)} 발행</p>
  ${marked.parse(w.body)}
</article>`;
  return layout({
    title: `${pageTitle(w)} — ${SITE_TITLE}`,
    description: `${w.week} (${period(w.meta)}) 주간 브리핑. ${counts(w.meta)}.`,
    root: "../../",
    body,
  });
}

function renderIndex(weeks) {
  const list = weeks.length
    ? `<ul class="archive">${weeks
        .map(
          (w) => `
  <li><a href="week/${w.week}/">
    <span class="wk">${w.week}</span>
    <span class="period">${period(w.meta)}</span>
    <span class="counts">${counts(w.meta)}</span>
  </a></li>`
        )
        .join("")}
</ul>`
    : `<div class="empty"><p>아직 발행된 주간호가 없습니다.</p></div>`;
  return layout({
    title: `${SITE_TITLE} — 주간 뉴스 브리핑`,
    description: SITE_TAGLINE,
    root: "./",
    body: `<h2 class="list">주간호</h2>\n${list}`,
  });
}

// ---------- 실행 ----------

const weeks = loadWeeks();
rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
writeFileSync(join(SITE, "index.html"), renderIndex(weeks));
for (const w of weeks) {
  const dir = join(SITE, "week", w.week);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderWeek(w));
}
console.log(`built ${weeks.length} week(s): ${weeks.map((w) => w.week).join(", ")}`);
