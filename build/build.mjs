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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content", "writing");
const OUT = path.join(ROOT, "writing");
const KATEX_DIST = path.join(ROOT, "node_modules", "katex", "dist");

const withDrafts = process.argv.includes("--drafts");

const SLUG_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;

const say = (...a) => console.log(...a);
const problems = [];

/* ── 1. 글 읽기 ─────────────────────────────────────────── */
async function loadPosts() {
  if (!existsSync(CONTENT)) {
    say(`  content/writing/ 이 없습니다. 빈 목록으로 진행합니다.`);
    return [];
  }

  const files = (await readdir(CONTENT)).filter((f) => /\.(md|markdown)$/i.test(f));
  const posts = [];

  for (const file of files) {
    const slug = file.replace(/\.(md|markdown)$/i, "");
    const raw = await readFile(path.join(CONTENT, file), "utf8");
    const { data, content } = matter(raw);

    // 파일 이름이 주소가 되므로 이름 규칙을 지키게 합니다.
    if (!SLUG_OK.test(slug)) {
      problems.push(
        `${file} — 파일 이름은 소문자·숫자·하이픈만 쓸 수 있습니다 (주소가 되는 값입니다). 예: scroll-motion.md`,
      );
      continue;
    }
    if (!data.title) {
      problems.push(`${file} — 프런트매터에 title 이 없습니다.`);
      continue;
    }
    if (!data.date || !DATE_OK.test(String(data.date.toISOString?.().slice(0, 10) ?? data.date))) {
      problems.push(`${file} — date 가 없거나 형식이 YYYY-MM-DD 가 아닙니다.`);
      continue;
    }

    const iso = (d) =>
      d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

    const draft = data.draft === true;
    if (draft && !withDrafts) {
      say(`  건너뜀 (초안)  ${file}`);
      continue;
    }

    posts.push({
      slug,
      file,
      source: content,
      title: String(data.title),
      date: iso(data.date),
      updated: data.updated ? iso(data.updated) : null,
      summary: data.summary ? String(data.summary) : excerptFrom(content),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
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
    say(`  ${p.slug}  ${p.minutes}분  ${p.toc.length}절${out.hasMath ? "  수식" : ""}`);
  }

  say("▸ 쓰기");
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // 글마다 디렉터리 하나. /writing/<이름>/index.html → /writing/<이름>
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const dir = path.join(OUT, p.slug);
    await mkdir(dir, { recursive: true });
    // 목록은 최신순이라, 배열의 이전 칸이 더 새 글입니다.
    await writeFile(path.join(dir, "index.html"), postPage(p, posts[i + 1], posts[i - 1]));
  }

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
