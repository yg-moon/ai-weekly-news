// 대상 주의 헤드라인을 날짜별로 모은다. 키워드를 넣지 않는 것이 핵심이다.
// 검색으로 후보를 찾으면 검색어가 결과를 정하므로, 후보 풀은 이 목록에서 시작한다.
// RUNBOOK 4절 참고.
//
//   node scripts/collect-headlines.mjs 2026-08-31 2026-09-06 [domestic|world|tech]
//
// domestic  네이버 뉴스 랭킹 — 날짜별·언론사별 많이 본 기사
// world     Wikipedia Portal:Current events(날짜별) + The Guardian 피드
// tech      Hacker News 프런트 페이지 — 날짜별 기술 화제
// ai        AI 연구소·기업 뉴스룸 1차 출처

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

function get(url, { binary = false } = {}) {
  // Node 의 fetch 는 일부 호스트에서 403 을 받는다. curl 로 받는다.
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const buf = execFileSync(
        "curl",
        ["-sSL", "-m", "25", "-A", UA, "-H", "Accept-Language: ko-KR,ko;q=0.9,en;q=0.8", url],
        { maxBuffer: 64 * 1024 * 1024 }
      );
      if (buf.length < 3000) throw new Error(`응답이 짧다 (${buf.length}B)`);
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
  const buf = get(`https://news.naver.com/main/ranking/popularDay.naver?date=${day.replace(/-/g, "")}`, { binary: true });
  const html = new TextDecoder("euc-kr").decode(buf); // 네이버 랭킹은 EUC-KR
  const out = [];
  for (const box of html.split('class="rankingnews_box"').slice(1)) {
    const name = box.match(/class="rankingnews_name"[^>]*>([^<]+)/);
    if (!name || !PRIMARY.includes(name[1].trim())) continue;
    const items = [];
    const re = /<a href="([^"]+)"[^>]*class="list_title[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    // ?ntype=RANKING 은 기사 주소에 필요 없다. 525건이면 8천 자다.
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
      if (t.length > 25) items.push({ title: t, url: "" });
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
// 8.5일치를 담아 주간 회고를 겨우 덮는다. BBC(3.3일)와 CNN(피드 고장)은 쓰지 않는다.
const WORLD_FEEDS = [["The Guardian", "https://www.theguardian.com/world/rss", "rss"]];

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
    const hit = items
      .filter((i) => i.day >= from && i.day <= to)
      .filter((v, i, a) => a.findIndex((x) => x.url === v.url) === i)
      .sort((a, b) => a.day.localeCompare(b.day));
    if (hit.length) out.push({ group: name, items: hit.map((i) => ({ title: `[${i.day}] ${i.title}`, url: i.url })) });
  }
  return out;
}

const ai = (from, to) => collectFeeds(FEEDS, from, to);

// 해외는 날짜별 Wikipedia 를 뼈대로 하고 Guardian 피드를 덧붙인다.
function world(from, to) {
  const out = [];
  for (let dt = new Date(from + "T00:00:00Z"); dt <= new Date(to + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + 1)) {
    const day = dt.toISOString().slice(0, 10);
    try {
      for (const g of wikipediaDay(day)) out.push({ group: `${day} · ${g.group}`, items: g.items });
    } catch (e) {
      out.push({ group: `${day} — 수집 실패: ${e.message}`, items: [] });
    }
  }
  return out.concat(collectFeeds(WORLD_FEEDS, from, to));
}

// ---------- 실행 ----------

const SOURCES = { domestic, tech };
const RANGE_SOURCES = { world, ai };

const args = process.argv.slice(2);
const ALL = { ...SOURCES, ...RANGE_SOURCES };
const [from, to] = args.filter((a) => !ALL[a]);
const want = args.filter((a) => ALL[a]);
if (!from || !to) {
  console.error("usage: node scripts/collect-headlines.mjs <YYYY-MM-DD> <YYYY-MM-DD> [domestic|world|tech]");
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
    const wd = WEEKDAYS[new Date(day + "T00:00:00+09:00").getDay()];
    let groups;
    try {
      groups = SOURCES[src](day);
    } catch (e) {
      console.log(`\n## ${day} (${wd}) — 수집 실패: ${e.message}`);
      continue;
    }
    console.log(`\n## ${day} (${wd}) — ${groups.length}개 묶음`);
    for (const g of groups) {
      console.log(`\n### ${g.group}`);
      for (const it of g.items) console.log(`- ${it.title}${it.url ? `\n  ${it.url}` : ""}`);
    }
  }
}
