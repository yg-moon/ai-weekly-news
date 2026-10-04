// 검색. 빌드가 언어판마다 항목 색인(search/index.json)을 만들고, 검색 페이지가 findItems 를
// 그대로 옮겨 받아 쓴다(build.mjs 의 renderSearch). 테스트는 search.test.mjs 다.
//
// 색인의 한 줄은 [제목, 본문, 주소, 표시용 정보] 다. 본문은 무슨 일·왜 중요한가·전개이고,
// 날짜·출처·근거 줄은 넣지 않는다. 매체 이름까지 찾으면 흔한 매체 하나에 수백 건이 걸린다.
// 줄은 최신 호부터, 한 호 안에서는 항목 순서대로 놓는다.

// 마크다운 표시를 걷어 낸 글자. [글](주소) 는 글만 남긴다.
export const plain = (s) =>
  s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*`]/g, "").replace(/\s+/g, " ").trim();

const SKIP = new Set(["날짜", "출처", "근거", "Date", "Sources", "Basis"]);

// 한 호의 항목들. body 는 원고 본문이다.
export function itemsOf(body) {
  return body.split(/^## /m).slice(1).flatMap((chunk) => {
    const group = chunk.split("\n")[0].trim();
    return chunk.split(/^### /m).slice(1).map((item) => {
      const [, num, title] = item.match(/^(\d+)\.\s*(.+)/);
      const text = item.split(/\n- \*\*/).slice(1)
        .map((f) => f.match(/^([^*]+)\*\*\s*:?\s*([\s\S]*)$/))
        .filter((m) => m && !SKIP.has(m[1].trim()))
        .map((m) => plain(m[2]))
        .join(" ");
      return { group, num: Number(num), title: plain(title), text };
    });
  });
}

// 띄어쓰기로 나눈 낱말이 모두 들어 있는 항목을 찾는다. 대소문자는 가리지 않고 부분 일치다.
// 관련도순은 제목에 걸린 낱말이 많은 항목이 앞이고, 같으면 색인 순서(최신 호부터)다.
// newest 면 색인 순서만 따른다.
// 검색 페이지에 문자열로 옮겨 넣으므로 바깥 이름을 쓰지 않는다.
export function findItems(entries, q, newest) {
  var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  var hits = [];
  if (terms.length)
    entries.forEach(function (e, i) {
      var title = e[0].toLowerCase(), all = title + "\n" + e[1].toLowerCase();
      if (terms.every(function (w) { return all.indexOf(w) >= 0; }))
        hits.push({ e: e, i: i, t: terms.filter(function (w) { return title.indexOf(w) >= 0; }).length });
    });
  hits.sort(function (a, b) { return (newest ? 0 : b.t - a.t) || a.i - b.i; });
  return { terms: terms, hits: hits.map(function (h) { return h.e; }) };
}
