// 기사 URL에서 발행일과 본문 텍스트를 뽑는다.
// 검색 요약 대신 원문을 대조하기 위한 도구다. RUNBOOK_WEEKLY 3절 참고.
//
//   node scripts/read-article.mjs <URL> [URL...]

import { execFileSync } from "node:child_process";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const DATE_KEYS = ["article:published_time", "datePublished", "pubdate", "date"];

function metaDate(html) {
  for (const key of DATE_KEYS) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]+content=["']([^"']+)`,
      "i"
    );
    const m = html.match(re);
    if (m) return m[1];
  }
  const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  return ld ? ld[1] : null;
}

function strip(s) {
  return s
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// 문단 태그만 모은다. <article> 이 없거나 비어 있는 사이트도 본문이 잡힌다.
// 문서 전체를 훑으면 메뉴와 안내 문구에 묻혀 본문이 잘려 나간다.
function paragraphs(html) {
  const seen = new Set();
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = strip(m[1]);
    if (t.length > 60) seen.add(t);
  }
  return [...seen].join("\n");
}

function text(html) {
  const base = html.replace(
    /<(script|style|noscript|svg|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " "
  );
  const article = base.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const scoped = article ? strip(article[1]) : "";
  const paras = paragraphs(base);
  const best = paras.length > scoped.length ? paras : scoped;
  // 둘 다 빈약하면 문서 전체로 되돌린다. 기준을 낮게 잡으면 본문 대신
  // 안내 문구 몇 줄만 잡고 멈춘다.
  return best.length > 1200 ? best : strip(base);
}

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error("usage: node scripts/read-article.mjs <URL> [URL...]");
  process.exit(1);
}

let failed = 0;
for (const url of urls) {
  console.log("=".repeat(80));
  console.log("URL   " + url);
  try {
    // Node 의 fetch 는 일부 언론사 호스트에서 403 을 받는다. curl 로 받는다.
    const buf = execFileSync(
      "curl",
      ["-sSL", "-m", "25", "-A", UA, "-H", "Accept-Language: ko-KR,ko;q=0.9,en;q=0.8", url],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    if (buf.length < 2000) throw new Error(`응답이 짧다 (${buf.length}B)`);
    // EUC-KR 로 내려주는 매체가 있어 charset 을 보고 디코딩한다.
    const head = buf.subarray(0, 4000).toString("latin1");
    const cs = head.match(/charset=["']?([\w-]+)/i);
    const enc = cs && /euc-kr|ks_c_5601|cp949/i.test(cs[1]) ? "euc-kr" : "utf-8";
    const html = new TextDecoder(enc).decode(buf);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    console.log("DATE  " + (metaDate(html) ?? "(발행일 메타태그 없음 — 본문에서 확인할 것)"));
    console.log("TITLE " + (title ? title[1].trim() : "(없음)"));
    console.log("-".repeat(80));
    console.log(text(html).slice(0, 4000));
  } catch (e) {
    failed++;
    console.log(`FAIL  ${e.message} — 원문을 받을 수 없으면 이 매체는 쓰지 않는다`);
  }
}
process.exit(failed && failed === urls.length ? 1 : 0);
