# exp4. Guardian 차단과 NPR world 대체

2026-11-09. W45 정기 발행 중 The Guardian 날짜 목록이 0건으로 조용히 빠진 것을 발견했다. 비는 해외 보도량을 NPR world 날짜 아카이브로 메울 수 있는지 본다. 결정은 `docs/DECISIONS.md` 수집 절에 있다.

## 목표

- Guardian 이 실제로 막혔는지, 지난 날짜도 막혔는지 확인한다.
- NPR world 날짜 아카이브가 지난 날짜까지 빠짐없이 받아지는지 본다.
- NPR world 를 더하면 해외 보도량 순위가 Guardian 이 있던 때에 얼마나 가까워지는지 잰다.

## 설계

- 대상: Guardian 이 정상이던 W42~W44 와 차단된 W45.
- 세 방식으로 같은 사안 정의(`data/topics/<WEEK>.json` 의 해외)를 센다.
  - G: 발행 당시 기록된 값(`data/runs/<WEEK>.json`, Guardian 포함)
  - B: 지금 받아지는 것(위키 + NPR business)
  - N: B + NPR world. NPR 은 business·world 를 합쳐 하루 1곳이다.
- 지표: 그 주 선정 기록에 오른 후보 쌍마다 보도량(outlets) 순서가 G 와 같은지 센다. G 가 동점인 쌍은 뺀다.
- 스크립트: `npr-world.mjs`(NPR world 수집, 출력 형식은 `collect-headlines.mjs` 와 같다), `compare.py`(`python3 compare.py data`).

## 결과

**Guardian 은 막혔다.** 2026-11-09 에 날짜 목록·기사·약관 페이지 모두 응답 200 에 "Client Challenge" 봇 확인 페이지만 왔다. W42~W44 날짜 목록도 0건이라 지난 날짜도 막혔다. 수집기는 0건을 경고 없이 넘겼다.

**NPR world 는 받아진다.** 4주 28일 모두 200 이고 빠진 날이 없다. 주 32~46건으로 Guardian(주 140건 안팎)의 4분의 1이다.

**순위가 G 에 가까워진다.**

| 주 | B 일치·불일치 | N 일치·불일치 |
|---|---|---|
| W42 | 15·7 | 20·2 |
| W43 | 22·2 | 23·1 |
| W44 | 30·9 | 33·6 |
| 합 | 67·18 | 76·9 |

- W42 3위 '우크라이나 Starlink 제한'은 G 9, B 2, N 9 로 돌아왔다. W44 이스라엘 총선은 G 8, B 3, N 6 이다.
- W45 는 실린 5개 순서가 바뀌지 않았다. 중간선거 8→9, 파라과이 5→7.
- 사안별 값은 `data/compare.txt` 에 있다.

## 한계

- 미국 매체라 유럽·아시아 사안이 덜 잡힌다. W42 프랑스 학생 시위 G 10·N 5, 동남아 연무 G 5·N 2, W45 방글라데시는 NPR world 0건이다.
- 아침 뉴스레터 Up First 는 제목 하나에 사안 둘을 담아("A. And, B") 매일 자동으로 잡힌다. 이 실험의 N 에는 들어 있고, 수집기에 넣을 때 뺐다.
- G 는 정답이 아니라 이전 측정값이다. 사안 정규식은 Guardian 시절 제목에 맞춰 짜여 N 이 조금 덜 잡혔을 수 있다.

## 결론

해외 수집에서 Guardian 을 빼고 NPR world 를 business 와 함께 하루 1곳으로 붙인다. Up First 는 뺀다. 응답이 200 이어도 기사 목록이 없으면 실패로 보고 경고한다. 해외 주요 매체는 BBC·CNN·NPR·The New York Times 4곳이 된다.

버린 것: Guardian 공식 API(AI 텍스트 마이닝이 비상업 키로 허용되는지 약관 확인이 필요하고 키 관리가 는다), 봇 확인 페이지 통과(우회다).
