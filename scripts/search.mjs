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

// 소문자로 바꾼 글 low 에서 낱말 w 가 걸리는 자리들. 한글은 낱말 안에서도 찾지만(조사가 붙는다),
// 영문·숫자로 시작하는 낱말은 단어 첫머리에서만 찾는다. "ai" 가 "said" 에 걸리면 영문판 420항목 중
// 412개가 나왔다. 검색 페이지에 문자열로 옮겨 넣으므로 바깥 이름을 쓰지 않는다.
export function positions(low, w) {
  var out = [], latin = /^[a-z0-9]/.test(w), i = low.indexOf(w);
  while (i >= 0) {
    if (!latin || i === 0 || !/[a-z0-9]/.test(low.charAt(i - 1))) out.push(i);
    i = low.indexOf(w, i + w.length);
  }
  return out;
}

// 띄어쓰기로 나눈 낱말이 모두 들어 있는 항목을 찾는다. 대소문자는 가리지 않는다.
// 관련도순은 제목에 걸린 낱말이 많은 항목이 앞이고, 같으면 제목·본문에 낱말이 걸린 횟수가 많은
// 항목, 그것도 같으면 색인 순서(최신 호부터)다. 횟수를 세지 않으면 제목에 없는 낱말("이재명")은
// 최신순과 순서가 같아진다. newest 면 색인 순서만 따른다. positions 와 함께 옮겨 넣는다.
export function findItems(entries, q, newest) {
  var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  var hits = [];
  if (terms.length)
    entries.forEach(function (e, i) {
      // 소문자 글은 처음 찾을 때 만들어 항목에 붙여 둔다. 글자를 칠 때마다 다시 만들지 않는다.
      var title = e.lt || (e.lt = e[0].toLowerCase()), all = e.la || (e.la = title + "\n" + e[1].toLowerCase());
      var counts = terms.map(function (w) { return positions(all, w).length; });
      if (counts.every(function (n) { return n > 0; }))
        hits.push({ e: e, i: i, t: terms.filter(function (w) { return positions(title, w).length > 0; }).length,
          c: counts.reduce(function (a, b) { return a + b; }, 0) });
    });
  hits.sort(function (a, b) { return (newest ? 0 : b.t - a.t || b.c - a.c) || a.i - b.i; });
  return { terms: terms, hits: hits.map(function (h) { return h.e; }) };
}
