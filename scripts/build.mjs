// content/{week,quarter,year}/*.md → site/
// data/runs/*.json → site/stats/
// 프론트매터는 평면 key: value 만 지원한다. 그 이상이 필요해지면 그때 파서를 바꾼다.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync } from "node:fs";
import { join, basename } from "node:path";
import { marked } from "marked";

// 취소선을 쓰지 않는다. GFM 은 한 문단의 물결표 두 개 사이를 취소선으로 바꾸는데,
// 한국어는 범위를 "6억~12억" 처럼 물결표로 쓴다. 2026-W32 에서 문장 일부에 줄이 그어졌다.
marked.use({
  renderer: {
    del({ raw, tokens }) {
      const t = raw.match(/^~+/)[0];
      return `${t}${this.parser.parseInline(tokens)}${t}`;
    },
  },
});

const ROOT = new URL("..", import.meta.url).pathname;
const CONTENT = join(ROOT, "content");
const RUNS = join(ROOT, "data", "runs");
const SITE = join(ROOT, "site");

const SITE_TITLE = "ai-weekly-news";
const SITE_TAGLINE = "지난 한 주의 뉴스를 국내·해외·AI 각 5건으로 정리합니다.";
const REPO_URL = "https://github.com/yg-moon/ai-weekly-news";
// 링크 미리보기 이미지는 절대 주소여야 한다.
const SITE_URL = "https://yg-moon.github.io/ai-weekly-news/";

// 발행물의 종류. 순서가 곧 탭 순서다.
const KINDS = {
  week: {
    label: "주간호", suffix: "주간 브리핑",
    groups: { 국내: "korea", 해외: "world", AI: "ai" },
  },
  quarter: {
    label: "분기호", suffix: "분기호",
    groups: { 국내: "korea", 해외: "world", AI: "ai" },
  },
  year: {
    label: "연간호", suffix: "연간호",
    groups: { 국내: "korea", 해외: "world", AI: "ai" },
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
  // 분기호·연간호의 근거 링크도 화면에서는 주간호와 같이 "출처"로 부른다.
  for (const label of ["출처", "근거"])
    if (fields[label])
      parts.push(`<p class="src"><span class="lbl">출처</span>${sources(fields[label].join(" "))}</p>`);

  // 분기 인사이트가 개별 항목을 가리킨다. 앵커는 `<분야>-<번호>` 다.
  return `<article class="item" id="${slug}-${num}">${parts.join("")}</article>`;
}

const KIND_HEADS = {
  flow: `<p class="kind-h"><b>흐름</b>여러 주에 걸쳐 이어진 일</p>`,
  single: `<p class="kind-h"><b>단발</b>흐름으로 묶이지 않은 큰 일</p>`,
};

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
      // 분기호·연간호는 흐름(전개)과 단발(날짜 없는 무슨 일)이 번호를 이어 쓴다. 번호가
      // 한 줄 순위로 읽히지 않게 각 묶음의 첫 항목 앞에 이름을 단다.
      const seen = new Set();
      const body = chunk.slice(m[0].length).replace(
        /<h3[^>]*>\s*(\d+)\.\s*([\s\S]*?)<\/h3>\s*<ul>([\s\S]*?)<\/ul>/g,
        (whole, num, title, list) => {
          const item = buildItem(slug, num, title.trim(), list);
          if (!item) return whole;
          const k = /<strong>전개<\/strong>/.test(list) ? "flow"
            : !/<strong>날짜<\/strong>/.test(list) ? "single" : null;
          if (!k || seen.has(k)) return item;
          seen.add(k);
          return KIND_HEADS[k] + item;
        }
      );

      const n = (body.match(/class="item"/g) ?? []).length;
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
    --korea:#0f6b57; --world:#2a5aa8; --ai:#6d3fa8;
    --accent:var(--korea); --radius:12px;
    --indent:2.3rem; --pad:1rem;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#151517; --surface:#1d1e21; --sunken:#232428;
      --text:#eeeeec; --dim:#b6b6b0; --muted:#8d8d87; --line:#303136;
      --korea:#63c3a6; --world:#82aeee; --ai:#bb9af0;
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
  header.site h1 a { color:inherit; text-decoration:none; display:inline-flex; align-items:center; gap:.5em; }
  /* 파비콘과 같은 그림이다. 글자 크기를 따라 커지고 작아진다. */
  .logo { width:1.2em; height:1.2em; flex:none; }
  /* 발행물과 통계 페이지는 사이트 이름만 둔다. 소개는 목록에만 있다. */
  header.site.compact { padding-bottom:.9rem; margin-bottom:1.75rem; }
  header.site.compact h1 { margin:0; font-size:1.05rem; }
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
  .group { --accent:var(--korea); margin-top:3.5rem; }
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

  /* 항목 */
  .item { padding:1.75rem 0; border-top:1px solid var(--line); scroll-margin-top:1rem; }
  .group > h2 + .item { border-top:none; padding-top:.75rem; }
  /* 분기호·연간호의 흐름·단발 이름. 단발 이름이 두 묶음을 가르는 선을 갖는다. */
  .kind-h { margin:0; font-size:.78rem; color:var(--muted); }
  .kind-h b { color:var(--accent); margin-right:.5rem; }
  .group > h2 + .kind-h { margin-top:.5rem; }
  .item + .kind-h { border-top:1px solid var(--line); padding-top:1.75rem; }
  .kind-h + .item { border-top:none; padding-top:.6rem; }
  /* 번호 배지는 제목 첫 줄의 가운데에 맞춘다. 제목 줄 높이는 1.2rem × 1.55 다. */
  .item-head { display:flex; gap:.7rem; align-items:flex-start; }
  .num {
    flex:none; min-width:1.6rem; height:1.6rem; padding:0 .35rem;
    display:inline-flex; align-items:center; justify-content:center;
    border-radius:.5rem; background:var(--accent); color:var(--bg);
    font-size:.8rem; font-weight:700; font-variant-numeric:tabular-nums;
    margin-top:calc((1.2rem * 1.55 - 1.6rem) / 2);
  }
  .item h3 { margin:0; font-size:1.2rem; line-height:1.55; letter-spacing:-.01em; }
  .when {
    margin:.5rem 0 .9rem var(--indent); font-size:.8rem; color:var(--muted);
    font-variant-numeric:tabular-nums;
  }
  .what { margin-left:var(--indent); }
  /* 날짜 줄이 없는 분기호·연간호는 제목 바로 밑에 본문이 온다. */
  .item-head + .what { margin-top:.6rem; }
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
  .tabs { display:flex; flex-wrap:wrap; gap:.25rem; margin:0 0 1.75rem; border-bottom:1px solid var(--line); }
  .tab {
    padding:.5rem .85rem; font-size:.9rem; text-decoration:none;
    color:var(--muted); border-bottom:2px solid transparent; margin-bottom:-1px;
  }
  .tab:hover { color:var(--text); }
  .tab.on { color:var(--text); font-weight:700; border-bottom-color:var(--accent); }
  .yr {
    padding:.5rem .35rem; font-size:.9rem; text-decoration:none;
    color:var(--muted); font-variant-numeric:tabular-nums;
  }
  .yr:hover { color:var(--text); }
  .yr.on { color:var(--text); font-weight:700; }
  .tabdiv { width:1px; margin:.55rem .45rem; background:var(--line); }

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
  .tops { width:100%; display:flex; flex-direction:column; margin-top:.2rem; }
  .top { display:flex; align-items:baseline; gap:.6rem; min-width:0; font-size:.85rem; line-height:1.6; color:var(--dim); }
  .top b { flex:none; width:1.6rem; font-size:.78rem; color:var(--accent); }
  /* 두 줄을 넘으면 말줄임표로 자른다. 전체 제목은 본문에 있다. */
  .top span, .toc .tt {
    min-width:0; overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;
  }
  .archive .counts { width:100%; color:var(--muted); font-size:.78rem; }
  .archive li.quarter .wk { color:var(--accent); }
  .archive li.quarter + li { border-top-color:var(--dim); }
  .empty {
    padding:1.5rem; border:1px dashed var(--line); border-radius:var(--radius);
    color:var(--muted); background:var(--surface);
  }

  /* 통계 페이지 */
  .period-now { margin:0 0 .25rem; font-size:.85rem; color:var(--muted); }
  h2.sec { font-size:1.15rem; margin:2rem 0 .3rem; }
  .sec-lede { color:var(--dim); font-size:.9rem; margin:0 0 1.25rem; }
  .ogs { display:grid; grid-template-columns:repeat(3,1fr); gap:1.5rem; }
  .og-h { margin:0 0 .5rem; font-weight:700; font-size:.9rem; color:var(--accent); }
  .og-h span { margin-left:.4rem; font-weight:400; font-size:.75rem; color:var(--muted); }
  .or { display:grid; grid-template-columns:6.5rem 1fr 3.6rem; gap:.5rem; align-items:center; padding:.15rem 0; font-size:.8rem; }
  .on { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .ob { height:.5rem; border-radius:3px; background:var(--sunken); overflow:hidden; }
  .ob i { display:block; height:100%; background:var(--accent); }
  .ov { text-align:right; font-variant-numeric:tabular-nums; }
  .ov small { margin-left:.3rem; font-size:.7rem; color:var(--muted); }
  .om summary { margin-top:.35rem; font-size:.75rem; color:var(--muted); cursor:pointer; }
  .om[open] summary { margin-bottom:.3rem; }
  .og-note { margin:1.25rem 0 0; font-size:.8rem; color:var(--muted); }
  @media (max-width:40rem) { .ogs { grid-template-columns:1fr; gap:1.75rem; } }
  .tiles { display:grid; grid-template-columns:repeat(4,1fr); gap:.75rem; margin:0 0 2.25rem; }
  .tile { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:.8rem 1rem; }
  .tile .k { display:block; font-size:.75rem; color:var(--muted); }
  .tile .v { display:block; font-size:1.5rem; font-weight:700; font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
  .tile .v small { font-size:.85rem; font-weight:400; color:var(--dim); margin-left:.15rem; }
  figure.chart { margin:0 0 2.25rem; }
  figure.chart figcaption { font-weight:700; font-size:.95rem; margin-bottom:.5rem; }
  figure.chart svg { display:block; width:100%; height:auto; overflow:visible; }
  .chart .grid { stroke:var(--line); stroke-width:1; }
  .chart .axis { fill:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; }
  .chart .val { fill:var(--text); font-size:11px; font-weight:700; font-variant-numeric:tabular-nums; }
  .chart .bar { fill:var(--accent); }
  .chart .hit { fill:transparent; }
  /* 막대를 누르면 그 막대만 진하게 남기고 값을 띄운다. 마지막 막대의 값은 늘 보인다. */
  .chart g.b { outline:none; cursor:pointer; -webkit-tap-highlight-color:transparent; }
  .chart .val { visibility:hidden; }
  .chart g.last .val { visibility:visible; }
  .chart svg:focus-within g .val { visibility:hidden; }
  .chart g.b:hover .val, .chart g.b:focus .val { visibility:visible; }
  .chart g.b:hover .bar { opacity:.8; }
  .chart svg:focus-within .bar { opacity:.35; }
  .chart g.b:focus .bar { opacity:1; }
  /* 누른 막대는 클릭을 흘려보낸다. 한 번 더 누르면 아래의 빈 그래프가 눌려 포커스가
     풀리고 원래대로 돌아온다. */
  .chart g.b:focus { pointer-events:none; }
  /* 막대가 많으면 폭을 고정하고 그래프만 좌우로 스크롤한다. 세로축은 따로 둔다. */
  .chart .plot { display:flex; }
  .chart.wide svg { width:auto; height:auto; overflow:hidden; }
  .chart .yaxis { flex:none; }
  .chart .scroll { overflow-x:auto; direction:rtl; flex:1; min-width:0; }
  /* 왼쪽 끝이 잘린 라벨이 버그처럼 보이지 않게 흐리게 사라지게 한다. 더 있다는 표시다. */
  .chart .scroll { -webkit-mask-image:linear-gradient(to right, transparent, #000 1.5rem); mask-image:linear-gradient(to right, transparent, #000 1.5rem); }
  .chart .scroll svg { direction:ltr; }
  .runs tr.old { display:none; }
  .more-toggle { position:absolute; opacity:0; pointer-events:none; }
  .more-toggle:checked ~ .table-scroll tr.old { display:table-row; }
  .more-toggle:checked ~ .more { display:none; }
  .more {
    display:block; margin-top:.75rem; padding:.6rem; text-align:center; cursor:pointer;
    font-size:.85rem; color:var(--muted); border:1px solid var(--line); border-radius:var(--radius);
  }
  .more:hover { color:var(--text); }
  .more-toggle:focus-visible ~ .more { outline:2px solid var(--accent); }
  .runs { width:100%; border-collapse:collapse; font-size:.85rem; font-variant-numeric:tabular-nums; }
  .runs th { text-align:left; font-weight:400; color:var(--muted); font-size:.75rem; padding:.4rem .5rem; border-bottom:1px solid var(--line); }
  .runs td { padding:.55rem .5rem; border-bottom:1px solid var(--line); white-space:nowrap; }
  .runs .r { text-align:right; }
  /* 모델은 모든 호가 같아 보조 정보다. 맨 오른쪽에 흐리게 둔다. */
  .runs .m { padding-left:1.25rem; color:var(--muted); }
  .table-scroll { overflow-x:auto; }
  @media (max-width:30rem) {
    .tiles { grid-template-columns:repeat(2,1fr); gap:.5rem; }
    .tile { padding:.6rem .7rem; }
    .tile .v { font-size:1.2rem; }
    /* 차트는 화면 폭에 맞춰 줄어든다. 글자는 줄어든 만큼 키워 둔다. */
    .chart:not(.wide) .axis, .chart:not(.wide) .val { font-size:20px; }
    .chart:not(.wide) .axis.alt { display:none; }
  }

  /* 주간호 목차. 좁은 화면에서는 제목 아래 상자로, 넓은 화면에서는 본문 왼쪽에 고정한다. */
  .toc {
    margin:1.5rem 0 0; padding:.9rem 1rem; background:var(--surface);
    border:1px solid var(--line); border-radius:var(--radius);
  }
  .toc-group + .toc-group { margin-top:.7rem; }
  .toc-name { margin:0 0 .15rem; font-size:.75rem; font-weight:700; color:var(--accent); }
  .toc ol { list-style:none; margin:0; padding:0; }
  .toc li { font-size:.875rem; line-height:1.5; }
  .toc a { display:flex; gap:.5rem; padding:.2rem 0; color:var(--dim); text-decoration:none; }
  .toc a:hover { color:var(--text); }
  .toc { scroll-margin-top:1rem; }
  .item h3 a.to-toc { color:inherit; text-decoration:none; -webkit-tap-highlight-color:transparent; }
  .toc .tn { flex:none; width:.8rem; color:var(--accent); font-weight:700; font-variant-numeric:tabular-nums; }
  @media (min-width:78rem) {
    .toc {
      position:fixed; top:2.5rem; width:15rem; max-height:calc(100vh - 5rem); overflow-y:auto;
      left:calc(50% - 20.5rem - 2.5rem - 15rem); margin:0; background:none; border:none; padding:0;
    }
    .toc li { font-size:.8rem; }
    /* 목차가 늘 옆에 있으니 제목은 눌러도 움직이지 않는다. */
    .item h3 a.to-toc { pointer-events:none; }
  }

  /* 이전 호·다음 호 */
  .pager { display:flex; gap:1rem; margin-top:3.5rem; padding-top:1.25rem; border-top:1px solid var(--line); }
  .pager a { display:flex; flex-direction:column; text-decoration:none; color:var(--text); font-weight:700; font-variant-numeric:tabular-nums; line-height:1.5; }
  .pager a:hover { color:var(--accent); }
  .pager small { font-size:.75rem; font-weight:400; color:var(--muted); }
  .pager .next { margin-left:auto; text-align:right; }

  footer {
    margin-top:4rem; padding-top:1.5rem; border-top:1px solid var(--line);
    font-size:.82rem; color:var(--muted);
  }
  footer a { color:var(--muted); }
  footer p { margin:0 0 .5rem; }
  footer p:last-child { margin:0; }

  @media (max-width:30rem) {
    :root { --indent:0rem; --pad:.9rem; }
    /* 왼쪽처럼 오른쪽도 본문 밖으로 같은 만큼 낸다. 글은 본문과 같은 폭이다. */
    .why { margin-right:calc((var(--pad) + 3px) * -1); }
    /* 좁은 화면은 본문을 들여 쓰지 않는다. 배지를 제목 글 속에 띄워 제목 둘째 줄이
       본문과 같은 왼쪽 선에서 시작하게 한다. */
    .item-head { display:block; margin-bottom:.2rem; }
    .item-head .num { float:left; margin-right:.55rem; }
  }
  @media (min-width:36rem) {
    .archive .counts { width:auto; margin-left:auto; }
  }
`;

function layout({ title, description, root, body, full = false }) {
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
<meta property="og:image" content="${SITE_URL}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${root}favicon-96.png" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
${full ? `<header class="site">
  <h1><a href="${root}"><img class="logo" src="${root}favicon.svg" alt="">${SITE_TITLE}</a></h1>
  <p class="tagline">${SITE_TAGLINE}</p>
  <p class="badges">
    <span class="badge">매주 월요일 오전 8시 발행 (KST)</span>
    <span class="badge">AI 수집 및 요약 · 모든 항목에 출처 링크</span>
  </p>
</header>` : `<header class="site compact"><h1><a href="${root}"><img class="logo" src="${root}favicon.svg" alt="">${SITE_TITLE}</a></h1></header>`}
${body}
<footer>
  <p><a href="${REPO_URL}">GitHub</a> · <a href="${root}stats/">통계</a></p>
</footer>
</div>
</body>
</html>
`;
}

// ---------- 기간 ----------
// 탭은 기간이다. 종류가 아니다. 한 분기 목록 안에 그 분기의 분기호와 주간호가
// 같이 놓인다. 발행물 자체의 경로는 종류별로 그대로 둔다.

// 분기는 ISO 8601 에 없다. 이 프로젝트가 13주씩 끊어 쓴다. 4분기만 그 해의
// 마지막 주(52 또는 53)까지라 한 주 길 때가 있다.
const quarterOf = (week) => (week <= 13 ? 1 : week <= 26 ? 2 : week <= 39 ? 3 : 4);

// 발행물이 어느 해 어느 분기에 속하는가. 연간호는 분기가 없다.
function placeOf(d) {
  if (d.kind === "week") {
    const [y, w] = d.id.split("-W");
    return { year: y, q: quarterOf(Number(w)) };
  }
  if (d.kind === "quarter") {
    const [y, q] = d.id.split("-Q");
    return { year: y, q: Number(q) };
  }
  return { year: d.id, q: null };
}

// 연도 → 그 해의 분기들과 연간호.
function timeline(sets) {
  const years = new Map();
  const at = (y) => {
    if (!years.has(y)) years.set(y, { quarters: new Map(), annual: null });
    return years.get(y);
  };
  for (const kind of KIND_NAMES)
    for (const d of sets[kind]) {
      const { year, q } = placeOf(d);
      if (q === null) {
        at(year).annual = d;
        continue;
      }
      const qs = at(year).quarters;
      if (!qs.has(q)) qs.set(q, []);
      qs.get(q).push(d);
    }
  // 분기호가 맨 위, 그 아래로 주간호 최신순이다.
  for (const y of years.values())
    for (const docs of y.quarters.values())
      docs.sort((a, b) =>
        a.kind === b.kind ? (a.id < b.id ? 1 : -1) : a.kind === "quarter" ? -1 : 1
      );
  return years;
}

// 내용이 있는 분기만 나온다. 연도·분기 오름차순이라 마지막이 가장 나중이다.
const periods = (years) =>
  [...years.keys()]
    .sort()
    .flatMap((y) =>
      [...years.get(y).quarters.keys()].sort((a, b) => a - b).map((q) => ({ year: y, q }))
    );

const listPath = (p) => `${p.year}/Q${p.q}/`;
const listTitle = (p) => `${p.year}년 ${p.q}분기`;

// 연도 칩과 분기 칩을 한 줄에 둔다. 연도가 하나뿐이면 누를 데가 없는 라벨이다.
// 연도를 누르면 그 해에서 가장 나중 분기로 간다. `연간` 은 지금 보고 있는 해의
// 연간호로 간다. root 는 최상위까지의 상대 경로다.
function tabs(years, here, root) {
  const all = periods(years);
  if (!all.length) return "";

  const yearChip = (y) =>
    y === here.year
      ? `<span class="yr on">${y}</span>`
      : `<a class="yr" href="${root}${listPath(all.filter((p) => p.year === y).pop())}">${y}</a>`;

  const quarterChip = (p) =>
    p.q === here.q
      ? `<span class="tab on" aria-current="page">Q${p.q}</span>`
      : `<a class="tab" href="${root}${listPath(p)}">Q${p.q}</a>`;

  const annual = years.get(here.year).annual;
  const yearRow = [...new Set(all.map((p) => p.year))].map(yearChip).join("");
  const quarterRow = all.filter((p) => p.year === here.year).map(quarterChip).join("");
  const annualChip = annual ? `<a class="tab" href="${root}year/${annual.id}/">연간</a>` : "";
  return `<nav class="tabs">${yearRow}<span class="tabdiv"></span>${quarterRow}${annualChip}</nav>`;
}

// 목차와 목록에 쓰는 제목. 태그만 걷고 전체를 둔다. 길면 CSS 가 두 줄에서 자른다.
const plainTitle = (html) => html.replace(/<[^>]+>/g, "").trim();

// 주간호 목차. 구조화한 본문에서 분야와 항목 제목을 다시 읽는다.
// 넓은 화면에서는 본문 왼쪽에 고정되고, 좁은 화면에서는 제목 아래에 펼쳐 둔다.
function toc(html) {
  const groups = html.split(/(?=<section class="group )/).flatMap((chunk) => {
    const g = chunk.match(/^<section class="group group--(\w+)"><h2><span class="rule"><\/span>([^<]*)/);
    if (!g) return [];
    const items = [...chunk.matchAll(/<article class="item" id="([^"]+)"><div class="item-head"><span class="num">(\d+)<\/span><h3>([\s\S]*?)<\/h3>/g)]
      .map(([, id, num, title]) => `<li><a href="#${id}"><span class="tn">${num}</span><span class="tt">${plainTitle(title)}</span></a></li>`);
    return items.length ? [`<div class="toc-group group--${g[1]}"><p class="toc-name">${g[2].trim()}</p><ol>${items.join("")}</ol></div>`] : [];
  });
  return groups.length ? `<nav class="toc" id="toc" aria-label="목차">${groups.join("")}</nav>` : "";
}

// 같은 종류의 바로 앞뒤 발행물. ID 는 문자열 순서가 곧 시간 순서다.
function pager(d) {
  const ids = sets[d.kind].map((x) => x.id).sort();
  const i = ids.indexOf(d.id);
  const [prev, next] = [ids[i - 1], ids[i + 1]];
  if (!prev && !next) return "";
  return `<nav class="pager" aria-label="이전 호와 다음 호">${
    prev ? `<a class="prev" href="../${prev}/"><small>이전 호</small>← ${prev}</a>` : ""}${
    next ? `<a class="next" href="../${next}/"><small>다음 호</small>${next} →</a>` : ""}</nav>`;
}

function renderDoc(d, years) {
  // 되돌아가는 곳은 그 발행물이 속한 분기 목록이다. 연간호는 분기가 없으므로
  // 그 해에서 가장 나중 분기로 보낸다.
  const p = placeOf(d);
  const back = p.q ? p : periods(years).filter((x) => x.year === p.year).pop();
  const main = structure(marked.parse(d.body), KINDS[d.kind].groups);
  // 목차를 둔다. 항목 제목을 누르면 목차로 돌아간다.
  const nav = toc(main);
  const body = `
${back ? `<p class="crumb"><a href="../../${listPath(back)}">← ${listTitle(back)}</a></p>` : ""}
<h1 class="issue-title">${pageTitleHtml(d)}</h1>
${isStandard(d) ? "" : `<p class="issue-meta">${counts(d)}</p>`}
${nav}
${nav ? main.replace(/(<div class="item-head"><span class="num">\d+<\/span><h3>)([\s\S]*?)<\/h3>/g, '$1<a class="to-toc" href="#toc">$2</a></h3>') : main}
${pager(d)}`;
  return layout({
    title: `${pageTitle(d)} — ${SITE_TITLE}`,
    description: `${d.id} (${period(d.meta)}) ${KINDS[d.kind].suffix}. ${counts(d)}.`,
    root: "../../",
    body,
  });
}

// 목록에서 발행물마다 분야별 1위 제목을 한 줄씩 미리 보여 준다.
function tops(d) {
  const lines = d.body.split(/^## /m).slice(1).flatMap((chunk) => {
    const name = chunk.split("\n")[0].trim();
    const first = chunk.match(/^### \d+\.\s*(.+)$/m);
    const slug = KINDS[d.kind].groups[name];
    return first && slug
      ? [`<span class="top group--${slug}"><b>${name}</b><span>${plainTitle(marked.parseInline(first[1]))}</span></span>`]
      : [];
  });
  return lines.length ? `<span class="tops">${lines.join("")}</span>` : "";
}

// 한 분기의 목록. 홈은 가장 나중 분기와 같은 내용이고 root 와 제목만 다르다.
function renderList(years, p, root, home) {
  const cards = years
    .get(p.year)
    .quarters.get(p.q)
    .map(
      (d) => `
  <li class="${d.kind}"><a href="${root}${d.kind}/${d.id}/">
    <span class="wk">${d.id}</span>
    <span class="period">${period(d.meta)}</span>
    ${isStandard(d) ? "" : `<span class="counts">${counts(d)}</span>`}
    ${tops(d)}
  </a></li>`
    )
    .join("");
  return layout({
    title: home ? `${SITE_TITLE} — 주간 뉴스 브리핑` : `${listTitle(p)} — ${SITE_TITLE}`,
    description: SITE_TAGLINE,
    root,
    full: true,
    body: `${tabs(years, p, root)}\n<h2 class="list">${listTitle(p)}</h2>\n<ul class="archive">${cards}\n</ul>`,
  });
}

// ---------- 실행 기록 ----------
// 한 발행물을 만드는 데 든 비용과 시간. data/runs 는 record-run.mjs 가 쓴다.

function loadRuns() {
  let files = [];
  try {
    files = readdirSync(RUNS).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map((f) => JSON.parse(readFileSync(join(RUNS, f), "utf8"))).sort((a, b) => runOrder(a) - runOrder(b));
}

const minutes = (r) => Math.round((new Date(r.published) - new Date(r.started)) / 60e3);
const usd = (x) => `$${x.toFixed(2)}`;
const shortWeek = (w) => (/^\d{4}$/.test(w) ? "연간" : w.replace(/^\d{4}-/, ""));

// 기록의 week 는 발행물 ID 다. 주간호 2026-W39, 분기호 2026-Q3, 연간호 2026. 분기호는
// 그 분기의 마지막 주 바로 뒤에, 연간호는 4분기 분기호 뒤에 놓는다. 4분기는 53주까지
// 있을 수 있다.
const runPlace = (r) => {
  const [y, t] = r.week.split("-");
  if (!t) return { year: y, q: 4 };
  return t[0] === "Q" ? { year: y, q: Number(t[1]) } : { year: y, q: quarterOf(Number(t.slice(1))) };
};
const runOrder = (r) => {
  const [y, t] = r.week.split("-");
  if (!t) return Number(y) * 100 + 53.9;
  const n = Number(t.slice(1));
  return Number(y) * 100 + (t[0] === "Q" ? (n === 4 ? 53 : n * 13) + 0.5 : n);
};

// 막대 하나에 값 하나. 축은 하나다. 값 표시는 마지막 막대에만 붙이고, 다른 막대는
// 누르거나 마우스를 올리면 나온다. 누른 막대만 진하게 남기고, 한 번 더 누르면 풀린다.
// 스크립트 없이 CSS 의 :focus 로 한다.
//
// 막대가 본문 폭에 다 안 들어가면 막대 폭을 고정하고 그래프만 좌우로 스크롤한다.
// 세로축은 따로 떼어 스크롤해도 제자리에 둔다. 처음 화면은 가장 최근 주차인 오른쪽
// 끝이다(.scroll 의 direction).
const WRAP = 656; // .wrap 의 max-width 41rem
const SLOT = 34;
function barChart(runs, value, fmt, caption) {
  const H = 200, L = 44, R = 8, T = 16;
  const years = new Set(runs.map((r) => r.week.slice(0, 4)));
  const B = years.size > 1 ? 38 : 24;
  const wide = runs.length * SLOT + R > WRAP - L;
  const W = wide ? L + R + runs.length * SLOT : 640;
  const max = Math.max(...runs.map(value));
  const step = niceStep(max / 3);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const slot = wide ? SLOT : (W - L - R) / Math.max(runs.length, 4);
  const bw = Math.min(40, slot * 0.6);
  const every = wide ? 1 : Math.ceil(runs.length / 13);

  const grid = [], axis = [];
  for (let v = 0; v <= top + 1e-9; v += step) {
    grid.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`);
    axis.push(`<text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, true)}</text>`);
  }

  const bars = runs.map((r, i) => {
    const v = value(r);
    const x = L + slot * i + (slot - bw) / 2;
    const y0 = y(0), y1 = Math.min(y(v), y0 - 1);
    const rad = Math.min(4, (y0 - y1) / 2, bw / 2);
    const d = `M${x},${y0}V${y1 + rad}Q${x},${y1} ${x + rad},${y1}H${x + bw - rad}Q${x + bw},${y1} ${x + bw},${y1 + rad}V${y0}Z`;
    const last = i === runs.length - 1;
    // 좁은 화면에서는 주차 라벨을 하나 걸러 보인다(.alt). 마지막 막대부터 센다.
    const k = (runs.length - 1 - i) / every;
    const tick = Number.isInteger(k) ? `<text class="axis${k % 2 ? " alt" : ""}" x="${x + bw / 2}" y="${H - B + 16}" text-anchor="middle">${shortWeek(r.week)}</text>` : "";
    // 해가 둘 이상이면 해마다 첫 막대 아래에 연도를 단다. W01 이 W52 뒤에 와도 읽힌다.
    const year = years.size > 1 && (i === 0 || runs[i - 1].week.slice(0, 4) !== r.week.slice(0, 4))
      ? `<text class="axis" x="${x}" y="${H - 4}">${r.week.slice(0, 4)}</text>` : "";
    return `<g class="b${last ? " last" : ""}" tabindex="0" aria-label="${r.week} ${fmt(v)}"><rect class="hit" x="${L + slot * i}" y="${T}" width="${slot}" height="${H - T - B}"/><path class="bar" d="${d}"/><text class="val" x="${x + bw / 2}" y="${y1 - 5}" text-anchor="middle">${fmt(v)}</text>${tick}${year}</g>`;
  });

  if (!wide)
    return `<figure class="chart"><figcaption>${caption}</figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${caption}">
${grid.join("")}${axis.join("")}
${bars.join("")}
</svg></figure>`;
  return `<figure class="chart wide"><figcaption>${caption}</figcaption>
<div class="plot"><svg class="yaxis" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" aria-hidden="true">${axis.join("")}</svg>
<div class="scroll"><svg width="${W - L}" height="${H}" viewBox="${L} 0 ${W - L} ${H}" role="img" aria-label="${caption}">
${grid.join("")}
${bars.join("")}
</svg></div></div></figure>`;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

const hoursMinutes = (m) => (m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`);

// 통계는 전체·연도·분기마다 페이지가 따로 있다. 목록의 탭과 같이 주소가 기간이고
// 스크립트를 쓰지 않는다. 기간은 발행물과 같은 13주 분기로 끊는다.
function statsViews(runs) {
  const views = [{ path: "stats/", label: "전체", runs }];
  const place = runPlace;
  for (const y of [...new Set(runs.map((r) => place(r).year))].sort()) {
    const inYear = runs.filter((r) => place(r).year === y);
    views.push({ path: `stats/${y}/`, label: `${y}년`, year: y, runs: inYear });
    for (const q of [...new Set(inYear.map((r) => place(r).q))].sort((a, b) => a - b))
      views.push({ path: `stats/${y}/Q${q}/`, label: listTitle({ year: y, q }), year: y, q, runs: inYear.filter((r) => place(r).q === q) });
  }
  return views;
}

// 전체 | 연도 | 고른 해의 분기. 전체에서는 분기 칩을 두지 않는다. 어느 해의 분기인지
// 알 수 없다.
function statsTabs(views, here, root) {
  if (views.length === 1) return "";
  const chip = (v, cls, text) =>
    v === here ? `<span class="${cls} on" aria-current="page">${text}</span>` : `<a class="${cls}" href="${root}${v.path}">${text}</a>`;
  const years = views.filter((v) => v.year && !v.q);
  const quarters = views.filter((v) => v.q && v.year === here.year);
  const div = `<span class="tabdiv"></span>`;
  return `<nav class="tabs">${chip(views[0], "tab", "전체")}${div}${years.map((v) => chip(v, "yr", v.year)).join("")}${
    quarters.length ? div + quarters.map((v) => chip(v, "tab", `Q${v.q}`)).join("") : ""}</nav>`;
}

// 인용 매체. 주간호 항목의 출처 줄에 오른 매체를 분야별로 센다. 한 항목에서 같은 매체는
// 한 번만 센다. 분기호·연간호의 출처는 주간호 링크라 세지 않는다.
const OUTLETS_SHOWN = 6;
function outletStats(view) {
  const docs = sets.week.filter((d) => {
    const p = placeOf(d);
    return (!view.year || p.year === view.year) && (!view.q || p.q === view.q);
  });
  if (!docs.length) return "";
  const groups = Object.entries(KINDS.week.groups).map(([name, slug]) => {
    const count = new Map();
    let items = 0;
    for (const d of docs) {
      const sec = d.body.split(/^## /m).find((c) => c.startsWith(name));
      for (const it of (sec ?? "").split(/^### /m).slice(1)) {
        items++;
        const line = it.match(/\*\*출처\*\*\s*:?\s*(.*)/)?.[1] ?? "";
        for (const n of new Set([...line.matchAll(/\[([^\]]+)\]\(/g)].map((m) => m[1]).filter((n) => !/^\d+$/.test(n))))
          count.set(n, (count.get(n) ?? 0) + 1);
      }
    }
    const list = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const max = list[0]?.[1] ?? 1;
    const row = ([n, v]) => `<div class="or"><span class="on">${n}</span><span class="ob"><i style="width:${Math.max(2, Math.round((v / max) * 100))}%"></i></span><span class="ov">${v}<small>${Math.round((v / items) * 100)}%</small></span></div>`;
    const rest = list.slice(OUTLETS_SHOWN);
    return `<div class="og group--${slug}"><p class="og-h">${name}<span>항목 ${items}건 · 매체 ${list.length}곳</span></p>
${list.slice(0, OUTLETS_SHOWN).map(row).join("")}
${rest.length ? `<details class="om"><summary>그 밖 ${rest.length}곳</summary>${rest.map(row).join("")}</details>` : ""}</div>`;
  });
  return `<h2 class="sec">인용 매체</h2>
<p class="sec-lede">주간호 항목에서 출처로 인용한 매체의 목록입니다.</p>
<div class="ogs">${groups.join("")}</div>
<p class="og-note">숫자는 그 매체를 출처로 단 항목 수, 퍼센트는 그 분야 항목 가운데 차지하는 비율입니다. 한 항목이 여러 매체를 출처로 달기 때문에 퍼센트를 더하면 100%를 넘습니다.</p>`;
}

function renderStats(views, view) {
  const { runs } = view;
  const root = "../".repeat(view.path.split("/").filter(Boolean).length);
  const sum = (f) => runs.reduce((s, r) => s + f(r), 0);
  const avg = (f) => sum(f) / runs.length;

  const tiles = runs.length
    ? `<div class="tiles">
  <div class="tile"><span class="k">발행물</span><span class="v">${runs.length}<small>개</small></span></div>
  <div class="tile"><span class="k">총 비용</span><span class="v">${usd(sum((r) => r.cost_usd))}</span></div>
  <div class="tile"><span class="k">평균 비용</span><span class="v">${usd(avg((r) => r.cost_usd))}</span></div>
  <div class="tile"><span class="k">평균 소요 시간</span><span class="v">${Math.round(avg(minutes))}<small>분</small></span></div>
</div>`
    : "";

  // 읽은 헤드라인은 기록이 없으면 비운다. 표는 최근 16개만 펼쳐 두고 나머지는 "더보기"로
  // 편다. 한 분기는 53주인 해의 4분기가 주간호 14개, 분기호, 연간호로 16개가 최대라
  // 분기 화면에는 버튼이 안 생긴다. 체크박스와 CSS 로 하고, 행은 모두 HTML 에 있다. CSS 가 형제
  // 선택자(~)로 표를 고르므로 체크박스는 표보다 앞에, 라벨은 뒤에 둔다. 순서가 바뀌면
  // 버튼이 오류 없이 안 먹는다.
  const SHOWN = 16;
  const rows = [...runs].reverse().map((r, i) => `<tr${i >= SHOWN ? ' class="old"' : ""}>
  <td>${r.week}</td>
  <td class="r">${usd(r.cost_usd)}</td><td class="r">${minutes(r)}분</td><td class="r">${r.headlines == null ? "—" : r.headlines.toLocaleString("en-US")}</td><td class="m">${r.model}</td>
</tr>`).join("");
  const more = runs.length > SHOWN
    ? `<label for="more-runs" class="more">더보기</label>`
    : "";
  const body = runs.length
    ? `${tiles}
${barChart(runs, (r) => r.cost_usd, (v, axis) => (axis ? `$${v}` : usd(v)), "비용 (달러)")}
${barChart(runs, minutes, (v) => `${v}분`, "소요 시간 (분)")}
${more ? `<input type="checkbox" id="more-runs" class="more-toggle">` : ""}<div class="table-scroll"><table class="runs">
<thead><tr><th>발행물</th><th class="r">비용</th><th class="r">소요 시간</th><th class="r">읽은 헤드라인</th><th class="m">모델</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
${more}`
    : `<div class="empty"><p>아직 기록이 없습니다.</p></div>`;

  return layout({
    title: view.q || view.year ? `통계 · ${view.label} — ${SITE_TITLE}` : `통계 — ${SITE_TITLE}`,
    description: `발행물을 만드는 데 든 비용과 시간, 인용한 매체. ${view.label}.`,
    root,
    body: `<p class="crumb"><a href="${root}">← 목록</a></p>
<h1 class="issue-title">통계</h1>
${statsTabs(views, view, root)}
${view.year ? `<p class="period-now">${view.label}</p>` : ""}
<h2 class="sec">발행 비용 및 시간</h2>
<p class="sec-lede">AI가 각 발행물을 만드는 데 든 비용과 시간입니다. 비용은 API 정가 환산이며 실제 청구액이 아닙니다.</p>
${body}
${outletStats(view)}`,
  });
}

// ---------- 실행 ----------

const sets = Object.fromEntries(KIND_NAMES.map((k) => [k, load(k)]));

// 다른 항목을 번호로 가리키면 빌드를 멈춘다. "(국내 2번)" 은 분기호가 항목을 떼어
// 다시 묶으면 가리킬 곳이 없다. 2026-W31~W38 에서 16곳이 나와 모두 고쳤다.
const crossRefs = Object.values(sets).flat().flatMap((p) =>
  [...p.body.matchAll(/(?:국내|해외|AI) ?[1-5] ?번(?!째)/g)].map((m) => `${p.kind}/${p.id} "${m[0]}"`)
);
if (crossRefs.length) {
  console.error(`다른 항목을 번호로 가리켰다: ${crossRefs.join(", ")}. 그 사안을 이름과 사실로 다시 쓴다.`);
  process.exit(1);
}

// 항목 제목은 한 사안을 짧게 쓴다(주간 런북 11절). 한글은 1자, 영문·숫자·공백은 반 자로 세어
// 26자를 넘거나 " — " 부제를 달면 빌드를 멈춘다.
const titleWidth = (t) => [...t].reduce((w, c) => w + (/[\uac00-\ud7a3]/.test(c) ? 1 : 0.5), 0);
const longTitles = Object.values(sets).flat().flatMap((p) =>
  [...p.body.matchAll(/^### \d+\.\s*(.+)$/gm)]
    .map((m) => m[1].trim())
    .filter((t) => titleWidth(t) > 26 || t.includes(" — "))
    .map((t) => `${p.kind}/${p.id} "${t}" (${titleWidth(t)}자)`)
);
if (longTitles.length) {
  console.error(`제목이 길거나 부제가 있다:\n  ${longTitles.join("\n  ")}`);
  process.exit(1);
}

// 한 이름은 한 표기로만 쓴다(주간 런북 10절). AI 기업과 AI 모델·제품은 영문, 빅테크는 한글이다.
// 출처 줄은 매체 이름이라 보지 않는다. 솔·루나·뮤즈처럼 일반어와 겹치는 이름은 오탐이 나서 뺐다.
const HANGUL_AI = /(?<![가-힣])(앤트로픽|오픈AI|클로드|오퍼스|소네트|하이쿠|페이블|미토스|제미나이|젬마|챗GPT|코덱스|코파일럿|딥마인드|딥시크|미스트랄|허깅페이스|퍼플렉시티|알파폴드|알파지놈|싱킹머신즈)/g;
const LATIN_BIGTECH = /\b(Google|Microsoft|Meta|NVIDIA|Nvidia|Apple|Amazon|SpaceX)\b(?! [A-Z0-9])/g;
const mixedNames = Object.values(sets).flat().flatMap((p) =>
  p.body.split("\n")
    .filter((l) => !/^- \*\*(출처|근거)\*\*/.test(l))
    .flatMap((l) => [...l.matchAll(HANGUL_AI), ...l.matchAll(LATIN_BIGTECH)])
    .map((m) => `${p.kind}/${p.id} "${m[0]}"`)
);
if (mixedNames.length) {
  console.error(`이름 표기가 규칙과 다르다: ${mixedNames.join(", ")}`);
  process.exit(1);
}

const years = timeline(sets);
const all = periods(years);

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
// 파비콘과 링크 미리보기 이미지. 만든 방법은 static/README.md 에 있다.
cpSync(join(ROOT, "static"), SITE, { recursive: true, filter: (f) => !f.endsWith("README.md") });

// 발행물 경로는 종류별로 그대로 둔다. 이미 나간 주소가 깨지면 안 된다.
for (const kind of KIND_NAMES)
  for (const d of sets[kind]) {
    const dir = join(SITE, kind, d.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), renderDoc(d, years));
  }

for (const p of all) {
  const dir = join(SITE, p.year, `Q${p.q}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderList(years, p, "../../", false));
}

// 홈은 가장 나중 분기다. 분기가 바뀐 첫 주에는 그 분기에 주간호 한 건뿐이다.
const latest = all[all.length - 1];
writeFileSync(
  join(SITE, "index.html"),
  latest
    ? renderList(years, latest, "./", true)
    : layout({
        title: `${SITE_TITLE} — 주간 뉴스 브리핑`,
        description: SITE_TAGLINE,
        root: "./",
        full: true,
        body: `<div class="empty"><p>아직 발행된 ${KINDS.week.label}가 없습니다.</p></div>`,
      })
);

const runs = loadRuns();
const statViews = statsViews(runs);
for (const v of statViews) {
  mkdirSync(join(SITE, v.path), { recursive: true });
  writeFileSync(join(SITE, v.path, "index.html"), renderStats(statViews, v));
}

// 기간별 통계가 기록을 빠뜨리거나 겹치지 않는지 본다. 분기 페이지의 표를 모두
// 합치면 기록 전체와 한 번씩 맞아야 한다.
const tableWeeks = (v) =>
  [...(readFileSync(join(SITE, v.path, "index.html"), "utf8").match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "")
    .matchAll(/<tr[^>]*>\s*<td>([^<]+)<\/td>/g)].map((m) => m[1]);
const inQuarters = statViews.filter((v) => v.q).flatMap(tableWeeks).sort();
const expected = runs.map((r) => r.week).sort();
if (inQuarters.join() !== expected.join() || statViews.some((v) => tableWeeks(v).length !== v.runs.length)) {
  console.error(`기간별 통계 표가 기록과 다르다. 기록 ${expected.length}개, 분기 표 합 ${inQuarters.length}개.`);
  process.exit(1);
}

// 목차가 항목을 빠짐없이 가리키는지 본다. 목차는 빌드가 만든 HTML 을 다시 읽어
// 만들므로, 항목 마크업이 바뀌면 목차가 오류 없이 비거나 모자랄 수 있다. 원고의 항목
// 수(보통 15개)와 목차 줄 수, 목차로 돌아가는 제목 링크 수가 모두 같아야 한다.
const badToc = KIND_NAMES.flatMap((kind) =>
  sets[kind].flatMap((d) => {
    const html = readFileSync(join(SITE, kind, d.id, "index.html"), "utf8");
    const want = Object.values(d.n).reduce((a, b) => a + b, 0);
    const lines = (html.match(/<nav class="toc"[\s\S]*?<\/nav>/)?.[0].match(/<li>/g) ?? []).length;
    const back = (html.match(/class="to-toc"/g) ?? []).length;
    return lines === want && back === want ? [] : [`${d.id} 항목 ${want} · 목차 ${lines} · 제목 링크 ${back}`];
  })
);
if (badToc.length) {
  console.error(`목차가 항목과 맞지 않는다: ${badToc.join(", ")}. 항목 마크업이 바뀌었는지 본다.`);
  process.exit(1);
}

// 분기호와 연간호의 근거 링크가 실제 항목을 가리키는지 본다. 분기호는 그 분기의
// 주간호와 앞선 분기호만, 연간호는 그 해의 분기호와 앞선 연간호만 가리킨다. 앵커가 없는 항목으로 가면
// 브라우저는 오류 없이 페이지 맨 위를 연다.
const NAME_OF = Object.fromEntries(Object.entries(KINDS.week.groups).map(([name, slug]) => [slug, name]));
const SOURCE = { quarter: "week", year: "quarter" };
const badLinks = ["quarter", "year"].flatMap((kind) =>
  sets[kind].flatMap((d) =>
    [...d.body.matchAll(/\]\((\.\.\/\.\.\/(\w+)\/([^/)]+)\/#(\w+)-(\d+))\)/g)].flatMap(([, href, k, id, slug, num]) => {
      const target = sets[k]?.find((t) => t.id === id);
      const count = target?.n[NAME_OF[slug]] ?? 0;
      const at = placeOf({ kind: k, id }), here = placeOf(d);
      const earlier = Number(at.year) < Number(here.year) || (at.year === here.year && at.q < here.q);
      const inside = k === SOURCE[kind]
        ? at.year === here.year && (kind === "year" || at.q === here.q)
        : k === kind && earlier;
      return target && inside && Number(num) <= count ? [] : [`${d.id} → ${href}`];
    })
  )
);
if (badLinks.length) {
  console.error(`근거 링크가 가리키는 항목이 없거나 범위 밖이다: ${badLinks.join(", ")}`);
  process.exit(1);
}

// 분기호와 연간호의 항목 모양을 본다. 2026-Q2·Q3 첫 발행에서 흐름이 주제 묶음으로
// 불어나고 전개가 연표가 된 것을 막는다(분기 런북 3·5절).
// - 1~3번 흐름은 서로 다른 주(연간호는 분기) 둘 이상에 근거가 있다.
// - 한 항목의 근거는 주마다 하나다. 같은 주 항목을 더 붙여 흐름을 키우지 않는다.
// - 한 주간호 항목은 한 번만 쓴다. 한 사안을 흐름과 단발에 나눠 싣지 않는다.
// - 지난 분기호(연간호는 지난 연간호) 링크는 흐름에만, 근거 맨 앞에 하나까지 단다.
// - 전개는 여섯 문장, 무슨 일은 한 문장까지다. 전개는 두 문단으로 나눈다.
const sentences = (t) => (t.match(/다\.["”’')]*(?=\s|$)/g) ?? []).length;
const badShape = ["quarter", "year"].flatMap((kind) =>
  sets[kind].flatMap((d) => {
    const out = [], seen = new Map();
    for (const chunk of d.body.split(/^## /m).slice(1)) {
      const field = chunk.split("\n")[0].trim();
      for (const item of chunk.split(/^### /m).slice(1)) {
        const num = Number(item.match(/^(\d+)\./)?.[1]);
        const at = `${field} ${num}`;
        // 필드는 다음 필드 줄 앞까지다. 전개처럼 문단을 나눈 필드도 통째로 읽는다.
        const line = (label) => item.match(new RegExp(`\\*\\*${label}\\*\\*\\s*:?\\s*([\\s\\S]*?)(?=\\n- \\*\\*|$)`))?.[1] ?? "";
        const links = [...line("근거").matchAll(/\]\(\.\.\/\.\.\/(\w+)\/([^/)]+)\/#(\w+-\d+)\)/g)].map(([, k, id, a]) => ({ k, id, a }));
        const own = links.filter((l) => l.k === SOURCE[kind]);
        const past = links.filter((l) => l.k === kind);
        if (past.length > 1) out.push(`${at}: 지난 ${kind === "quarter" ? "분기호" : "연간호"} 링크가 ${past.length}개다(하나까지)`);
        if (past.length && links[0].k !== kind) out.push(`${at}: 지난 ${kind === "quarter" ? "분기호" : "연간호"} 링크가 근거 맨 앞이 아니다`);
        if (past.length && num > 3) out.push(`${at}: 단발에 지난 ${kind === "quarter" ? "분기호" : "연간호"} 링크가 있다`);
        const ids = own.map((l) => l.id);
        if (new Set(ids).size !== ids.length) out.push(`${at}: 근거에 같은 ${kind === "quarter" ? "주" : "분기"}가 두 번 있다`);
        if (num <= 3 && new Set(ids).size < 2) out.push(`${at}: 흐름인데 근거가 ${kind === "quarter" ? "두 주" : "두 분기"}에 걸치지 않는다`);
        for (const l of own) {
          const key = `${l.id}#${l.a}`;
          if (seen.has(key)) out.push(`${at}: ${key} 를 ${seen.get(key)} 에서 이미 썼다`);
          else seen.set(key, at);
        }
        if (sentences(line("전개")) > 6) out.push(`${at}: 전개가 ${sentences(line("전개"))}문장이다(6까지)`);
        if (line("전개") && !/\n\s*\n/.test(line("전개").trim())) out.push(`${at}: 전개가 한 문단이다(두 문단으로 나눈다)`);
        if (sentences(line("무슨 일")) > 1) out.push(`${at}: 무슨 일이 ${sentences(line("무슨 일"))}문장이다(1까지)`);
      }
    }
    return out.map((m) => `${d.id} ${m}`);
  })
);
if (badShape.length) {
  console.error(`분기호·연간호 항목이 런북과 맞지 않는다:\n  ${badShape.join("\n  ")}`);
  process.exit(1);
}

// ---------- 쓰이지 않는 스타일 ----------
// CSS 에 정의된 클래스가 어느 페이지에도 없으면 빌드를 멈춘다. 마크업의 클래스 이름이
// 바뀌면 스타일이 오류 없이 떨어져 나간다. 52dcefa 가 번호 배지를 그렇게 지웠다.
// 아래는 특정 내용이 있을 때만 나오는 클래스라, 지금 콘텐츠에 없어도 정상이다.
const CONDITIONAL = new Set([
  "quarter", // 분기호가 있을 때
  "empty", // 목록이나 기록이 비었을 때
  "counts", "issue-meta", // 건수가 국내·해외·AI 5건씩이 아닌 호
  "wide", "plot", "yaxis", "scroll", // 한 그래프의 막대가 본문 폭을 넘을 때
  "old", "more-toggle", "more", // 기록이 16개를 넘을 때
]);
const usedClasses = new Set();
for (const f of readdirSync(SITE, { recursive: true }))
  if (f.endsWith(".html"))
    for (const m of readFileSync(join(SITE, f), "utf8").matchAll(/class="([^"]*)"/g))
      for (const c of m[1].split(/\s+/)) usedClasses.add(c);
const cssSelectors = CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{[^{}]*\}/g, "{}");
const unusedClasses = [...new Set([...cssSelectors.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))]
  .filter((c) => !usedClasses.has(c) && !CONDITIONAL.has(c));
// 취소선이 다시 생기면 빌드를 멈춘다. 마크다운 변환기를 바꾸거나 올릴 때 위 설정이 빠질 수 있다.
const struck = readdirSync(SITE, { recursive: true }).filter(
  (f) => f.endsWith(".html") && readFileSync(join(SITE, f), "utf8").includes("<del>")
);
if (struck.length) {
  console.error(`취소선이 렌더링됐다: ${struck.join(", ")}. 물결표가 취소선으로 바뀌었는지 본다.`);
  process.exit(1);
}
if (unusedClasses.length) {
  console.error(`쓰이지 않는 CSS 클래스: ${unusedClasses.join(", ")}. 마크업의 클래스 이름이 바뀌었는지 본다.`);
  process.exit(1);
}

console.log(
  all
    .map((p) => `${listTitle(p)} ${years.get(p.year).quarters.get(p.q).length}개`)
    .join(" | ") || "발행물 없음"
);
console.log(`통계 ${statViews.map((v) => `${v.label} ${v.runs.length}개`).join(" | ")}`);
