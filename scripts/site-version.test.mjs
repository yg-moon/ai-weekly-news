import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashSite, kst, pickUpdated, VERSION_FILE } from "./site-version.mjs";

test("kst 는 UTC 커밋 시각을 한국 시각으로 바꾸고 날짜가 넘어가는 것도 맞춘다", () => {
  assert.deepEqual(kst("2026-10-04T15:30:00Z"), { y: 2026, m: 10, d: 5, hm: "00:30", iso: "2026-10-05T00:30+09:00" });
  assert.equal(kst("2026-10-04T10:52:41+09:00").iso, "2026-10-04T10:52+09:00");
});

test("지문은 version.json 을 빼고 파일 내용이 바뀔 때만 바뀐다", () => {
  const dir = mkdtempSync(join(tmpdir(), "site-version-"));
  try {
    writeFileSync(join(dir, "index.html"), "a");
    const h = hashSite(dir);
    writeFileSync(join(dir, VERSION_FILE), "{}");
    assert.equal(hashSite(dir), h);
    writeFileSync(join(dir, "index.html"), "b");
    assert.notEqual(hashSite(dir), h);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("배포본과 지문이 같을 때만 그 시각을 이어 쓴다", () => {
  const head = { sha: "x", time: "2026-10-05T01:00:00Z" };
  const live = { hash: "h", updated: "2026-10-04T10:52+09:00" };
  assert.equal(pickUpdated("h", live, head), "2026-10-04T10:52+09:00");
  assert.equal(pickUpdated("other", live, head), "2026-10-05T10:00+09:00");
  assert.equal(pickUpdated("h", null, head), "2026-10-05T10:00+09:00");
});
