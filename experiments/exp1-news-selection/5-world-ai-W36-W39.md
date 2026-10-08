# W36~W39 확장 실험: 해외 Guardian 권장 방식(A1c)과 AI 매체 추가

저장소 파일은 고치지 않았고 커밋도 하지 않았다. 수집은 저장소의 `scripts/collect-headlines.mjs`(커밋 전 수정본, Anthropic `/claude-*` 대응)로 world·ai·aimedia 를 받았다.
W40 실험의 스크립트를 주 인자를 받도록만 바꿔 다시 썼다.
- `exp4.mjs` = exp-guardian/exp.mjs 와 같은 계산(A0/A1/A1c/A2/A2b/A3)이다. 사안 정의는 `<주>/cands.mjs` 에 있다. 출력은 `<주>/exp.out`, `<주>/hits.json`.
- `build4.py` = exp-ai/build.py 와 같다. TC+Verge(이번 수집)에 Wired 월별 사이트맵(src/), Register 사이트맵, Reuters 사이트맵 100쪽(둘 다 exp-ai 에 받아 둔 것)을 합쳐 `<주>/aimedia-plus.md` 를 만든다.
- `ai4.mjs` = count.mjs 와 같은 방식으로 센다. 지금 방식(TC+Verge)과 새 방식(+Reuters·Wired·Register)을 함께 센다. Reuters 는 AI 키워드로 먼저 거른다. 사안 정의는 `<주>/aicands.mjs`, 출력은 `<주>/ai.out`.
- footrule 은 실린 5개끼리 순위 차이의 합이다(0이 완전 일치). 동점이면 입력 순서(=실린 순서)를 따르게 되어 지금 방식이 유리해지므로, 동점에 평균 순위를 주는 tieaware 도 함께 적었다.

## 0. 백필 한계
- **Reuters**: 받아 둔 1만 건 창이 2026-09-07 일부(36건, 평일의 1/10)부터 시작한다. **W36 에는 전혀 닿지 않는다.** W37 은 월요일(09-07)이 거의 비고 나머지 날은 다 닿는다. W38·W39 는 모두 닿는다. 지금 다시 받으면 창이 더 밀리므로 다시 받지 않았다.
- **Wired** 는 lastmod(수정일) 기준이라 날짜가 밀릴 수 있다. 8·9월 사이트맵을 새로 받았다.
- **Register** 사이트맵은 1월부터 덮어 문제가 없다.
- 사안 묶기는 그 주 헤드라인 전체를 읽고 했다. 다만 data/runs 에 주별 selection(게이트 판정)이 없어서 빠진 후보는 모두 '빠짐'으로 적었다. 빠진 이유(중복·국면 없음·단발)는 알 수 없다.
- 위키 인용 괄호를 매체로 세는 `outsOf` 는 W40 과 같다. HUR·SSU·IRGC·"$2.46" 같은 괄호도 매체로 잡혀 wOut 이 1 정도 부푼다. W40 과 같은 조건으로 두려고 고치지 않았다.
- 손으로 지운 오탐: 아래 7절.

## 1. 해외 요약 (실린 5개 순위 일치, footrule tieaware)
| 주 | 실린 순서 | A0 지금 | A1c 권장 | A1c 에서 실린 5위보다 위에 있는 빠진 후보 |
|---|---|---|---|---|
| W36 | 이란 > 네팔 > AfD > 특사 키이우 > 라이프치히 | 4 | 4 | 러시아 키이우 공습(12), 가자(8), 인니 산불·연무(8). 실린 라이프치히는 7 |
| W37 | 후티 > 정착촌 금지 > 필리핀 여객선 > 열차 피격 > 미국 폭염 | 4 | **2** | 이란(14), 가자(12), 우크라 공습(9), AfD 후폭풍(5, 여객선과 동점), 스웨덴 선거(4, 폭염과 동점) |
| W38 | 후티 > 연준 > 제재법 > 그린란드 > 모스크바 공격 | 6 | 6 | 이란(20), 가자(8), 스웨덴 정권 교체(6), 러 총선(5), 캐나다-EU(4) |
| W39 | 이란 > 시진핑 > 후티 > 티그라이 > 브라질 베팅 | 3 | 2 | 수단(8), 아프-파 전쟁(7), 가자(7), 남아공 총격(7). 시진핑은 6 |
| W40(기존) | fly > 프랑스 > 이라크 > G7 > 에티오피아 | 8 | 8 | 브라질 대선·가자·키이우·스페인 주택·북한(모두 이라크·G7 보다 위) |

- 다섯 주 중 A1c 가 더 맞은 주가 둘(W37, W39 소폭)이고 같은 주가 셋이다. 나빠진 주는 없다. **도움은 작고 일관되게 '해는 없다'** 수준이다.
- 실린 5개 순위가 바뀐 것도 W37(여객선 ↔ 폭염 자리 교정)과 W36(AfD ↔ 특사 맞바꿈) 정도다. W40 의 "flydubai 7 대 이라크 3" 같은 뚜렷한 분리는 이번 네 주에서 다시 나오지 않았다.

## 2. AI 요약 (outlets 먼저, days 다음. footrule tieaware)
| 주 | 실린 순서 | 지금 | 새 방식 | 새 방식에서 실린 것보다 위로 올라온 빠진 후보 |
|---|---|---|---|---|
| W36 (Reuters 없음) | Astra > Nvidia-HF > Fable 5.1 > Gemini 3.8 Flash > Daybreak 10억$ | 0 | 0 | OpenAI 'rogue agents/위키 사건'(3일·3곳), 신문사 저작권 소송(2일·3곳). 둘 다 Fable(1일·3곳)보다 위 |
| W37 (Reuters 월요일 빔) | 나비에-스토크스 > 연구원 퇴사 > Mistral > RubyGems > 유전체 | 2 | 2 | Suno(3/3), Muse 출시(2/3), Amodei '감속'(2/3). 셋 다 Mistral(1/3)보다 위 |
| W38 | 자율규제 무산 > MS 내부문서 > 군 오인 첩보 > MS 행동강령 > Gemini 3.8 Live | 0 | 2 | Anthropic 바이오랩(3/3), Muse(3/3), Claude로 OpenAI 해킹(2/3), Gemini 해킹(2/3). 넷 다 실린 2위(3/2)보다 위 |
| W39 | 호주 정부 침입 > Muse 1위 > Opus 5.5·Sol·Luna > AI 통제 > 바이오랩 효소 | 6 | 5 | 없음. Anthropic IPO 의결권(3/2)이 AI 통제(3/2)와 동점 |
| W40(기존) | DevDay > Astra > 서약 > IPO > Argon | - | - | Sonnet 5.5(2/3)가 Argon(2/2)보다 위 |
(표기: days/outlets)

- **변별력은 일관되게 좋아진다.** 지금 방식은 매체가 둘뿐이라 outlets 가 0·1·2 셋으로만 나뉜다. W39 처럼 실린 상위 5개가 모두 2곳으로 동점이 되면 days 만으로 순위가 정해진다. 새 방식은 상한이 5곳이라 W39 의 호주 침입(1/2 → 4/5)이나 W38 자율규제(2/4 → 5/5)처럼 큰 사안이 확실히 떨어져 나온다.
- **실린 순위와 맞는 정도는 일관되게 좋아지지 않는다.** footrule 은 W38 에서 0 → 2 로 나빠졌고 W39 에서 6 → 5 로 조금 좋아졌다. W36·W37 은 같다. W40 처럼 "4개 일치, 5위 하나만 바뀐다"는 결과는 W37·W38 에서도 비슷하게 나온다. 다만 바뀌는 쪽은 매주 '빠진 후보가 위로'이다.
- 주마다 1~4개의 빠진 후보가 새 방식에서 실린 것 위로 올라온다. 대부분 Reuters·Register·Wired 가 한 꼭지씩 더해 준 Anthropic·Meta·OpenAI 관련 사안이다(바이오랩, Muse, Suno, rogue agents). 그중 바이오랩(W38 → W39 5위)과 Muse(W37 → W39 2위)는 다음 주에 실렸다. 보도량이 한 주 먼저 신호를 낸 셈이다. 다만 이것은 결과를 보고 한 해석이다.

## 3. 주별 메모
**W36**
- 해외: 모든 방식이 이란 > 네팔 > 라이프치히 순이다. AfD(일요일 선거, 3일·od 4)와 특사 키이우(od 4)는 어느 방식에서도 라이프치히(od 7)보다 아래다. Guardian 네팔 23건 중 6건이 영상이고 4건이 호주인 실종자 기사(독자 근접성)다. A1c 가 영상을 빼도 6일을 다 받아 네팔이 2위로 오른다(실린 순위와 같음).
- AI: Reuters 가 없다. Daybreak(5위)는 TC·Verge·Wired·Register 어디에도 없다(0/0). 뉴스룸에만 나온 발표다. Fable 5.1 은 수정된 수집기로도 Anthropic 뉴스룸 목록에 잡히지 않는다. 지금 목록에는 haiku/opus/sonnet-5-5 만 있어 지난 모델 페이지는 목록에서 빠진 것으로 보인다.

**W37**
- 해외: A1c 가 여객선(76명 사망, od 5)을 폭염(od 4) 위로 올려 실린 순서에 맞췄다. 대신 **AfD 후폭풍이 위키 0건, Guardian 5일**만으로 od 5 가 되어 여객선과 동점이다(A0 에서는 꼴찌 1). 열차 피격(4위)은 일요일 하루 사건이라 모든 방식에서 꼴찌다(od 2).
- AI: 새 방식에서 연구원 퇴사(Reuters·Wired 추가 → 4곳)가 나비에-스토크스(3곳)를 앞선다. Reuters 의 'Morning Bid' 같은 묶음 기사 한 건이 섞여 있다(날짜·매체 수에는 영향 없음). 유전체(5위)는 1/2 로 빠진 후보 셋보다 낮다.

**W38**
- 해외: **연준 금리 인상(2위)은 위키·Guardian world 어디에도 없다(0).** 해외 소스는 미국 통화정책을 세지 못한다. A0·A1c 가 똑같이 놓친다. 그린란드(4위, od 2)도 약하다. Guardian 이 많이 다룬 스웨덴 정권 교체(위키 1, G 4일)가 6위에서 4위로, 캐나다-EU 준회원(G 3일)이 8위에서 6위로 오른다.
- AI: 자율규제 무산이 22건·5곳으로 압도한다. 그러나 Reuters 9건 중 6건이 증시 기사다("Tech stocks slide on AI slowdown talks" 등). 군 오인 첩보(3위)와 MS 내부문서(2위)는 Reuters·Wired·Register 증분이 0이어서 새 방식에서 상대 순위가 내려간다. Gemini 3.8 Live(5위)는 어느 매체에도 없다(0/0).

**W39**
- 해외: 모든 방식이 후티(od 9)를 시진핑 국빈 방문(od 6)보다 위에 둔다. A1c 는 위키 항목을 날짜마다 세므로, 매일 위키 항목이 붙는 전쟁이 올라간다. 아프-파 전쟁은 A0 3 → A1c 7, 수단은 6 → 8 이다. 둘 다 Guardian 은 0건이다. 브라질 베팅 금지(5위)는 od 3 으로 빠진 후보 대부분보다 낮다.
- AI: 새 방식이 동점을 풀어 지금 방식에서 위에 있던 swarm·수학 자문단(2/2)을 실린 것 아래로 내린다. Muse(7일·5곳)가 호주 침입(4일·5곳)보다 위다. Muse 의 Reuters 6건 중 3건은 'Morning Bid'·주간 차트 같은 시장 칼럼이다.

## 4. 부작용
- **해외 · 유럽(영국) 쏠림이 재현된다.** Guardian 만으로 점수를 얻는 사안이 매주 1~2개씩 나온다. W37 AfD 후폭풍(위키 0), W38 스웨덴·캐나다-EU, W36 네팔의 호주인 기사가 그렇다. 하루 1점 상한이 있어 크게 튀지는 않는다(최대 +5). 그래도 위키에 없는 유럽 정치 후속 보도가 실린 5위권 바로 아래까지 올라온다.
- **해외 · 아프리카·남아시아는 Guardian 이 거의 0이다**(수단, 아프-파, 티그라이 1, 남아공 1). A1c 는 합산이라 깎이지는 않는다. 상대적으로는 밀린다.
- **해외 · A1c 는 Guardian 과 별개로 위키 항목도 날짜별로 센다.** 그래서 매일 항목이 붙는 계속되는 전쟁(이란·가자·우크라·아프-파·수단)이 늘 상위를 차지한다. 이것들은 게이트(국면 없음)가 거르는 전제다. 게이트가 약하면 순위표가 전쟁으로 채워진다.
- **해외 · 구조적 사각지대는 두 방식이 같다.** 미국 경제(W38 연준 0), 일요일 사건(W36 AfD, W37 열차, W38 모스크바: 하루치만 잡힘)이 그렇다.
- **AI · 오탐보다 '같은 사안의 금융 각도 기사'가 문제다.** Reuters 의 시장 기사·Morning Bid·주간 묶음이 W38 자율규제(6/9건), W39 Muse(3/6건)를 부풀린다. 날짜·매체 수로 세면 하루 1점이라 영향은 days 1~2 정도다. 그래도 금융시장이 반응한 사안(감속 요구, Muse)이 연구·안전 사안보다 체계적으로 유리하다.
- **AI · 기업 쏠림**: 추가 증분이 Anthropic·OpenAI·Meta 사안에 몰린다. Google 발표(Gemini 3.8 Flash·Live, 유전체)는 증분이 Register 1건 이하다. 뉴스룸에만 나오는 Google·OpenAI 발표(Daybreak, Gemini Live)는 어느 방식에서도 0이다.
- **AI 오탐**: Reuters 는 AI 키워드로 걸러도 무관한 기사가 남는다. 손으로 지운 것은 7절에 있다. W40 의 AstraZeneca 류는 정규식에서 미리 뺐다.

## 5. W40 처럼 순위가 뒤집혔어야 할 곳 (실린 순위가 어느 방식의 보도량과도 맞지 않는 곳)
- W36 해외: AfD 3위·특사 4위 < 라이프치히 5위(모든 방식). 일요일 선거라 주 안 보도가 잘린 것이 주된 원인으로 보인다.
- W37 해외: 열차 피격 4위 < 폭염 5위(모든 방식). W37 AI: 유전체 5위는 빠진 Suno·Muse·감속보다 낮다(두 방식 모두).
- W38 해외: 연준 2위는 보도량 0으로 측정이 안 된다. 뒤집힘이라기보다 소스 공백이다. W38 AI: 군 오인 첩보 3위·행동강령 4위는 새 방식에서 바이오랩·Muse·두 해킹 사안보다 낮다. Gemini 3.8 Live 5위는 0이다.
- W39 해외: 시진핑 2위 < 후티 3위(모든 방식). W39 AI: Muse 2위 > 호주 침입 1위(보도량). AI 통제 4위는 바이오랩 5위와 비슷하거나 낮다.
- W36 AI: Daybreak 5위는 0이다(W40 Argon 보다 더 약하다).
- 여기에는 2절의 over 사유(되돌리기 어려움 등)로 설명되는 것이 섞여 있을 수 있다. 이번 주들은 selection 기록이 없어 확인하지 못했다.

## 6. 결론
- 해외 A1c: 다섯 주(W36~W40)에서 실린 5개와의 일치가 같거나 조금 좋다(나빠진 주 없음). 영상·라이브·브리핑 제외와 하루 1점 상한 덕에 Guardian 이 단독으로 순위를 뒤집는 일은 없었다. 다만 유럽 정치 후속(AfD·스웨덴)이 Guardian 만으로 5위권 경계까지 오르는 쏠림이 매주 보인다. 도입한다면 "위키 0건인데 Guardian 만으로 점수를 얻은 사안"을 표시하는 열을 두는 것을 권한다.
- AI 매체 추가: 변별력은 매주 좋아진다(2곳 상한 → 5곳). 실린 순위와의 일치는 주마다 달라 W40 처럼 "명확히 도움"이라 하기 어렵다. 새 방식은 실린 것보다 많이 보도된 빠진 후보를 매주 1~4개 드러낸다. 이것은 다시 볼 거리를 주는 쪽의 효용이다. Reuters 시장 칼럼은 정규식이나 섹션(`/markets/`, 'Morning Bid', 'Week Ahead')으로 빼는 편이 낫다.
- 백필 한계: Reuters 는 약 5주(이 시점 09-07 이후)만 닿는다. W36 은 Reuters 없이 계산했고 W37 은 월요일이 빈다. Wired 는 수정일 기준이다.

## 7. 손으로 지운 오탐·고친 정규식
- W36 해외: 'SBU|HUR'(대소문자 무시)가 Church·hurricane·Augsburg 를 잡아 `\b` 로 막았다. 'shootout' 이 네덜란드·멕시코 총격을 잡아 'Kyiv shootout|spy services' 로 좁혔다. 이란에서 이란 국내 교통사고 2건, 마슈하드 차량 돌진, 쌍둥이 자매 수감 기사를 뺐다.
- W37 해외: 폭염에서 스페인 최고 기온 항목을 뺐다. 정착촌에서 'IDF 병사 총격 영상'을 뺐다.
- W36 AI: Register "rogue openai agents … before hugging face" 가 HF 로 잡혀 rogue 쪽으로 옮겼다.
- W37 AI: Register "us claims chinese ai companies … distilling" 을 뺐다(Anthropic 증류 보고서와 다른 사건).
- W39 AI: Reuters "Anthropic, OpenAI call for Australia to relax ban on training" 을 뺐다(호주 침입과 다른 사안).
- 남겨 둔 것: Reuters 묶음·시장 칼럼(W37 퇴사 1, W38 감속 6, W39 Muse 3). 사안은 맞지만 금융 각도라 4절에 적었다.

## 8. 표

#### W36 해외

| 사안 | 실린 순위 | wOut | gN | gCore | days | A0(out0) | A1c(odCore) |
|---|---|---|---|---|---|---|---|
| US-Iran strikes/tankers | 1 | 10 | 12 | 9 | 7 | 11 | 22 |
| Nepal-Tibet floods | 2 | 6 | 23 | 15 | 6 | 7 | 13 |
| Kyiv strikes/SBU-HUR | 빠짐 | 8 | 7 | 5 | 6 | 9 | 12 |
| Gaza/WB | 빠짐 | 5 | 6 | 3 | 7 | 6 | 8 |
| Indonesia fires/haze/volcano | 빠짐 | 4 | 2 | 1 | 5 | 5 | 8 |
| Leipzig drone/Russia blamed | 5 | 4 | 6 | 4 | 5 | 5 | 7 |
| AfD Saxony-Anhalt | 3 | 1 | 3 | 3 | 3 | 2 | 4 |
| US envoys Kyiv | 4 | 3 | 4 | 1 | 3 | 4 | 4 |
| Houthi offensive | 빠짐 | 2 | 1 | 1 | 3 | 3 | 3 |
| Ceuta crisis | 빠짐 | 1 | 3 | 2 | 2 | 2 | 3 |

#### W36 AI (days/outlets)

| 사안 | 실린 순위 | 지금(TC+Verge) | 새(+Reuters·Wired·Register) | 더한 매체 |
|---|---|---|---|---|
| GPT-6 Astra | 1 | 5/2 | 5/4 | Wired, The Register |
| Nvidia buys Hugging Face | 2 | 2/2 | 2/4 | The Register, Wired |
| OpenAI rogue agents / wiki incident | 빠짐 | 3/2 | 3/3 | The Register |
| NYT/publishers copyright vs OpenAI | 빠짐 | 2/2 | 2/3 | Wired |
| Fable 5.1 / Mythos 5.1 | 3 | 1/2 | 1/3 | The Register |
| Gemini 3.8 Flash | 4 | 1/1 | 2/2 | The Register |
| Tumbler Ridge lawsuits vs OpenAI | 빠짐 | 1/2 | 1/2 | - |
| Thinking Machines $1B round | 빠짐 | 1/1 | 1/1 | - |
| OpenAI $1B cyber defense | 5 | 0/0 | 0/0 | - |

#### W37 해외

| 사안 | 실린 순위 | wOut | gN | gCore | days | A0(out0) | A1c(odCore) |
|---|---|---|---|---|---|---|---|
| Houthi Red Sea coast | 1 | 6 | 4 | 4 | 7 | 7 | 15 |
| Iran war/pipeline | 빠짐 | 9 | 2 | 2 | 6 | 10 | 14 |
| Gaza | 빠짐 | 9 | 2 | 2 | 5 | 10 | 12 |
| Russian strikes on Ukraine | 빠짐 | 4 | 4 | 3 | 6 | 5 | 9 |
| UK/FR/CA settlement goods ban | 2 | 3 | 8 | 6 | 3 | 4 | 6 |
| AfD win aftermath | 빠짐 | 0 | 14 | 10 | 5 | 1 | 5 |
| Philippine ferry fire | 3 | 2 | 3 | 2 | 4 | 3 | 5 |
| Swedish election | 빠짐 | 2 | 4 | 2 | 3 | 3 | 4 |
| US hottest summer | 5 | 3 | 0 | 0 | 2 | 4 | 4 |
| Russian drone hits Poland-bound train | 4 | 1 | 1 | 1 | 1 | 2 | 2 |

#### W37 AI (days/outlets)

| 사안 | 실린 순위 | 지금(TC+Verge) | 새(+Reuters·Wired·Register) | 더한 매체 |
|---|---|---|---|---|
| Anthropic researcher quits/warns | 2 | 3/2 | 3/4 | Reuters, Wired |
| OpenAI Navier-Stokes | 1 | 4/2 | 4/3 | Wired |
| Suno licensed model/scraping | 빠짐 | 3/2 | 3/3 | Reuters |
| Meta Muse agent | 빠짐 | 2/2 | 2/3 | Wired |
| Amodei plan to slow AI | 빠짐 | 1/2 | 2/3 | Reuters |
| Mistral EUR3B (Samsung) | 3 | 1/1 | 1/3 | Reuters, The Register |
| OpenAI agent RubyGems attack | 4 | 1/1 | 2/2 | Reuters |
| DeepMind genome variants | 5 | 1/1 | 1/2 | The Register |
| OpenAI pauses Pro subs (Astra demand) | 빠짐 | 1/2 | 1/2 | - |
| Anthropic distillation report | 빠짐 | 2/1 | 2/1 | - |

#### W38 해외

| 사안 | 실린 순위 | wOut | gN | gCore | days | A0(out0) | A1c(odCore) |
|---|---|---|---|---|---|---|---|
| Iran war/Hormuz | 빠짐 | 11 | 4 | 4 | 6 | 12 | 20 |
| Houthi islands/Riyadh | 1 | 6 | 8 | 7 | 5 | 7 | 11 |
| Gaza | 빠짐 | 6 | 5 | 3 | 4 | 7 | 8 |
| Sweden govt change | 빠짐 | 2 | 5 | 5 | 4 | 3 | 6 |
| Russian Duma election | 빠짐 | 4 | 3 | 1 | 4 | 5 | 5 |
| Canada EU associate | 빠짐 | 1 | 7 | 6 | 3 | 2 | 4 |
| US Russia/Iran sanctions law | 3 | 4 | 0 | 0 | 2 | 4 | 4 |
| Merz/German state elections | 빠짐 | 1 | 2 | 2 | 2 | 2 | 3 |
| Ukraine drone attack on Moscow | 5 | 2 | 2 | 1 | 1 | 3 | 3 |
| US-Denmark Greenland deal | 4 | 1 | 1 | 1 | 2 | 2 | 2 |
| Fed rate hike | 2 | 0 | 0 | 0 | 0 | 0 | 0 |

#### W38 AI (days/outlets)

| 사안 | 실린 순위 | 지금(TC+Verge) | 새(+Reuters·Wired·Register) | 더한 매체 |
|---|---|---|---|---|
| Big Tech kills AI self-regulation body | 1 | 4/2 | 5/5 | Reuters, The Register, Wired |
| Anthropic biology lab | 빠짐 | 2/2 | 3/3 | Reuters |
| Meta Muse expansion | 빠짐 | 3/2 | 3/3 | Wired |
| Researchers used Claude to hack OpenAI | 빠짐 | 2/2 | 2/3 | The Register |
| Gemini hacks other companies | 빠짐 | 1/2 | 2/3 | Reuters |
| Microsoft internal docs in NYT suit | 2 | 3/2 | 3/2 | - |
| Microsoft AI code of conduct | 4 | 1/1 | 2/2 | Reuters |
| Embedded safety evaluators / auditors | 빠짐 | 2/2 | 2/2 | - |
| US military near-seizure via chatbot intel | 3 | 1/2 | 1/2 | - |
| Gemini 3.8 Live | 5 | 0/0 | 0/0 | - |

#### W39 해외

| 사안 | 실린 순위 | wOut | gN | gCore | days | A0(out0) | A1c(odCore) |
|---|---|---|---|---|---|---|---|
| Iran Hormuz offer/Trump rejects | 1 | 8 | 6 | 5 | 5 | 9 | 14 |
| Houthi missile on Yanbu | 3 | 5 | 4 | 3 | 5 | 6 | 9 |
| Sudan war | 빠짐 | 6 | 0 | 0 | 4 | 6 | 8 |
| Afghanistan-Pakistan war | 빠짐 | 3 | 0 | 0 | 5 | 3 | 7 |
| Gaza/Netanyahu UN | 빠짐 | 4 | 7 | 5 | 3 | 5 | 7 |
| South Africa mass shootings | 빠짐 | 6 | 1 | 1 | 3 | 7 | 7 |
| Xi state visit to US | 2 | 4 | 2 | 2 | 4 | 5 | 6 |
| Tigray rebels seize airport | 4 | 4 | 1 | 1 | 4 | 5 | 5 |
| Russian strikes on Ukraine | 빠짐 | 3 | 2 | 1 | 4 | 4 | 5 |
| Brazil bans sports betting | 5 | 2 | 1 | 1 | 2 | 3 | 3 |
| Greenland agreement | 빠짐 | 2 | 3 | 1 | 2 | 3 | 3 |
| Typhoon Dujuan Japan | 빠짐 | 1 | 3 | 1 | 2 | 2 | 2 |

#### W39 AI (days/outlets)

| 사안 | 실린 순위 | 지금(TC+Verge) | 새(+Reuters·Wired·Register) | 더한 매체 |
|---|---|---|---|---|
| Meta Muse tops App Store | 2 | 6/2 | 7/5 | The Register, Reuters, Wired |
| OpenAI agent breaks into Australian govt site | 1 | 1/2 | 4/5 | Reuters, The Register, Wired |
| Opus 5.5 / GPT-6 Sol & Luna | 3 | 1/2 | 2/3 | Reuters |
| Anthropic biolab enzyme | 5 | 1/2 | 2/3 | Reuters |
| 20 countries back AI controls, Trump rejects | 4 | 2/1 | 3/2 | Reuters |
| Anthropic founders voting control/IPO | 빠짐 | 1/1 | 3/2 | Reuters |
| OpenAI agent swarms hacking databases | 빠짐 | 2/2 | 2/2 | - |
| OpenAI math advisory/100 open problems | 빠짐 | 2/2 | 2/2 | - |
| Anthropic-Akamai $11.6B | 빠짐 | 1/1 | 2/2 | Reuters |
| Labs launch own AI safety body | 빠짐 | 1/1 | 1/1 | - |
