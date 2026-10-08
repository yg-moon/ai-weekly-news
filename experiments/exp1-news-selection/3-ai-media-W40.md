# W40 AI 보도량 매체 확장 실험 (2026-09-28 ~ 10-04)

저장소는 건드리지 않았다. 산출물: build.py(통합), aimedia-plus.md(통합 헤드라인), counts.txt, probe/(원응답), reuters/(사이트맵 100쪽),
collect-headlines.scratch.mjs(Anthropic 파서 수정본).

## 1. 매체별 확인 (8곳)
| 매체 | 방식 | 결과 | W40 건수 |
|---|---|---|---|
| Reuters | arc sitemap `?outputType=xml&from=0..9900` (100건씩, 제목 포함, URL 끝에 발행일) | 됨. 단 최근 1만 건(약 5주)만 닿는다 → 오래된 백필 불가 | 2,226(전 분야) |
| Wired | `sitemap-YYYY-MM.xml` 월별 (2021-11~) | 됨. 제목은 slug, 날짜는 lastmod(수정일) | 107 |
| The Register | `sitemap.xml` (1만 건, URL에 날짜·섹션) | 됨. 최근 수개월은 월 500건 수준으로 덮음 | 129 |
| MIT Technology Review | WordPress `wp-json/wp/v2/posts?after=&before=` | 됨. 주 16건뿐 | 16 |
| Ars Technica | wp-json | 403 (막힘) | - |
| VentureBeat | wp-json / sitemap | 000·429 (Vercel 보안 체크포인트) | - |
| Engadget | `/sitemap/2026/september/29/` | 200이지만 연도 색인으로 떨어짐, 기사 목록 없음 | - |
| ZDNet | `/sitemaps/article/2026/09/`, `/sitemap.xml` | HTML/빈 응답 | - |

## 2. W40 AI 후보 재계산 (days/outlets; 앞은 기존 TC+Verge, 뒤는 6곳 합산)
| 사안 | 기존 | 확장 | 기여한 새 매체 | 판정 |
|---|---|---|---|---|
| GPT-6.1 Astra 보류·안전연구자 이탈 | 5/2 | 6/5 | Reuters·Wired·Register | 실림 2위 |
| 에이전트 외부 사이트 침입 | 4/2 | 4/5 | Reuters·Wired·Register·MITTR | 빠짐(중복) |
| DevDay Dots·Sol | 4/2 | 4/4 | Reuters·Wired | 실림 1위 |
| Meta Muse | 3/2 | 5/4 | Reuters·Wired | 빠짐(국면 없음) |
| Anthropic IPO 투자설명서 | 1/2 | 3/4 | Reuters(8건)·Register | 실림 4위 |
| AI 안전 서약 | 3/2 | 4/3 | Reuters·Wired (TC 없음) | 실림 3위 |
| Sonnet 5.5 | 1/2 | 2/3 | Reuters("second Claude 5.5 model", 09-28) | 빠짐(단발) |
| Gemini 4 Argon | 1/1 | 2/2 | Reuters(09-30) | 실림 5위 |
| AMD-World Labs | 1/1 | 2/2 | Reuters | 빠짐(단발) |
(IPO의 Register 제목 "leaked ipo docs anthropic…"은 counts.txt 정규식에서 빠져 3곳으로 찍혔으나 직접 확인해 4곳으로 셈.)

- outlets 상한이 2→6으로 풀리며 변별이 생겼다. 순수 보도량 순: Astra(5) ≥ 침입(5) > DevDay·Muse·IPO(4) > 서약·Sonnet(3) > Argon·AMD(2).
- 게이트(중복·국면 없음) 뒤 상위 5 = Astra, DevDay, IPO, 서약, **Sonnet 5.5**. 실린 5개와 4개 일치, 5위만 바뀐다.
- Sonnet 5.5(2일·3곳) vs Argon(2일·2곳): 차이는 Reuters 1건 대 0 → 1곳 차로 여전히 근소. 축적 가치로 Argon 을 둔 판단은 "근거 있는 역전"이지만 보도량은 Sonnet 쪽이 일관되게 앞선다.
- 상위 4개의 순서·포함은 바뀌지 않았다. IPO는 1일→3일·4곳으로 "over" 사유가 필요 없어진다.

## 3. 권고
- **Reuters + Wired + The Register** 를 aimedia 에 더하는 조합을 권한다. 세 곳이 모든 후보의 증분을 냈고, MITTR 는 주 16건이라 1건 기여뿐(생략 가능).
- Reuters 는 전 분야라 AI 필터가 필요하다(section `/technology/` 만으로는 IPO·Sonnet 등이 `/business/` 에 있어 놓친다 → 제목 키워드로 걸러야 함). 10,000건 창(약 5주) 밖의 백필은 불가하니 주간 정시 실행에는 쓸 수 있고 과거 백필에서는 빠진다고 경고해야 한다.
- Wired 는 lastmod 라 Verge 와 같은 날짜 밀림 주의. Register 는 섹션 `ai-and-ml` 외에도 AI 기사가 있어 전체를 받는 편이 낫다.
- AstraZeneca·일반 "pledge" 같은 오탐이 Reuters 에서 크게 늘어 정규식을 좁혀야 한다(이번 계산은 손으로 걸렀다).

## 4. Sonnet 5.5 누락 원인
수집 코드 문제. anthropic.com/news 카드에 "Introducing Claude Sonnet 5.5 · Sep 28, 2026" 이 있으나 링크가 `/claude-sonnet-5-5` 로
`/news/` 밖이다. `parseAnthropic` 정규식이 `href="(\/news\/[^"]+)"` 만 잡아 빠졌다. 같은 이유로 Opus 5.5(09-22, W39)와 Haiku 5.5(10-07)도 빠진다.
스크래치 수정본: `href="(\/(?:news\/[^"]+|claude-[a-z0-9-]+))"` + slug 처리 `m[1].replace(/^\/(news\/)?/, "")` → 세 모델 모두 잡힘 확인.
