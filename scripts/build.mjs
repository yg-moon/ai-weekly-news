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
const FOOTER_NOTE =
  "최신 속보가 아니라 완결된 주간의 정리입니다. 한 주의 범위는 월요일부터 일요일까지입니다.";
const FOOTER_LIMIT =
  "수집과 요약은 AI가 합니다. 사람이 개별 항목을 일일이 검증하지는 않으므로, 각 항목의 출처 링크로 확인해 주세요.";

const GROUPS = { 국내: "home", 해외: "world", AI: "ai" };
const GROUP_NAMES = Object.keys(GROUPS);

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
      return { week, meta, body, n: sectionCounts(body) };
    })
    .sort((a, b) => (a.week < b.week ? 1 : -1)); // 최신순
}

// 건수는 본문에서 센다. 프론트매터에 적어 두면 본문과 어긋나도 아무도 모른다.
function sectionCounts(body) {
  const out = {};
  for (const chunk of body.split(/^## /m).slice(1)) {
    out[chunk.split("\n")[0].trim()] = (chunk.match(/^### /gm) ?? []).length;
  }
  return out;
}

// ---------- 표기 ----------

const koDate = (iso) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
};
const period = (meta) => `${koDate(meta.period_start)}–${koDate(meta.period_end)}`;
const counts = (w) => GROUP_NAMES.map((g) => `${g} ${w.n[g] ?? 0}`).join(" · ");
// 각 분야 5건이 표준이다. 표준이면 건수를 화면에서 반복하지 않고, 어긋날 때만 드러낸다.
const isStandard = (w) => GROUP_NAMES.every((g) => w.n[g] === 5);
const pageTitle = (w) => `${w.week} 주간 브리핑 (${period(w.meta)})`;
// 화면에서는 기간을 다음 줄로 내린다. 한 줄에 두면 좁은 화면에서 어중간하게 잘린다.
const pageTitleHtml = (w) =>
  `${w.week} 주간 브리핑<span class="period">${period(w.meta)}</span>`;

// ---------- 본문 구조화 ----------
// marked 가 낸 h3 + ul 을 항목 블록으로 바꾼다. 라벨을 화면에서 없애고
// 날짜는 칩으로, "왜 중요한가"는 강조 블록으로, 출처는 각주로 보낸다.

// 한 필드 안의 빈 줄은 문단 경계다. marked 는 그것을 </p><p> 로 낸다.
// 긴 본문을 한 덩어리로 두지 않기 위한 것이며, 나머지 필드는 보통 한 문단이다.
function paragraphs(html) {
  return html
    .replace(/^<p>/, "")
    .replace(/<\/p>$/, "")
    .split(/<\/p>\s*<p>/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildItem(num, title, listHtml) {
  const fields = {};
  // 목록에 빈 줄이 있으면 marked 가 각 <li> 안을 <p> 로 감싼다. 양쪽을 다 받는다.
  const re =
    /<li>\s*(?:<p>)?\s*<strong>(날짜|무슨 일|왜 중요한가|출처)<\/strong>\s*:?\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/g;
  let m;
  while ((m = re.exec(listHtml))) fields[m[1]] = paragraphs(m[2].trim());

  // 알려진 라벨이 하나도 없으면 원본을 그대로 둔다.
  if (!Object.keys(fields).length) return null;

  const ps = (key) => fields[key].map((t) => `<p>${t}</p>`).join("");
  const parts = [
    `<div class="item-head"><span class="num">${num}</span><h3>${title}</h3></div>`,
  ];
  if (fields["날짜"]) parts.push(`<p class="when">${fields["날짜"].join(" ")}</p>`);
  if (fields["무슨 일"]) parts.push(`<div class="what">${ps("무슨 일")}</div>`);
  if (fields["왜 중요한가"])
    parts.push(`<div class="why"><p class="lbl">왜 중요한가</p>${ps("왜 중요한가")}</div>`);
  if (fields["출처"])
    parts.push(`<p class="src"><span class="lbl">출처</span>${fields["출처"].join(" ")}</p>`);

  return `<article class="item">${parts.join("")}</article>`;
}

function structure(html) {
  // 1) 항목: <h3>N. 제목</h3> + 바로 뒤 <ul>
  html = html.replace(
    /<h3[^>]*>\s*(\d+)\.\s*([\s\S]*?)<\/h3>\s*<ul>([\s\S]*?)<\/ul>/g,
    (whole, num, title, list) => buildItem(num, title.trim(), list) ?? whole
  );

  // 2) 분야: <h2>국내</h2> 부터 다음 <h2> 직전까지를 section 으로 감싼다
  const chunks = html.split(/(?=<h2[^>]*>)/);
  return chunks
    .map((chunk) => {
      const m = chunk.match(/^<h2[^>]*>\s*([\s\S]*?)<\/h2>/);
      if (!m) return chunk;
      const name = m[1].trim();
      const slug = GROUPS[name] ?? "other";
      const n = (chunk.match(/class="item"/g) ?? []).length;
      const chip = n === 5 ? "" : `<span class="n">${n}건</span>`;
      const head = `<h2><span class="rule"></span>${name}${chip}</h2>`;
      return `<section class="group group--${slug}">${head}${chunk.slice(m[0].length)}</section>`;
    })
    .join("");
}

// ---------- 레이아웃 ----------

const CSS = `
  :root {
    --bg:#fbfbf9; --surface:#fff; --sunken:#f4f4f1;
    --text:#191918; --dim:#55554f; --muted:#84847c; --line:#e5e5e0;
    --home:#0f6b57; --world:#2a5aa8; --ai:#6d3fa8;
    --accent:var(--home); --radius:12px;
    --indent:2.3rem; --pad:1rem;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#151517; --surface:#1d1e21; --sunken:#232428;
      --text:#eeeeec; --dim:#b6b6b0; --muted:#8d8d87; --line:#303136;
      --home:#63c3a6; --world:#82aeee; --ai:#bb9af0;
    }
  }
  *,*::before,*::after { box-sizing:border-box; }
  body {
    margin:0; padding-block:2.5rem 4rem; padding-inline:20px;
    background:var(--bg); color:var(--text);
    font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;
    font-size:16px; line-height:1.75; -webkit-text-size-adjust:100%;
    word-break:keep-all; overflow-wrap:break-word; letter-spacing:-.02em;
  }
  .wrap { max-width:41rem; margin:0 auto; }
  /* 어절 단위로 끊고 왼쪽 정렬. 국내 신문사 본문이 모두 이 방식이다.
     줄 끝에 평균 1.2자가 비지만 단어가 쪼개지지 않는다. */
  .what p, .why p { font-size:1.125rem; }
  a { color:var(--accent); text-underline-offset:3px; text-decoration-thickness:1px; }

  /* 머리말 */
  header.site { padding-bottom:1.5rem; border-bottom:1px solid var(--line); margin-bottom:2.25rem; }
  header.site h1 { margin:0 0 .4rem; font-size:1.4rem; letter-spacing:-.02em; }
  header.site h1 a { color:inherit; text-decoration:none; }
  .tagline { margin:0 0 .8rem; color:var(--dim); font-size:.95rem; }
  .badges { margin:0; display:flex; flex-wrap:wrap; gap:.4rem; }
  .badge {
    padding:.15rem .6rem; border-radius:999px; border:1px solid var(--line);
    background:var(--surface); font-size:.75rem; color:var(--muted); white-space:nowrap;
  }
  .crumb { font-size:.875rem; margin:0 0 1.5rem; }
  .crumb a { color:var(--muted); text-decoration:none; }
  .crumb a:hover { color:var(--text); }

  /* 주간호 제목 */
  .issue-title { font-size:1.5rem; letter-spacing:-.02em; margin:0 0 .3rem; line-height:1.35; }
  .issue-title .period {
    display:block; font-size:1.05rem; font-weight:400; color:var(--muted);
    letter-spacing:-.01em; margin-top:.15rem; font-variant-numeric:tabular-nums;
  }
  .issue-meta { color:var(--muted); font-size:.875rem; margin:0 0 1rem; }

  /* 분야 */
  .group { --accent:var(--home); margin-top:3.5rem; }
  .group--world { --accent:var(--world); }
  .group--ai { --accent:var(--ai); }
  .group > h2 {
    display:flex; align-items:center; gap:.6rem;
    font-size:1.2rem; letter-spacing:-.01em; margin:0 0 .5rem; color:var(--accent);
  }
  .group > h2 .rule { width:1.5rem; height:3px; border-radius:2px; background:var(--accent); }
  .group > h2 .n {
    margin-left:auto; font-size:.75rem; font-weight:400; color:var(--muted);
    border:1px solid var(--line); border-radius:999px; padding:.1rem .55rem; background:var(--surface);
  }
  /* 분야 도입 문단 */
  .group > p { color:var(--dim); font-size:.95rem; margin:0 0 .5rem var(--indent); }

  /* 항목 */
  .item { padding:1.75rem 0; border-top:1px solid var(--line); }
  .group > h2 + .item, .group > p + .item { border-top:none; padding-top:.75rem; }
  .item-head { display:flex; gap:.7rem; align-items:baseline; }
  .num {
    flex:none; min-width:1.6rem; height:1.6rem; padding:0 .35rem;
    display:inline-flex; align-items:center; justify-content:center;
    border-radius:.5rem; background:var(--accent); color:var(--bg);
    font-size:.8rem; font-weight:700; font-variant-numeric:tabular-nums;
    transform:translateY(.15rem);
  }
  .item h3 { margin:0; font-size:1.2rem; line-height:1.55; letter-spacing:-.01em; }
  .when {
    margin:.5rem 0 .9rem var(--indent); font-size:.8rem; color:var(--muted);
    font-variant-numeric:tabular-nums;
  }
  .what { margin-left:var(--indent); }
  .what p { margin:0; color:var(--dim); }
  .what p + p { margin-top:.85rem; }
  .why {
    margin:1.1rem calc(var(--pad) * -1) 0 calc(var(--indent) - var(--pad) - 3px);
    padding:.85rem var(--pad);
    background:var(--sunken); border-left:3px solid var(--accent);
    border-radius:0 var(--radius) var(--radius) 0;
  }
  .why p { margin:0; }
  .why p + p { margin-top:.7rem; }
  .why .lbl {
    display:block; font-size:.7rem; letter-spacing:.08em; font-weight:700;
    color:var(--accent); margin-bottom:.3rem;
  }
  .src { margin:.9rem 0 0 var(--indent); font-size:.8rem; color:var(--muted); line-height:1.9; }
  .src .lbl { color:var(--muted); margin-right:.4rem; }
  .src a { color:var(--muted); }
  .src a:hover { color:var(--accent); }
  .src em { font-style:normal; color:var(--muted); opacity:.85; }

  /* 목록 페이지 */
  h2.list { font-size:1.05rem; margin:0 0 1rem; }
  .archive { list-style:none; margin:0; padding:0; }
  .archive li + li { border-top:1px solid var(--line); }
  .archive a {
    display:flex; flex-wrap:wrap; gap:.15rem .75rem; align-items:baseline;
    padding:1rem .5rem; margin-inline:-.5rem; text-decoration:none; color:inherit;
    border-radius:var(--radius);
  }
  .archive a:hover { background:var(--surface); }
  .archive .wk { font-weight:700; font-variant-numeric:tabular-nums; }
  .archive .period { color:var(--dim); font-size:.9rem; }
  .archive .counts { width:100%; color:var(--muted); font-size:.78rem; }
  .empty {
    padding:1.5rem; border:1px dashed var(--line); border-radius:var(--radius);
    color:var(--muted); background:var(--surface);
  }

  footer {
    margin-top:4rem; padding-top:1.5rem; border-top:1px solid var(--line);
    font-size:.82rem; color:var(--muted);
  }
  footer a { color:var(--muted); }
  footer p { margin:0 0 .5rem; }
  footer p:last-child { margin:0; }

  @media (max-width:30rem) {
    :root { --indent:0rem; --pad:.9rem; }
    .why { margin-right:0; }
    .item-head { margin-bottom:.2rem; }
  }
  @media (min-width:36rem) {
    .archive .counts { width:auto; margin-left:auto; }
  }
`;

function layout({ title, description, root, body }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="site">
  <h1><a href="${root}">${SITE_TITLE}</a></h1>
  <p class="tagline">${SITE_TAGLINE}</p>
  <p class="badges">
    <span class="badge">매주 월요일 오전 8시 발행 (KST)</span>
    <span class="badge">AI 자동 생성 · 모든 항목에 출처 링크</span>
  </p>
</header>
${body}
<footer>
  <p>${FOOTER_NOTE}</p>
  <p>${FOOTER_LIMIT}</p>
  <p><a href="${REPO_URL}">GitHub 저장소</a></p>
</footer>
</div>
</body>
</html>
`;
}

function renderWeek(w) {
  const body = `
<p class="crumb"><a href="../../">← 전체 목록</a></p>
<h1 class="issue-title">${pageTitleHtml(w)}</h1>
<p class="issue-meta">${isStandard(w) ? "" : counts(w) + " · "}${koDate(w.meta.published)} 발행</p>
${structure(marked.parse(w.body))}`;
  return layout({
    title: `${pageTitle(w)} — ${SITE_TITLE}`,
    description: `${w.week} (${period(w.meta)}) 주간 브리핑. ${counts(w)}.`,
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
    ${isStandard(w) ? "" : `<span class="counts">${counts(w)}</span>`}
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
