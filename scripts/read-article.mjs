// 기사 URL에서 발행일과 본문 텍스트를 뽑는다.
// 검색 요약 대신 원문을 대조하기 위한 도구다. RUNBOOK_WEEKLY 3절 참고.
//
//   node scripts/read-article.mjs <URL> [URL...]

import { fetchArticle } from "./article.mjs";

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
    const a = await fetchArticle(url);
    console.log("DATE  " + (a.date ?? "(발행일 메타태그 없음 — 본문에서 확인할 것)"));
    console.log("TITLE " + (a.title ?? "(없음)"));
    console.log("-".repeat(80));
    console.log(a.text.slice(0, 4000));
  } catch (e) {
    failed++;
    console.log(`FAIL  ${e.message} — 원문을 받을 수 없으면 이 매체는 쓰지 않는다`);
  }
}
process.exit(failed && failed === urls.length ? 1 : 0);
