// 실험용: NPR world 날짜 아카이브를 collect-headlines 출력 형식(### 날짜 · NPR)으로 낸다.
// 아카이브 한 쪽은 그 날짜부터 거슬러 15건이라, 다음 날 쪽에 앞 날 기사가 섞여 나오면 그날은 다 받은 것이다.
import { execFileSync } from "node:child_process";
import { parseNpr } from "../../scripts/collect-headlines.mjs";
const [from, to] = process.argv.slice(2);
const get = (u) => execFileSync("curl", ["-sS", "-A", "Mozilla/5.0", u], { maxBuffer: 1 << 26 }).toString();
const all = new Map(); const pages = {};
for (let t = Date.parse(from); t <= Date.parse(to) + 864e5; t += 864e5) {
  const d = new Date(t), day = d.toISOString().slice(0, 10);
  const html = get(`https://www.npr.org/sections/world/archive?date=${d.getUTCMonth() + 1}-${d.getUTCDate()}-${d.getUTCFullYear()}`);
  const dates = [...html.matchAll(/<h2 class="title"><a href="https:\/\/www\.npr\.org\/(\d{4}\/\d\d\/\d\d)\//g)].map((m) => m[1].replace(/\//g, "-"));
  pages[day] = dates;
  for (const dd of new Set(dates)) for (const it of parseNpr(html, dd)) { if (!all.has(dd)) all.set(dd, new Map()); all.get(dd).set(it.url, it); }
}
for (let t = Date.parse(from); t <= Date.parse(to); t += 864e5) {
  const day = new Date(t).toISOString().slice(0, 10);
  const next = new Date(t + 864e5).toISOString().slice(0, 10);
  const complete = (pages[day] || []).some((x) => x < day) || (pages[next] || []).some((x) => x < day);
  const items = [...(all.get(day) || new Map()).values()];
  console.error(`${day}: ${items.length}건 ${complete ? "" : "(잘렸을 수 있음)"}`);
  if (!items.length) continue;
  console.log(`\n### ${day} · NPR\n`);
  for (const i of items) console.log(`- ${i.title}\n  ${i.url}`);
}
