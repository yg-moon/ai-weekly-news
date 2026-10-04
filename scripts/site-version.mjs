// 배포본의 지문과 마지막 업데이트 시각. 빌드가 부른다.
//
// 지문은 site/ 의 모든 파일(경로와 내용)을 sha256 으로 묶은 값이다. 바닥글의 업데이트 시각은
// 자리표시인 채로 넣고 지문을 낸 뒤 채운다. 그래서 시각만 다른 두 빌드는 지문이 같다.
// 지문은 version.json 으로 함께 배포한다. 다음 배포가 이 값과 견줘 화면이 바뀌었는지 안다.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

export const VERSION_FILE = "version.json";

export function hashSite(dir) {
  const h = createHash("sha256");
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath, d.name)).split("\\").join("/"))
    .filter((f) => f !== VERSION_FILE)
    .sort();
  for (const f of files) h.update(f).update("\0").update(readFileSync(join(dir, f))).update("\0");
  return h.digest("hex");
}

// 커밋 시각(ISO)을 KST 의 연·월·일·시각으로 나눈다. 실행 환경이 UTC 여도 맞게 9시간을 더한다.
export function kst(iso) {
  const t = new Date(new Date(iso).getTime() + 9 * 3600e3);
  const p = (n) => String(n).padStart(2, "0");
  return {
    y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
    hm: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`,
    iso: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}+09:00`,
  };
}

export function headCommit(root) {
  try {
    const [sha, time] = execFileSync("git", ["log", "-1", "--format=%H %cI"], { cwd: root, encoding: "utf8" }).trim().split(" ");
    return { sha, time };
  } catch {
    return { sha: null, time: new Date().toISOString() };
  }
}

// 업데이트 시각을 정한다. 지금 배포본(live)의 지문이 같으면 그 시각을 그대로 쓰고,
// 다르거나 배포본을 읽지 못했으면 이번 커밋 시각을 쓴다.
export function pickUpdated(hash, live, head) {
  return live && live.hash === hash && live.updated ? live.updated : kst(head.time).iso;
}

export async function fetchLive(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
