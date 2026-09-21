// content/{week,quarter,year}/*.md → site/
// 프론트매터는 평면 key: value 만 지원한다. 그 이상이 필요해지면 그때 파서를 바꾼다.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { marked } from "marked";

const ROOT = new URL("..", import.meta.url).pathname;
const CONTENT = join(ROOT, "content");
const SITE = join(ROOT, "site");

const SITE_TITLE = "ai-weekly-news";
const SITE_TAGLINE = "지난 한 주의 뉴스를 국내·해외·AI 각 5건으로 정리합니다.";
const REPO_URL = "https://github.com/yg-moon/ai-weekly-news";
const FOOTER_NOTE =
  "최신 속보가 아니라 완결된 주간의 정리입니다. 한 주의 범위는 월요일부터 일요일까지입니다.";
const FOOTER_LIMIT =
  "수집과 요약은 AI가 합니다. 사람이 개별 항목을 일일이 검증하지는 않으므로, 각 항목의 출처 링크로 확인해 주세요.";

// 발행물의 종류. 순서가 곧 탭 순서다.
const KINDS = {
  week: {
    label: "주간호", suffix: "주간 브리핑",
    groups: { 국내: "home", 해외: "world", AI: "ai" },
  },
  quarter: {
    label: "분기호", suffix: "분기호",
    groups: { 흐름: "flow", 단발: "single" },
  },
  year: {
    label: "연간호", suffix: "연간호",
    groups: { 흐름: "flow", 단발: "single" },
  },
};
const KIND_NAMES = Object.keys(KINDS);

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

// 아직 만들지 않은 종류는 폴더가 없다. 그때는 빈 목록이다.
function load(kind) {
  let files;
  try {
    files = readdirSync(join(CONTENT, kind));
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { meta, body } = parseFrontmatter(readFileSync(join(CONTENT, kind, f), "utf8"));
      const id = basename(f, ".md");
      if (meta[kind] !== id) throw new Error(`${kind}/${f}: 파일명과 frontmatter ${kind} 가 다르다`);
      return { kind, id, meta, body, n: sectionCounts(body) };
    })
    .sort((a, b) => (a.id < b.id ? 1 : -1)); // 최신순
}

// 건수는 본문에서 센다. 프론트매터에 적어 두면 본문과 어긋나도 아무도 모른다.
// 단발처럼 항목이 h3 가 아니라 목록이면 목록 줄을 센다.
function sectionCounts(body) {
  const out = {};
  for (const chunk of body.split(/^## /m).slice(1)) {
    const heads = (chunk.match(/^### /gm) ?? []).length;
    out[chunk.split("\n")[0].trim()] = heads || (chunk.match(/^- /gm) ?? []).length;
  }
  return out;
}

// ---------- 표기 ----------

const koDate = (iso) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
};
const period = (meta) => `${koDate(meta.period_start)}–${koDate(meta.period_end)}`;
const groupsOf = (d) => Object.keys(KINDS[d.kind].groups);
const counts = (d) => groupsOf(d).map((g) => `${g} ${d.n[g] ?? 0}`).join(" · ");
// 어느 종류든 구획마다 5건이 표준이다. 표준이면 건수를 화면에서 반복하지 않고,
// 어긋날 때만 드러낸다.
const isStandard = (d) => groupsOf(d).every((g) => d.n[g] === 5);
const pageTitle = (d) => `${d.id} ${KINDS[d.kind].suffix} (${period(d.meta)})`;
// 화면에서는 기간을 다음 줄로 내린다. 한 줄에 두면 좁은 화면에서 어중간하게 잘린다.
const pageTitleHtml = (d) =>
  `${d.id} ${KINDS[d.kind].suffix}<span class="period">${period(d.meta)}</span>`;

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

// 같은 매체가 한 항목에 여러 번 나오면 이름을 한 번만 쓰고 링크마다 번호를 붙인다.
// 위키백과가 여러 번 인용된 출처를 하나로 묶고 번호 링크를 다는 방식과 같다.
// 매체 이름을 되풀이하지 않으면서 링크는 하나도 잃지 않는다.
function sources(html) {
  // 링크 말고 다른 글이 섞여 있으면 손대지 않는다. 묶다가 조용히 지우는 것보다 낫다.
  const rest = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, "").replace(/[\s/·]/g, "");
  if (rest) return html;

  const groups = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const label = m[2].trim();
    if (!groups.has(label)) groups.set(label, []);
    const urls = groups.get(label);
    if (!urls.includes(m[1])) urls.push(m[1]);
  }
  if (!groups.size) return html;

  return [...groups]
    .map(([label, urls]) =>
      urls.length === 1
        ? `<a href="${urls[0]}">${label}</a>`
        : label + urls.map((u, i) => ` <a class="n" href="${u}">${i + 1}</a>`).join("")
    )
    .join(" / ");
}

function buildItem(slug, num, title, listHtml) {
  const fields = {};
  // 목록에 빈 줄이 있으면 marked 가 각 <li> 안을 <p> 로 감싼다. 양쪽을 다 받는다.
  const re =
    /<li>\s*(?:<p>)?\s*<strong>(날짜|무슨 일|왜 중요한가|출처|전개|근거)<\/strong>\s*:?\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/g;
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
  if (fields["전개"]) parts.push(`<div class="what">${ps("전개")}</div>`);
  if (fields["왜 중요한가"])
    parts.push(`<div class="why"><p class="lbl">왜 중요한가</p>${ps("왜 중요한가")}</div>`);
  for (const label of ["출처", "근거"])
    if (fields[label])
      parts.push(`<p class="src"><span class="lbl">${label}</span>${sources(fields[label].join(" "))}</p>`);

  // 분기 인사이트가 개별 항목을 가리킨다. 앵커는 `<분야>-<번호>` 다.
  return `<article class="item" id="${slug}-${num}">${parts.join("")}</article>`;
}

function structure(html, groups) {
  // 구획으로 먼저 자른다. 항목 앵커에 구획 이름이 들어가므로 항목보다 구획을 먼저 알아야 한다.
  const chunks = html.split(/(?=<h2[^>]*>)/);
  return chunks
    .map((chunk) => {
      const m = chunk.match(/^<h2[^>]*>\s*([\s\S]*?)<\/h2>/);
      if (!m) return chunk;
      const name = m[1].trim();
      const slug = groups[name] ?? "other";

      // 항목: <h3>N. 제목</h3> + 바로 뒤 <ul>
      const body = chunk.slice(m[0].length).replace(
        /<h3[^>]*>\s*(\d+)\.\s*([\s\S]*?)<\/h3>\s*<ul>([\s\S]*?)<\/ul>/g,
        (whole, num, title, list) => buildItem(slug, num, title.trim(), list) ?? whole
      );

      // 단발처럼 항목이 h3 가 아니면 목록 줄을 센다.
      const n =
        (body.match(/class="item"/g) ?? []).length || (body.match(/<li>/g) ?? []).length;
      const chip = n === 5 ? "" : `<span class="n">${n}건</span>`;
      const head = `<h2><span class="rule"></span>${name}${chip}</h2>`;
      return `<section class="group group--${slug}">${head}${body}</section>`;
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
  /* 분기호·연간호. 흐름이 본체이고 단발은 보조라 색으로 층을 나눈다. */
  .group--flow { --accent:var(--home); }
  .group--single { --accent:var(--dim); }
  .group--single ul { list-style:none; margin:0; padding:0; }
  .group--single li { padding:.9rem 0; border-top:1px solid var(--line); }
  .group--single li:first-child { border-top:none; }
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
  .item { padding:1.75rem 0; border-top:1px solid var(--line); scroll-margin-top:1rem; }
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
  /* 같은 매체의 여러 링크. 이름과 구분되게 작고 흐리게 둔다. */
  .src a.n { font-size:.7rem; vertical-align:.25em; padding:0 .05rem; opacity:.75; }
  .src em { font-style:normal; color:var(--muted); opacity:.85; }

  /* 목록 페이지 */
  .tabs { display:flex; gap:.25rem; margin:0 0 1.75rem; border-bottom:1px solid var(--line); }
  .tab {
    padding:.5rem .85rem; font-size:.9rem; text-decoration:none;
    color:var(--muted); border-bottom:2px solid transparent; margin-bottom:-1px;
  }
  .tab:hover { color:var(--text); }
  .tab.on { color:var(--text); font-weight:700; border-bottom-color:var(--accent); }

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
  <p><a href="${REPO_URL}">GitHub 저장소</a> · 글 <a href="${REPO_URL}/blob/main/LICENSE-CONTENT">CC BY-NC-SA 4.0</a></p>
</footer>
</div>
</body>
</html>
`;
}

// 종류가 하나뿐이면 탭을 그리지 않는다. 분기호가 처음 들어오는 날 탭이 생긴다.
// root 는 사이트 최상위까지의 상대 경로다. 주간호 목록이 최상위에 있으므로
// 주간호 탭은 root 자신을 가리킨다.
function tabs(current, sets, root) {
  const live = KIND_NAMES.filter((k) => sets[k].length);
  if (live.length < 2) return "";
  return `<nav class="tabs">${live
    .map((k) => {
      const href = k === "week" ? root : `${root}${k}/`;
      return k === current
        ? `<span class="tab on" aria-current="page">${KINDS[k].label}</span>`
        : `<a class="tab" href="${href}">${KINDS[k].label}</a>`;
    })
    .join("")}</nav>`;
}

function renderDoc(d, sets) {
  // 주간호 목록만 최상위에 있어서 되돌아가는 링크가 한 단계 더 올라간다.
  const back = d.kind === "week" ? "../../" : "../";
  const body = `
<p class="crumb"><a href="${back}">← ${KINDS[d.kind].label} 목록</a></p>
<h1 class="issue-title">${pageTitleHtml(d)}</h1>
${isStandard(d) ? "" : `<p class="issue-meta">${counts(d)}</p>`}
${structure(marked.parse(d.body), KINDS[d.kind].groups)}`;
  return layout({
    title: `${pageTitle(d)} — ${SITE_TITLE}`,
    description: `${d.id} (${period(d.meta)}) ${KINDS[d.kind].suffix}. ${counts(d)}.`,
    root: "../../",
    body,
  });
}

function renderIndex(kind, sets) {
  const docs = sets[kind];
  const label = KINDS[kind].label;
  const root = kind === "week" ? "./" : "../";
  const list = docs.length
    ? `<ul class="archive">${docs
        .map(
          (d) => `
  <li><a href="${root}${d.kind}/${d.id}/">
    <span class="wk">${d.id}</span>
    <span class="period">${period(d.meta)}</span>
    ${isStandard(d) ? "" : `<span class="counts">${counts(d)}</span>`}
  </a></li>`
        )
        .join("")}
</ul>`
    : `<div class="empty"><p>아직 발행된 ${label}가 없습니다.</p></div>`;
  return layout({
    title: kind === "week" ? `${SITE_TITLE} — 주간 뉴스 브리핑` : `${label} — ${SITE_TITLE}`,
    description: SITE_TAGLINE,
    root,
    body: `${tabs(kind, sets, root)}\n<h2 class="list">${label}</h2>\n${list}`,
  });
}

// ---------- 실행 ----------

const sets = Object.fromEntries(KIND_NAMES.map((k) => [k, load(k)]));
rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });

for (const kind of KIND_NAMES) {
  // 주간호 목록은 최상위에, 나머지는 자기 폴더에 둔다.
  const indexDir = kind === "week" ? SITE : join(SITE, kind);
  // 아직 하나도 없는 종류는 목록 페이지도 만들지 않는다. 탭에 없으므로 갈 길이 없다.
  if (kind !== "week" && !sets[kind].length) continue;
  mkdirSync(indexDir, { recursive: true });
  writeFileSync(join(indexDir, "index.html"), renderIndex(kind, sets));

  for (const d of sets[kind]) {
    const dir = join(SITE, kind, d.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), renderDoc(d, sets));
  }
}

console.log(
  KIND_NAMES.filter((k) => sets[k].length)
    .map((k) => `${KINDS[k].label} ${sets[k].length}개: ${sets[k].map((d) => d.id).join(", ")}`)
    .join(" | ")
);
