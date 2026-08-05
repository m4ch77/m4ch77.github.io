/* ============================================================
   Notion 마크다운 정규화

   Notion 에서 쓴 글을 그대로 받아들이기 위한 앞단입니다.
   Notion 은 표준 마크다운과 두 군데서 갈립니다.

   1. 인라인 수식을 $$...$$ 로 씁니다.
      표준에서 $$ 는 별행 수식이라, 그대로 넘기면 이렇게 깨집니다.
        "값은 $$x^2$$ 입니다"      → <p> 안에 <p> 가 생겨 마크업이 깨짐
        "$$x^2$$ 가 값입니다"      → KaTeX parse error
      그래서 **한 줄 안에 다른 글자와 섞여 있는 $$...$$ 는 $...$ 로**
      바꿉니다. 제 줄을 온전히 차지한 $$ 는 별행 수식으로 둡니다.

   2. Notion 고유 블록을 HTML 로 내보냅니다.
      <aside> 콜아웃, <details> 토글, <span underline="true">,
      <span color="blue">, {color="..."} 같은 것들입니다.

   내보내기 방법 두 가지를 모두 받습니다.
     · Notion UI  → "Export as Markdown & CSV"
     · Notion API → Notion-flavored Markdown

   코드 블록 안은 절대 건드리지 않습니다.
   ============================================================ */

/* ── 코드 구간 보호 ──────────────────────────────────────
   ```펜스``` 와 `인라인 코드` 를 자리표로 빼두고, 변환이 끝난 뒤
   되돌립니다. 이걸 안 하면 코드 예제 안의 $$ 나 <aside> 까지 바뀝니다. */
function protectCode(src) {
  const shelf = [];
  const keep = (text) => {
    shelf.push(text);
    // 마크다운이 건드리지 않는 사적 영역 문자를 자리표로 씁니다.
    return `\u0000${shelf.length - 1}\u0000`;
  };

  let out = src
    // 펜스가 먼저입니다 (인라인보다 길게 먹습니다)
    .replace(/^([ \t]*)(`{3,}|~{3,})[\s\S]*?^\1?\2[ \t]*$/gm, (m) => keep(m))
    .replace(/`[^`\n]*`/g, (m) => keep(m));

  return {
    text: out,
    restore: (s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => shelf[Number(i)]),
  };
}

/* ── 1. $$ 수식 정규화 ──────────────────────────────────── */
export function normalizeMath(src) {
  const lines = src.split("\n");
  const out = [];
  let inDisplay = false; // $$ 만 있는 줄로 열린 블록 안인지

  for (const line of lines) {
    const bare = line.trim();

    // 여는/닫는 $$ 한 줄 — 별행 수식 블록의 경계입니다. 그대로 둡니다.
    if (bare === "$$") {
      inDisplay = !inDisplay;
      out.push(line);
      continue;
    }
    if (inDisplay) {
      out.push(line);
      continue;
    }

    // 한 줄이 통째로 $$...$$ 인 경우도 별행 수식입니다. 그대로 둡니다.
    if (/^\$\$[\s\S]*\$\$$/.test(bare) && bare.length > 4) {
      const inner = bare.slice(2, -2);
      // 안에 또 $$ 가 없어야 진짜 하나의 별행 수식입니다.
      if (!inner.includes("$$")) {
        out.push(line);
        continue;
      }
    }

    // 그 밖에 줄 안에 섞여 있는 $$...$$ 는 Notion 의 인라인 수식입니다.
    out.push(
      line.replace(/\$\$([^\n]*?)\$\$/g, (m, body) => {
        if (!body.trim()) return m;
        // 이미 $ 로 끝나는 식이면 $$$ 가 되지 않게 다듬습니다.
        return "$" + body.trim() + "$";
      }),
    );
  }

  return out.join("\n");
}

/* ── 2. Notion 고유 표기 → 우리 마크업 ──────────────────── */
const COLORS = new Set([
  "gray", "brown", "orange", "yellow", "green",
  "blue", "purple", "pink", "red",
]);

export function normalizeNotionSyntax(src) {
  let s = src;

  // 밑줄: <span underline="true">X</span> → <u>X</u>
  s = s.replace(/<span\s+underline=["']true["']\s*>([\s\S]*?)<\/span>/gi, "<u>$1</u>");

  // 글자색 · 배경색: <span color="blue">X</span> → 클래스로
  s = s.replace(
    /<span\s+color=["']([a-z_]+)["']\s*>([\s\S]*?)<\/span>/gi,
    (m, name, body) => {
      const bg = name.endsWith("_bg");
      const base = bg ? name.slice(0, -3) : name;
      if (!COLORS.has(base)) return body;
      return `<span class="nt-${bg ? "bg-" : ""}${base}">${body}</span>`;
    },
  );

  // 사람 멘션 → 그냥 이름만 남깁니다 (링크는 내부 주소라 쓸모없습니다)
  s = s.replace(/<mention-user[^>]*>([\s\S]*?)<\/mention-user>/gi, "$1");
  s = s.replace(/<mention-user[^>]*\/>/gi, "");

  // 블록 속성 {color="..."} · 제목 토글 {toggle="true"} 는 떼어냅니다.
  s = s.replace(/\s*\{(?:color|toggle)=["'][^"']*["']\}/g, "");

  // 콜아웃: <aside>💡 내용</aside> → 아이콘을 떼어 따로 세웁니다.
  s = s.replace(/<aside>([\s\S]*?)<\/aside>/gi, (m, inner) => {
    const body = inner.trim();
    // 첫 글자가 이모지면 아이콘으로 씁니다.
    const hit = body.match(/^(\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*)\s*([\s\S]*)$/u);
    const icon = hit ? hit[1] : "";
    const text = hit ? hit[2].trim() : body;
    return (
      `\n<div class="nt-callout">` +
      (icon ? `<span class="nt-callout-icon" aria-hidden="true">${icon}</span>` : "") +
      `<div class="nt-callout-body">\n\n${text}\n\n</div></div>\n`
    );
  });

  return s;
}

/* ── 3. Notion 이 붙이는 32자리 id 폴더 떼기 ───────────────
   Notion 내보내기의 이미지 경로는 이렇게 생겼습니다.
     ![](My%20Page%20e3f1a2b4c5d6.../Untitled.png)
   글을 폴더 형태(content/writing/<이름>/index.md)로 두면 이미지가
   같은 폴더에 있으므로 앞의 폴더 이름만 떼면 바로 맞습니다. */
export function normalizeAssetPaths(src) {
  return src.replace(/\]\(([^)]+)\)/g, (m, url) => {
    if (/^(https?:|\/\/|#|data:|mailto:|tel:|\/)/i.test(url)) return m;

    let decoded;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      decoded = url;
    }

    // "이름 32자리hex/파일" 형태의 앞 구간을 떼어냅니다.
    const stripped = decoded.replace(/^[^/]*\b[0-9a-f]{32}\b[^/]*\//i, "");
    return `](${encodeURI(stripped)})`;
  });
}

/* ── 4. 제목과 속성 뽑아내기 ─────────────────────────────
   Notion 내보내기에는 프런트매터가 없습니다. 대신 첫 줄이 제목이고
   그 아래에 속성이 "이름: 값" 으로 붙습니다. 그걸 읽어 씁니다. */
const PROP_KEYS = {
  tags: "tags", 태그: "tags", "다중 선택": "tags",
  date: "date", created: "date", 날짜: "date", 생성일: "date",
  updated: "updated", 수정일: "updated",
  summary: "summary", description: "summary", 요약: "summary", 설명: "summary",
  lang: "lang", 언어: "lang",
  draft: "draft", 초안: "draft",
};

const TRUTHY = new Set(["true", "yes", "y", "1", "on", "예", "네", "참"]);

export function extractFrontmatter(src) {
  const lines = src.split("\n");
  const found = {};
  let i = 0;

  const skipBlank = () => { while (i < lines.length && !lines[i].trim()) i++; };

  skipBlank();

  // 첫 줄이 h1 이면 제목입니다.
  if (i < lines.length) {
    const h1 = lines[i].match(/^#\s+(.+?)\s*$/);
    if (h1) {
      found.title = h1[1].trim();
      i++;
    }
  }

  skipBlank();

  // 이어지는 "이름: 값" 줄들을 속성으로 읽습니다.
  // 본문 문장이 잡히지 않도록, 알고 있는 이름만 받습니다.
  while (i < lines.length) {
    const m = lines[i].match(/^\s*(?:\*\*)?([^:*\n]{1,20})(?:\*\*)?\s*:\s*(.*)$/);
    if (!m) break;
    const key = PROP_KEYS[m[1].trim().toLowerCase()];
    if (!key) break;

    const value = m[2].trim();
    if (value) {
      if (key === "tags") {
        found.tags = value.split(/[,·]/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
      } else if (key === "date" || key === "updated") {
        const d = parseLooseDate(value);
        if (d) found[key] = d;
      } else if (key === "draft") {
        found.draft = TRUTHY.has(value.toLowerCase());
      } else {
        found[key] = value;
      }
    }
    i++;
    skipBlank();
  }

  return { data: found, body: lines.slice(i).join("\n") };
}

/* Notion 이 내보내는 날짜는 지역 표기입니다. 몇 가지를 받아들입니다.
     2026-08-05 · August 5, 2026 · 2026년 8월 5일 · 2026/08/05 */
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export function parseLooseDate(raw) {
  const s = String(raw).trim();
  const pad = (n) => String(n).padStart(2, "0");

  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  m = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`;
  }
  return null;
}

/* ── 전체 파이프라인 ─────────────────────────────────────
   프런트매터(---)를 이미 쓴 글은 그대로 존중하고, 없으면 Notion 식으로
   제목과 속성을 뽑습니다. */
export function normalize(source, { hasFrontmatter }) {
  const guard = protectCode(source);
  let text = guard.text;

  text = normalizeMath(text);
  text = normalizeNotionSyntax(text);
  text = normalizeAssetPaths(text);

  text = guard.restore(text);

  if (hasFrontmatter) return { data: {}, body: text };
  return extractFrontmatter(text);
}
