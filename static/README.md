# static

빌드가 `site/` 에 그대로 복사한다. 이 파일은 복사하지 않는다.

- `favicon.svg`: 탭 아이콘이자 사이트 제목 옆 로고. 세 막대는 국내·해외·AI 의 색이다.
- `favicon-96.png`: SVG 파비콘을 쓰지 않는 브라우저(사파리 등)용 탭·북마크 아이콘(96×96). `favicon.svg` 를 캡처한 것이다.
- `apple-touch-icon.png`: 홈 화면 아이콘(180×180). `favicon.svg` 를 캡처한 것이다.
- `og.png`: 링크 미리보기 이미지(1200×630). `scripts/og-image.html` 을 Pretendard 글꼴과 같은 폴더에 두고 브라우저로 1200×630 을 캡처했다. 문구를 바꾸면 다시 캡처한다.
- `og-en.png`: 영문판 링크 미리보기 이미지. 같은 `scripts/og-image.html` 을 주소 끝에 `?lang=en` 을 붙여 열고 캡처했다.
