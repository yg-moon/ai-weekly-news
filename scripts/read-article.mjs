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
    // 본문만 보인다. 본문을 가려내지 못한 페이지만 전체를 보이고 그렇다고 밝힌다. 관련기사 제목과
    // "많이 본 뉴스" 는 다른 기사라 사실의 근거가 아니다(RUNBOOK_WEEKLY 3절).
    if (a.body.length > 200) console.log(a.body.slice(0, 4000));
    else console.log("(본문을 가려내지 못해 페이지 전체를 보인다. 관련기사·메뉴가 섞여 있다)\n" + a.text.slice(0, 4000));
  } catch (e) {
    failed++;
    console.log(`FAIL  ${e.message} — 원문을 받을 수 없으면 이 매체는 쓰지 않는다`);
  }
}
process.exit(failed && failed === urls.length ? 1 : 0);
