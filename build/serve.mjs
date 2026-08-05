/* ============================================================
   로컬 미리보기 서버

     npm run dev      빌드 → 서버 (content/ 를 지켜보며 자동 재빌드)
     npm run serve    빌드 없이 서버만

   GitHub Pages · Amplify 와 **같은 방식으로 주소를 풉니다.**
     /                      → index.html
     /writing               → /writing/ 로 301, 그다음 writing/index.html
     /writing/scroll-motion → /writing/scroll-motion/ 로 301
   그래서 로컬에서 본 것이 배포본과 같습니다.

   올려도 되는 파일 목록도 배포와 같게 맞췄습니다. design.md 나
   secret/ 을 요청하면 로컬에서도 404 가 납니다. 로컬에서만 보이는
   파일 때문에 배포 후에 깨지는 일을 막습니다.
   ============================================================ */

import http from "node:http";
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4173);
const HOST = "127.0.0.1";

/* 배포와 같은 허용 목록 (.github/workflows/deploy.yml 과 맞춰 두세요) */
const ROOT_FILE_OK = /\.(html|css|js|svg|txt|webmanifest)$/i;
const OK_DIRS = ["assets", ".well-known", "writing"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
};

/* 이 경로를 내보내도 되는가 — 배포 허용 목록과 같은 판단 */
function allowed(rel) {
  if (!rel || rel.startsWith("..")) return false;
  const first = rel.split("/")[0];
  if (rel.includes("/")) return OK_DIRS.includes(first);
  return ROOT_FILE_OK.test(rel);
}

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { "cache-control": "no-store", ...headers });
  res.end(body);
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    return send(res, 400, "bad request");
  }

  // 디렉터리인데 슬래시가 없으면 붙여서 넘깁니다 (배포와 같은 동작).
  // 이래야 페이지 안의 ../ 상대 경로가 로컬에서도 똑같이 풀립니다.
  if (!pathname.endsWith("/")) {
    const asDir = path.join(ROOT, pathname.slice(1));
    if (existsSync(asDir) && statSync(asDir).isDirectory()) {
      return send(res, 301, "", { location: pathname + "/" });
    }
  }

  let rel = pathname.replace(/^\/+/, "");
  if (pathname.endsWith("/")) rel = path.join(rel, "index.html");
  if (rel === "") rel = "index.html";

  if (!allowed(rel)) {
    return send(res, 404, notFound(pathname), { "content-type": MIME[".html"] });
  }

  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    return send(res, 404, notFound(pathname), { "content-type": MIME[".html"] });
  }

  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "content-length": statSync(file).size,
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
});

const notFound = (p) => `<!DOCTYPE html><html lang="ko"><meta charset="utf-8">
<title>404</title>
<body style="font:14px ui-monospace,monospace;background:#0a0b0d;color:#e6e8ec;padding:3rem">
<p>404 &mdash; ${p.replace(/[<>&]/g, "")}</p>
<p style="color:#676b75">배포에서도 이 경로는 없습니다. 있어야 한다면 허용 목록을 확인하세요.</p>
<p><a href="/" style="color:#7aa2ff">/</a> &middot; <a href="/writing/" style="color:#7aa2ff">/writing/</a></p>
</body></html>`;

/* ── 빌드 ─────────────────────────────────────────────── */
function build() {
  return new Promise((resolve) => {
    // 로컬에서는 초안까지 봅니다. 배포에서는 빠집니다.
    const p = spawn(
      process.execPath,
      [path.join(ROOT, "build", "build.mjs"), "--drafts"],
      { stdio: "inherit" },
    );
    p.on("exit", (code) => resolve(code === 0));
  });
}

/* content/ 가 바뀌면 다시 빌드합니다. 저장 한 번에 여러 이벤트가 오므로
   조금 모아서 한 번만 돕니다. */
function watchContent() {
  const dir = path.join(ROOT, "content");
  if (!existsSync(dir)) return;

  let timer = null;
  let running = false;

  watch(dir, { recursive: true }, (_e, file) => {
    if (file && !/\.(md|markdown)$/i.test(file) && !file.includes(".")) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return;
      running = true;
      console.log(`\n▸ 바뀜: ${file} — 다시 빌드합니다`);
      await build();
      console.log(`   새로고침하세요  http://${HOST}:${PORT}/writing/\n`);
      running = false;
    }, 120);
  });
  console.log("   content/ 를 지켜봅니다 (고치면 자동으로 다시 빌드합니다)");
}

/* ── 시작 ─────────────────────────────────────────────── */
const args = process.argv.slice(2);

if (args.includes("--build")) {
  const ok = await build();
  if (!ok) {
    console.error("\n빌드가 실패해서 서버를 띄우지 않습니다.");
    process.exit(1);
  }
  console.log("");
}

server.listen(PORT, HOST, () => {
  console.log(`▸ 로컬 미리보기`);
  console.log(`   허브     http://${HOST}:${PORT}/`);
  console.log(`   글 목록  http://${HOST}:${PORT}/writing/`);
  console.log("");
  if (args.includes("--watch")) watchContent();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`포트 ${PORT} 가 이미 쓰이고 있습니다. PORT=4174 npm run dev 처럼 바꿔 보세요.`);
    process.exit(1);
  }
  throw err;
});
