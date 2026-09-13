# ai-weekly-news

### [yg-moon.github.io/ai-weekly-news](https://yg-moon.github.io/ai-weekly-news/)

지난 한 주에 실제로 있었던 일을 **국내 5건 · 해외 5건 · AI 5건**으로 정리해 매주 월요일 오전 8시(KST)에 발행합니다.

수집과 요약은 AI가 하고, 사람은 파이프라인을 관리합니다. 개별 항목의 내용을 사람이 일일이 검증하지는 않으므로 각 항목에 출처 링크를 답니다. 최신 속보가 아니라 **완결된 주간의 정리**이며, 주간호가 쌓여 월간·연간 트렌드로 이어지는 것이 목표입니다.

## 문서

- 무엇을 왜 만드는가: [`docs/INTENT.md`](docs/INTENT.md)
- 어떤 기준을 왜 정했는가: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- 매주 어떻게 만드는가: [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- 에이전트 작업 규칙: [`AGENTS.md`](AGENTS.md)

## 구조

- `content/week/<ISO주차>.md` — 주간호 원본. 여기서 사이트가 생성됩니다.
- `scripts/` — 빌드와 기사 원문 추출.
- `site/` — 빌드 산출물. 커밋하지 않으며 Actions가 Pages에 배포합니다.

```bash
npm ci && npm run build              # content/week/*.md → site/
node scripts/read-article.mjs <URL>  # 기사 발행일과 본문 추출
```
