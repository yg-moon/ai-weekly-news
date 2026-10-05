// 화면 점검. 빌드한 site/ 를 브라우저로 열어 모든 종류의 페이지를 같은 기준으로 잰다.
// 빌드 검사와 달리 브라우저가 필요해 배포에서는 돌리지 않는다. 화면을 고친 뒤 돌린다.
//
//   node scripts/check-layout.mjs
//
// 보는 것
// - 머리말: 로고·사이트 이름·오른쪽 도구가 모든 페이지에서 같은 자리·같은 크기인지(폰·데스크톱)
// - 머리말 줄: 로고·검색·테마·언어 선택이 한 중앙선에 있고, 버튼 셋의 높이가 같은지
// - 빈 곳: 폰에서 글자·상자 사이가 GAP_MAX 를 넘는 곳
// - 본문 폭: 폰에서 배경·테두리가 있는 상자가 본문 폭 밖으로 나가는지
// - 좁은 폰: 340px 에서 화면이 옆으로 넘치는지
// 걸린 것이 있으면 종료 코드 1 로 끝난다.

import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const SITE = join(import.meta.dirname, "..", "site");
const GAP_MAX = 30;
// 일부러 비워 둔 곳. 검색어가 없을 때 결과 수 줄 자리는 비어 있다.
const GAP_ALLOWED = [{ page: "search/", from: "INPUT" }];
// 일부러 본문 폭 밖으로 내민 상자. 지금은 없다.
const OUTSIDE_ALLOWED = [];

const { chromium } = await import("playwright").catch(() => import("/opt/node22/lib/node_modules/playwright/index.mjs"));
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

if (!existsSync(SITE)) {
  console.error("site/ 가 없다. 먼저 npm run build 를 돌린다.");
  process.exit(1);
}

// 페이지 종류마다 하나씩 고른다. 가장 나중 것을 쓴다.
const latest = (dir) => {
  const d = join(SITE, dir);
  return existsSync(d) ? readdirSync(d).filter((f) => statSync(join(d, f)).isDirectory()).sort().pop() : null;
};
const years = readdirSync(SITE).filter((f) => /^\d{4}$/.test(f)).sort();
const y = years.at(-1);
const quarters = y ? readdirSync(join(SITE, y)).filter((f) => /^Q\d$/.test(f)).sort() : [];
const PAGES = [
  "", y && `${y}/${quarters.at(-1)}/`, y && quarters.length > 1 && `${y}/${quarters.at(-2)}/`,
  `week/${latest("week")}/`, `quarter/${latest("quarter")}/`, latest("year") && `year/${latest("year")}/`,
  "stats/", y && `stats/${y}/`, y && `stats/${y}/${quarters.at(-1)}/`,
  "about/", "search/", "search/?q=종부세", "404.html",
  "en/", `en/week/${latest("en/week")}/`, "en/stats/", "en/about/",
].filter((p) => p !== false && p !== null && !/null|undefined/.test(p));

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = join(SITE, p);
  if (!f.startsWith(SITE) || !existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ executablePath });
const problems = [];

async function open(path, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 });
  await page.goto(base + path, { waitUntil: "networkidle" });
  if (path.includes("?q=")) await page.waitForSelector("#results li", { timeout: 5000 }).catch(() => {});
  return page;
}

// 1. 머리말
for (const width of [390, 1280]) {
  let first = null;
  for (const path of PAGES) {
    const page = await open(path, width);
    const box = await page.evaluate(() => ["header.site h1", "header.site .logo", "header.site .tools"].map((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? [r.left, r.top, r.width, r.height].map(Math.round).join(",") : "없음";
    }).join(" | "));
    await page.close();
    if (!first) first = { path, box };
    else if (box !== first.box) problems.push(`머리말 ${width}px: ${path || "/"} 가 ${first.path || "/"} 와 다르다 (${box} ≠ ${first.box})`);
  }
}

// 1-1. 머리말 줄. 높이가 다르거나 중앙선이 어긋나면 이유 모를 이질감이 났다(2026-10-05).
// 언어 선택의 높이를 폭마다 다르게 두므로 그 경계 양쪽을 잰다.
for (const width of [340, 390, 1280]) {
  const page = await open("", width);
  const m = await page.evaluate(() => Object.fromEntries(["logo", "search-link", "theme-toggle", "lang"].map((c) => {
    const r = document.querySelector(`header.site .${c}`).getBoundingClientRect();
    return [c, { mid: r.top + r.height / 2, h: r.height }];
  })));
  await page.close();
  const mids = Object.values(m).map((v) => v.mid), hs = ["search-link", "theme-toggle", "lang"].map((c) => m[c].h);
  if (Math.max(...mids) - Math.min(...mids) > 1) problems.push(`머리말 ${width}px: 중앙선이 어긋난다 (${Object.entries(m).map(([c, v]) => `${c} ${v.mid.toFixed(1)}`).join(", ")})`);
  if (Math.max(...hs) - Math.min(...hs) > 1) problems.push(`머리말 ${width}px: 버튼 높이가 다르다 (검색 ${hs[0]}, 테마 ${hs[1]}, 언어 ${hs[2]})`);
}

// 2~3. 폰에서 빈 곳과 본문 폭
for (const path of PAGES) {
  const page = await open(path, 390);
  const found = await page.evaluate((GAP_MAX) => {
    const visible = (e) => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return r.width && r.height && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const boxed = (cs) => parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || cs.backgroundColor !== "rgba(0, 0, 0, 0)";
    const els = [...document.querySelectorAll("body *")].filter((e) => {
      if (!visible(e) || e.closest("svg") && e.tagName !== "svg") return false;
      const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      return hasText || boxed(getComputedStyle(e)) || ["IMG", "INPUT", "svg"].includes(e.tagName);
    });
    const name = (e) => (typeof e.className === "string" && e.className ? `.${e.className.split(" ")[0]}` : e.tagName);
    const spans = els.map((e) => { const r = e.getBoundingClientRect(); return [r.top + scrollY, r.bottom + scrollY, e]; }).sort((a, b) => a[0] - b[0]);
    const gaps = [];
    let [, bottom, prev] = spans[0];
    for (const [top, bt, e] of spans.slice(1)) {
      if (top - bottom > GAP_MAX) gaps.push({ gap: Math.round(top - bottom), from: prev.tagName, text: `${name(prev)} → ${name(e)} "${(e.textContent || "").trim().slice(0, 16)}"` });
      if (bt > bottom) { bottom = bt; prev = e; }
    }
    const col = document.querySelector(".wrap").getBoundingClientRect();
    const scrolls = (e) => { for (let a = e.parentElement; a; a = a.parentElement) if (/auto|scroll/.test(getComputedStyle(a).overflowX)) return true; return false; };
    const outside = els.filter((e) => boxed(getComputedStyle(e)) && !e.matches("html, body, .wrap") && !scrolls(e))
      .filter((e) => { const r = e.getBoundingClientRect(); return r.left < col.left - 0.5 || r.right > col.right + 0.5; })
      .map((e) => name(e));
    return { gaps, outside: [...new Set(outside)] };
  }, GAP_MAX);
  await page.close();
  for (const g of found.gaps)
    if (!GAP_ALLOWED.some((a) => a.page === path && a.from === g.from)) problems.push(`빈 곳 ${path || "/"}: ${g.gap}px ${g.text}`);
  for (const o of found.outside) if (!OUTSIDE_ALLOWED.includes(o)) problems.push(`본문 폭 밖 ${path || "/"}: ${o}`);
}

// 4. 좁은 폰
for (const path of PAGES) {
  const page = await open(path, 340);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const lines = await page.evaluate(() => Math.round(document.querySelector("header.site .masthead").getBoundingClientRect().height));
  await page.close();
  if (over > 0) problems.push(`340px 에서 옆으로 ${over}px 넘친다: ${path || "/"}`);
  if (lines > 40) problems.push(`340px 에서 머리말이 두 줄이다: ${path || "/"}`);
}

await browser.close();
server.close();
console.log(`페이지 ${PAGES.length}개: ${PAGES.map((p) => p || "/").join(", ")}`);
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("걸린 것 없음");
