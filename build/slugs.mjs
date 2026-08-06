/* ============================================================
   주소(slug) 부여 — 기본키처럼 동작합니다

   Notion 의 `Slug` 칸을 비워두면 `page1`, `page2` … 를 붙입니다.
   핵심은 **한 번 부여한 번호는 영구히 그 글의 것**이라는 점입니다.

     · 글을 지워도 그 번호를 다시 쓰지 않습니다 (기본키와 같은 성질)
     · 글을 중간에 넣어도 기존 번호가 밀리지 않습니다
     · 그래서 이미 공유된 주소가 깨지지 않습니다

   "몇 번째 글" 을 그때그때 세는 방식이면 글 하나만 지워도 뒤 번호가 전부
   밀리고, 그 주소를 저장해 둔 사람은 다른 글을 보게 됩니다. 그래서
   대응표를 파일로 남기고 함께 커밋합니다.

   대응표: content/slug-map.json
     {
       "next": 3,
       "byId": { "<Notion 페이지 id>": "page1", ... }
     }
   ============================================================ */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* 사람이 적은 Slug 를 주소로 쓸 수 있게 다듬습니다.
   한글이나 대문자가 들어오면 주소가 지저분해지므로 걸러냅니다. */
export function normalizeSlug(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return SLUG_RE.test(s) ? s : "";
}

export async function loadMap(file) {
  if (!existsSync(file)) return { next: 1, byId: {} };
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    return {
      next: Number.isInteger(data.next) && data.next > 0 ? data.next : 1,
      byId: data.byId && typeof data.byId === "object" ? data.byId : {},
    };
  } catch {
    // 손상된 파일을 덮어써서 번호를 재사용하는 것이 최악입니다. 멈춥니다.
    throw new Error(
      `${file} 을 읽을 수 없습니다. 이 파일이 주소를 기억하고 있어서, ` +
        `덮어쓰면 이미 공유된 주소가 다른 글을 가리키게 됩니다. ` +
        `git 에서 복구한 뒤 다시 실행하세요.`,
    );
  }
}

export async function saveMap(file, map) {
  await mkdir(path.dirname(file), { recursive: true });
  const ordered = {};
  // 번호순으로 정렬해 두면 diff 가 읽힙니다.
  for (const [id, slug] of Object.entries(map.byId).sort((a, b) =>
    a[1].localeCompare(b[1], "en", { numeric: true }),
  )) {
    ordered[id] = slug;
  }
  await writeFile(file, JSON.stringify({ next: map.next, byId: ordered }, null, 2) + "\n");
}

/* 한 글의 주소를 정합니다.

   explicit  Notion 의 Slug 칸 값 (없으면 빈 값)
   id        Notion 페이지 id — 번호를 기억하는 기준입니다

   반환: { slug, assigned }  assigned 가 true 면 이번에 새로 붙인 번호입니다. */
export function resolveSlug(map, { id, explicit }) {
  const typed = normalizeSlug(explicit);
  if (typed) {
    // 사람이 정한 값이 언제나 이깁니다.
    return { slug: typed, assigned: false };
  }

  const known = map.byId[id];
  if (known) return { slug: known, assigned: false };

  const slug = `page${map.next}`;
  map.byId[id] = slug;
  map.next += 1;
  return { slug, assigned: true };
}

/* 같은 주소를 두 글이 쓰려고 하면 한쪽이 조용히 덮입니다. 미리 잡습니다. */
export function findCollisions(entries) {
  const seen = new Map();
  const out = [];
  for (const e of entries) {
    const prev = seen.get(e.slug);
    if (prev) out.push({ slug: e.slug, a: prev, b: e.title });
    else seen.set(e.slug, e.title);
  }
  return out;
}
