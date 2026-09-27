// 대상 주의 헤드라인을 날짜별로 모은다. 키워드를 넣지 않는 것이 핵심이다.
// 검색으로 후보를 찾으면 검색어가 결과를 정하므로, 후보 풀은 이 목록에서 시작한다.
// RUNBOOK_WEEKLY 2절 참고.
//
//   node scripts/collect-headlines.mjs 2026-08-31 2026-09-06 [domestic|world|tech|ai|aimedia]
//
// domestic  네이버 뉴스 랭킹 — 날짜별·언론사별 많이 본 기사
// world     Wikipedia Portal:Current events(날짜별, 인용 URL 포함) + The Guardian 날짜 목록
// tech      Hacker News 프런트 페이지 — 날짜별 기술 화제
// ai        AI 연구소·기업 뉴스룸 1차 출처
// aimedia   TechCrunch·The Verge 날짜별 AI 기사 — AI 의 보도량을 센다

import { execFileSync } from "node:child_process";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

// 기성 종합지·지상파·통신사. 편집 판단의 기준으로 삼는다.
// 기성 종합일간지·지상파·통신사만 본다. 연성 기사 비중이 높은 매체는
// '많이 본' 편향을 키우므로 제외한다. 근거는 docs/DECISIONS.md 참고.
const PRIMARY = [
  "조선일보", "중앙일보", "동아일보", "한겨레", "경향신문", "한국일보", "서울신문", "국민일보",
  "KBS", "SBS", "MBC", "JTBC", "YTN",
  "연합뉴스", "연합뉴스TV",
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["일","월","화","수","목","금","토"];

// ---------- 공통 ----------

function get(url, { binary = false, min = 3000 } = {}) {
  // Node 의 fetch 는 일부 호스트에서 403 을 받는다. curl 로 받는다.
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const buf = execFileSync(
        "curl",
        ["-sSL", "-m", "25", "-A", UA, "-H", "Accept-Language: ko-KR,ko;q=0.9,en;q=0.8", url],
        { maxBuffer: 64 * 1024 * 1024 }
      );
      if (buf.length < min) throw new Error(`응답이 짧다 (${buf.length}B)`);
      return binary ? buf : buf.toString("utf8");
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const clean = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();

// ---------- 국내 ----------

function domestic(day) {
  const ymd = day.replace(/-/g, "");
  const buf = get(`https://news.naver.com/main/ranking/popularDay.naver?date=${ymd}`, { binary: true });
  const html = new TextDecoder("euc-kr").decode(buf); // 네이버 랭킹은 EUC-KR
  // 아카이브 밖 날짜를 요청하면 네이버가 오늘 랭킹을 대신 준다. 그대로 쓰면
  // 오늘 뉴스가 그 주의 기사로 실린다. 페이지의 날짜 이동 목록에 요청한
  // 날짜가 있는지로 가려낸다.
  if (!html.includes(`date=${ymd}`))
    throw new Error(`${day} 은 네이버 랭킹 아카이브 밖이다 — 오늘 랭킹이 대신 온다`);
  const out = [];
  for (const box of html.split('class="rankingnews_box"').slice(1)) {
    const name = box.match(/class="rankingnews_name"[^>]*>([^<]+)/);
    if (!name || !PRIMARY.includes(name[1].trim())) continue;
    const items = [];
    const re = /<a href="([^"]+)"[^>]*class="list_title[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    // ?ntype=RANKING 은 네이버가 랭킹에서 들어온 맥락을 표시하는 값이다.
    // 본문과 발행일 추출은 붙이든 떼든 결과가 같아 뗀다. 525건이면 8천 자다.
    while ((m = re.exec(box))) items.push({ title: clean(m[2]), url: m[1].split("?")[0] });
    if (items.length) out.push({ group: name[1].trim(), items });
  }
  return out;
}

// ---------- 해외 ----------

function wikipediaDay(day) {
  const [yy, mm, dd] = day.split("-").map(Number);
  const html = get(`https://en.wikipedia.org/wiki/Portal:Current_events/${yy}_${MONTHS[mm - 1]}_${dd}`);
  const body = html.slice(html.indexOf("current-events-content"));
  const out = [];
  // <div role="heading">분류</div> 뒤의 <ul> 묶음
  const re = /role="heading"[^>]*>([\s\S]*?)<\/div>([\s\S]*?)(?=role="heading"|<\/div>\s*<\/div>\s*<\/div>)/g;
  let m;
  while ((m = re.exec(body))) {
    const group = clean(m[1]);
    if (!group || group.length > 60) continue;
    const items = [];
    const li = /<li>([\s\S]*?)<\/li>/g;
    let n;
    while ((n = li.exec(m[2]))) {
      const t = clean(n[1]);
      // 사안마다 인용 기사 URL 을 남긴다. 검색 도구는 BBC·The Guardian 을 돌려주지
      // 않아서, 두 매체의 기사는 여기서 찾는다.
      const cites = [...n[1].matchAll(/<a rel="mw:ExtLink[^"]*" href="([^"]+)" class="external text">/g)]
        .map((c) => c[1].replace(/&amp;/g, "&"));
      if (t.length > 25) items.push({ title: t, url: cites.join("\n  ") });
    }
    if (items.length) out.push({ group, items });
  }
  return out;
}

// ---------- 기술 ----------

function tech(day) {
  const html = get(`https://news.ycombinator.com/front?day=${day}`);
  const items = [];
  const re = /class="titleline"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) items.push({ title: clean(m[2]), url: m[1] });
  return items.length ? [{ group: "Hacker News front page", items }] : [];
}

// ---------- AI 1차 출처 ----------
// 연구소 뉴스룸과 공식 블로그를 직접 추적한다. 테크 매체 요약보다 앞선다.
// 날짜 구간 전체를 한 번에 받으므로 per-day 가 아니라 per-range 로 돈다.

const FEEDS = [
  ["OpenAI", "https://openai.com/news/rss.xml", "rss"],
  ["Anthropic", "https://www.anthropic.com/news", "anthropic"],
  ["Google AI", "https://blog.google/technology/ai/rss/", "rss"],
  ["Google DeepMind", "https://deepmind.google/blog/rss.xml", "rss"],
  ["NVIDIA", "https://blogs.nvidia.com/feed/", "rss"],
  ["Microsoft", "https://news.microsoft.com/source/feed/", "rss"],
  ["Hugging Face", "https://huggingface.co/blog/feed.xml", "rss"],
];

// 해외 보조. Wikipedia 가 약한 경제·기업 사안을 메운다.
// 피드는 최근 8.5일치뿐이라 지난 주차에서 비었다. 날짜 목록은 과거 날짜도 준다.
function guardianDay(day) {
  const [yy, mm, dd] = day.split("-").map(Number);
  const path = `${yy}/${MONTHS[mm - 1].slice(0, 3).toLowerCase()}/${String(dd).padStart(2, "0")}`;
  const html = get(`https://www.theguardian.com/world/${path}/all`);
  const items = [];
  const re = new RegExp(`<a href="(https://www\\.theguardian\\.com/[a-z/-]+/${path}/[^"]+)" class="fc-item__link"[^>]*>([\\s\\S]*?)</a>`, "g");
  for (const m of html.matchAll(re))
    if (!items.some((i) => i.url === m[1])) items.push({ title: clean(m[2]), url: m[1] });
  return items;
}

// ---------- AI 테크 매체 ----------
// 뉴스룸은 회사마다 한 번 발표해서 "얼마나 크게 다뤄졌는가"를 셀 수 없다.
// 테크 매체의 날짜별 AI 기사로 며칠에 걸쳐 몇 개 매체가 다뤘는지 센다.
// Ars Technica 는 날짜 페이지에 인기 기사가 매일 섞여 세는 데 쓰지 않는다.

const kstDay = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

function techcrunch(from, to) {
  const a = new Date(from + "T00:00:00+09:00").toISOString().slice(0, 19);
  const b = new Date(new Date(to + "T00:00:00+09:00").getTime() + 864e5).toISOString().slice(0, 19);
  const out = [];
  for (let page = 1; ; page++) {
    // 기사가 없는 구간은 "[]" 두 글자다.
    const body = get(`https://techcrunch.com/wp-json/wp/v2/posts?categories=577047203&after=${a}&before=${b}&per_page=100&page=${page}&_fields=date_gmt,title,link`, { min: 2 });
    const posts = JSON.parse(body);
    for (const p of posts) {
      const title = clean(p.title.rendered);
      // 행사 홍보 글은 기사가 아니다.
      if (/TechCrunch Disrupt|StrictlyVC|Disrupt 20\d\d/.test(title)) continue;
      out.push({ title, url: p.link, day: kstDay(p.date_gmt + "Z") });
    }
    if (posts.length < 100) break;
  }
  return out;
}

// 사이트맵의 날짜는 발행 시각이 아니라 수정 시각이다. 대부분 발행 당일이지만
// 뒤늦게 고친 기사는 날짜가 밀린다.
function verge(from, to) {
  const months = new Set();
  for (let dt = new Date(from + "T00:00:00Z"); dt <= new Date(to + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + 1))
    months.add(`${dt.getUTCFullYear()}/${dt.getUTCMonth() + 1}`);
  const out = [];
  for (const mo of months) {
    const xml = get(`https://www.theverge.com/sitemaps/entries/${mo}`);
    for (const m of xml.matchAll(/<loc>(https:\/\/www\.theverge\.com\/ai-artificial-intelligence\/\d+\/([^<]+))<\/loc><lastmod>([^<]+)/g)) {
      const day = kstDay(m[3]);
      if (day >= from && day <= to) out.push({ title: m[2].replace(/-/g, " "), url: m[1], day });
    }
  }
  return out;
}

function aimedia(from, to) {
  const all = [];
  for (const [name, fn] of [["TechCrunch", techcrunch], ["The Verge", verge]]) {
    try {
      for (const i of fn(from, to)) all.push({ ...i, name });
    } catch (e) {
      console.error(`경고: aimedia ${name} 를 못 받았다 (${e.message}). 보도량 세기에서 이 매체가 빠진다.`);
    }
  }
  const out = [];
  for (const day of [...new Set(all.map((i) => i.day))].sort()) {
    const wd = WEEKDAYS[new Date(day + "T00:00:00Z").getUTCDay()];
    for (const name of ["TechCrunch", "The Verge"]) {
      const items = all.filter((i) => i.day === day && i.name === name);
      if (items.length) out.push({ group: `${day} (${wd}) · ${name}`, items });
    }
  }
  return out;
}

function parseRss(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const t = it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const l = it.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
    const d = it.match(/<pubDate>([^<]+)<\/pubDate>/);
    if (!t || !d) continue;
    const day = new Date(d[1]);
    if (isNaN(day)) continue;
    out.push({ title: clean(t[1]), url: l ? l[1].trim() : "", day: day.toISOString().slice(0, 10) });
  }
  return out;
}

function parseAnthropic(html) {
  const out = [];
  // 카드마다 링크와 "Aug 31, 2026" 형태의 날짜가 함께 나온다.
  for (const m of html.matchAll(/href="(\/news\/[^"]+)"[\s\S]{0,600}?([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/g)) {
    const mi = MONTHS.findIndex((x) => x.startsWith(m[2]));
    if (mi < 0) continue;
    const day = `${m[4]}-${String(mi + 1).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    const slug = m[1].replace("/news/", "").replace(/-/g, " ");
    out.push({ title: slug, url: `https://www.anthropic.com${m[1]}`, day });
  }
  return out;
}

function collectFeeds(list, from, to) {
  const out = [];
  for (const [name, url, kind] of list) {
    let items;
    try {
      const body = get(url);
      items = kind === "rss" ? parseRss(body) : parseAnthropic(body);
    } catch (e) {
      out.push({ group: `${name} — 수집 실패: ${e.message}`, items: [] });
      continue;
    }
    // 최근 글만 담는 피드는 지난 주차를 덮지 못한다. 0건과 구분되지 않아 여기서 알린다.
    // 주 앞쪽 하루이틀이 빠지는 것은 짧은 피드의 평소 모습이라, 주 전체가 밖일 때만 알린다.
    const oldest = items.reduce((m, i) => (i.day < m ? i.day : m), "9999");
    if (items.length && oldest > to)
      console.error(`경고: ai ${name} 피드가 ${oldest} 부터만 담는다. 대상 주를 덮지 못해 이 출처가 빠진다.`);
    const hit = items
      .filter((i) => i.day >= from && i.day <= to)
      .filter((v, i, a) => a.findIndex((x) => x.url === v.url) === i)
      .sort((a, b) => a.day.localeCompare(b.day));
    if (hit.length) out.push({ group: name, items: hit.map((i) => ({ title: `[${i.day}] ${i.title}`, url: i.url })) });
  }
  return out;
}

const ai = (from, to) => collectFeeds(FEEDS, from, to);

// 해외는 날짜별 Wikipedia 를 뼈대로 하고 Guardian 날짜 목록을 덧붙인다.
function world(from, to) {
  const out = [];
  const guardian = [];
  for (let dt = new Date(from + "T00:00:00Z"); dt <= new Date(to + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + 1)) {
    const day = dt.toISOString().slice(0, 10);
    try {
      for (const g of wikipediaDay(day)) out.push({ group: `${day} · ${g.group}`, items: g.items });
    } catch (e) {
      out.push({ group: `${day} — 수집 실패: ${e.message}`, items: [] });
      console.error(`경고: world ${day} 를 못 받았다 (${e.message}). 이 날의 사안이 후보 풀에서 빠진다.`);
    }
    try {
      const items = guardianDay(day);
      if (items.length) guardian.push({ group: `${day} · The Guardian`, items });
    } catch (e) {
      console.error(`경고: world The Guardian ${day} 를 못 받았다 (${e.message}).`);
    }
  }
  return out.concat(guardian);
}

// ---------- 실행 ----------

const SOURCES = { domestic, tech };
const RANGE_SOURCES = { world, ai, aimedia };

const args = process.argv.slice(2);
const ALL = { ...SOURCES, ...RANGE_SOURCES };
const [from, to] = args.filter((a) => !ALL[a]);
const want = args.filter((a) => ALL[a]);
if (!from || !to) {
  console.error("usage: node scripts/collect-headlines.mjs <YYYY-MM-DD> <YYYY-MM-DD> [domestic|world|tech|ai|aimedia]");
  process.exit(1);
}
const picked = want.length ? want : Object.keys(ALL);

for (const src of picked) {
  console.log(`\n${"=".repeat(70)}\n# ${src}\n${"=".repeat(70)}`);
  if (RANGE_SOURCES[src]) {
    // 구간 단위로 한 번만 받는다.
    for (const g of RANGE_SOURCES[src](from, to)) {
      console.log(`\n### ${g.group}`);
      for (const it of g.items) console.log(`- ${it.title}${it.url ? `\n  ${it.url}` : ""}`);
    }
    continue;
  }
  for (let dt = new Date(from + "T00:00:00Z"); dt <= new Date(to + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + 1)) {
    const day = dt.toISOString().slice(0, 10);
    const wd = WEEKDAYS[new Date(day + "T00:00:00Z").getUTCDay()];
    // 빈 목록으로 끝나는 날은 하루가 통째로 후보 풀에서 빠진다. 네이버가
    // 정상 응답에 빈 목록을 준 적이 있어 다시 받아 본다. 실패는 stdout 이
    // 아니라 stderr 로 낸다. stdout 은 파일로 보내져 수백 줄에 묻힌다.
    let groups = [];
    let err;
    for (let attempt = 1; attempt <= 3 && !groups.length; attempt++) {
      try {
        groups = SOURCES[src](day);
        err = null;
      } catch (e) {
        err = e;
      }
      if (!groups.length && attempt < 3)
        console.error(`재시도 ${attempt}/3 — ${src} ${day} 가 비었다`);
    }
    if (!groups.length) {
      const why = err ? `수집 실패: ${err.message}` : "빈 목록";
      console.log(`\n## ${day} (${wd}) — ${why}`);
      console.error(`경고: ${src} ${day} 를 못 받았다 (${why}). 이 날의 사안이 후보 풀에서 빠진다.`);
      continue;
    }
    console.log(`\n## ${day} (${wd}) — ${groups.length}개 묶음`);
    for (const g of groups) {
      console.log(`\n### ${g.group}`);
      for (const it of g.items) console.log(`- ${it.title}${it.url ? `\n  ${it.url}` : ""}`);
    }
  }
}
