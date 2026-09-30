// 발행물의 외부 링크가 열리는지 본다. 독자가 누른 출처가 깨져 있으면 신뢰가 떨어진다.
//
//   node scripts/check-links.mjs content/week/2026-W40.md      # 하나라도 깨지면 exit 1
//   node scripts/check-links.mjs --report content/week/*.md    # 목록만 내고 exit 0
//
// 깨짐으로 보는 것: 404·410 같은 4xx, 세 번 시도해도 5xx·응답 없음·주소 없음,
// 제목이 "없는 페이지"인 것, 기사 주소가 사이트 첫 화면으로 넘어가는 것.
// 확인 못 함으로 보는 것: 401·403·406·429. openai.com 처럼 자동 접속을 막는 사이트는
// 멀쩡한 주소에도 403 을 준다(2026-09-30 전수조사에서 브라우저로 모두 열렸다).
// 경고만 하고 실패로 치지 않는다.
//
// Node 의 fetch 는 일부 언론사 호스트에서 403 을 받아 curl 로 받는다(read-article.mjs 와 같다).

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BLOCKED = new Set([401, 403, 406, 429]);
const NOT_FOUND = /404|not found|페이지를 찾을 수 없|삭제된 기사|존재하지 않는/i;

const args = process.argv.slice(2);
const report = args.includes("--report");
const files = args.filter((a) => !a.startsWith("--"));
if (!files.length) {
  console.error("사용법: node scripts/check-links.mjs [--report] <md 파일...>");
  process.exit(2);
}

const where = new Map();
for (const f of files)
  for (const [, url] of readFileSync(f, "utf8").matchAll(/\]\((https?:\/\/[^)\s]+)\)/g))
    where.set(url, [...(where.get(url) ?? []), f]);

const curl = (url) =>
  new Promise((resolve) => {
    execFile(
      "curl",
      ["-sS", "-L", "-m", "30", "-A", UA, "-H", "Accept-Language: ko-KR,ko;q=0.9,en;q=0.8",
        "-w", "\n@@@%{http_code} %{url_effective}", url],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const i = stdout.lastIndexOf("\n@@@");
        const [code, final] = i < 0 ? ["0", url] : stdout.slice(i + 4).split(/ (.*)/s);
        const title = (stdout.slice(0, i).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
        resolve({ code: Number(code), final: final?.trim() || url, title, err: err ? stderr.trim().split("\n")[0] : "" });
      }
    );
  });

const depth = (u) => new URL(u).pathname.split("/").filter(Boolean).length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(url) {
  let r;
  for (const wait of [0, 5000, 15000]) {
    await sleep(wait);
    r = await curl(url);
    if (r.code && r.code < 500) break;
  }
  if (BLOCKED.has(r.code)) return { kind: "blocked", why: `${r.code}` };
  if (r.code < 200 || r.code >= 300) return { kind: "broken", why: r.code ? `${r.code}` : r.err || "응답 없음" };
  if (NOT_FOUND.test(r.title)) return { kind: "broken", why: `제목이 "${r.title.slice(0, 60)}"` };
  if (depth(url) > 1 && depth(r.final) === 0) return { kind: "broken", why: `첫 화면으로 넘어감 (${r.final})` };
  return { kind: "ok" };
}

// 호스트마다 셋, 전체 열둘까지 동시에 본다. 한 언론사에 몰아 보내면 막힌다.
const queue = [...where.keys()];
const busy = {};
const result = new Map();
await new Promise((done) => {
  let active = 0;
  const next = () => {
    if (!queue.length && !active) return done();
    while (active < 12) {
      const i = queue.findIndex((u) => (busy[new URL(u).host] ?? 0) < 3);
      if (i < 0) break;
      const url = queue.splice(i, 1)[0];
      const host = new URL(url).host;
      busy[host] = (busy[host] ?? 0) + 1;
      active++;
      check(url).then((r) => {
        result.set(url, r);
        busy[host]--;
        active--;
        next();
      });
    }
    if (!active && queue.length) setTimeout(next, 200);
  };
  next();
});

const list = (kind) => [...result].filter(([, r]) => r.kind === kind);
const show = ([url, r]) => `  ${r.why}  ${url}\n      ${[...new Set(where.get(url))].join(", ")}`;
const broken = list("broken");
const blocked = list("blocked");
console.log(`링크 ${result.size}개: 정상 ${list("ok").length}, 확인 못 함 ${blocked.length}, 깨짐 ${broken.length}`);
if (blocked.length) console.log(`확인 못 함 (자동 접속 차단, 실패로 치지 않는다):\n${blocked.map(show).join("\n")}`);
if (broken.length) console.log(`깨짐:\n${broken.map(show).join("\n")}`);
process.exit(broken.length && !report ? 1 : 0);
