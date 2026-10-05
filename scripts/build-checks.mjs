// 빌드의 검사. 원고 검사는 렌더링 전에, 사이트 검사는 페이지를 쓴 뒤에 돈다. build.mjs 가
// 부르고, 걸린 것을 모두 모아 내고 빌드를 멈춘다. scripts/build-checks.test.mjs 가 일부러 틀린
// 원고로 검사가 걸리는지 본다.

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { OUTLETS_EN } from "./outlets-en.mjs";

// 날짜 칸("9월 21일–26일 (월–토)", "5월 11일 (월)~5월 15일 (금)", "Sep 21–26 (Mon–Sat)", "Mar 31–Apr 2 (Tue–Thu)")을
// 읽어 문제를 낸다. 연도는 주차에서 정하고, 주 경계를 넘는 1월·12월은 그 주에 가까운 해로 본다.
const DOW = { ko: [..."일월화수목금토"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateProblems(value, weekId, lang = "ko") {
  const [y, w] = weekId.split("-W").map(Number);
  const jan4 = Date.UTC(y, 0, 4), monday = jan4 - (((new Date(jan4).getUTCDay() + 6) % 7) - (w - 1) * 7) * 864e5;
  const dates = [];
  let month = null;
  const re = lang === "en" ? new RegExp(`(?:(${MONTH_EN.join("|")})\\s+)?(\\d{1,2})\\b`, "g") : /(?:(\d{1,2})월\s*)?(\d{1,2})일/g;
  for (const [, m, day] of value.replace(/\([^)]*\)/g, (s) => s.replace(/\d/g, "")).matchAll(re)) {
    if (m) month = lang === "en" ? MONTH_EN.indexOf(m) : Number(m) - 1;
    if (month === null) return ["날짜를 읽지 못했다"];
    const near = [y - 1, y, y + 1].map((yy) => Date.UTC(yy, month, Number(day))).sort((a, b) => Math.abs(a - monday) - Math.abs(b - monday))[0];
    dates.push(near);
  }
  const days = [...value.matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1].split(/[–~-]/).map((s) => s.trim()));
  if (!dates.length || dates.length > 2 || days.length !== dates.length) return ["날짜를 읽지 못했다"];
  const out = [];
  dates.forEach((t, i) => {
    const real = DOW[lang][new Date(t).getUTCDay()];
    if (days[i] !== real) out.push(`${new Date(t).getUTCMonth() + 1}/${new Date(t).getUTCDate()} 은 ${real}${lang === "ko" ? "요일" : ""}이다`);
  });
  if (dates.length === 2 && dates[0] >= dates[1]) out.push("시작이 끝보다 늦거나 같다");
  return out;
}

// 원고 검사. SETS 는 언어판 → 종류 → 발행물 목록이다. 경고는 빌드를 멈추지 않는다.
export function checkContent({ SETS, TEXT, KINDS, CONTENT, placeOf }) {
  const KIND_NAMES = Object.keys(KINDS);
  const sets = SETS.ko;
  const errors = [], warnings = [];

  // 영문판은 한국어판을 옮긴 것이다. 원본이 없거나, 구획과 항목 수가 다르거나, 출처 링크가
  // 하나라도 다르거나, 영문판을 만든 뒤 원본이 고쳐졌으면 빌드를 멈춘다. 영문판은 자주 들여다보지
  // 않아 어긋나도 늦게 알게 된다(2026-10-01 사용자). 원본을 고친 세션이 영문판도 고친다.
  // 영문 원고의 source 는 번역할 때 읽은 원본 파일의 sha256 앞 12자리다.
  const linksOf = (d) => [...d.body.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).join("\n");
  // 근거 줄의 링크 이름. "W35 국내 3" 은 영문판에서 "W35 Korea 3" 이다.
  const GROUP_EN = Object.fromEntries(Object.keys(TEXT.ko.groups).map((g, i) => [g, Object.keys(TEXT.en.groups)[i]]));
  const basisOf = (d, en) =>
    d.body.split("\n").filter((l) => /^- \*\*(근거|Basis)\*\*/.test(l))
      .flatMap((l) => [...l.matchAll(/\[([^\]]+)\]\(/g)].map((m) => (en ? m[1].replace(/국내|해외/g, (g) => GROUP_EN[g]) : m[1])));
  // 출처 줄의 매체 이름. 영문판은 OUTLETS_EN 의 이름을 쓴다.
  const outletsOf = (d, en) =>
    d.body.split("\n").filter((l) => /^- \*\*(출처|Sources)\*\*/.test(l))
      .flatMap((l) => [...l.matchAll(/\[([^\]]+)\]\(/g)].map((m) => (en ? OUTLETS_EN[m[1]] ?? m[1] : m[1])));
  const shapeOf = (d) => Object.entries(d.n).map(([g, n]) => `${TEXT[d.lang].groups[g] ?? g} ${n}`).join(", ");
  const badTranslations = [];
  const sourceHash = (kind, id) => createHash("sha256").update(readFileSync(join(CONTENT, kind, `${id}.md`))).digest("hex").slice(0, 12);
  for (const kind of KIND_NAMES)
    for (const d of SETS.en[kind]) {
      const ko = sets[kind].find((x) => x.id === d.id);
      const at = `en/${kind}/${d.id}`;
      if (!ko) badTranslations.push(`${at}: 한국어 원본이 없다`);
      else if ((d.meta.through ?? "") !== (ko.meta.through ?? "")) badTranslations.push(`${at}: 기준 주(through)가 원본과 다르다`);
      else if (shapeOf(d) !== shapeOf(ko)) badTranslations.push(`${at}: 구획·항목 수가 원본과 다르다 (${shapeOf(d)} / 원본 ${shapeOf(ko)})`);
      else if (linksOf(d) !== linksOf(ko)) badTranslations.push(`${at}: 링크가 원본과 다르다`);
      else if (outletsOf(d).join() !== outletsOf(ko, true).join()) badTranslations.push(`${at}: 출처 매체 이름이 OUTLETS_EN 과 다르다`);
      else if (basisOf(d).join() !== basisOf(ko, true).join()) badTranslations.push(`${at}: 근거 링크 이름이 원본과 다르다`);
      // 영문 제목은 60자까지다. 한국어 제목의 26자와 같이 목차에서 두 줄을 넘지 않는 길이다.
      for (const [, t] of d.body.matchAll(/^### \d+\.\s*(.+)$/gm))
        if (t.length > 60) badTranslations.push(`${at}: 제목이 ${t.length}자다(60까지) "${t}"`);
      // 영문은 둥근 따옴표(“ ” ’)를 쓴다. 링크 주소 밖의 곧은 따옴표를 막는다.
      const straight = d.body.replace(/\]\([^)]*\)/g, "").match(/.{0,20}["'].{0,20}/);
      if (straight) badTranslations.push(`${at}: 곧은 따옴표가 있다 "${straight[0]}"`);
      else if (d.meta.source !== sourceHash(kind, d.id))
        badTranslations.push(`${at}: 영문판을 만든 뒤 원본이 바뀌었다. 바뀐 곳을 다시 옮기고 source 를 ${sourceHash(kind, d.id)} 로 바꾼다`);
    }
  if (badTranslations.length) errors.push(`영문판이 원본과 맞지 않는다:\n  ${badTranslations.join("\n  ")}`);
  // 영문 문장은 40단어까지 권한다. 비원어민이 한 번에 읽는 길이다(사용자 2026-10-01).
  // 따옴표 안의 인용은 원문 문장을 지키므로 세지 않는다. 막지는 않고 알리기만 한다.
  const longSentences = KIND_NAMES.flatMap((kind) => SETS.en[kind].flatMap((d) =>
    d.body.split("\n").filter((l) => !/^(#|- \*\*(Date|Sources|Basis)\*\*)/.test(l))
      .flatMap((l) => l.trim().replace(/^- \*\*[^*]+\*\*: /, "").split(/(?<=[.!?”])\s+(?=[A-Z“])/))
      .filter((s) => s.replace(/“[^”]*”/g, "").split(/\s+/).filter(Boolean).length > 40)
      .map((s) => `en/${kind}/${d.id}: ${s.slice(0, 80)}…`)));
  if (longSentences.length) warnings.push(`40단어가 넘는 영문 문장이 있다(나누기를 권한다):\n  ${longSentences.join("\n  ")}`);

  // 다른 항목을 번호로 가리키면 빌드를 멈춘다. "(국내 2번)" 은 분기호가 항목을 떼어
  // 다시 묶으면 가리킬 곳이 없다. 2026-W31~W38 에서 16곳이 나와 모두 고쳤다.
  const crossRefs = Object.values(sets).flat().flatMap((p) =>
    [...p.body.matchAll(/(?:국내|해외|AI) ?[1-5] ?번(?!째)/g)].map((m) => `${p.kind}/${p.id} "${m[0]}"`)
  );
  if (crossRefs.length) errors.push(`다른 항목을 번호로 가리켰다: ${crossRefs.join(", ")}. 그 사안을 이름과 사실로 다시 쓴다.`);

  // 항목 제목은 한 사안을 짧게 쓴다(주간 런북 11절). 한글은 1자, 영문·숫자·공백은 반 자로 세어
  // 26자를 넘거나 " — " 부제를 달면 빌드를 멈춘다.
  const titleWidth = (t) => [...t].reduce((w, c) => w + (/[\uac00-\ud7a3]/.test(c) ? 1 : 0.5), 0);
  const longTitles = Object.values(sets).flat().flatMap((p) =>
    [...p.body.matchAll(/^### \d+\.\s*(.+)$/gm)]
      .map((m) => m[1].trim())
      .filter((t) => titleWidth(t) > 26 || t.includes(" — "))
      .map((t) => `${p.kind}/${p.id} "${t}" (${titleWidth(t)}자)`)
  );
  if (longTitles.length) errors.push(`제목이 길거나 부제가 있다:\n  ${longTitles.join("\n  ")}`);

  // 한 이름은 한 표기로만 쓴다(주간 런북 10절). AI 기업과 AI 모델·제품은 영문, 빅테크는 한글이다.
  // 출처 줄은 매체 이름이라 보지 않는다. 솔·루나·뮤즈처럼 일반어와 겹치는 이름은 오탐이 나서 뺐다.
  const HANGUL_AI = /(?<![가-힣])(앤트로픽|오픈AI|클로드|오퍼스|소네트|하이쿠|페이블|미토스|제미나이|젬마|챗GPT|코덱스|코파일럿|딥마인드|딥시크|미스트랄|허깅페이스|퍼플렉시티|알파폴드|알파지놈|싱킹머신즈)/g;
  const LATIN_BIGTECH = /\b(Google|Microsoft|Meta|NVIDIA|Nvidia|Apple|Amazon|SpaceX)\b(?! [A-Z0-9])/g;
  const mixedNames = Object.values(sets).flat().flatMap((p) =>
    p.body.split("\n")
      .filter((l) => !/^- \*\*(출처|근거)\*\*/.test(l))
      .flatMap((l) => [...l.matchAll(HANGUL_AI), ...l.matchAll(LATIN_BIGTECH)])
      .map((m) => `${p.kind}/${p.id} "${m[0]}"`)
  );
  if (mixedNames.length) errors.push(`이름 표기가 규칙과 다르다: ${mixedNames.join(", ")}`);


  // 주간호 날짜 칸의 요일이 날짜와 맞는지, 범위의 시작이 끝보다 늦지 않은지 본다(주간 런북 11절).
  // 날짜는 손으로 옮겨 적어 하루 어긋나도 눈에 띄지 않는다. 영문판도 같은 칸을 본다.
  // 주 범위 밖은 주 경계의 현지 날짜일 수 있어 막지 않는다. QUALITY_CHECKS 3.4 가 알린다.
  const badDates = ["ko", "en"].flatMap((lang) => SETS[lang].week.flatMap((d) =>
    d.body.split("\n").filter((l) => /^- \*\*(날짜|Date)\*\*/.test(l))
      .map((l) => l.replace(/^- \*\*(날짜|Date)\*\*:\s*/, "").trim())
      .flatMap((v) => dateProblems(v, d.id, lang).map((m) => `${lang === "en" ? "en/" : ""}week/${d.id} "${v}": ${m}`))));
  if (badDates.length) errors.push(`날짜 칸이 맞지 않는다:\n  ${badDates.join("\n  ")}`);

  // 분기호와 연간호의 근거 링크가 실제 항목을 가리키는지 본다. 분기호는 그 분기의
  // 주간호와 앞선 분기호만, 연간호는 그 해의 분기호와 앞선 연간호만 가리킨다. 앵커가 없는 항목으로 가면
  // 브라우저는 오류 없이 페이지 맨 위를 연다.
  const NAME_OF = Object.fromEntries(Object.entries(KINDS.week.groups).map(([name, slug]) => [slug, name]));
  const SOURCE = { quarter: "week", year: "quarter" };
  const badLinks = ["quarter", "year"].flatMap((kind) =>
    sets[kind].flatMap((d) =>
      [...d.body.matchAll(/\]\((\.\.\/\.\.\/(\w+)\/([^/)]+)\/#(\w+)-(\d+))\)/g)].flatMap(([, href, k, id, slug, num]) => {
        const target = sets[k]?.find((t) => t.id === id);
        const count = target?.n[NAME_OF[slug]] ?? 0;
        const at = placeOf({ kind: k, id }), here = placeOf(d);
        const earlier = Number(at.year) < Number(here.year) || (at.year === here.year && at.q < here.q);
        const inside = k === SOURCE[kind]
          ? at.year === here.year && (kind === "year" || at.q === here.q)
          : k === kind && earlier;
        // 진행 중인 분기호는 근거로 걸 수 없고, 진행 중인 판은 기준 주 뒤의 주간호를 걸 수 없다.
        const settled = !target?.meta.through && !(d.meta.through && k === "week" && id > d.meta.through);
        return target && inside && settled && Number(num) <= count ? [] : [`${d.id} → ${href}`];
      })
    )
  );
  const badThrough = sets.year.filter((d) => d.meta.through).map((d) => `${d.id}: 연간호에는 through 를 두지 않는다`)
    .concat(sets.quarter.filter((d) => d.meta.through).flatMap((d) => {
      const w = d.meta.through.match(/^(\d{4})-W(\d{2})$/);
      const at = w && placeOf({ kind: "week", id: d.meta.through }), here = placeOf(d);
      return w && at.year === here.year && at.q === here.q ? [] : [`${d.id}: through ${d.meta.through} 가 그 분기의 주차가 아니다`];
    }));
  if (badThrough.length) errors.push(`진행 중 분기호의 기준 주가 맞지 않는다: ${badThrough.join(", ")}`);
  if (badLinks.length) errors.push(`근거 링크가 가리키는 항목이 없거나 범위 밖이다: ${badLinks.join(", ")}`);

  // 분기호와 연간호의 항목 모양을 본다. 2026-Q2·Q3 첫 발행에서 흐름이 주제 묶음으로
  // 불어나고 전개가 연표가 된 것을 막는다(분기 런북 3·5절).
  // - 1~3번 흐름은 서로 다른 주(연간호는 분기) 둘 이상에 근거가 있다.
  // - 한 항목의 근거는 주마다 하나다. 같은 주 항목을 더 붙여 흐름을 키우지 않는다.
  // - 한 주간호 항목은 한 번만 쓴다. 한 사안을 흐름과 단발에 나눠 싣지 않는다.
  // - 지난 분기호(연간호는 지난 연간호) 링크는 흐름에만, 근거 맨 앞에 하나까지 단다.
  // - 전개는 여덟 문장, 세 문단이다(배경·전환점·분기 말). 무슨 일은 네 문장까지다. 한 호가 주간호 한 호
  //   길이를 넘지 않게 한다(사용자 2026-10-04).
  // - 흐름과 단발 모두 왜 중요한가를 두 문장까지 둔다. 연간호도 분기호와 같다(사용자 2026-10-01).
  const sentences = (t) => (t.match(/다\.["”’')]*(?=\s|$)/g) ?? []).length;
  const badShape = ["quarter", "year"].flatMap((kind) =>
    sets[kind].flatMap((d) => {
      const out = [], seen = new Map();
      for (const chunk of d.body.split(/^## /m).slice(1)) {
        const field = chunk.split("\n")[0].trim();
        const flows = [], singles = [];
        for (const item of chunk.split(/^### /m).slice(1)) {
          const num = Number(item.match(/^(\d+)\./)?.[1]);
          const at = `${field} ${num}`;
          // 흐름은 전개 칸이 있는 항목이다. 진행 중인 분기호는 흐름이 셋보다 적을 수 있어 번호로 가리지 않는다.
          const flow = /\*\*전개\*\*/.test(item);
          (flow ? flows : singles).push(num);
          // 필드는 다음 필드 줄 앞까지다. 전개처럼 문단을 나눈 필드도 통째로 읽는다. 라벨 뒤 공백에
        // 줄바꿈을 넣지 않는다. 넣으면 비어 있는 필드가 다음 필드를 제 내용으로 읽는다.
          const line = (label) => item.match(new RegExp(`\\*\\*${label}\\*\\*[ \\t]*:?[ \\t]*([\\s\\S]*?)(?=\\n- \\*\\*|$)`))?.[1] ?? "";
          const links = [...line("근거").matchAll(/\]\(\.\.\/\.\.\/(\w+)\/([^/)]+)\/#(\w+-\d+)\)/g)].map(([, k, id, a]) => ({ k, id, a }));
          const own = links.filter((l) => l.k === SOURCE[kind]);
          const past = links.filter((l) => l.k === kind);
          if (past.length > 1) out.push(`${at}: 지난 ${kind === "quarter" ? "분기호" : "연간호"} 링크가 ${past.length}개다(하나까지)`);
          if (past.length && links[0].k !== kind) out.push(`${at}: 지난 ${kind === "quarter" ? "분기호" : "연간호"} 링크가 근거 맨 앞이 아니다`);
          if (past.length && !flow) out.push(`${at}: 단발에 지난 ${kind === "quarter" ? "분기호" : "연간호"} 링크가 있다`);
          const ids = own.map((l) => l.id);
          if (new Set(ids).size !== ids.length) out.push(`${at}: 근거에 같은 ${kind === "quarter" ? "주" : "분기"}가 두 번 있다`);
          if (flow && new Set(ids).size < 2) out.push(`${at}: 흐름인데 근거가 ${kind === "quarter" ? "두 주" : "두 분기"}에 걸치지 않는다`);
          for (const l of own) {
            const key = `${l.id}#${l.a}`;
            if (seen.has(key)) out.push(`${at}: ${key} 를 ${seen.get(key)} 에서 이미 썼다`);
            else seen.set(key, at);
          }
          if (sentences(line("전개")) > 8) out.push(`${at}: 전개가 ${sentences(line("전개"))}문장이다(8까지)`);
          const paras = line("전개").trim() ? line("전개").trim().split(/\n\s*\n/).length : 0;
          if (flow && paras !== 3) out.push(`${at}: 전개가 ${paras}문단이다(세 문단으로 나눈다)`);
          if (sentences(line("무슨 일")) > 4) out.push(`${at}: 무슨 일이 ${sentences(line("무슨 일"))}문장이다(4까지)`);
          if (!line("왜 중요한가").trim()) out.push(`${at}: 왜 중요한가가 없다`);
          if (sentences(line("왜 중요한가")) > 2) out.push(`${at}: 왜 중요한가가 ${sentences(line("왜 중요한가"))}문장이다(2까지)`);
        }
        if (flows.length > 3 || singles.length > 2) out.push(`${field}: 흐름 ${flows.length} · 단발 ${singles.length}이다(흐름 3, 단발 2까지)`);
        if (Math.max(...flows) > Math.min(...singles)) out.push(`${field}: 흐름이 단발보다 앞에 오지 않았다`);
      }
      return out.map((m) => `${d.id} ${m}`);
    })
  );
  if (badShape.length) errors.push(`분기호·연간호 항목이 런북과 맞지 않는다:\n  ${badShape.join("\n  ")}`);


  return { errors, warnings };
}

// 실행 기록이 없는 발행물. 런북은 기록을 발행물과 같은 커밋에 넣게 한다.
// 빠지면 통계에서 그 호가 소리 없이 빠지고, RSS 발행 시각이 추정값이 된다.
export function missingRuns(ids, runs) {
  const have = new Set(runs.map((r) => r.week));
  return [...new Set(ids)].filter((id) => !have.has(id)).sort();
}

// 만든 사이트 검사. SITE 에 페이지를 다 쓴 뒤에 부른다.
export function checkSite({ SETS, TEXT, KINDS, SITE, CSS, runs, statViews }) {
  const KIND_NAMES = Object.keys(KINDS);
  const LANG_NAMES = Object.keys(TEXT);
  const errors = [];

  const noRun = missingRuns(LANG_NAMES.flatMap((lang) => KIND_NAMES.flatMap((kind) => SETS[lang][kind].map((d) => d.id))), runs);
  if (noRun.length) errors.push(`실행 기록이 없는 발행물: ${noRun.join(", ")}. node scripts/record-run.mjs <호> 로 남긴다.`);

  // 기간별 통계가 기록을 빠뜨리거나 겹치지 않는지 본다. 분기 페이지의 표(주간호 표와
  // 분기호·연간호 표)를 모두 합치면 기록 전체와 한 번씩 맞아야 한다.
  const tableWeeks = (v) =>
    [...readFileSync(join(SITE, v.path, "index.html"), "utf8").matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)]
      .flatMap((t) => [...t[1].matchAll(/<tr[^>]*>\s*<td>([^<]+)<\/td>/g)].map((m) => m[1]));
  const inQuarters = statViews.filter((v) => v.q).flatMap(tableWeeks).sort();
  const expected = runs.map((r) => r.week).sort();
  if (inQuarters.join() !== expected.join() || statViews.some((v) => tableWeeks(v).length !== v.runs.length)) errors.push(`기간별 통계 표가 기록과 다르다. 기록 ${expected.length}개, 분기 표 합 ${inQuarters.length}개.`);

  // 목차가 항목을 빠짐없이 가리키는지 본다. 목차는 빌드가 만든 HTML 을 다시 읽어
  // 만들므로, 항목 마크업이 바뀌면 목차가 오류 없이 비거나 모자랄 수 있다. 원고의 항목
  // 수(보통 15개)와 목차 줄 수, 목차로 돌아가는 제목 링크 수가 모두 같아야 한다.
  const badToc = LANG_NAMES.flatMap((lang) => KIND_NAMES.flatMap((kind) =>
    SETS[lang][kind].flatMap((d) => {
      const html = readFileSync(join(SITE, TEXT[lang].dir, kind, d.id, "index.html"), "utf8");
      const want = Object.values(d.n).reduce((a, b) => a + b, 0);
      const lines = (html.match(/<nav class="toc"[\s\S]*?<\/nav>/)?.[0].match(/<li>/g) ?? []).length;
      const back = (html.match(/class="to-toc"/g) ?? []).length;
      return lines === want && back === want ? [] : [`${TEXT[lang].dir}${d.id} 항목 ${want} · 목차 ${lines} · 제목 링크 ${back}`];
    })
  ));
  if (badToc.length) errors.push(`목차가 항목과 맞지 않는다: ${badToc.join(", ")}. 항목 마크업이 바뀌었는지 본다.`);


  // ---------- 쓰이지 않는 스타일 ----------
  // CSS 에 정의된 클래스가 어느 페이지에도 없으면 빌드를 멈춘다. 마크업의 클래스 이름이
  // 바뀌면 스타일이 오류 없이 떨어져 나간다. 52dcefa 가 번호 배지를 그렇게 지웠다.
  // 아래는 특정 내용이 있을 때만 나오는 클래스라, 지금 콘텐츠에 없어도 정상이다.
  const CONDITIONAL = new Set([
    "quarter", // 분기호가 있을 때
    "year", // 연간호가 있을 때
    "empty", // 목록이나 기록이 비었을 때
    "pending", "note", // 새 분기의 1~3주차, 진행 중 분기호가 나오기 전
    "counts", "issue-meta", // 건수가 국내·해외·AI 5건씩이 아닌 호
    "wide", "plot", "yaxis", "scroll", // 한 그래프의 막대가 본문 폭을 넘을 때
    "old", "more-toggle", "more", // 기록이 16개를 넘을 때
  ]);
  const usedClasses = new Set();
  for (const f of readdirSync(SITE, { recursive: true }))
    if (f.endsWith(".html"))
      for (const m of readFileSync(join(SITE, f), "utf8").matchAll(/class="([^"]*)"/g))
        for (const c of m[1].split(/\s+/)) usedClasses.add(c);
  const cssSelectors = CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{[^{}]*\}/g, "{}");
  const unusedClasses = [...new Set([...cssSelectors.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))]
    .filter((c) => !usedClasses.has(c) && !CONDITIONAL.has(c));
  // 취소선이 다시 생기면 빌드를 멈춘다. 마크다운 변환기를 바꾸거나 올릴 때 위 설정이 빠질 수 있다.
  const struck = readdirSync(SITE, { recursive: true }).filter(
    (f) => f.endsWith(".html") && readFileSync(join(SITE, f), "utf8").includes("<del>")
  );
  if (struck.length) errors.push(`취소선이 렌더링됐다: ${struck.join(", ")}. 물결표가 취소선으로 바뀌었는지 본다.`);
  if (unusedClasses.length) errors.push(`쓰이지 않는 CSS 클래스: ${unusedClasses.join(", ")}. 마크업의 클래스 이름이 바뀌었는지 본다.`);

  // ---------- 화면 ----------
  errors.push(...checkSelectedFill(SITE, CSS), ...checkLineContrast(CSS));


  return errors;
}

// 고른 탭·칩은 채워서 보인다. HTML 에 "X on" 으로 나오는 클래스마다 CSS 의 .X.on 에 배경이 있어야
// 한다. 통계의 연도 탭(yr)만 채움이 빠져 굵은 글씨로 남은 적이 있다(2026-10-05).
export function checkSelectedFill(SITE, CSS) {
  const selected = new Set();
  for (const f of readdirSync(SITE, { recursive: true }))
    if (f.endsWith(".html"))
      for (const m of readFileSync(join(SITE, f), "utf8").matchAll(/class="([^"]*)"/g)) {
        const cls = m[1].split(/\s+/);
        if (cls.includes("on")) for (const c of cls) if (c !== "on") selected.add(c);
      }
  const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const filled = (c) => rules.some(([, sel, body]) => sel.split(",").some((s) => new RegExp(`\\.${c}\\.on\\b`).test(s)) && /background\s*:/.test(body));
  const missing = [...selected].filter((c) => !filled(c));
  return missing.length ? [`고른 상태에 배경이 없는 클래스: ${missing.map((c) => `.${c}.on`).join(", ")}. 고른 탭·칩은 채워서 보인다.`] : [];
}

// 선은 바탕에서 또렷이 보여야 한다. 밝은 화면과 어두운 화면에서 --line 과 --bg 의 명암비를 본다.
// 1.2~1.4 이던 때는 선이 있는지 알기 어려웠다(2026-10-05).
const LINE_CONTRAST = 2.5;
export function checkLineContrast(CSS) {
  const lum = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const out = [];
  for (const block of CSS.match(/\{[^{}]*--line:[^{}]*\}/g) ?? []) {
    const bg = block.match(/--bg:(#[0-9a-f]{6})/i)?.[1], line = block.match(/--line:(#[0-9a-f]{6})/i)?.[1];
    if (!bg || !line) { out.push(`--line 과 --bg 를 같은 블록에서 #rrggbb 로 정해야 명암비를 볼 수 있다: ${block.slice(0, 60)}`); continue; }
    const r = ratio(line, bg);
    if (r < LINE_CONTRAST) out.push(`선 색 ${line} 이 바탕 ${bg} 에서 명암비 ${r.toFixed(2)} 로 흐리다(${LINE_CONTRAST} 이상).`);
  }
  if (!out.length && !/--line:/.test(CSS)) out.push("CSS 에서 --line 을 찾지 못했다.");
  return out;
}
