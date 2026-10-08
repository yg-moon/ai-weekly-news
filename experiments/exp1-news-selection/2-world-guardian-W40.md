# W40 해외: Guardian 기사 수를 보도량에 넣는 실험

입력: ../sel-W40/world.md (위키 Current events 119건 + Guardian 140건). 저장소 파일은 고치지 않았다.
스크립트: gparse.mjs (world.md → rows.json, Guardian URL 포함), exp.mjs (사안 묶기·방식별 순위, hits.json 에 사안별 적중 목록).

## 1. Guardian 데이터가 들어오는 방식
- `guardianDay()` 가 `theguardian.com/world/YYYY/mon/dd/all` (world 태그 날짜 목록) 한 쪽을 받아 `fc-item__link` 링크를 URL 기준으로 중복 제거한다. 피드가 아니라 날짜 페이지라 과거 주도 받아진다.
- world 태그만 받는다. business·us-news·environment 쪽 기사는 world 태그가 없으면 빠진다. 경제·미군 사안(G7, 이라크)이 Guardian 에 거의 안 잡히는 이유일 수 있다(확인은 안 함).
- W40: 날짜별 11/18/31/26/16/18/20 = 140건. URL 140개, 제목 140개 모두 고유하다(같은 URL 중복 없음).
- 섹션: world 110, world/video 19, world/live 7, australia-news 2, world/ng-interactive 1, technology 1.

## 2. 사안별 수치 (게이트 통과 5개 + 게이트에 걸린 5개)
wOut=위키 인용 매체 수(Guardian 제외), gN=Guardian 기사 수, gDays=Guardian 기사가 나온 날, gCore=영상·라이브블로그·브리핑 뺀 Guardian 기사 수, days=위키∪Guardian 날짜, out0=직전 방식(위키 매체+Guardian 1곳), od=(날짜,매체) 쌍 수, odCore=od 에서 Guardian 은 gCore 만.

| 사안 | 실린 순위/게이트 | wOut | gN | gDays | gCore | days | out0 | od | odCore |
|---|---|---|---|---|---|---|---|---|---|
| flydubai | 1 | 2 | 15 | 5 | 10 | 5 | 3 | 7 | 7 |
| 프랑스 고교생 시위 | 2 | 2 | 6 | 4 | 4 | 5 | 3 | 7 | 7 |
| 미군 이라크 철수 | 3 | 3 | 0 | 0 | 0 | 2 | 3 | 3 | 3 |
| G7 비축유 | 4 | 1 | 1 (라이브블로그) | 1 | 0 | 1 | 2 | 2 | 1 |
| 에티오피아 메켈레 | 5 | 6 | 0 | 0 | 0 | 4 | 6 | 8 | 8 |
| 브라질 대선 | 예고 | 1 | 7 | 5 | 6 | 5 | 2 | 6 | 6 |
| 키이우 공습 | 국면 없음 | 2 | 9 | 5 | 1 | 6 | 3 | 8 | 5 |
| 스페인 주택 | 국면 없음 | 1 | 6 | 4 | 5 | 4 | 2 | 5 | 5 |
| 가자·서안 | 국면 없음 | 3 | 3 | 2 | 2 | 4 | 4 | 6 | 6 |
| DMZ·북한 미사일 | 중복 | 1 | 2 | 2 | 2 | 3 | 2 | 3 | 3 |

직전 selection.json 의 outlets 와 조금 다르다(eth 6 동일, fly 3 동일, g7 2 동일). 정규식을 이번에 새로 짰기 때문이다.

## 3. 방식별 순위
게이트 전 10개 전체(*=게이트에 걸린 사안):
- A0 직전 방식(매체 수, Guardian 1곳): eth > 가자* > 키이우* > fly > fr > iraq > 브라질* > 스페인* > 북한* > g7
- A1 (날짜,매체) 쌍, Guardian 은 하루 1: 키이우* > eth > fly > fr > 브라질* > 가자* > 스페인* > 북한* > iraq > g7
- A1c A1 에서 Guardian 영상·라이브·브리핑 제외: eth > fly > fr > 브라질* > 가자* > 키이우* > 스페인* > 북한* > iraq > g7
- A2 위키 매체 수 1차, Guardian 기사 수 2차(동점 해소): eth > 가자* > iraq > fly > fr > 키이우* > 브라질* > 스페인* > 북한* > g7
- A2b 세 축(위키 매체·날짜·Guardian 기사) 순위 합: fly > fr > 브라질* > 키이우* > 가자* > eth > 스페인* > iraq > 북한* > g7
- A3 위키 매체 + log2(1+gCore): eth > fly > 가자* > fr > 브라질* > 스페인* > 키이우* > iraq > 북한* > g7

게이트 통과 5개만(실린 순위 fly>fr>iraq>g7>eth, footrule=|순위차| 합):
- A0·A1·A1c·A3: eth>fly>fr>iraq>g7 (8)
- A2: eth>iraq>fly>fr>g7 (10)
- A2b, '날짜 먼저 그다음 od': fly>fr>eth>iraq>g7 (4)

읽을 점
- 모든 방식에서 G7 이 5개 중 꼴찌이고 에티오피아가 G7 보다 위다. 직전 감사의 "G7 4위는 납득 안 됨"을 어느 방식이든 뒷받침한다.
- Guardian 을 날짜별로 넣으면(A1/A1c) flydubai 7 대 이라크 3 으로 차이가 드러난다. 직전 방식(A0)에서는 3 대 3 이었다.
- 기사 수를 그대로 쓰는 방식(A2b, A3)은 Guardian 이 많이 다룬 유럽·중남미 사안(스페인 주택 gCore 5, 브라질 6)을 끌어올린다. 브라질·키이우는 게이트가 거르지만 스페인 주택은 '국면 없음' 판단이 약하면 5위권에 들어온다.
- 이라크·에티오피아는 Guardian 0건이다. Guardian world 목록이 아프리카 전황·미군 기사를 거의 싣지 않은 것이지, 보도가 없었다는 뜻은 아니다. 기사 수를 1차 축으로 쓰면(A2b) 이 두 사안이 깎인다.

## 4. 권하는 방식: A1c
- 보도량 = (날짜, 매체) 쌍의 수. 위키 인용 매체는 그 항목의 날짜에, Guardian 은 하루 최대 1로 넣는다. 영상(/video/), 라이브블로그(/live/), "briefing:" 제목은 Guardian 쪽에서 뺀다.
- 이유: Guardian 기사 15건이 한 매체의 판단을 15배로 키우지 않고, 며칠을 따라갔는지(5일)만 반영한다. 같은 날 같은 사건을 영상·라이브·해설로 여러 번 낸 것은 하루 1로 접힌다. 게이트 통과 5개 순위는 A0 과 같아서(크게 흔들리지 않음) 도입 위험이 작고, flydubai-이라크 차이는 드러난다.
- Guardian 기사 수(gN/gCore)는 점수에 넣지 말고 참고 열로만 둔다. 섹션·지역 편중 때문이다.
- 이 방식으로도 eth 가 1위로 올라온다. 위키 항목이 인용을 많이 달아서다(4개 항목에 6곳). 실린 순위(fly 1)는 2절 '되돌리기 어려움'보다는 보도량 해석의 문제이므로, 위키 인용 수 자체가 약한 신호라는 점은 그대로 남는다.

## 5. 걸린 문제(오탐·편중·중복)
섹션·형식 편중
- flydubai 15건 중 5건이 영상·라이브·Deconstructed·Friday briefing(편집 회고)이다. 키이우는 9건 중 8건이 영상·라이브·매일 나오는 "Ukraine war briefing" 이어서, 브리핑을 세면 계속되는 전쟁이 매일 자동으로 1점씩 받는다(od 8 → odCore 5).
- G7 의 Guardian 유일 기사는 라이브블로그(world/live)다. 그날 라이브블로그 제목이 G7 이었을 뿐, 별도 기사는 없다.
- 영국·호주 시각 기사가 섞인다(flydubai '호주인 부부', '호주 보안당국 조사'). 사안 자체의 보도량이 아니라 Guardian 독자 근접성이다.
- Guardian 은 world 태그 목록만 받으므로 경제(G7)·미국발(이라크) 사안을 체계적으로 덜 센다.

중복
- 수집기가 URL 로 중복을 지워 같은 기사 중복은 0건이다. 다만 같은 내용의 기사+영상+라이브블로그가 별개 URL 로 들어온다(위 형식 편중과 같은 문제).

정규식 오탐·누락 (exp.mjs 에서 제외 처리)
- 'pilot' → 미국 해안경비대 Gulfstream 에어앰뷸런스 수색(flydubai 아님). 이 오탐이 위키 매체 CBC·Winnipeg City News 를 flydubai 에 붙였다.
- 'Iraq' → 호르무즈 해협 이라크 유조선 항목(철수 아님). 'barrels' → 같은 항목이 G7 에 붙음.
- 'Russia|Kyiv' 계열 → 이르쿠츠크 연구소 사망, Su-35 격추, 'Kyiv Independent 편집장' 인터뷰.
- 'Brazil' → 포르투갈의 브라질인 언어 차별 기사.
- 'housing' → 유럽 전반 주택 해설(09-30), 'Spanish' → 스페인 홍수 영상.
- 'Gaza' → 수영 소녀 영상, 구글 지도 피해 화상(그 주의 사건 아님). 남겨 두었다.
- 누락: 'France.*student' 가 "student protests across France"(09-29, 어순 반대)를 놓쳤다. 고친 뒤 프랑스 gN 5 → 6, days 4 → 5.
- 북한: 'South Korea' 만 쓰면 상어 기사·우크라이나 포로 기사(국내 4위 사안)가 붙는다. 지뢰·미사일로 좁혔다.
