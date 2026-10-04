// 지금 작업 트리로 만든 사이트를 다른 커밋(기본 HEAD)으로 만든 사이트와 비교한다.
// 빌드·렌더링 코드를 고친 뒤 화면이 뜻하지 않게 바뀌지 않았는지 본다. 바뀐 것이 없어야 하는
// 정리 작업이면 "차이 없음"이 나와야 한다.
//
//   node scripts/diff-site.mjs            # HEAD 와 비교
//   node scripts/diff-site.mjs main~3     # 다른 커밋과 비교
//
// 페이지마다 같은 <style> 은 따로 한 번만 비교한다. 본문은 태그마다 줄을 나눠 diff 로 보여 준다.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION_FILE } from "./site-version.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ref = process.argv[2] ?? "HEAD";
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// 비교할 커밋을 임시 작업 트리에 꺼내 빌드한다. 저장소의 작업 트리는 건드리지 않는다.
const tmp = mkdtempSync(join(tmpdir(), "diff-site-"));
const old = join(tmp, "old");
run("git", ["worktree", "add", "--detach", old, ref], ROOT);
try {
  symlinkSync(join(ROOT, "node_modules"), join(old, "node_modules"));
  run("node", ["scripts/build.mjs"], old);
  run("node", ["scripts/build.mjs"], ROOT);
  report(join(old, "site"), join(ROOT, "site"));
} finally {
  run("git", ["worktree", "remove", "--force", old], ROOT);
  rmSync(tmp, { recursive: true, force: true });
}

function files(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath, d.name)))
    .filter((f) => f !== VERSION_FILE)
    .sort();
}

function report(a, b) {
  const fa = new Set(files(a)), fb = new Set(files(b));
  const added = [...fb].filter((f) => !fa.has(f));
  const removed = [...fa].filter((f) => !fb.has(f));
  const style = (html) => html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? "";
  const styles = new Set();
  const changed = [];
  for (const f of [...fb].filter((f) => fa.has(f))) {
    const x = readFileSync(join(a, f)), y = readFileSync(join(b, f));
    if (x.equals(y)) continue;
    if (!f.endsWith(".html")) { changed.push([f, null]); continue; }
    const [hx, hy] = [x.toString(), y.toString()];
    if (style(hx) !== style(hy)) styles.add(`${style(hx)}\u0000${style(hy)}`);
    // 바닥글의 업데이트 시각은 커밋마다 다르므로 비교에서 뺀다. version.json 도 같은 이유로 뺀다.
    const [bx, by] = [hx, hy].map((h) => h.replace(style(h), "").replace(/<p class="updated">[^<]*<\/p>/, "<p class=\"updated\"></p>"));
    if (bx !== by) changed.push([f, [bx, by]]);
  }

  if (!added.length && !removed.length && !changed.length && !styles.size) {
    console.log(`차이 없음 (${ref} 와 같은 사이트, 파일 ${fb.size}개)`);
    return;
  }
  for (const f of added) console.log(`+ ${f}`);
  for (const f of removed) console.log(`- ${f}`);
  // 태그마다 줄을 나눠 diff 에 넘긴다. 한 줄이 페이지 전체라서 그대로는 읽을 수 없다.
  const lines = (h) => h.replace(/>/g, ">\n");
  const diff = (x, y) => {
    const d = mkdtempSync(join(tmpdir(), "diff-site-"));
    writeFileSync(join(d, "a"), lines(x));
    writeFileSync(join(d, "b"), lines(y));
    try {
      return run("diff", ["-U1", join(d, "a"), join(d, "b")]);
    } catch (e) {
      return e.stdout; // diff 는 차이가 있으면 1 로 끝난다
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };
  for (const s of styles) {
    const [x, y] = s.split("\u0000");
    console.log(`\n== <style> (모든 페이지)\n${diff(x, y).split("\n").slice(2).join("\n")}`);
  }
  for (const [f, pair] of changed) {
    console.log(`\n== ${f}${pair ? "" : " (바이너리가 바뀜)"}`);
    if (pair) console.log(diff(...pair).split("\n").slice(2, 60).join("\n"));
  }
  console.log(`\n바뀐 파일 ${changed.length}개, 새 파일 ${added.length}개, 없어진 파일 ${removed.length}개${styles.size ? ", 스타일 바뀜" : ""}`);
}
