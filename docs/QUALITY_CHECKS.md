# QUALITY_CHECKS

**문서와 발행물이 어긋났는지 점검하는 법.** 검사 항목과 그 실행 방법을 담는다. 점검 결과는 남기지 않는다.

**매주 돌리지 않는다.** 비용이 크고 매주 바뀌는 것도 아니다.

## 언제 돌리나

- 영구 문서(`AGENTS.md` · `INTENT.md` · `DECISIONS.md` · `RUNBOOK.md`)를 크게 고친 다음.
- 주간호가 여러 번 쌓이는 동안 한 번도 안 돌렸을 때.
- 다른 모델이나 사람이 이 프로젝트를 이어받기 전.
- 발행물에서 오류가 나왔을 때. 같은 유형이 더 있는지 본다.

## 어떻게 돌리나

- 번호 순서대로 한다. 기계 검사(1·3절)가 먼저다. 싸고, 여기서 걸리면 읽어 볼 범위가 준다.
- **찾은 것은 그 자리에서 고친다.** 목록만 남기면 다음 점검 때 그대로 있다.
- 기준 자체를 바꿔야 하는 것이면 고치지 말고 선택지를 사용자에게 낸다. 정해지면 [`DECISIONS.md`](DECISIONS.md) 에 남긴다.
- 고칠 게 없어도 5절은 반드시 한다.
- 모든 명령은 저장소 최상위에서 실행한다.

## 1. 문서 — 기계로 보는 것

### 1.1 분량

```bash
wc -l AGENTS.md README.md docs/*.md
```

| 문서 | 상한 | 넘으면 |
|---|---|---|
| `AGENTS.md` | 70줄 | 세션마다 읽는 비용이다. 실행 규칙은 `RUNBOOK.md` 로 내린다 |
| `docs/INTENT.md` | 70줄 | "어떻게"가 섞였는지 본다 |
| `docs/RUNBOOK.md` | 350줄 | 절 단위로 쪼갤지 판단한다 |
| `README.md` | 40줄 | 사람이 읽는 입구다. 상세는 링크로 넘긴다 |
| `docs/QUALITY_CHECKS.md` | 200줄 | 두 항목이 같은 것을 검사하고 있는지 본다. 안 걸린다고 지우지는 않는다 |
| `docs/DECISIONS.md` | 없음 (쌓기만 함) | "현재 유효한 결정"이 계속 길어지면 버린 것이 아래로 안 내려간 것이다 |
| `docs/PLAN.md` | 없음 | 끝난 항목이 남아 있는지만 본다 |

### 1.2 끊어진 내부 참조

```bash
for f in AGENTS.md README.md docs/*.md; do
  grep -o '](\([^)#]*\.md\)[^)]*)' "$f" | sed 's/](//;s/).*//;s/#.*//' | while read -r l; do
    [ -e "$(dirname "$f")/$l" ] || echo "$f -> $l"
  done
done
```

### 1.3 문서 간 중복 문장

```bash
for f in AGENTS.md docs/INTENT.md docs/DECISIONS.md docs/RUNBOOK.md; do
  grep -o '^[-*] .*' "$f" | sed 's/^[-*] //;s/\*\*//g;s/\[\([^]]*\)\]([^)]*)/\1/g' \
    | awk -v F="$f" 'length($0)>15{print F"\t"$0}'
done | sort -t$'\t' -k2 \
  | awk -F'\t' '{k=$2; gsub(/[ .,·]/,"",k); if(k==p){print pf" / "$1"\n  "$2} p=k; pf=$1}'
```

글자가 조금이라도 다르면 안 잡힌다. 같은 뜻을 다른 문장으로 쓴 것은 2.2 에서 읽어서 잡는다.

## 2. 문서 — 읽어야 아는 것

### 2.1 문장이 제 문서에 있는가

[`../AGENTS.md`](../AGENTS.md) "문서의 역할 분담" 표를 펴 놓고 각 문서의 소제목과 항목을 훑는다. 표의 **담지 않는 것** 칸에 해당하는 문장이 있으면 옮긴다.

- 표에 없는 종류의 내용이면 어느 칸도 안 맞는 것이다. `PLAN.md` 에 두고, 반복해서 필요해지면 그때 표를 고친다.
- 각 문서 첫 줄에 담는 것이 한 줄로 적혀 있는가. 거기에 다른 문서로 보내는 안내가 섞이지 않았는가.
- 특정 제품에서만 되는 절차가 `RUNBOOK.md` 본문에 섞이지 않았는가. "플랫폼별 실행" 절로 모은다.

### 2.2 서로 어긋나지 않는가

- `DECISIONS.md` "현재 유효한 결정"의 각 행이 `RUNBOOK.md` 의 실제 절차와 같은 말을 하는가. 다르면 둘 중 하나가 낡았다.
- `DECISIONS.md` "버린 것"의 방식이 다른 문서에 아직 절차로 남아 있지 않은가.
- 한 문서 안에서 앞뒤가 맞는가. 숫자·기간·매체 목록이 특히 잘 어긋난다.
- 없는 표나 절을 가리키는 문장이 없는가. "아래 표에 있다", "위에서 정한 대로" 같은 표현을 의심한다.

### 2.3 문서와 코드가 어긋나지 않는가

문서에 적힌 목록이 실제 스크립트와 같은지 나란히 놓고 본다.

```bash
sed -n '/^### 7. 매체/,/^### 8\./p' docs/RUNBOOK.md
grep -n 'const PRIMARY\|const FEEDS\|const WORLD_FEEDS' -A 20 scripts/collect-headlines.mjs
```

- 국내 주요 매체 목록이 `PRIMARY` 와 같은가.
- AI 뉴스룸 표가 `FEEDS` 와 같은가. 경로까지 본다.
- `RUNBOOK.md` 에 적힌 명령과 파일 경로가 실제로 존재하는가. 대상 주 계산 명령은 직접 실행해 본다.

### 2.4 길어지는 값을 하는가

- 새로 늘어난 문장마다 묻는다. 이 문장이 없으면 무엇이 잘못되는가. 답이 없으면 지운다.
- 한 번 쓰고 아무도 안 읽는 절이 있는가.

## 3. 발행물 — 기계로 보는 것

`W=content/week/2026-W36.md` 처럼 대상 파일을 정하고 실행한다.

### 3.1 건수와 항목 구성

```bash
node -e '
const t=require("fs").readFileSync(process.argv[1],"utf8");
for(const s of t.split(/\n## /).slice(1)) console.log(s.split("\n")[0], (s.match(/\n### /g)||[]).length+"건");
for(const s of t.split(/\n### /).slice(1)){
  const m=["날짜","무슨 일","왜 중요한가","출처"].filter(k=>!s.includes("**"+k+"**"));
  if(m.length) console.log("누락:", s.split("\n")[0], "→", m.join(","));
}' "$W"
```

국내·해외·AI 가 각 5건이어야 한다. 모자라면 발행하지 않는다.

### 3.1.1 한 덩어리로 쓴 본문

```bash
node -e '
const t=require("fs").readFileSync(process.argv[1],"utf8");
for(const s of t.split(/\n### /).slice(1)){
  const m=s.match(/\*\*무슨 일\*\*:([\s\S]*?)\n- \*\*왜/); if(!m) continue;
  const paras=m[1].trim().split(/\n\s*\n/).length, sents=(m[1].match(/다\./g)||[]).length;
  if(sents>4 && paras===1) console.log("문단 미분리:", s.split("\n")[0], `(${sents}문장)`);
}' "$W"
```

서너 문장을 넘는 본문은 갈래가 바뀌는 곳에서 나눈다(`RUNBOOK.md` 11절).

### 3.2 출처 라벨과 실제 매체 (네트워크 필요)

```bash
grep -o '\[[^]]*\](https://n\.news\.naver\.com/article/[0-9]*/[0-9]*)' "$W" | while read -r l; do
  label=${l%%]*}; label=${label#[}; url=${l##*(}; url=${url%)}
  real=$(curl -s -A "Mozilla/5.0" "$url" | grep -o 'og:article:author" content="[^"|]*' | head -1 | sed 's/.*content="//;s/ *$//')
  case "$label" in "$real"*) ;; *) echo "불일치: $label / 실제 $real / $url" ;; esac
done
```

네이버 링크는 매체가 URL 에 안 보여서 라벨이 틀려도 눈으로는 안 걸린다. 네이버 외 링크는 호스트를 직접 본다.

```bash
grep -o '\[[^]]*\](https\?://[^)]*)' "$W" | grep -v 'n\.news\.naver' | sed 's#\](# → #;s#^\[##;s#/[^/]*)$##'
```

### 3.3 상투 표현

```bash
grep -n -o '관통했\|쏠림\|흔들었\|겨눴\|신호탄\|분수령\|불붙\|제동을 걸\|막을 올\|화두를 던\|촉각을 곤두\|지각변동\|판도를 바꾸' "$W"
```

새로 눈에 걸린 표현은 이 목록에 더한다. 규칙 자체는 `RUNBOOK.md` 10절에 있다.

### 3.4 대상 주를 벗어난 날짜

```bash
node -e '
const f=process.argv[1], t=require("fs").readFileSync(f,"utf8");
const [,y,w]=f.match(/(\d{4})-W(\d{2})/).map(Number);
const j=new Date(Date.UTC(y,0,4)), mon=new Date(j);
mon.setUTCDate(j.getUTCDate()-((j.getUTCDay()+6)%7)+(w-1)*7);
const sun=new Date(mon); sun.setUTCDate(mon.getUTCDate()+6);
console.log("주 범위", mon.toISOString().slice(0,10), "~", sun.toISOString().slice(0,10));
const seen=new Set();
for(const m of t.matchAll(/(\d{1,2})월 (\d{1,2})일/g))
  if(new Date(Date.UTC(y,+m[1]-1,+m[2]))>sun && !seen.has(m[0])) seen.add(m[0]) && console.log("주 이후:", m[0]);
' "$W"
```

걸렸다고 바로 오류는 아니다. 그 주에 발표된 예정일과 시한은 써도 된다(`RUNBOOK.md` 9절). **그 주에는 알 수 없었던 결과**가 들어갔는지를 본다.

## 4. 발행물 — 읽어야 아는 것

최근 주간호 하나를 독자처럼 처음부터 끝까지 읽는다.

- "무슨 일"과 "왜 중요한가"가 각각 실제로 답을 하는가. "왜 중요한가"가 사실 요약을 되풀이하고 있지 않은가.
- 요약하기 좋게 사실을 구부린 곳이 없는가. 여러 사건을 한 테마로 묶으려다 억지가 된 곳을 본다.
- 주요 매체 규칙(`RUNBOOK.md` 7절)을 지켰는가. 보조 매체만 쓴 항목에 표시가 있는가.
- 고른 15건이 실제로 그 주의 큰 뉴스인가. 분야를 맞추려고 채운 항목이 없는가.
- 휴대폰 폭에서 읽히는가.

## 5. 이 문서 자체

**프로젝트가 바뀌면 이 점검표도 바뀐다.** 안 고치면 없어진 것을 검사하고 새로 생긴 것을 놓친다. 점검할 때마다 마지막으로 이것을 한다.

- 새로 생긴 문서·스크립트·산출물이 검사 대상에 들어와 있는가.
- 버린 방식을 아직 검사하고 있지 않은가.
- 이번에 찾은 문제 중 **해당 검사 항목이 없어서** 놓쳤던 것이 있는가. 있으면 항목을 더한다. 한 번 난 오류는 한 번 더 난다.
- **아무것도 안 걸린다고 지우지 않는다.** 안 걸리는 것은 그 기준이 지켜지고 있다는 뜻이다. 검사를 지우는 것은 검사할 대상이 없어졌을 때뿐이다.

점검 결과는 남기지 않는다. 고치는 것이 결과다.
