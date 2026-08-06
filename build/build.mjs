/* ============================================================
   빌드

     content/writing/<이름>.md   →   /writing/<이름>

   파일 이름이 그대로 주소가 됩니다. 날짜는 파일 이름이 아니라
   프런트매터에서 읽습니다. 이름에 날짜를 넣으면 주소가 지저분해지고,
   나중에 날짜를 고칠 때 주소가 바뀌어 링크가 깨집니다.

   실행
     npm run build
     npm run build -- --drafts     초안까지 포함
   ============================================================ */

import { readdir, readFile, writeFile, mkdir, rm, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

import {
  createRenderer,
  collectFenceLangs,
  render,
  readingMinutes,
  excerptFrom,
} from "./markdown.mjs";
import { feedPage, postPage, rss, hubCards } from "./templates.mjs";
import * as notion from "./notion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* 글 원본은 두 곳에서 옵니다.

     content/writing/   손으로 쓴 글. 동기화가 건드리지 않습니다.
     content/notion/    Notion 동기화가 관리. 이 폴더만 지우고 다시 씁니다.

   빌드는 둘을 합쳐 한 목록으로 냅니다. 폴더는 **출처를 나누는 것일 뿐**
   주소에는 영향이 없습니다. 둘 다 /writing/<이름> 으로 나갑니다.
   그래서 나중에 손글을 Notion 으로 옮겨도 링크가 깨지지 않습니다. */
const CONTENT_DIRS = [
  { dir: path.join(ROOT, "content", "writing"), origin: "손" },
  { dir: path.join(ROOT, "content", "notion"), origin: "Notion" },
];

const OUT = path.join(ROOT, "writing");
const KATEX_DIST = path.join(ROOT, "node_modules", "katex", "dist");

const withDrafts = process.argv.includes("--drafts");

const SLUG_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;

const say = (...a) => console.log(...a);
const problems = [];

/* ── 1. 글 찾기 ─────────────────────────────────────────
   두 가지 형태를 받습니다.

     content/writing/이름.md              그림 없는 글
     content/writing/이름/index.md        그림이 딸린 글 (Notion 내보내기)

   Notion 에서 "Export as Markdown & CSV" 를 하면 `제목 32자리hex.md` 와
   같은 이름의 폴더가 함께 나옵니다. 둘을 `이름/index.md` 와 `이름/` 로
   옮기면 그림 경로가 그대로 맞습니다. */
async function findSources() {
  const out = [];
  const seen = new Map(); // slug → 먼저 찾은 곳 (겹침 검사용)

  for (const { dir: base, origin } of CONTENT_DIRS) {
    if (!existsSync(base)) continue;

    for (const e of await readdir(base, { withFileTypes: true })) {
      let found = null;

      if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) {
        found = {
          slug: e.name.replace(/\.(md|markdown)$/i, ""),
          file: path.join(base, e.name),
          label: `${path.basename(base)}/${e.name}`,
          dir: null,
        };
      } else if (e.isDirectory()) {
        for (const name of ["index.md", "index.markdown"]) {
          const p = path.join(base, e.name, name);
          if (existsSync(p)) {
            found = {
              slug: e.name,
              file: p,
              label: `${path.basename(base)}/${e.name}/${name}`,
              dir: path.join(base, e.name),
            };
            break;
          }
        }
      }

      if (!found) continue;
      found.origin = origin;

      /* 이름(=주소)이 겹치면 한쪽이 조용히 덮입니다. 멈추고 알려줍니다.
         제목은 겹쳐도 괜찮습니다. 주소를 정하는 것은 이름뿐입니다. */
      const prev = seen.get(found.slug);
      if (prev) {
        problems.push(
          `이름이 겹칩니다 — "${found.slug}"\n` +
            `      ${prev}\n` +
            `      ${found.label}\n` +
            `    이름이 그대로 주소가 되므로 둘 중 하나를 바꿔야 합니다.`,
        );
        continue;
      }
      seen.set(found.slug, found.label);
      out.push(found);
    }
  }

  return out;
}

/* ── 2. 글 읽기 ─────────────────────────────────────────── */
async function loadPosts() {
  const sources = await findSources();
  if (!sources.length) {
    say("  글이 없습니다. content/writing/ 에 마크다운을 넣어보세요.");
    return [];
  }

  const posts = [];

  for (const src of sources) {
    const raw = await readFile(src.file, "utf8");

    // --- 프런트매터가 있으면 그것이 우선입니다.
    const fm = matter(raw);
    const hasFrontmatter = Object.keys(fm.data).length > 0;

    /* Notion 표기를 표준 마크다운으로 고칩니다 (수식 · 콜아웃 · 색 · 경로).

       demote 는 Notion 에서 내려온 글에만 켭니다. Notion 제목 1단계를
       h2 로 낮춰서, 글 제목(h1)과 겹치지 않고 목차에도 오르게 합니다. */
    const norm = notion.normalize(fm.content, {
      hasFrontmatter,
      demote: src.origin === "Notion",
    });

    // 프런트매터 > Notion 속성 순으로 합칩니다.
    const data = { ...norm.data, ...fm.data };
    const content = norm.body;

    /* 우리가 아직 모르는 Notion 태그가 있으면 알려줍니다. 멈추지는
       않습니다 — 글이 안 나가는 것보다 조금 어색하게라도 나가는 게
       낫습니다. 대신 무엇을 더 다뤄야 하는지 남깁니다. */
    if (norm.leftover?.length) {
      say(
        `  ! ${src.label} — 아직 다루지 않는 Notion 태그: ` +
          norm.leftover.map((t) => `<${t}>`).join(" ") +
          " (build/notion.mjs 에 규칙을 더해야 합니다)",
      );
    }

    if (!SLUG_OK.test(src.slug)) {
      problems.push(
        `${src.label} — 이름은 소문자·숫자·하이픈만 쓸 수 있습니다 (주소가 되는 값입니다). 예: scroll-motion`,
      );
      continue;
    }
    if (!data.title) {
      problems.push(
        `${src.label} — 제목이 없습니다. 프런트매터에 title 을 적거나, 첫 줄을 "# 제목" 으로 두세요.`,
      );
      continue;
    }

    const iso = (d) =>
      d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    const date = data.date ? iso(data.date) : null;

    if (!date || !DATE_OK.test(date)) {
      problems.push(
        `${src.label} — 날짜가 없거나 형식이 YYYY-MM-DD 가 아닙니다. 프런트매터의 date 나 Notion 의 "Created" 속성을 확인하세요.`,
      );
      continue;
    }

    const draft = data.draft === true;
    if (draft && !withDrafts) {
      say(`  건너뜀 (초안)  ${src.label}`);
      continue;
    }

    posts.push({
      slug: src.slug,
      label: src.label,
      origin: src.origin,
      assetDir: src.dir,
      source: content,
      title: String(data.title),
      date,
      updated: data.updated ? iso(data.updated) : null,
      summary: data.summary ? String(data.summary) : excerptFrom(content),
      tags: Array.isArray(data.tags)
        ? data.tags.map(String)
        : data.tags ? String(data.tags).split(/[,·]/).map((t) => t.trim()).filter(Boolean) : [],
      lang: data.lang === "en" ? "en" : "ko",
      cover: data.cover ? String(data.cover) : null,
      draft,
      minutes: readingMinutes(content),
    });
  }

  // 최신 글이 위로. 같은 날짜면 이름순으로 안정 정렬합니다.
  posts.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date < a.date ? -1 : 1));
  return posts;
}

/* ── 2. KaTeX 자원 ──────────────────────────────────────
   CSS 는 woff2 → woff → ttf 순서로 적혀 있어서, 요즘 브라우저는
   woff2 만 받아 갑니다. 그래서 woff2 만 복사합니다 (296KB → 그중 실제로
   내려가는 것은 글에 쓰인 글리프가 든 몇 개뿐입니다). */
async function copyKatex() {
  const dest = path.join(OUT, "katex");
  await mkdir(path.join(dest, "fonts"), { recursive: true });
  await cp(path.join(KATEX_DIST, "katex.min.css"), path.join(dest, "katex.min.css"));

  const fonts = (await readdir(path.join(KATEX_DIST, "fonts"))).filter((f) =>
    f.endsWith(".woff2"),
  );
  for (const f of fonts) {
    await cp(path.join(KATEX_DIST, "fonts", f), path.join(dest, "fonts", f));
  }
  return fonts.length;
}

/* ── 3. 허브 캐러셀에 실제 글을 꽂습니다 ─────────────────
   index.html 의 표시 사이만 갈아치웁니다. 표시가 없으면 건너뜁니다. */
async function injectHub(posts) {
  const file = path.join(ROOT, "index.html");
  const START = "<!-- build:posts:start -->";
  const END = "<!-- build:posts:end -->";

  let html = await readFile(file, "utf8");
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  if (a === -1 || b === -1 || b < a) {
    say("  index.html 에 build:posts 표시가 없어 캐러셀은 건드리지 않았습니다.");
    return false;
  }

  // 커버가 지정되지 않은 글은 있는 커버 이미지를 돌려 씁니다.
  const withCover = posts.map((p, i) => ({
    ...p,
    cover: p.cover || `assets/cover-0${(i % 6) + 1}.svg`,
  }));

  const next =
    html.slice(0, a + START.length) + "\n" + hubCards(withCover) + "          " + html.slice(b);

  if (next !== html) {
    await writeFile(file, next);
    return true;
  }
  return false;
}

/* ── 4. 메인 ────────────────────────────────────────────── */
async function main() {
  say("▸ 글 읽기");
  const posts = await loadPosts();

  if (problems.length) {
    console.error("\n중단합니다. 고쳐야 할 것이 있습니다:\n");
    for (const p of problems) console.error("  · " + p);
    console.error("");
    process.exit(1);
  }
  say(`  ${posts.length} 편`);

  say("▸ 렌더러 준비");
  const langs = collectFenceLangs(posts.map((p) => p.source));
  say(`  코드 언어 ${langs.length ? langs.join(", ") : "(없음)"}`);
  const { md } = await createRenderer(langs);

  say("▸ 본문 변환");
  let mathCount = 0;
  for (const p of posts) {
    const out = render(md, p.source);
    p.html = out.html;
    p.toc = out.toc;
    p.hasMath = out.hasMath;
    if (out.hasMath) mathCount++;
    say(`  ${p.slug}  [${p.origin}]  ${p.minutes}분  ${p.toc.length}절${out.hasMath ? "  수식" : ""}`);
  }

  say("▸ 쓰기");
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // 글마다 디렉터리 하나. /writing/<이름>/index.html → /writing/<이름>
  let copiedAssets = 0;
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const dir = path.join(OUT, p.slug);
    await mkdir(dir, { recursive: true });

    // 폴더 형태 글이면 원본 옆에 있던 그림을 함께 옮깁니다.
    // 마크다운 원본은 산출물에 넣지 않습니다.
    if (p.assetDir) {
      for (const e of await readdir(p.assetDir, { withFileTypes: true })) {
        if (/\.(md|markdown)$/i.test(e.name)) continue;
        await cp(path.join(p.assetDir, e.name), path.join(dir, e.name), {
          recursive: true,
        });
        copiedAssets++;
      }
    }

    // 목록은 최신순이라, 배열의 이전 칸이 더 새 글입니다.
    await writeFile(path.join(dir, "index.html"), postPage(p, posts[i + 1], posts[i - 1]));
  }
  if (copiedAssets) say(`  글에 딸린 파일 ${copiedAssets}개를 함께 옮겼습니다`);

  const allTags = [...new Set(posts.flatMap((p) => p.tags))].sort();
  await writeFile(path.join(OUT, "index.html"), feedPage(posts, allTags));
  await writeFile(path.join(OUT, "rss.xml"), rss(posts));
  await writeFile(
    path.join(OUT, "feed.json"),
    JSON.stringify(
      {
        version: "https://jsonfeed.org/version/1.1",
        title: "m4ch77 — 글",
        home_page_url: "https://m4ch77.com/writing",
        feed_url: "https://m4ch77.com/writing/feed.json",
        language: "ko",
        items: posts.map((p) => ({
          id: `https://m4ch77.com/writing/${p.slug}`,
          url: `https://m4ch77.com/writing/${p.slug}`,
          title: p.title,
          summary: p.summary,
          date_published: `${p.date}T09:00:00+09:00`,
          tags: p.tags,
        })),
      },
      null,
      2,
    ),
  );

  if (mathCount > 0) {
    const n = await copyKatex();
    say(`  katex.min.css + woff2 ${n}개 (수식 있는 글 ${mathCount}편)`);
  } else {
    say("  수식이 없어 KaTeX 자원은 복사하지 않았습니다.");
  }

  const injected = await injectHub(posts);
  say(`  허브 캐러셀 ${injected ? "갱신" : "그대로"}`);

  // 결과 요약
  const files = [];
  async function walk(dir, base = "") {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const rel = path.join(base, e.name);
      if (e.isDirectory()) await walk(path.join(dir, e.name), rel);
      else files.push(rel);
    }
  }
  await walk(OUT);
  const total = (
    await Promise.all(files.map((f) => stat(path.join(OUT, f)).then((s) => s.size)))
  ).reduce((a, b) => a + b, 0);

  say(`\n완료. writing/ 에 ${files.length}개 파일, ${(total / 1024).toFixed(0)}KB`);
  for (const p of posts) say(`  /writing/${p.slug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
