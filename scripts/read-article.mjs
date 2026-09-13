// 기사 URL에서 발행일과 본문 텍스트를 뽑는다.
// 검색 요약 대신 원문을 대조하기 위한 도구다. RUNBOOK 2절 참고.
//
//   node scripts/read-article.mjs <URL> [URL...]

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

function text(html) {
  const base = html.replace(
    /<(script|style|noscript|svg|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " "
  );
  // <article> 안이 비어 있는 사이트가 있어, 너무 짧으면 문서 전체로 되돌린다.
  const article = base.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const scoped = article ? strip(article[1]) : "";
  return scoped.length > 400 ? scoped : strip(base);
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
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ko,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
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
