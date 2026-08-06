/* ============================================================
   Notion → content/notion/

   Notion 데이터베이스의 글을 내려받아 마크다운으로 저장합니다.
   빌드는 그 마크다운을 읽어 사이트를 만듭니다.

   방향은 **한 방향**입니다. Notion 이 진실의 원천이고, 이 폴더는
   그 사본입니다. 여기서 고친 것은 다음 동기화에 덮입니다.
   손으로 관리하고 싶은 글은 content/writing/ 으로 옮기면 됩니다
   (그 폴더는 이 스크립트가 건드리지 않습니다).

   읽기 전용입니다. Notion 에 아무것도 쓰지 않습니다. 통합에 업데이트
   권한을 주지 않았으므로, 이 코드에 버그가 있어도 Notion 을 망칠 수
   없습니다.

   실행
     NOTION_TOKEN=... NOTION_DATA_SOURCE_ID=... node build/notion-sync.mjs
     ... --dry-run     파일을 쓰지 않고 무엇을 할지만 보여줍니다

   필요한 DB 속성 (없으면 무엇이 없는지 알려줍니다)
     이름   제목        글 제목
     발행   체크박스     켜야 사이트에 나갑니다
     날짜   날짜        발행일
     태그   다중 선택    태그
     요약   텍스트      목록 설명
     Slug   텍스트      주소. 비우면 page1, page2 … 를 붙입니다
   ============================================================ */

import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadMap, saveMap, resolveSlug, normalizeSlug } from "./slugs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "content", "notion");
const SLUG_MAP = path.join(ROOT, "content", "slug-map.json");

const TOKEN = process.env.NOTION_TOKEN || "";
const SOURCE = process.env.NOTION_DATA_SOURCE_ID || "";
const DRY = process.argv.includes("--dry-run");

const API = "https://api.notion.com/v1";

/* 버전을 2025-09-03 로 둡니다.
   이 버전에서 "데이터베이스"와 "데이터 소스"가 분리됐고, /data_sources/…/query
   가 생겼습니다. 그 전 버전(2022-06-28)으로 부르면 invalid_request_url 이
   납니다. 실제로 그 오류를 냈습니다.

   마크다운 엔드포인트는 걱정하지 않아도 됩니다. 공식 문서에 "새 엔드포인트
   같은 추가적 변경은 모든 버전에 동시에 적용된다"고 되어 있습니다. */
const VERSION = "2025-09-03";

const say = (...a) => console.log(...a);
const die = (msg) => {
  console.error("\n" + msg + "\n");
  process.exit(1);
};

/* 속성 이름은 한국어와 영어를 모두 받습니다. Notion 에서 어느 쪽으로
   만드셨든 동작하게 하려는 것입니다. */
const FIELD = {
  published: ["발행", "Published", "공개"],
  date: ["날짜", "Date", "발행일"],
  tags: ["태그", "Tags"],
  summary: ["요약", "Summary", "설명", "Description"],
  slug: ["Slug", "슬러그", "주소"],
};

function pick(props, names) {
  for (const n of names) if (props[n]) return props[n];
  return null;
}

/* Notion 속성 값에서 우리가 쓸 형태만 꺼냅니다. */
const readTitle = (p) =>
  (p?.title || []).map((t) => t.plain_text).join("").trim();
const readText = (p) =>
  (p?.rich_text || []).map((t) => t.plain_text).join("").trim();
const readCheck = (p) => p?.checkbox === true;
const readDate = (p) => (p?.date?.start ? String(p.date.start).slice(0, 10) : null);
const readTags = (p) => {
  if (p?.multi_select) return p.multi_select.map((o) => o.name);
  if (p?.select?.name) return [p.select.name];
  return [];
};

async function notion(pathname, init = {}, { soft = false } = {}) {
  const res = await fetch(API + pathname, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "notion-version": VERSION,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // soft 는 "이 실패는 예상된 것이니 호출한 쪽이 처리한다" 는 뜻입니다.
    if (soft) return { __error: true, status: res.status, body };
    if (res.status === 401) {
      die(
        "Notion 이 토큰을 거절했습니다 (401).\n" +
          "  · NOTION_TOKEN 시크릿이 최신 값인지 확인하세요.\n" +
          "  · 지난 대화에 노출된 토큰은 폐기하고 새로 발급해야 합니다.",
      );
    }
    if (res.status === 404) {
      die(
        "Notion 이 그 데이터베이스를 찾을 수 없다고 합니다 (404).\n" +
          "  토큰은 유효한데 **DB 를 통합에 연결하지 않은** 경우가 대부분입니다.\n" +
          "  DB 페이지 → 오른쪽 위 ··· → 연결 → 검색창에 통합 이름을 직접 입력.\n" +
          "  (추천 목록의 Google Drive / GitHub 풀 리케스트가 아닙니다)",
      );
    }
    die(`Notion API 오류 ${res.status}\n  ${pathname}\n  ${body.slice(0, 400)}`);
  }
  return res.json();
}

/* ── 1. 발행된 글 목록 ─────────────────────────────────── */
async function listPosts() {
  /* 주신 ID 가 "데이터 소스" 인지 "데이터베이스" 인지에 따라 엔드포인트가
     다릅니다. 어느 쪽인지 물어보는 대신 데이터 소스로 먼저 시도하고,
     아니면 데이터베이스로 넘어갑니다. 어느 쪽으로 통했는지 찍어 둡니다. */
  let endpoint = `/data_sources/${SOURCE}/query`;

  const probe = await notion(endpoint, {
    method: "POST",
    body: JSON.stringify({ page_size: 1 }),
  }, { soft: true });

  if (probe.__error) {
    const fallback = `/databases/${SOURCE}/query`;
    const probe2 = await notion(fallback, {
      method: "POST",
      body: JSON.stringify({ page_size: 1 }),
    }, { soft: true });

    if (probe2.__error) {
      die(
        `Notion 이 이 ID 로는 조회할 수 없다고 합니다.\n` +
          `  데이터 소스로 시도: ${probe.status} ${probe.body.slice(0, 160)}\n` +
          `  데이터베이스로 시도: ${probe2.status} ${probe2.body.slice(0, 160)}\n\n` +
          `  확인할 것\n` +
          `   1. ID 가 맞는지 — DB → ··· → 데이터 소스 관리 → 데이터 소스 ID 복사\n` +
          `   2. DB 를 통합에 연결했는지 — DB 페이지 → ··· → 연결 → 통합 이름 검색\n` +
          `      (추천 목록의 Google Drive / GitHub 풀 리케스트가 아닙니다)`,
      );
    }
    endpoint = fallback;
    say("  (데이터베이스 엔드포인트로 조회합니다)");
  }

  const pages = [];
  let cursor;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    // 필터를 API 로 걸지 않고 전부 받아 우리가 고릅니다. 속성 이름이
    // 한국어일 수도 영어일 수도 있어서, 필터를 걸면 이름이 틀렸을 때
    // 조용히 0건이 됩니다. 그건 디버깅이 어렵습니다.
    const res = await notion(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });

    pages.push(...(res.results || []));
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  return pages;
}

/* ── 2. 본문을 Notion-flavored Markdown 으로 ────────────── */
async function fetchMarkdown(pageId) {
  const res = await notion(`/pages/${pageId}/markdown`);
  const md = res.markdown ?? res.content ?? "";
  return { markdown: String(md), truncated: res.truncated === true };
}

/* ── 3. 그림 내려받기 ───────────────────────────────────
   Notion 이 주는 파일 주소는 **1시간 뒤 만료**됩니다(공식 문서).
   그대로 마크다운에 남기면 한 시간 뒤 전부 깨집니다. 받아서 커밋합니다. */
async function downloadAssets(markdown, dir, slug) {
  const urls = [...markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)];
  if (!urls.length) return { markdown, count: 0 };

  let out = markdown;
  let n = 0;

  for (const [, alt, url] of urls) {
    // Notion 이 호스팅하는 것만 받습니다. 외부 이미지는 그대로 둡니다.
    if (!/(amazonaws\.com|notion-static\.com|notion\.so|prod-files)/i.test(url)) continue;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());

      // 이름은 내용 해시로 정합니다. 같은 그림이면 파일명이 같아서
      // 매번 새 파일이 쌓이지 않습니다(커밋이 지저분해지지 않게).
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update(buf).digest("hex").slice(0, 10);
      const ext = (url.split("?")[0].match(/\.(png|jpe?g|gif|webp|avif|svg)$/i) || [
        "",
        "png",
      ])[1].toLowerCase();
      const name = `${hash}.${ext}`;

      if (!DRY) {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, name), buf);
      }
      out = out.split(url).join(name);
      n++;
    } catch (e) {
      console.error(`    그림을 받지 못했습니다 (${slug}): ${e.message}`);
      console.error("    주소가 만료되었을 수 있습니다. 다시 실행해 보세요.");
      process.exitCode = 1;
    }
  }

  return { markdown: out, count: n };
}

/* ── 4. 프런트매터로 감싸기 ─────────────────────────────── */
const yamlStr = (s) => JSON.stringify(String(s)); // 따옴표·콜론을 안전하게

function frontmatter(meta) {
  const lines = ["---", `title: ${yamlStr(meta.title)}`, `date: ${meta.date}`];
  if (meta.summary) lines.push(`summary: ${yamlStr(meta.summary)}`);
  if (meta.tags.length) lines.push(`tags: [${meta.tags.map(yamlStr).join(", ")}]`);
  if (meta.updated) lines.push(`updated: ${meta.updated}`);
  if (!meta.published) lines.push("draft: true");
  lines.push(
    "# 이 파일은 Notion 에서 만들어졌습니다. 직접 고치면 다음 동기화에 덮입니다.",
    `# 원본: ${meta.url}`,
    "---",
    "",
  );
  return lines.join("\n");
}

/* ── 메인 ───────────────────────────────────────────────── */
async function main() {
  if (!TOKEN) die("NOTION_TOKEN 이 없습니다. GitHub Secrets 에 등록하세요.");
  if (!SOURCE) die("NOTION_DATA_SOURCE_ID 가 없습니다. 워크플로의 env 를 확인하세요.");

  say("▸ Notion 에서 목록 받기");
  const pages = await listPosts();
  say(`  ${pages.length}건`);

  if (!pages.length) {
    say("  DB 가 비어 있거나 통합이 볼 수 있는 행이 없습니다.");
  }

  const map = await loadMap(SLUG_MAP);
  const problems = [];
  const kept = new Set();
  let written = 0;
  let assets = 0;

  for (const page of pages) {
    const props = page.properties || {};
    const title = readTitle(pick(props, ["이름", "Name", "제목", "Title"]));
    const published = readCheck(pick(props, FIELD.published));
    const date =
      readDate(pick(props, FIELD.date)) ||
      (page.created_time ? page.created_time.slice(0, 10) : null);

    if (!title) {
      problems.push(`제목이 빈 행이 있습니다 (${page.id})`);
      continue;
    }
    if (!date) {
      problems.push(`"${title}" — 날짜가 없습니다. 날짜 속성을 채우세요.`);
      continue;
    }

    const typed = readText(pick(props, FIELD.slug));
    const { slug, assigned } = resolveSlug(map, { id: page.id, explicit: typed });

    if (typed && !normalizeSlug(typed)) {
      problems.push(
        `"${title}" — Slug "${typed}" 는 주소로 쓸 수 없습니다. ` +
          `소문자·숫자·하이픈만 됩니다(한글은 안 됩니다). 비우면 번호를 붙입니다.`,
      );
      continue;
    }

    kept.add(slug);

    const { markdown, truncated } = await fetchMarkdown(page.id);
    if (truncated) {
      say(`  ! ${slug} 은 너무 길어 일부만 받았습니다 (Notion 2만 블록 한도)`);
    }

    const dir = path.join(OUT, slug);
    const asset = await downloadAssets(markdown, dir, slug);
    assets += asset.count;

    const body =
      frontmatter({
        title,
        date,
        summary: readText(pick(props, FIELD.summary)),
        tags: readTags(pick(props, FIELD.tags)),
        updated: page.last_edited_time ? page.last_edited_time.slice(0, 10) : null,
        published,
        url: page.url || "",
      }) + asset.markdown.trim() + "\n";

    if (!DRY) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "index.md"), body);
    }

    written++;
    say(
      `  ${published ? "발행" : "초안"}  ${slug}${assigned ? " (새 주소)" : ""}` +
        `  ${title}${asset.count ? `  그림 ${asset.count}` : ""}`,
    );
  }

  if (problems.length) {
    console.error("\n고쳐야 할 것이 있습니다:");
    for (const p of problems) console.error("  · " + p);
    console.error("");
    process.exitCode = 1;
  }

  /* Notion 에서 지운 글은 이 폴더에서도 지웁니다. content/writing/ 은
     건드리지 않습니다. 폴더를 나눈 이유가 이것입니다.

     폴더뿐 아니라 낱개 .md 파일도 봅니다. 동기화는 폴더 형태로 쓰지만
     손으로 넣어둔 파일이 남아 있을 수 있습니다. */
  if (existsSync(OUT) && !DRY) {
    for (const e of await readdir(OUT, { withFileTypes: true })) {
      const name = e.isDirectory() ? e.name : e.name.replace(/\.(md|markdown)$/i, "");
      if (kept.has(name)) continue;
      if (!e.isDirectory() && !/\.(md|markdown)$/i.test(e.name)) continue;
      await rm(path.join(OUT, e.name), { recursive: true, force: true });
      say(`  지움  ${e.name} (Notion 에 없습니다)`);
    }
  }

  if (!DRY) await saveMap(SLUG_MAP, map);

  say(
    `\n${DRY ? "[미리보기] " : ""}글 ${written}편, 그림 ${assets}개.` +
      ` 주소 대응표 next=${map.next}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
