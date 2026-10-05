// content/{week,quarter,year}/*.md → site/
// data/runs/*.json → site/stats/
// 프론트매터는 평면 key: value 만 지원한다. 그 이상이 필요해지면 그때 파서를 바꾼다.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { OUTLETS_EN } from "./outlets-en.mjs";
import { checkContent, checkSite } from "./build-checks.mjs";
import { itemsOf, findItems, positions } from "./search.mjs";
import { VERSION_FILE, hashSite, kst, headCommit, pickUpdated, fetchLive } from "./site-version.mjs";

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

// URL 의 pathname 은 한글·공백을 %인코딩한 채로 둔다. 파일 경로로 바꿔 쓴다.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTENT = join(ROOT, "content");
const RUNS = join(ROOT, "data", "runs");
const SITE = join(ROOT, "site");

const SITE_TITLE = "AI Weekly News";
const SITE_TAGLINE = "지난 한 주의 뉴스를 국내·해외·AI 각 5건으로 정리합니다. AI가 수집하고 요약하며, 모든 항목에 출처를 답니다.";
const REPO_URL = "https://github.com/yg-moon/ai-weekly-news";
// 링크 미리보기 이미지는 절대 주소여야 한다.
const SITE_URL = "https://yg-moon.github.io/ai-weekly-news/";
// 방문자 통계(Umami Cloud). 배포된 주소에서 연 페이지만 센다.
const UMAMI_ID = "23e118f1-1e88-4802-952a-7bc65d7e05a5";

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

// 언어판. 한국어판이 원본이고 영문판은 그 번역이다. 영문 원고는 content/en/ 에 같은
// 파일 이름으로 두고, 페이지는 site/en/ 아래에 한국어판과 같은 경로로 낸다.
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TEXT = {
  ko: {
    dir: "", locale: "ko_KR", name: "KOR",
    groups: KINDS.week.groups,
    suffix: Object.fromEntries(KIND_NAMES.map((k) => [k, KINDS[k].suffix])),
    period: (meta) => `${koDate(meta.period_start)} – ${koDate(meta.period_end)}`,
    listTitle: (p) => (p.q ? `${p.year}년 ${p.q}분기` : `${p.year}년 연간`),
    tagline: SITE_TAGLINE,
    home: "주간 뉴스 브리핑", recent: "최근",
    why: "왜 중요한가", src: "출처", annual: "연간", toc: "목차", stats: "통계", about: "사이트 소개",
    flow: ["흐름", "여러 주에 걸쳐 이어진 일"], single: ["단발", "흐름으로 묶이지 않은 큰 일"],
    count: (n) => `${n}건`,
    state: ["진행중", "완결"],
    pending: (need) => `주간호가 ${need}개 이상 쌓이면 흐름을 모아 분기호를 작성하고, 매주 갱신합니다.`,
    theme: "다크 모드 전환",
    search: { label: "검색", placeholder: "지난 호에서 찾기", sort: ["관련도순", "최신순"], count: (n) => `${n}건`, none: "결과가 없습니다.", desc: "지난 호의 항목을 제목과 본문으로 찾습니다." },
    pager: ["이전 호와 다음 호", "이전 호", "다음 호"],
    og: "og.png",
    aboutDesc: `${SITE_TITLE}를 만든 이유와 뉴스를 고르고 만드는 방식.`,
    updated: (t) => `마지막 업데이트: ${t.y}년 ${t.m}월 ${t.d}일 ${t.hm} KST`,
    fb: {
      link: "피드백", title: "피드백 보내기", close: "닫기",
      msg: "불편한 점이나 바라는 점을 적어주세요", email: "답장받을 이메일 (선택)",
      send: "보내기", sending: "보내는 중…", done: "보냈습니다. 고맙습니다.", fail: "보내지 못했습니다. 잠시 뒤 다시 보내 주세요.",
    },
    st: {
      back: "← 목록", all: "전체", yearLabel: (y) => `${y}년`,
      tiles: ["주간호", "개", "총 비용", "평균 비용", "평균 소요 시간", "분"],
      min: (v) => `${v}분`, cost: "비용 (달러)", time: "소요 시간 (분)",
      more: "더보기", th: ["주간호", "비용", "소요 시간", "읽은 헤드라인", "모델"], empty: "아직 기록이 없습니다.",
      long: "분기호·연간호", longLede: "분기호는 분기 도중 매주 다시 쓰므로, 모든 판의 비용과 시간을 더해 적습니다.",
      longTh: ["발행물", "판 수", "총 비용", "평균 비용", "총 소요 시간", "평균 소요 시간"],
      notes: [
        [["2026-W40"], "W40부터 영문판 번역과 링크·수치 검사를 발행 시 함께 수행합니다. 따라서 지난 호를 한꺼번에 만든 W39까지보다 비용과 시간이 증가했습니다."],
        [["2026-Q2", "2026-Q3"], "2026-Q2·Q3는 분기가 끝난 뒤 한 번에 써서 판이 하나입니다."],
      ],
      sec: "발행 비용 및 시간",
      lede: "AI가 각 발행물을 만드는 데 든 비용과 시간입니다. 비용은 API 정가 환산이며 실제 청구액이 아닙니다.",
      desc: (label) => `발행물을 만드는 데 든 비용과 시간, 인용한 매체. ${label}.`,
      outlets: "인용 매체", outletsLede: "주간호 항목에서 출처로 인용한 매체의 목록입니다.",
      outletHead: (items, n) => `항목 ${items}건 · 매체 ${n}곳`, rest: (n) => `그 밖 ${n}곳`,
      outletNote: "숫자는 그 매체를 출처로 단 항목 수, 퍼센트는 그 분야 항목 가운데 차지하는 비율입니다. 한 항목이 여러 매체를 출처로 달기 때문에 퍼센트를 더하면 100%를 넘습니다.",
    },
  },
  en: {
    dir: "en/", locale: "en_US", name: "ENG",
    groups: { Korea: "korea", World: "world", AI: "ai" },
    suffix: { week: "Weekly Briefing", quarter: "Quarterly Review", year: "Annual Review" },
    period: ({ period_start: a, period_end: b }) => {
      const [, ma, da] = a.split("-").map(Number), [, mb, db] = b.split("-").map(Number);
      return ma === mb ? `${EN_MONTHS[ma - 1]} ${da}–${db}` : `${EN_MONTHS[ma - 1]} ${da} – ${EN_MONTHS[mb - 1]} ${db}`;
    },
    listTitle: (p) => (p.q ? `${p.year} Q${p.q}` : `${p.year} Annual`),
    // 세 분야 이름은 줄이 바뀌어도 함께 넘어가게 붙인다(\u00a0). 좁은 폰에서 "AI." 만 떨어졌다.
    tagline: "The past week in five stories each: Korea\u00a0·\u00a0World\u00a0·\u00a0AI. Collected and summarized by AI, with sources for every item.",
    home: "Weekly News Briefing", recent: "Latest",
    why: "Why it matters", src: "Sources", annual: "Annual", toc: "Contents", stats: "Stats", about: "About",
    flow: ["Ongoing", "Stories that ran over several weeks"], single: ["Standalone", "Big stories that stand on their own"],
    count: (n) => `${n} items`,
    state: ["In progress", "Complete"],
    pending: (need) => `Once ${["zero", "one", "two", "three", "four", "five"][need]} or more weekly briefings are in, their developing stories will be gathered into a quarterly review, updated every week.`,
    theme: "Toggle dark mode",
    search: { label: "Search", placeholder: "Search past publications", sort: ["Relevance", "Newest"], count: (n) => (n === 1 ? "1 result" : `${n} results`), none: "No results.", desc: "Search past items by title and text." },
    pager: ["Previous and next publications", "Previous", "Next"],
    og: "og-en.png",
    aboutDesc: `Why ${SITE_TITLE} exists, and how its stories are chosen and made.`,
    updated: (t) => `Last updated: ${EN_MONTHS[t.m - 1]} ${t.d}, ${t.y}, ${t.hm} KST`,
    fb: {
      link: "Feedback", title: "Send feedback", close: "Close",
      msg: "Tell us what isn't working or what you'd like to see", email: "Email for a reply (optional)",
      send: "Send", sending: "Sending…", done: "Sent. Thank you.", fail: "Couldn't send. Please try again later.",
    },
    st: {
      back: "← All publications", all: "All", yearLabel: (y) => y,
      tiles: ["Weekly briefings", "", "Total cost", "Average cost", "Average time", "min"],
      min: (v) => `${v} min`, cost: "Cost (USD)", time: "Time (minutes)",
      more: "Show more", th: ["Weekly briefing", "Cost", "Time", "Headlines read", "Model"], empty: "No records yet.",
      long: "Quarterly and annual reviews", longLede: "Quarterly reviews are rewritten every week while the quarter is under way, so these figures include the cost and time of every edition.",
      longTh: ["Publication", "Editions", "Total cost", "Average cost", "Total time", "Average time"],
      notes: [
        [["2026-W40"], "Since W40, each publication also includes the English translation and the link and figure checks, so it costs more and takes longer than W39 and earlier, which were produced together in one batch."],
        [["2026-Q2", "2026-Q3"], "2026-Q2 and Q3 were written once after their quarters ended, so each has one edition."],
      ],
      sec: "Cost and time per publication",
      lede: "What it cost the AI to make each publication, and how long it took. Costs are calculated at API list prices, not what was actually billed.",
      desc: (label) => `Cost and time to make each publication, and the outlets cited. ${label}.`,
      outlets: "Outlets cited", outletsLede: "The outlets cited as sources in weekly items.",
      outletHead: (items, n) => `${items} items · ${n} outlets`, rest: (n) => `${n} more`,
      outletNote: "The number is how many items cite that outlet. The percentage is its share of all items in that section. One item often cites several outlets, so the percentages add up to more than 100%.",
    },
  },
};
const LANG_NAMES = Object.keys(TEXT);
// 영문 원고의 라벨. 화면과 검사는 한국어 라벨 이름으로 다룬다.
const FIELD_EN = { Date: "날짜", "What happened": "무슨 일", "Why it matters": "왜 중요한가", Sources: "출처", Development: "전개", Basis: "근거" };

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
function load(kind, lang = "ko") {
  const from = join(CONTENT, TEXT[lang].dir, kind);
  let files;
  try {
    files = readdirSync(from);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { meta, body } = parseFrontmatter(readFileSync(join(from, f), "utf8"));
      const id = basename(f, ".md");
      if (meta[kind] !== id) throw new Error(`${kind}/${f}: 파일명과 frontmatter ${kind} 가 다르다`);
      return { kind, id, lang, meta, body, n: sectionCounts(body) };
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
const period = (d) => TEXT[d.lang].period(d.meta);
const groupsOf = (d) => Object.keys(TEXT[d.lang].groups);
const counts = (d) => groupsOf(d).map((g) => `${g} ${d.n[g] ?? 0}`).join(" · ");
// 어느 종류든 구획마다 5건이 표준이다. 표준이면 건수를 화면에서 반복하지 않고,
// 어긋날 때만 드러낸다.
const isStandard = (d) => groupsOf(d).every((g) => d.n[g] === 5);
// 분기호는 진행 중인지 끝났는지를 제목에 붙인다. 진행 중인 판은 프런트매터에 through(기준 주)가 있다.
const stateMark = (d) => (d.kind === "quarter" ? ` (${TEXT[d.lang].state[d.meta.through ? 0 : 1]})` : "");
const pageTitle = (d) => `${d.id} ${TEXT[d.lang].suffix[d.kind]}${stateMark(d)} (${period(d)})`;
// 화면에서는 기간을 다음 줄로 내린다. 한 줄에 두면 좁은 화면에서 어중간하게 잘린다.
const pageTitleHtml = (d) =>
  `${d.id} ${TEXT[d.lang].suffix[d.kind]}${stateMark(d)}<span class="period">${period(d)}</span>`;

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

function buildItem(slug, num, title, listHtml, T) {
  const fields = {};
  // 목록에 빈 줄이 있으면 marked 가 각 <li> 안을 <p> 로 감싼다. 양쪽을 다 받는다.
  const re =
    /<li>\s*(?:<p>)?\s*<strong>(날짜|무슨 일|왜 중요한가|출처|전개|근거|Date|What happened|Why it matters|Sources|Development|Basis)<\/strong>\s*:?\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/g;
  let m;
  while ((m = re.exec(listHtml))) fields[FIELD_EN[m[1]] ?? m[1]] = paragraphs(m[2].trim());

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
    parts.push(`<div class="why"><p class="lbl">${T.why}</p>${ps("왜 중요한가")}</div>`);
  // 분기호·연간호의 근거 링크도 화면에서는 주간호와 같이 "출처"로 부른다.
  for (const label of ["출처", "근거"])
    if (fields[label])
      parts.push(`<p class="src"><span class="lbl">${T.src}</span>${sources(fields[label].join(" "))}</p>`);

  // 분기 인사이트가 개별 항목을 가리킨다. 앵커는 `<분야>-<번호>` 다.
  return `<article class="item" id="${slug}-${num}">${parts.join("")}</article>`;
}

const kindHead = ([name, what]) => `<p class="kind-h"><b>${name}</b>${what}</p>`;

function structure(html, T) {
  const { groups } = T;
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
          const item = buildItem(slug, num, title.trim(), list, T);
          if (!item) return whole;
          const k = /<strong>(전개|Development)<\/strong>/.test(list) ? "flow"
            : !/<strong>(날짜|Date)<\/strong>/.test(list) ? "single" : null;
          if (!k || seen.has(k)) return item;
          seen.add(k);
          return kindHead(T[k]) + item;
        }
      );

      const n = (body.match(/class="item"/g) ?? []).length;
      const chip = n === 5 ? "" : `<span class="n">${T.count(n)}</span>`;
      const head = `<h2><span class="rule"></span>${name}${chip}</h2>`;
      return `<section class="group group--${slug}">${head}${body}</section>`;
    })
    .join("");
}

// ---------- 레이아웃 ----------

// 스타일은 style.css 에 있다. 페이지마다 <style> 로 넣는다. 파일 하나를 더 받지 않아도 된다.
const CSS = readFileSync(join(ROOT, "scripts", "style.css"), "utf8");

// 언어 선택. 다른 언어판에 같은 페이지가 있으면 그리로, 없으면 그 언어판의 홈으로 간다.
// 고른 언어를 기억해 두고, 다음에 다른 언어판 주소로 들어오면 같은 페이지의 고른 언어판으로
// 옮긴다. 저장소를 못 쓰는 브라우저에서는 기억만 못 하고 페이지는 그대로 보인다.
const LANG_SCRIPT = `<script>
(function () {
  var h = document.documentElement;
  try {
    var want = localStorage.getItem("lang");
    var alt = h.getAttribute("data-alt-" + want);
    if (want && want !== h.lang && alt) location.replace(alt + location.hash);
  } catch (e) {}
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-lang]");
    if (a) try { localStorage.setItem("lang", a.getAttribute("data-lang")); } catch (e) {}
  });
})();
</script>`;

// 화면 밝기. 기본은 기기 설정이다. 버튼은 지금 보이는 쪽의 반대로 바꾸고, 그 결과가 기기 설정과
// 같으면 저장을 지워 다시 기기 설정을 따른다. 그리기 전에 돌도록 <head> 에 둔다.
const THEME_SCRIPT = `<script>
(function () {
  var h = document.documentElement, mq = window.matchMedia && matchMedia("(prefers-color-scheme: dark)");
  try { var t = localStorage.getItem("theme"); if (t === "dark" || t === "light") h.setAttribute("data-theme", t); } catch (e) {}
  document.addEventListener("click", function (e) {
    if (!(e.target.closest && e.target.closest(".theme-toggle"))) return;
    var sys = mq && mq.matches ? "dark" : "light", next = (h.getAttribute("data-theme") || sys) === "dark" ? "light" : "dark";
    if (next === sys) h.removeAttribute("data-theme"); else h.setAttribute("data-theme", next);
    try { next === sys ? localStorage.removeItem("theme") : localStorage.setItem("theme", next); } catch (e) {}
  });
})();
</script>`;

// 피드백 창. 보낸 글은 Web3Forms 가 사용자 메일로 전한다. 액세스 키는 받는 메일 주소를 가리키는
// 공개용 값이라 페이지에 그대로 둔다. 보던 페이지 주소를 함께 보낸다. botcheck 는 스팸 봇이 채우는 숨은 칸이다.
const WEB3FORMS_KEY = "ba2d7f3e-9ed5-410b-9716-b693f1b42ad6";
function feedback(T) {
  const F = T.fb;
  return `<dialog class="fb" id="fb" aria-labelledby="fb-title">
  <form method="dialog" class="fb-head"><h2 id="fb-title">${F.title}</h2><button class="fb-x" aria-label="${F.close}">×</button></form>
  <form class="fb-form">
    <textarea name="message" required aria-label="${F.link}" placeholder="${F.msg}"></textarea>
    <input name="email" type="email" aria-label="${F.email}" placeholder="${F.email}">
    <input name="botcheck" type="checkbox" class="fb-bot" tabindex="-1" autocomplete="off">
    <button class="fb-send" disabled>${F.send}</button>
    <p class="fb-status" role="status"></p>
  </form>
</dialog>
<script>
(function () {
  var d = document.getElementById("fb"), f = d.querySelector(".fb-form"), b = f.querySelector(".fb-send"), s = f.querySelector(".fb-status");
  var F = ${JSON.stringify({ send: F.send, sending: F.sending, done: F.done, fail: F.fail })};
  // 바닥글 버튼과 본문의 #feedback 링크(소개 페이지)가 같은 창을 연다.
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest(".fb-open, a[href='#feedback']");
    if (!t) return;
    e.preventDefault(); s.textContent = ""; d.showModal();
  });
  d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
  f.message.addEventListener("input", function () { b.disabled = !f.message.value.trim(); s.textContent = ""; });
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    b.disabled = true; b.textContent = F.sending;
    fetch("https://api.web3forms.com/submit", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: "${WEB3FORMS_KEY}", subject: "피드백 — " + document.title,
        from_name: "${SITE_TITLE}", message: f.message.value, email: f.email.value || undefined,
        page: location.href, botcheck: f.botcheck.checked,
      }),
    }).then(function (r) { return r.json(); }).then(function (r) {
      if (!r.success) throw 0;
      f.reset(); s.textContent = F.done;
    }).catch(function () { s.textContent = F.fail; b.disabled = false; })
      .then(function () { b.textContent = F.send; });
  });
})();
</script>`;
}

// 바닥글의 마지막 업데이트 시각 자리. 모든 페이지를 쓴 뒤 사이트 지문을 내고 채운다(맨 아래).
const UPDATED_MARK = "__SITE_UPDATED__";

// path 는 언어판 안에서의 경로다. 홈은 "", 주간호는 "week/2026-W39/".
function layout({ title, description, root, body, full = false, lang = "ko", path = null }) {
  const T = TEXT[lang];
  const home = root + T.dir;
  const others = path === null ? [] : LANG_NAMES.filter((l) => l !== lang && PAGES[l].has(path));
  const altAttrs = others.map((l) => ` data-alt-${l}="${root}${TEXT[l].dir}${path}"`).join("");
  const hreflang = path !== null && others.length
    ? [...[lang, ...others].map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE_URL}${TEXT[l].dir}${path}">`),
        `<link rel="alternate" hreflang="x-default" href="${SITE_URL}${path}">`].join("\n")
    : "";
  const switcher = `<nav class="lang" aria-label="Language">${LANG_NAMES.map((l) =>
    l === lang
      ? `<span aria-current="true">${TEXT[l].name}</span>`
      : `<a href="${root}${TEXT[l].dir}${path !== null && PAGES[l].has(path) ? path : ""}" hreflang="${l}" data-lang="${l}">${TEXT[l].name}</a>`
  ).join("")}</nav>`;
  const searchLink = `<a class="search-link" href="${home}search/" aria-label="${T.search.label}"${path === "search/" ? ' aria-current="page"' : ""}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16.5 16.5 21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></a>`;
  const themeButton = `<button class="theme-toggle" type="button" aria-label="${T.theme}"><svg class="i-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/></svg><svg class="i-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg></button>`;
  const masthead = `<div class="masthead"><h1><a href="${home}"><img class="logo" src="${root}favicon.svg" alt="">${SITE_TITLE}</a></h1><div class="tools">${searchLink}${themeButton}${switcher}</div></div>`;
  return `<!doctype html>
<html lang="${lang}"${altAttrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
${path === null ? "" : `<meta property="og:url" content="${SITE_URL}${T.dir}${path}">\n<link rel="canonical" href="${SITE_URL}${T.dir}${path}">\n`}<meta property="og:locale" content="${T.locale}">
<meta property="og:image" content="${SITE_URL}${T.og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${root}favicon-96.png" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="${SITE_TITLE}${lang === "ko" ? "" : ` (${T.name})`}" href="${SITE_URL}${T.dir}feed.xml">
<script defer src="https://cloud.umami.is/script.js" data-website-id="${UMAMI_ID}" data-domains="yg-moon.github.io"></script>
${hreflang}
${THEME_SCRIPT}
<style>${CSS}</style>
${LANG_SCRIPT}
</head>
<body>
<div class="wrap">
${full ? `<header class="site">
  ${masthead}
  <p class="tagline">${T.tagline}</p>
</header>` : `<header class="site compact">${masthead}</header>`}
${body}
<footer>
  <p><a href="${home}about/">${T.about}</a> · <a href="${home}stats/">${T.stats}</a> · <button class="fb-open" type="button">${T.fb.link}</button> · <a href="${home}feed.xml">RSS</a> · <a href="${REPO_URL}">GitHub</a></p>
  <p class="updated">${UPDATED_MARK}</p>
</footer>
${feedback(T)}
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

// 연간 목록은 q 가 null 이다. 연간호 하나뿐이어도 분기와 같은 목록 페이지로 둔다. 칩을 누르는
// 사람은 무엇이 있는지 보려는 것이라 발행물로 바로 넘어가면 당황한다(2026-10-05).
const annuals = (years) =>
  [...years.keys()].sort().filter((y) => years.get(y).annual).map((y) => ({ year: y, q: null }));
const listPath = (p) => (p.q ? `${p.year}/Q${p.q}/` : `${p.year}/annual/`);
const listTitle = (p, lang = "ko") => TEXT[lang].listTitle(p);

// 목록의 탭은 두 단이다. 첫 줄은 최근(홈)과 연도들, 둘째 줄은 고른 해의 분기와 연간이다.
// 한 줄에 다 두면 해가 셋을 넘을 때 분기가 다음 줄로 밀린다. 연도를 누르면 그 해의 연간
// 목록으로, 연간호가 아직 없으면 그 해에서 가장 나중 분기로 간다. 첫 줄은 줄바꿈하지 않고, 넘치면 옆으로 밀어 본다. here 가 없으면 홈이다.
function tabs(years, here, root, T) {
  const all = periods(years);
  if (!all.length) return "";
  const recent = here ? `<a class="tab" href="${root}">${T.recent}</a>` : `<span class="tab on" aria-current="page">${T.recent}</span>`;
  const yearTabs = [...new Set(all.map((p) => p.year))].map((y) =>
    here && y === here.year ? `<span class="tab on">${y}</span>` : `<a class="tab" href="${root}${listPath(years.get(y).annual ? { year: y, q: null } : all.filter((p) => p.year === y).pop())}">${y}</a>`).join("");
  const row = `<nav class="tabs">${recent}<span class="tabdiv"></span>${yearTabs}</nav>`;
  if (!here) return row;
  const quarterChips = all.filter((p) => p.year === here.year).map((p) =>
    p.q === here.q ? `<span class="chip on" aria-current="page">Q${p.q}</span>` : `<a class="chip" href="${root}${listPath(p)}">Q${p.q}</a>`).join("");
  const annual = years.get(here.year).annual;
  const annualChip = !annual ? "" : here.q === null
    ? `<span class="chip on" aria-current="page">${T.annual}</span>`
    : `<a class="chip" href="${root}${listPath({ year: here.year, q: null })}">${T.annual}</a>`;
  return `${row}<nav class="subtabs">${quarterChips}${annualChip}</nav>`;
}

// 목차와 목록에 쓰는 제목. 태그만 걷고 전체를 둔다. 길면 CSS 가 두 줄에서 자른다.
const plainTitle = (html) => html.replace(/<[^>]+>/g, "").trim();

// 주간호 목차. 구조화한 본문에서 분야와 항목 제목을 다시 읽는다.
// 넓은 화면에서는 본문 왼쪽에 고정되고, 좁은 화면에서는 제목 아래에 펼쳐 둔다.
function toc(html, T) {
  const groups = html.split(/(?=<section class="group )/).flatMap((chunk) => {
    const g = chunk.match(/^<section class="group group--(\w+)"><h2><span class="rule"><\/span>([^<]*)/);
    if (!g) return [];
    const items = [...chunk.matchAll(/<article class="item" id="([^"]+)"><div class="item-head"><span class="num">(\d+)<\/span><h3>([\s\S]*?)<\/h3>/g)]
      .map(([, id, num, title]) => `<li><a href="#${id}"><span class="tn">${num}</span><span class="tt">${plainTitle(title)}</span></a></li>`);
    return items.length ? [`<div class="toc-group group--${g[1]}"><p class="toc-name">${g[2].trim()}</p><ol>${items.join("")}</ol></div>`] : [];
  });
  return groups.length ? `<nav class="toc" id="toc" aria-label="${T.toc}">${groups.join("")}</nav>` : "";
}

// 같은 종류의 바로 앞뒤 발행물. ID 는 문자열 순서가 곧 시간 순서다.
function pager(d) {
  const ids = SETS[d.lang][d.kind].map((x) => x.id).sort();
  const i = ids.indexOf(d.id);
  const [prev, next] = [ids[i - 1], ids[i + 1]];
  const [label, before, after] = TEXT[d.lang].pager;
  if (!prev && !next) return "";
  return `<nav class="pager" aria-label="${label}">${
    prev ? `<a class="prev" href="../${prev}/"><small>${before}</small>← ${prev}</a>` : ""}${
    next ? `<a class="next" href="../${next}/"><small>${after}</small>${next} →</a>` : ""}</nav>`;
}

function renderDoc(d, years) {
  // 되돌아가는 곳은 그 발행물이 속한 분기 목록이고, 연간호는 그 해의 연간 목록이다.
  const p = placeOf(d);
  const T = TEXT[d.lang];
  const main = fallbackLinks(keepNames(structure(marked.parse(d.body), T), d.lang), d.lang);
  // 목차를 둔다. 항목 제목을 누르면 목차로 돌아간다.
  const nav = toc(main, T);
  const body = `
<p class="crumb"><a href="../../${listPath(p)}">← ${listTitle(p, d.lang)}</a></p>
<h1 class="issue-title">${pageTitleHtml(d)}</h1>
${isStandard(d) ? "" : `<p class="issue-meta">${counts(d)}</p>`}
${nav}
${nav ? main.replace(/(<div class="item-head"><span class="num">\d+<\/span><h3>)([\s\S]*?)<\/h3>/g, '$1<a class="to-toc" href="#toc">$2</a></h3>') : main}
${pager(d)}`;
  return layout({
    title: `${pageTitle(d)} — ${SITE_TITLE}`,
    description: `${d.id} (${period(d)}) ${T.suffix[d.kind]}. ${counts(d)}.`,
    root: "../../" + "../".repeat(T.dir.split("/").filter(Boolean).length),
    body,
    lang: d.lang,
    path: `${d.kind}/${d.id}/`,
  });
}

// 영문판에서 대문자로 시작하는 하이픈 낱말을 줄 끝에서 자르지 않는다. 한국 이름의
// 붙임표에서 줄이 바뀌면 "Lee Jae-" 와 "myung" 이 갈린다. 태그 밖 글자만 고친다.
const keepNames = (html, lang) =>
  lang !== "en" ? html : html.split(/(<[^>]+>)/).map((t) =>
    t.startsWith("<") ? t : t.replace(/\b([A-Z][a-z]+-[a-z]+)\b/g, '<span class="nw">$1</span>')).join("");

// 분기호·연간호의 근거 링크는 같은 언어판의 발행물을 가리킨다. 영문판에 아직 없는 발행물은
// 한국어판으로 보낸다. 번역이 생기면 다음 빌드부터 영문판으로 간다.
const fallbackLinks = (html, lang) =>
  lang === "ko" ? html : html.replace(/href="\.\.\/\.\.\/(week|quarter|year)\/([^/"]+)\//g, (whole, kind, id) =>
    SETS[lang][kind].some((x) => x.id === id) ? whole : `href="../../${"../".repeat(TEXT[lang].dir.split("/").filter(Boolean).length)}${kind}/${id}/`);

// 목록에서 발행물마다 분야별 1위 제목을 한 줄씩 미리 보여 준다.
function tops(d) {
  const lines = d.body.split(/^## /m).slice(1).flatMap((chunk) => {
    const name = chunk.split("\n")[0].trim();
    const first = chunk.match(/^### \d+\.\s*(.+)$/m);
    const slug = TEXT[d.lang].groups[name];
    return first && slug
      ? [`<span class="top group--${slug}"><b>${name}</b><span>${plainTitle(marked.parseInline(first[1]))}</span></span>`]
      : [];
  });
  return lines.length ? `<span class="tops">${lines.join("")}</span>` : "";
}

// 한 분기의 목록. 홈은 가장 나중 분기와 같은 내용이고 root 와 제목만 다르다.
// root 는 사이트 최상위까지, base 는 그 언어판 최상위까지의 상대 경로다.
// 진행 중 분기호는 그 분기 주간호가 4개 쌓인 주부터 나온다(분기 런북 1절). 그 전에는 분기호
// 자리에 주간호가 몇 개 쌓이면 나오는지 적는다. 날짜를 적으면 그날이 특별한 날처럼 읽힌다
// (사용자 2026-10-05).
const PENDING_WEEKS = 4;
function pendingCard(p, docs, lang) {
  if (!p.q || docs.some((d) => d.kind === "quarter") || docs.length >= PENDING_WEEKS) return "";
  const T = TEXT[lang];
  return `
  <li class="pending"><div><span class="wk">${p.year}-Q${p.q} (${T.state[0]})</span><span class="note">${T.pending(PENDING_WEEKS)}</span></div></li>`;
}

const card = (d, base) => `
  <li class="${d.kind}"><a href="${base}${d.kind}/${d.id}/">
    <span class="wk">${d.id}${d.kind === "year" ? ` ${TEXT[d.lang].suffix.year}` : ""}${stateMark(d)}</span>
    <span class="period">${period(d)}</span>
    ${isStandard(d) ? "" : `<span class="counts">${counts(d)}</span>`}
    ${tops(d)}
  </a></li>`;

function renderList(years, p, root, lang = "ko") {
  const T = TEXT[lang];
  const base = root + T.dir;
  const docs = p.q ? years.get(p.year).quarters.get(p.q) : [years.get(p.year).annual];
  return layout({
    title: `${listTitle(p, lang)} — ${SITE_TITLE}`,
    description: T.tagline,
    root,
    full: true,
    lang,
    path: listPath(p),
    body: `${tabs(years, p, base, T)}\n<ul class="archive">${pendingCard(p, docs, lang)}${docs.map((d) => card(d, base)).join("")}\n</ul>`,
  });
}

// 홈은 분기와 상관없는 최근 호들이다. 탭의 "최근"이 곧 제목이라 따로 제목을 달지 않는다. 맨 위에 가장 최근 분기호(진행 중이거나 지난 분기 완결본),
// 그 아래 최근 주간호 13개를 둔다. 분기가 바뀌는 곳에 분기 이름을 단다. 새 분기 첫 주에도
// 홈이 비지 않게 한 것이다(2026-10-04). 연간호는 나오면 분기호 위에 두고, 다음 해 분기호가
// 나오면 홈에서 빠진다(2026-10-05).
const HOME_WEEKS = 13;
function renderHome(years, root, lang = "ko") {
  const T = TEXT[lang];
  const base = root + T.dir;
  const newest = periods(years).reverse().map((p) => ({ p, docs: years.get(p.year).quarters.get(p.q) }));
  const quarterly = newest.flatMap((x) => x.docs).find((d) => d.kind === "quarter");
  const lastYear = [...years.keys()].sort().reverse().find((y) => years.get(y).annual);
  const annual = lastYear && !(quarterly && placeOf(quarterly).year > lastYear) ? years.get(lastYear).annual : null;
  let rows = "", shown = 0;
  for (const { p, docs } of newest) {
    const weeks = docs.filter((d) => d.kind === "week").slice(0, HOME_WEEKS - shown);
    if (!weeks.length) continue;
    rows += `\n  <li class="qdiv">${listTitle(p, lang)}</li>` + weeks.map((d) => card(d, base)).join("");
    if ((shown += weeks.length) >= HOME_WEEKS) break;
  }
  return layout({
    title: `${SITE_TITLE} — ${T.home}`,
    description: T.tagline,
    root,
    full: true,
    lang,
    path: "",
    body: `${tabs(years, null, base, T)}\n<ul class="archive">${annual ? card(annual, base) : ""}${quarterly ? card(quarterly, base) : ""}${rows}\n</ul>`,
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

// 여러 판을 만든 분기호는 record-run 이 판마다의 시간을 더해 minutes 에 둔다.
const minutes = (r) => r.minutes ?? Math.round((new Date(r.published) - new Date(r.started)) / 60e3);
const usd = (x) => `$${x.toFixed(2)}`;
const shortWeek = (w, annual) => (/^\d{4}$/.test(w) ? annual : w.replace(/^\d{4}-/, ""));

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
function barChart(runs, value, fmt, caption, annual) {
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
    const tick = Number.isInteger(k) ? `<text class="axis${k % 2 ? " alt" : ""}" x="${x + bw / 2}" y="${H - B + 16}" text-anchor="middle">${shortWeek(r.week, annual)}</text>` : "";
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

const viewLabel = (v, lang) =>
  !v.year ? TEXT[lang].st.all : !v.q ? TEXT[lang].st.yearLabel(v.year) : listTitle(v, lang);

// 전체 | 연도 | 고른 해의 분기. 전체에서는 분기 칩을 두지 않는다. 어느 해의 분기인지
// 알 수 없다.
function statsTabs(views, here, root, lang) {
  if (views.length === 1) return "";
  const chip = (v, cls, text) =>
    v === here ? `<span class="${cls} on" aria-current="page">${text}</span>` : `<a class="${cls}" href="${root}${v.path}">${text}</a>`;
  const years = views.filter((v) => v.year && !v.q);
  const quarters = views.filter((v) => v.q && v.year === here.year);
  const div = `<span class="tabdiv"></span>`;
  return `<nav class="tabs">${chip(views[0], "tab", TEXT[lang].st.all)}${div}${years.map((v) => chip(v, "yr", v.year)).join("")}${
    quarters.length ? div + quarters.map((v) => chip(v, "tab", `Q${v.q}`)).join("") : ""}</nav>`;
}

// 인용 매체. 주간호 항목의 출처 줄에 오른 매체를 분야별로 센다. 한 항목에서 같은 매체는
// 한 번만 센다. 분기호·연간호의 출처는 주간호 링크라 세지 않는다.
const OUTLETS_SHOWN = 6;
function outletStats(view, lang) {
  const S = TEXT[lang].st;
  const display = (n) => (lang === "en" ? OUTLETS_EN[n] ?? n : n);
  const groupName = Object.fromEntries(Object.entries(TEXT[lang].groups).map(([name, slug]) => [slug, name]));
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
    const list = [...count].map(([n, v]) => [display(n), v]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const max = list[0]?.[1] ?? 1;
    const row = ([n, v]) => `<div class="or"><span class="on">${n}</span><span class="ob"><i style="width:${Math.max(2, Math.round((v / max) * 100))}%"></i></span><span class="ov">${v}<small>${Math.round((v / items) * 100)}%</small></span></div>`;
    const rest = list.slice(OUTLETS_SHOWN);
    return `<div class="og group--${slug}"><p class="og-h">${groupName[slug]}<span>${S.outletHead(items, list.length)}</span></p>
${list.slice(0, OUTLETS_SHOWN).map(row).join("")}
${rest.length ? `<details class="om"><summary>${S.rest(rest.length)}</summary>${rest.map(row).join("")}</details>` : ""}</div>`;
  });
  return `<h2 class="sec">${S.outlets}</h2>
<p class="sec-lede">${S.outletsLede}</p>
<div class="ogs">${groups.join("")}</div>
<p class="og-note">${S.outletNote}</p>`;
}

// 타일·그래프·첫 표는 주간호만 센다. 분기호는 분기 도중 매주 다시 써서 판의 비용이 한 줄에
// 쌓이므로, 주간호와 섞으면 막대가 튀고 평균이 부푼다. 분기호·연간호는 아래 표에 따로 둔다
// (사용자 2026-10-05).
function renderStats(views, view, lang = "ko") {
  const runs = view.runs.filter((r) => /-W\d+$/.test(r.week));
  const longRuns = view.runs.filter((r) => !/-W\d+$/.test(r.week));
  const T = TEXT[lang], S = T.st;
  const root = "../".repeat((T.dir + view.path).split("/").filter(Boolean).length);
  const base = root + T.dir;
  const label = viewLabel(view, lang);
  const sum = (f) => runs.reduce((s, r) => s + f(r), 0);
  const avg = (f) => sum(f) / runs.length;
  const unit = (u) => (u ? `<small>${u}</small>` : "");

  const tiles = runs.length
    ? `<div class="tiles">
  <div class="tile"><span class="k">${S.tiles[0]}</span><span class="v">${runs.length}${unit(S.tiles[1])}</span></div>
  <div class="tile"><span class="k">${S.tiles[2]}</span><span class="v">${usd(sum((r) => r.cost_usd))}</span></div>
  <div class="tile"><span class="k">${S.tiles[3]}</span><span class="v">${usd(avg((r) => r.cost_usd))}</span></div>
  <div class="tile"><span class="k">${S.tiles[4]}</span><span class="v">${Math.round(avg(minutes))}${unit(S.tiles[5])}</span></div>
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
  <td class="r">${usd(r.cost_usd)}</td><td class="r">${S.min(minutes(r))}</td><td class="r">${r.headlines == null ? "—" : r.headlines.toLocaleString("en-US")}</td><td class="m">${r.model}</td>
</tr>`).join("");
  const more = runs.length > SHOWN
    ? `<label for="more-runs" class="more">${S.more}</label>`
    : "";
  const body = runs.length
    ? `${tiles}
${barChart(runs, (r) => r.cost_usd, (v, axis) => (axis ? `$${v}` : usd(v)), S.cost, T.annual)}
${barChart(runs, minutes, S.min, S.time, T.annual)}
${more ? `<input type="checkbox" id="more-runs" class="more-toggle">` : ""}<div class="table-scroll"><table class="runs">
<thead><tr><th>${S.th[0]}</th><th class="r">${S.th[1]}</th><th class="r">${S.th[2]}</th><th class="r">${S.th[3]}</th><th class="m">${S.th[4]}</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
${more}${tableNotes(runs, view, lang)}`
    : `<div class="empty"><p>${S.empty}</p></div>`;

  return layout({
    title: view.q || view.year ? `${T.stats} · ${label} — ${SITE_TITLE}` : `${T.stats} — ${SITE_TITLE}`,
    description: S.desc(label),
    root,
    lang,
    path: view.path,
    body: `<p class="crumb"><a href="${base}">${S.back}</a></p>
<h1 class="issue-title">${T.stats}</h1>
${statsTabs(views, view, base, lang)}
${view.year ? `<p class="period-now">${label}</p>` : ""}
<h2 class="sec">${S.sec}</h2>
<p class="sec-lede">${S.lede}</p>
${body}
${longTable(longRuns, view, lang)}
${outletStats(view, lang)}`,
  });
}

function longTable(runs, view, lang) {
  if (!runs.length) return "";
  const S = TEXT[lang].st;
  const rows = [...runs].reverse().map((r) => {
    const n = r.editions ?? 1;
    return `<tr><td>${r.week}</td><td class="r">${n}</td><td class="r">${usd(r.cost_usd)}</td><td class="r">${usd(r.cost_usd / n)}</td><td class="r">${S.min(minutes(r))}</td><td class="r">${S.min(Math.round(minutes(r) / n))}</td></tr>`;
  }).join("");
  return `<h2 class="sec">${S.long}</h2>
<p class="sec-lede">${S.longLede}</p>
<div class="table-scroll"><table class="runs">
<thead><tr>${S.longTh.map((h, i) => `<th${i ? ' class="r"' : ""}>${h}</th>`).join("")}</tr></thead>
<tbody>${rows}</tbody>
</table></div>${tableNotes(runs, view, lang)}`;
}

// 표 아래 메모. 메모는 그것이 설명하는 기록에 붙고, 그 기록이 들어 있는 연도·분기 탭에만
// 나온다. 전체 탭에는 해가 쌓이면 낡은 이야기가 되므로 띄우지 않는다. 메모를 나중에 지우거나
// 옮기지 않아도 되게 하려는 것이다.
function tableNotes(runs, view, lang) {
  if (!view.year) return "";
  return TEXT[lang].st.notes
    .filter(([ids]) => runs.some((r) => ids.includes(r.week)))
    .map(([, text]) => `\n<p class="table-note">${text}</p>`).join("");
}

// 소개 페이지. 본문은 content/about.md(영문판 content/en/about.md)이고 첫 줄 # 이 제목이다.
function renderAbout(lang) {
  const T = TEXT[lang];
  const root = "../".repeat((T.dir + "about/").split("/").filter(Boolean).length);
  const md = readFileSync(join(CONTENT, T.dir, "about.md"), "utf8");
  const [, title, rest] = md.match(/^# (.+)\n([\s\S]*)$/);
  return layout({
    title: `${title} — ${SITE_TITLE}`,
    description: T.aboutDesc,
    root,
    lang,
    path: "about/",
    body: `<p class="crumb"><a href="${root + T.dir}">${T.st.back}</a></p>
<h1 class="issue-title">${title}</h1>
<div class="prose">
${marked.parse(rest)}</div>`,
  });
}

// 검색 페이지. 색인(index.json)은 이 페이지만 받는다. 검색어는 주소의 ?q= 에 남아 공유할 수 있다.
// 한글은 조합 중인 글자까지 바로 찾되, 끝에 홀로 남은 자모(ㄱ, ㅏ)는 빼고 찾는다. 데스크톱 입력기는
// 다음 글자를 칠 때까지 조합을 끝내지 않아, 조합이 끝난 뒤에만 찾으면 한 글자씩 늦었다(2026-10-04).
// 결과의 클래스 이름은 아래 문자열에 그대로 적어 둔다.
// 빌드의 쓰이지 않는 스타일 검사가 HTML 안의 class="…" 를 읽는다.
function renderSearch(lang) {
  const T = TEXT[lang], S = T.search;
  const root = "../".repeat((T.dir + "search/").split("/").filter(Boolean).length);
  return layout({
    title: `${S.label} — ${SITE_TITLE}`,
    description: S.desc,
    root,
    lang,
    path: "search/",
    body: `<p class="crumb"><a href="${root + T.dir}">${T.st.back}</a></p>
<h1 class="issue-title">${S.label}</h1>
<form class="search" role="search" onsubmit="return false"><input id="q" type="search" name="q" autocomplete="off" autofocus placeholder="${S.placeholder}" aria-label="${S.label}"></form>
<p class="search-count"><span id="count" aria-live="polite"></span><span class="sort" id="sort" hidden><button type="button" data-sort="rel" aria-pressed="true">${S.sort[0]}</button> · <button type="button" data-sort="new" aria-pressed="false">${S.sort[1]}</button></span></p>
<ol class="search-results" id="results"></ol>
<script>
(function () {
  ${positions.toString()}
  ${findItems.toString()}
  var input = document.getElementById("q"), out = document.getElementById("results"), count = document.getElementById("count"), sortBox = document.getElementById("sort");
  var newest = new URLSearchParams(location.search).get("sort") === "new";
  var entries = null, COUNT = ${JSON.stringify(S.count(0)).replace("0", "{n}")}, ONE = ${JSON.stringify(S.count(1))}, NONE = ${JSON.stringify(S.none)}, SNIP = ${lang === "ko" ? 90 : 140};
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // 걸린 자리를 찾는 규칙은 검색과 같다(positions). 겹치는 자리는 앞의 것만 칠한다.
  function mark(s, terms) {
    var low = s.toLowerCase(), r = [], out = "", at = 0;
    terms.forEach(function (w) { positions(low, w).forEach(function (i) { r.push([i, i + w.length]); }); });
    r.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (x) {
      if (x[0] < at) return;
      out += esc(s.slice(at, x[0])) + "<mark>" + esc(s.slice(x[0], x[1])) + "</mark>";
      at = x[1];
    });
    return out + esc(s.slice(at));
  }
  function snippet(text, terms) {
    var low = text.toLowerCase(), at = Math.min.apply(null, terms.map(function (w) { var p = positions(low, w); return p.length ? p[0] : Infinity; }));
    var start = at === Infinity ? 0 : Math.max(0, at - SNIP / 4);
    var cut = start ? text.slice(start, at).search(/\\s/) : -1;
    if (cut >= 0) start += cut + 1;
    var end = Math.min(text.length, start + SNIP);
    return (start ? "…" : "") + mark(text.slice(start, end), terms) + (end < text.length ? "…" : "");
  }
  function render(q) {
    q = q.replace(/[\u3131-\u318e]+$/, "");
    var r = findItems(entries, q, newest);
    try { history.replaceState(null, "", q.trim() ? "?q=" + encodeURIComponent(q.trim()) + (newest ? "&sort=new" : "") : location.pathname); } catch (e) {}
    sortBox.hidden = r.hits.length < 2;
    [].forEach.call(sortBox.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-sort") === "new") === newest)); });
    if (!r.terms.length) { count.textContent = ""; out.innerHTML = ""; return; }
    count.textContent = r.hits.length ? (r.hits.length === 1 ? ONE : COUNT.replace("{n}", r.hits.length)) : NONE;
    out.innerHTML = r.hits.map(function (e) {
      return '<li><a class="sr-title" href="../' + e[2] + '">' + mark(e[0], r.terms) + '</a><span class="sr-meta">' + esc(e[3]) + '</span><span class="sr-text">' + snippet(e[1], r.terms) + '</span></li>';
    }).join("");
  }
  input.addEventListener("input", function () { if (entries) render(input.value); });
  sortBox.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b && entries) { newest = b.getAttribute("data-sort") === "new"; render(input.value); }
  });
  fetch("index.json").then(function (r) { return r.json(); }).then(function (d) {
    entries = d;
    var q = new URLSearchParams(location.search).get("q");
    if (q) input.value = q;
    render(input.value);
  });
})();
</script>`,
  });
}

// ---------- 실행 ----------

const SETS = Object.fromEntries(LANG_NAMES.map((l) => [l, Object.fromEntries(KIND_NAMES.map((k) => [k, load(k, l)]))]));
const sets = SETS.ko;

// 원고 검사(scripts/build-checks.mjs). 걸린 것을 모두 내고 멈춘다.
const stop = (errors) => {
  if (!errors.length) return;
  console.error(errors.join("\n"));
  process.exit(1);
};
const content = checkContent({ SETS, TEXT, KINDS, CONTENT, placeOf });
for (const w of content.warnings) console.warn(w);
stop(content.errors);

const years = timeline(sets);
const all = periods(years);

// 언어판마다 있는 페이지. 언어 선택이 같은 페이지의 다른 언어판으로 갈 수 있는지 본다.
const YEARS = Object.fromEntries(LANG_NAMES.map((l) => [l, timeline(SETS[l])]));
const PAGES = Object.fromEntries(LANG_NAMES.map((l) => [l, new Set([
  ...KIND_NAMES.flatMap((k) => SETS[l][k].map((d) => `${k}/${d.id}/`)),
  ...periods(YEARS[l]).map(listPath),
  ...annuals(YEARS[l]).map(listPath),
  ...(l === "ko" || periods(YEARS[l]).length ? [""] : []),
])]));

// 통계는 두 언어판에 모두 있다. 숫자는 같고 화면 문구만 다르다.
const runs = loadRuns();
const statViews = statsViews(runs);
for (const l of LANG_NAMES) for (const v of statViews) PAGES[l].add(v.path);
for (const l of LANG_NAMES) PAGES[l].add("about/");
for (const l of LANG_NAMES) PAGES[l].add("search/");

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
// 파비콘과 링크 미리보기 이미지. 만든 방법은 static/README.md 에 있다.
cpSync(join(ROOT, "static"), SITE, { recursive: true, filter: (f) => !f.endsWith("README.md") });

// 발행물 경로는 종류별로 그대로 둔다. 이미 나간 주소가 깨지면 안 된다.
for (const lang of LANG_NAMES)
  for (const kind of KIND_NAMES)
    for (const d of SETS[lang][kind]) {
      const dir = join(SITE, TEXT[lang].dir, kind, d.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "index.html"), renderDoc(d, YEARS[lang]));
    }

for (const p of [...all, ...annuals(years)]) {
  const dir = join(SITE, listPath(p));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderList(years, p, "../../"));
}

// 영문판 목록과 홈. 옮긴 호가 있는 분기만 나온다.
const enAll = periods(YEARS.en);
for (const p of [...enAll, ...annuals(YEARS.en)]) {
  const dir = join(SITE, "en", listPath(p));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderList(YEARS.en, p, "../../../", "en"));
}
if (enAll.length) writeFileSync(join(SITE, "en", "index.html"), renderHome(YEARS.en, "../", "en"));

// 홈은 가장 나중 분기다. 분기가 바뀐 첫 주에는 그 분기에 주간호 한 건뿐이다.
const latest = all[all.length - 1];
writeFileSync(
  join(SITE, "index.html"),
  latest
    ? renderHome(years, "./")
    : layout({
        title: `${SITE_TITLE} — 주간 뉴스 브리핑`,
        description: SITE_TAGLINE,
        root: "./",
        full: true,
        path: "",
        body: `<div class="empty"><p>아직 발행된 ${KINDS.week.label}가 없습니다.</p></div>`,
      })
);

for (const lang of LANG_NAMES)
  for (const v of statViews) {
    mkdirSync(join(SITE, TEXT[lang].dir, v.path), { recursive: true });
    writeFileSync(join(SITE, TEXT[lang].dir, v.path, "index.html"), renderStats(statViews, v, lang));
  }

for (const lang of LANG_NAMES) {
  mkdirSync(join(SITE, TEXT[lang].dir, "about"), { recursive: true });
  writeFileSync(join(SITE, TEXT[lang].dir, "about", "index.html"), renderAbout(lang));
}

// 검색 페이지와 항목 색인. 최신 호부터 놓고, 같은 날 끝나면 분기호·연간호가 앞이다.
const newestFirst = (a, b) => b.meta.period_end.localeCompare(a.meta.period_end) || KIND_NAMES.indexOf(b.kind) - KIND_NAMES.indexOf(a.kind);
const badIndex = [];
for (const lang of LANG_NAMES) {
  const T = TEXT[lang];
  const index = KIND_NAMES.flatMap((k) => SETS[lang][k]).sort(newestFirst).flatMap((d) =>
    itemsOf(d.body).map((it) => {
      const href = `${d.kind}/${d.id}/#${T.groups[it.group]}-${it.num}`;
      const page = readFileSync(join(SITE, T.dir, d.kind, d.id, "index.html"), "utf8");
      if (!page.includes(`id="${T.groups[it.group]}-${it.num}"`)) badIndex.push(`${T.dir}${href}`);
      return [it.title, it.text, href, `${d.id}${stateMark(d)} · ${it.group} ${it.num} · ${period(d)}`];
    })
  );
  const want = KIND_NAMES.flatMap((k) => SETS[lang][k]).reduce((n, d) => n + Object.values(d.n).reduce((a, b) => a + b, 0), 0);
  if (index.length !== want) badIndex.push(`${lang} 색인 ${index.length}개 · 원고 항목 ${want}개`);
  mkdirSync(join(SITE, T.dir, "search"), { recursive: true });
  writeFileSync(join(SITE, T.dir, "search", "index.json"), JSON.stringify(index));
  writeFileSync(join(SITE, T.dir, "search", "index.html"), renderSearch(lang));
}
stop(badIndex.length ? [`검색 색인이 원고와 맞지 않는다: ${badIndex.join(", ")}`] : []);

// 없는 주소. GitHub Pages 가 어느 깊이의 주소에서든 이 파일을 내므로 경로를 절대 경로로 쓴다.
writeFileSync(
  join(SITE, "404.html"),
  layout({
    title: `페이지를 찾을 수 없습니다 — ${SITE_TITLE}`,
    description: SITE_TAGLINE,
    root: new URL(SITE_URL).pathname,
    body: `<div class="empty"><h1 class="issue-title">페이지를 찾을 수 없습니다</h1>
<p>주소가 바뀌었거나 없는 페이지입니다. <a href="${new URL(SITE_URL).pathname}">처음으로</a></p>
<p lang="en">This page doesn't exist. <a href="${new URL(SITE_URL).pathname}en/">Go to the English home</a></p></div>`,
  })
);

// RSS. 언어판마다 하나이고 최근 발행물 20개를 싣는다. 항목 제목을 분야별로 적는다.
// 발행 시각은 실행 기록에서 읽고, 기록이 없으면 기간 다음 날 오전 6시(KST)로 둔다.
const FEED_SIZE = 20;
const xml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pubDate = (d) => {
  const r = runs.find((x) => x.week === d.id);
  return new Date(r ? r.published : new Date(Date.parse(`${d.meta.period_end}T06:00:00+09:00`) + 864e5)).toUTCString();
};
for (const lang of LANG_NAMES) {
  const T = TEXT[lang];
  const docs = KIND_NAMES.flatMap((k) => SETS[lang][k])
    // 지난 호는 한꺼번에 만든 것이 많아 발행 시각이 아니라 기간 끝 순서로 놓는다.
    .sort(newestFirst)
    .slice(0, FEED_SIZE);
  const items = docs.map((d) => {
    const url = `${SITE_URL}${T.dir}${d.kind}/${d.id}/`;
    const desc = d.body.split(/^## /m).slice(1).map((chunk) => {
      const titles = [...chunk.matchAll(/^### (\d+)\.\s*(.+)$/gm)].map(([, n, t]) => `${n}. ${plainTitle(marked.parseInline(t))}`);
      return `<p><b>${chunk.split("\n")[0].trim()}</b><br>${titles.join("<br>")}</p>`;
    }).join("");
    return `<item><title>${xml(pageTitle(d))}</title><link>${url}</link><guid>${url}</guid><pubDate>${pubDate(d)}</pubDate><description>${xml(desc)}</description></item>`;
  });
  writeFileSync(
    join(SITE, T.dir, "feed.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${SITE_TITLE}${lang === "ko" ? "" : ` (${T.name})`}</title><link>${SITE_URL}${T.dir}</link><description>${xml(T.tagline)}</description><language>${lang}</language>
${items.join("\n")}
</channel></rss>
`
  );
}

// 검색 엔진에 내는 페이지 목록. 두 언어판의 모든 페이지다.
writeFileSync(
  join(SITE, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${LANG_NAMES.flatMap((l) => [...PAGES[l]].filter((p) => p !== "search/").sort().map((p) => `<url><loc>${SITE_URL}${TEXT[l].dir}${p}</loc></url>`)).join("\n")}
</urlset>
`
);

// 사이트 검사(scripts/build-checks.mjs).
stop(checkSite({ SETS, TEXT, KINDS, SITE, CSS, runs, statViews }));

// 마지막 업데이트 시각은 사이트 전체에 하나다. 배포되는 파일이 바뀐 커밋의 시각을 쓴다.
// 배포 때는 LIVE_VERSION_URL 로 지금 배포본의 지문을 읽어, 같으면 그 시각을 이어 쓴다.
// 로컬 빌드는 배포본을 읽지 않고 HEAD 커밋 시각을 쓴다.
const hash = hashSite(SITE);
const head = headCommit(ROOT);
const live = await fetchLive(process.env.LIVE_VERSION_URL);
const updated = pickUpdated(hash, live, head);
for (const f of readdirSync(SITE, { recursive: true }).filter((f) => f.endsWith(".html"))) {
  const file = join(SITE, f);
  const html = readFileSync(file, "utf8");
  const lang = html.match(/<html lang="(\w+)"/)?.[1] ?? "ko";
  writeFileSync(file, html.replace(UPDATED_MARK, TEXT[lang].updated(kst(updated))));
}
writeFileSync(join(SITE, VERSION_FILE), JSON.stringify({ hash, commit: head.sha, updated }, null, 2) + "\n");

console.log(
  all
    .map((p) => `${listTitle(p)} ${years.get(p.year).quarters.get(p.q).length}개`)
    .join(" | ") || "발행물 없음"
);
console.log(`통계 ${statViews.map((v) => `${v.label} ${v.runs.length}개`).join(" | ")}`);
console.log(`업데이트 ${updated} (${!process.env.LIVE_VERSION_URL ? "배포본 안 봄" : !live ? "배포본 못 읽음" : live.hash === hash ? "배포본과 같음" : "배포본과 다름"}) · 지문 ${hash.slice(0, 12)}`);
console.log(`영문판 ${KIND_NAMES.map((k) => `${KINDS[k].label} ${SETS.en[k].length}개`).join(" | ")}`);
