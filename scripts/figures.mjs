// 본문 수치와 낱말을 읽고 원문과 맞춰 보는 규칙. check-figures.mjs 가 쓰고, figures.test.mjs 가
// 표기마다 맞게 읽는지 본다. 규칙의 설명은 check-figures.mjs 머리말에 있다.

const BIG = { 만: 1e4, 억: 1e8, 조: 1e12 };
const SMALL = { 천: 1e3, 백: 1e2 };
const EN = { hundred: 1e2, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const SHORT = { k: 1e3, m: 1e6, bn: 1e9, b: 1e9, tn: 1e12, t: 1e12 };
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
// 한국어 수 한 덩어리. "1천220억", "25만2천756", "1조 2천억", "3천 5백" 을 하나로 읽는다.
const KO_PART = String.raw`${NUM}(?:[천백] ?${NUM})*[천백]?`;
const KO_PHRASE = new RegExp(String.raw`${KO_PART}(?:[조억만](?: ?${KO_PART})?)*`, "g");
const EN_ATOM = new RegExp(String.raw`([$£€]\s?)?(${NUM})(?:\s?(hundred|thousand|million|billion|trillion)\b|(bn|tn|[kmbt])\b)?`, "gi");
// 법 조항의 "조". 금액이나 수량 단위가 뒤에 오지 않는 "N조" 는 조항 번호로 본다(투표권법 2조, 조약 5조).
const UNIT_AFTER = /^\s?(원|달러|엔|위안|유로|파운드|루피|개|명|배럴|톤|건|주|규모|대)/;

const num = (s) => Number(s.replace(/,/g, ""));

// 값과 적힌 자리. 적힌 자리는 마지막으로 적은 숫자의 자리다(742조 → 1조, 1조 2천억 → 1천억, 2,000 → 1).
function koValue(raw) {
  let total = 0, cur = 0, step = 1, last = 1;
  for (const [, n, small, big] of raw.matchAll(/([\d,]+(?:\.\d+)?)([천백])?|([조억만])/g)) {
    if (big) { total += (cur || 1) * BIG[big]; cur = 0; step = last * BIG[big]; last = step; }
    else {
      cur += num(n) * (SMALL[small] ?? 1);
      last = 10 ** -(n.split(".")[1]?.length ?? 0) * (SMALL[small] ?? 1);
      step = last;
    }
  }
  return { value: total + cur, step };
}

export function koFigures(text) {
  return [...text.matchAll(KO_PHRASE)].map((m) => {
    const raw = m[0].trimEnd();
    const f = { start: m.index, end: m.index + raw.length, raw, digits: raw.match(/[\d.,]+/)[0], ...koValue(raw), big: /[조억만천백]/.test(raw) };
    if (/^[\d,]+조$/.test(raw) && !UNIT_AFTER.test(text.slice(f.end, f.end + 4))) {
      f.value = num(raw.slice(0, -1));
      f.step = 1;
      f.big = false;
    }
    return f;
  });
}

// $400m, £750m, 1.2bn, 1M tokens, A95B 같은 줄임 표기도 읽는다. 소문자 m·k·b·t 는 통화 기호가 붙을 때만
// 단위로 본다(136m 는 미터다).
function enFigures(text) {
  return [...text.matchAll(EN_ATOM)].map((m) => {
    const short = m[4];
    const unit = short && (m[1] || /^(bn|tn)$/i.test(short) || short === short.toUpperCase()) ? SHORT[short.toLowerCase()] : 1;
    return { value: num(m[2]) * (EN[m[3]?.toLowerCase()] ?? unit) };
  });
}

// 영어 기사는 수를 글자로 쓰기도 한다(seven million barrels, per million tokens, Twenty-two, half a million,
// five decades). 로마 숫자(Leo XIV)도 읽는다.
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const WORD = String.raw`(?:${Object.keys(TENS).join("|")})(?:-(?:${ONES.slice(1, 10).join("|")}))?|${ONES.join("|")}|a|half a`;
const EN_WORD = new RegExp(String.raw`\b(${WORD})\b(?:\s(hundred|thousand|million|billion|trillion|decades?)\b)?`, "gi");
function wordValue(w) {
  w = w.toLowerCase();
  if (w === "a") return 1;
  if (w === "half a") return 0.5;
  const [t, o] = w.split("-");
  return TENS[t] !== undefined ? TENS[t] + (o ? ONES.indexOf(o) : 0) : ONES.indexOf(t);
}
const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const roman = (r) => [...r].reduce((n, c, i) => n + (ROMAN[c] < (ROMAN[r[i + 1]] ?? 0) ? -ROMAN[c] : ROMAN[c]), 0);
const wordValues = (text) => [
  ...[...text.matchAll(EN_WORD)].map((m) => wordValue(m[1]) * (m[2] ? (EN[m[2].toLowerCase()] ?? 10) : 1)),
  ...[...text.matchAll(/\b(?:hundred|thousand|million|billion|trillion|decade)\b/gi)].map((m) => EN[m[0].toLowerCase()] ?? 10),
  ...[...text.matchAll(/\b[A-Z][a-z]+ ([IVXLC]{2,7})\b/g)].map((m) => roman(m[1])),
];

// 원문에 나온 값 전부. 한국어와 영어 표기를 둘 다 읽는다.
export const valuesIn = (text) =>
  new Set([...koFigures(text).map((f) => f.value), ...enFigures(text).map((f) => f.value), ...wordValues(text)]);

// 본문에서 대조할 수치. 날짜·연도·시각·한 자리 수는 뺀다.
export function itemFigures(text) {
  return koFigures(text).filter((f) => {
    const after = text.slice(f.end, f.end + 2);
    const before = text.slice(Math.max(0, f.start - 1), f.start);
    if (/^[월일]/.test(after) && !f.big) return false;
    if (/^년/.test(after) && f.value >= 1900 && f.value <= 2100) return false;
    if (/^시(?!간)/.test(after) || (/^분/.test(after) && /\d시 ?$/.test(text.slice(Math.max(0, f.start - 4), f.start)))) return false;
    if (/[\w.-]/.test(before)) return false; // 모델명·버전(GPT-5.1, A100)의 일부
    if (/[A-Za-z]\s$/.test(text.slice(Math.max(0, f.start - 2), f.start))) return false; // Opus 5.5, Gemini 3
    if (f.value < 10 && !f.big && !f.digits.includes(".") && !/^\s?%/.test(after)) return false;
    return true;
  });
}

const APPROX_BEFORE = /(약|대략|거의|최대|최소|무려)\s?$/;
// 단위를 사이에 둬도 본다(10조 원 안팎, 500건 넘게, 1300㎞ 넘게).
const APPROX_AFTER = /^(대|\s?[가-힣㎞㎜%]{0,3}\s?(가량|여|쯤|안팎|남짓|이상|이하|넘|미만|가까))/;

// 값이 같거나, 원문 값을 적힌 자리에서 반올림하거나 끝자리를 버리면 같을 때 찾은 것으로 본다
// (6.12% → 6.1%, 742조7573억 → 742조). "약·가량·넘게" 가 붙은 수는 끝의 0 을 뺀 자리로 본다(약 50 → 10 단위, 1300㎞ 넘게 → 100 단위).
export function found(f, text, values) {
  if (values.has(f.value)) return true;
  const approx = APPROX_BEFORE.test(text.slice(Math.max(0, f.start - 4), f.start)) ||
    APPROX_AFTER.test(text.slice(f.end, f.end + 8));
  let step = f.step;
  if (approx) {
    while (Number.isInteger(f.value / (step * 10)) && step * 10 <= f.value) step *= 10;
  }
  const eps = step / 1e6;
  for (const v of values) {
    if (Math.abs(v - f.value) <= step / 2 + eps) return true;
    if (v >= f.value - eps && v < f.value + step - eps) return true;
  }
  return false;
}

// ---------- 낱말 ----------
// 수치 밖의 사실을 원문과 맞춰 볼 때 쓰는 낱말. check-figures.mjs 가 본문 밖에서만 찾은 사실과 다른 항목의
// 출처에만 있는 사실을 찾을 때 쓴다. 따옴표 안 인용(6자 이상)은 띄어쓰기를 뺀 통째로, 영어는 대문자가 든
// 낱말을, 한국어는 조사를 뗀 두 글자 이상 낱말을 본다. nouns 를 주면 용언 꼴로 끝나는 낱말을 뺀다.

const PARTICLE = /(으로부터|에서는|에게서|으로는|이라고|라고|이라는|라는|에서|에게|으로|부터|까지|처럼|보다|이며|이나|은|는|이|가|을|를|의|에|로|와|과|도|만|씩)$/;
const VERBAL = /(다|고|며|거나|지만|자|면|서|는데|려|게|던|된|한|할|운|하|해|돼|했|됐|져|워|겠|었|았|지|록|니)$/;
const STOP = new Set("대통령 정부 장관 위원장 대표 의원 후보자 관계자 이날 지난 이번 오는 당시 이후 이전 가운데 관련 대해 위해 통해 따라 함께 이상 이하 미국 한국 중국 일본 북한 러시아 이란 이스라엘 우크라이나 국민의힘 민주당 더불어민주당 청와대 대통령실 국회".split(" "));
const flat = (s) => s.replace(/\s+/g, "");

// 본문을 문장으로 나눈다. 필드 이름("- ")은 떼고 열 자 이하 조각은 버린다.
export const sentences = (text) =>
  text.split(/\n/).flatMap((l) => l.replace(/^\s*-\s*/, "").split(/(?<=[다요]\.["”’']?|\.["”’']?)\s+(?=[가-힣A-Z0-9"“'‘(])/))
    .map((s) => s.trim()).filter((s) => s.length > 10);

export function words(sentence, { nouns = false } = {}) {
  const out = new Map();
  for (const m of sentence.matchAll(/["“'‘]([^"”'’]{6,})["”'’]/g)) out.set("Q" + flat(m[1]).replace(/[.,·…!?]/g, ""), "quote");
  for (const w of sentence.split(/[\s,.·…()\[\]"“”'‘’]+/)) {
    // 영문 이름 뒤에 붙은 조사는 뗀다("OpenAI는" → OpenAI).
    const latin = w.match(/^[A-Za-z][A-Za-z0-9.-]*[A-Za-z0-9]/)?.[0];
    if (latin && /[A-Z]/.test(latin)) { out.set("L" + latin, "latin"); continue; }
    const h = w.match(/^[가-힣]+/)?.[0];
    if (!h) continue;
    let s = h;
    for (let i = 0; i < 2 && s.length > 2; i++) s = s.replace(PARTICLE, "");
    if (s.length < 2 || STOP.has(s) || (nouns && VERBAL.test(s))) continue;
    out.set("H" + s, "ko");
  }
  return [...out].map(([key, kind]) => ({ key, kind, text: key.slice(1) }));
}

// 원문 글을 낱말 대조용으로 한 번 손질해 둔다. 인용은 띄어쓰기와 문장부호를 무시하고 찾는다.
export const pageText = (text) => ({ text, squeezed: flat(text).replace(/[.,·…!?]/g, "") });
export const hasWord = (w, page) => (w.kind === "quote" ? page.squeezed : page.text).includes(w.text);
// 인용은 그 자체로 강한 근거라 둘로 센다.
export const weight = (ws) => ws.reduce((n, w) => n + (w.kind === "quote" ? 2 : 1), 0);
