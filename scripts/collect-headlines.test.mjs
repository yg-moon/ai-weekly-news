// 헤드라인 수집기의 파싱 규칙을 짧은 HTML 조각으로 본다. 네트워크는 쓰지 않는다.
// 조각은 2026-10-08 받은 실제 쪽에서 줄였다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFront, parseYna, parseGuardian, parseNpr } from "./collect-headlines.mjs";

const brick = (page, links) => `
<div class="newspaper_brick_item _start_page">
  <h3><span class="page_notation"><em>${page}</em>면</span></h3>
  <ul class="newspaper_article_lst">${links
    .map(([href, t]) => `<li><a href="${href}" onclick="nclk(event,'pap.alist','','');" data-nlog-params="{&#034;rank&#034;:1}">
      <div class="newspaper_img_frame"><img src="x.jpg" alt="섬네일 이미지"></div>
      <div class="newspaper_txt_box"><strong>${t}</strong><p></p></div></a></li>`)
    .join("")}</ul>
</div>`;

test("지면 보기에서 A1면 기사만 꺼내고, 날짜가 다르거나 지면이 없으면 비운다", () => {
  const html = `<span>2026.09.29.화</span>` +
    brick("A1", [
      ["https://n.news.naver.com/article/newspaper/023/0004000950?date=20260929", "[단독] 포스코, 국내 첫 민간 원전 추진"],
      ["https://n.news.naver.com/article/newspaper/023/0004000944?date=20260929", "청년파산 30% 줄 때 &quot;노인파산&quot; 급증"],
    ]) +
    brick("A2", [["https://n.news.naver.com/article/newspaper/023/1?date=20260929", "2면 기사"]]);
  assert.deepEqual(parseFront(html, "20260929"), [
    { title: "[단독] 포스코, 국내 첫 민간 원전 추진", url: "https://n.news.naver.com/article/newspaper/023/0004000950" },
    { title: '청년파산 30% 줄 때 "노인파산" 급증', url: "https://n.news.naver.com/article/newspaper/023/0004000944" },
  ]);
  assert.deepEqual(parseFront(html, "20260930"), []);
  assert.deepEqual(parseFront(`<span>2026.10.04.일</span><div>지면이 없습니다</div>`, "20261004"), []);
});

test("연합 주요뉴스 이력에서 제목과 기사 주소를 꺼내고 같은 기사는 한 번만 둔다", () => {
  const item = (id, t) => `<li><figure><a href="https://www.yna.co.kr/view/${id}?section=society/all" class="img"></a></figure>
<strong class="tit-wrap">
<a href="https://www.yna.co.kr/view/${id}?section=society/all" class="tit-news">
<span class="title01">${t}</span>
</a>
</strong></li>`;
  const html = item("AKR20260926044900004", "&apos;막바지 귀경행렬&apos; 부산→서울 5시간") +
    item("AKR20260926000100001", "추석 연휴 사흘째") +
    item("AKR20260926044900004", "&apos;막바지 귀경행렬&apos; 부산→서울 5시간");
  assert.deepEqual(parseYna(html), [
    { title: "'막바지 귀경행렬' 부산→서울 5시간", url: "https://www.yna.co.kr/view/AKR20260926044900004" },
    { title: "추석 연휴 사흘째", url: "https://www.yna.co.kr/view/AKR20260926000100001" },
  ]);
});

test("Guardian 날짜 목록에서 영상·라이브블로그·브리핑을 뺀다", () => {
  const path = "2026/sep/30";
  const a = (href, t) => `<a href="https://www.theguardian.com/${href}" class="fc-item__link" data-link-name="article"><span class="js-headline-text">${t}</span></a>`;
  const html = [
    a(`world/${path}/flydubai-pilot-stabbing`, "Flydubai pilot arrested after stabbing"),
    a(`world/video/${path}/lethal-russian-strikes`, "Lethal Russian strikes hit residential area in Kyiv – video"),
    a(`world/live/${path}/russia-ukraine-war`, "No imminent threat to Nato territory"),
    a(`world/${path}/ukraine-war-briefing-nato`, "Ukraine war briefing: Nato condemns Moscow"),
    a(`world/${path}/wednesday-briefing-burnham`, "Wednesday briefing: Can Andy Burnham live up"),
    a(`australia-news/${path}/sydney-floods`, "Sydney floods"),
    a(`world/${path}/flydubai-pilot-stabbing`, "Flydubai pilot arrested after stabbing"),
  ].join("\n");
  assert.deepEqual(parseGuardian(html, path).map((i) => i.title), ["Flydubai pilot arrested after stabbing", "Sydney floods"]);
});

test("NPR business 아카이브에서 그날 기사만 남기고 같은 기사는 한 번만 둔다", () => {
  // 2026-10-11 받은 9-16-2026 쪽에서 줄였다. 쪽은 그 날짜부터 거슬러 15건이라 앞 날짜가 섞인다.
  const a = (href, t) => `<article class="item has-image"><div class="item-info"><h2 class="title"><a href="https://www.npr.org/${href}"  data-metrics-ga4='{"action":"topic_homepage_recirculation_click","clickPosition":"2.1"}' >${t}</a></h2></div></article>`;
  const html = [
    a("2026/09/16/nx-s1-5968724/federal-reserve-interest-rates-inflation-economy", "The Fed raises interest rates for the first time in over three years"),
    a("2026/09/16/nx-s1-5971223/how-will-the-feds-interest-rate-hike", "How will the Fed&#8217;s interest rate hike affect costs?"),
    a("2026/09/16/nx-s1-5968724/federal-reserve-interest-rates-inflation-economy", "The Fed raises interest rates for the first time in over three years"),
    a("2026/09/15/nx-s1-5968711/clarity-act-crypto-senate-vote", "A Trump-backed crypto bill suffered a defeat"),
    a("sections/planet-money/2026/09/16/g-s1-1/millionaires", "The powerful millionaires hiding in plain sight"),
  ].join("\n");
  assert.deepEqual(parseNpr(html, "2026-09-16"), [
    { title: "The Fed raises interest rates for the first time in over three years", url: "https://www.npr.org/2026/09/16/nx-s1-5968724/federal-reserve-interest-rates-inflation-economy" },
    { title: "How will the Fed’s interest rate hike affect costs?", url: "https://www.npr.org/2026/09/16/nx-s1-5971223/how-will-the-feds-interest-rate-hike" },
    { title: "The powerful millionaires hiding in plain sight", url: "https://www.npr.org/sections/planet-money/2026/09/16/g-s1-1/millionaires" },
  ]);
  assert.deepEqual(parseNpr(html, "2026-09-17"), []);
});
