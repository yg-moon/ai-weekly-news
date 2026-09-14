// 헤드라인 목록에서 패턴을 미리 정하지 않고 자주 등장한 말을 뽑는다.
//
// 후보를 전수로 모아도, 순위를 매길 때 "내가 떠올린 주제"만 세면 같은 편향이
// 한 단계 뒤에서 되살아난다. 이 도구는 무엇을 셀지 데이터가 정하게 한다.
// RUNBOOK_WEEKLY 4절 참고.
//
// 국내와 해외 풀에 잘 맞는다. AI 풀은 항목이 적고 제목이 짧아 빈도가 흩어지므로
// 이 도구를 보조로만 쓰고 뉴스룸 목록은 전부 읽는다. RUNBOOK_WEEKLY 4절 참고.
//
//   node scripts/rank-topics.mjs <헤드라인파일> [--top 40]
//   node scripts/rank-topics.mjs <헤드라인파일> --covered "용혜인,호르무즈,종부세"
//
// --covered 를 주면 상위 목록 중 선정에 반영되지 않은 것을 경고한다.
// 선정을 마친 뒤 반드시 한 번 돌린다.

import { readFileSync } from "node:fs";

const STOP = new Set(
  `있다 없다 대한 위해 이번 오늘 내일 어제 그리고 하지만 대해 통해 관련 발표 밝혀 밝혔
   말했 전했 나서 나섰 따르 따라 했다 한다 된다 됐다 지난 올해 내년 작년 사람 우리 모두
   다시 처음 단독 속보 종합 영상 사진 현장 기자 뉴스 인터뷰 그래픽 이라며 라며 라고
   대비 최대 최고 최초 무슨 이유 상황 경우 문제 결과 정도 수준 가능 계획 예정 전망
   분석 지적 주장 요구 강조 확인 한국 만원 가능성 이라고 한다는 된다는 대한민국`
    .split(/\s+/)
);
const PARTICLE = /(은|는|이|가|을|를|에|의|도|와|과|로|으로|에서|에게|부터|까지|만|들|씨|측)$/;

// 해외와 AI 풀은 영어다. 같은 기준을 적용하려면 영어도 세야 한다.
const STOP_EN = new Set(
  `the a an and or but of in on at to for from with by as is are was were be been being
   has have had do does did will would can could may might must shall should
   this that these those it its his her their our your my he she they we you
   not no nor so than then there here what which who whom whose when where why how
   after before during over under between about against into through more most some any
   all both each other another new says said say according report reports reported
   first second third last next year years day days week weeks month months
   one two three four five six seven eight nine ten million billion percent
   says his her also amid following since until while including such other
   // 출처 표기 — Wikipedia 항목 끝에 "(AFP via France 24)" 처럼 붙는다
   via afp reuters bbc cnn npr jazeera guardian xinhua euronews nbc espn dawn fortune
   tribune news agency press media post times wire service france daily world
   independent telegraph journal herald observer today online magazine network
   // Hacker News 게시글 접두사
   show ask launch tell hiring
   // 사건 서술에 늘 붙는 일반어
   people killed injured dead death toll least others wounded missing rescue
   president minister government official officials state states united country countries
   city district province region town village area local national international
   attack attacks strike strikes announces announced says reports court judge police
   military forces troops security company court case election party`
    .split(/\s+/).filter((w) => w && !w.startsWith("//"))
);

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const top = Number(args[args.indexOf("--top") + 1]) || 40;
const covered = (args[args.indexOf("--covered") + 1] ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

if (!file) {
  console.error("usage: node scripts/rank-topics.mjs <헤드라인파일> [--top N] [--covered \"a,b,c\"]");
  process.exit(1);
}

const heads = readFileSync(file, "utf8")
  .split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());

const freq = new Map();
const sample = new Map();
const display = new Map();
for (const h of heads) {
  const seen = new Set();
  // 한글
  for (const raw of h.match(/[가-힣]{2,8}/g) ?? []) {
    const t = raw.replace(PARTICLE, "");
    if (t.length < 2 || t.length > 6 || STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    freq.set(t, (freq.get(t) ?? 0) + 1);
    if (!sample.has(t)) sample.set(t, h);
  }
  // 영어 — 소문자로 세고 표시는 원형을 쓴다
  for (const raw of h.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? []) {
    if (!/^[A-Z]/.test(raw)) continue; // 고유명사만
    const key = raw.toLowerCase();
    if (key.length < 3 || STOP_EN.has(key) || seen.has(key)) continue;
    seen.add(key);
    freq.set(key, (freq.get(key) ?? 0) + 1);
    if (!sample.has(key)) sample.set(key, h);
    if (!display.has(key) || /^[A-Z]/.test(raw)) display.set(key, raw);
  }
}

// 아무것도 세지 못했다면 통과로 착각하게 두지 않는다.
if (!heads.length || !freq.size) {
  console.error(
    `측정할 것이 없다. 헤드라인 ${heads.length}건, 토큰 ${freq.size}종.\n` +
      `입력 파일이 '- ' 로 시작하는 헤드라인 목록인지 확인한다.`
  );
  process.exit(2);
}

const show = (t) => display.get(t) ?? t;
const sorted = [...freq].sort((a, b) => b[1] - a[1]).slice(0, top);
console.log(`헤드라인 ${heads.length}건 · 토큰 ${freq.size}종 · 상위 ${top}개\n`);
for (const [t, n] of sorted) {
  console.log(`${String(n).padStart(3)}  ${show(t).padEnd(14)} ${sample.get(t).slice(0, 56)}`);
}

if (covered.length) {
  // 선정한 주제의 토큰이 상위 목록의 어느 항목과도 겹치지 않으면 빠뜨린 것이다.
  const norm = (x) => x.toLowerCase();
  const miss = sorted.filter(([t]) =>
    !covered.some((c) => norm(t).includes(norm(c)) || norm(c).includes(norm(t)))
  );
  console.log(`\n${"=".repeat(60)}`);
  if (!miss.length) {
    console.log("상위 목록이 모두 선정에 반영됐다.");
  } else {
    console.log(`선정에 반영되지 않은 상위 토큰 ${miss.length}개 — 빠뜨린 사안이 없는지 확인한다.\n`);
    for (const [t, n] of miss) console.log(`  ${String(n).padStart(3)}  ${show(t).padEnd(14)} ${sample.get(t).slice(0, 50)}`);
  }
}
