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

/* Notion **API** 는 UI 내보내기와 다른 태그를 씁니다. 공식 매핑표 기준으로
   차이가 나는 것만 먼저 맞춰 둡니다.

     콜아웃   UI: <aside>        API: <callout>
     표       UI: GFM 파이프 표   API: <table><tr><td>
     그 밖에  <columns> <column> <synced_block> <table_of_contents/>
              <unknown url alt> <file src> <video src> <audio src> <pdf src>

   표는 마크다운으로 되돌리지 않고 HTML 그대로 둡니다. markdown-it 이
   html:true 라 통과하고, .tbl-wrap 으로 감싸 스타일을 맞춥니다. */
export function normalizeApiBlocks(src) {
  let s = src;

  /* 콜아웃 — 아래 normalizeNotionSyntax 의 <aside> 처리에 얹습니다.
     API 는 아이콘을 **속성**에 담습니다(<callout icon="💡">). UI 내보내기는
     본문 첫 글자에 둡니다. <aside> 처리가 본문에서 이모지를 찾으므로,
     속성에 있는 아이콘을 본문 앞으로 옮겨 줍니다. */
  s = s.replace(/<callout([^>]*)>([\s\S]*?)<\/callout>/gi, (m, attrs, body) => {
    const icon = (attrs.match(/icon=["']([^"']+)["']/i) || [])[1] || "";
    return `<aside>${icon ? icon + " " : ""}${body}</aside>`;
  });

  /* 빈 줄 — API 마크다운에는 문단을 가르는 **빈 줄이 없습니다.**
     공식 문서에 "Plain empty lines are stripped out" 이라 적혀 있고,
     의도한 빈 줄은 <empty-block/> 한 줄로 옵니다.

     그대로 넘기면 markdown-it 이 모르는 태그로 흘려보내서 본문에
     <empty-block/> 이 글자로 박히고, 게다가 빈 줄이 없으니 앞뒤 문단이
     한 덩어리로 붙습니다. 첫 동기화 글에서 실제로 그렇게 나왔습니다.
     표준 마크다운의 빈 줄로 되돌립니다. */
  s = s.replace(/<empty-block\s*\/?>(?:\s*<\/empty-block>)?/gi, "\n");

  // 단 나누기 — 웹에서는 그냥 위아래로 흐르게 둡니다. 좁은 화면에서 단을
  // 유지하면 읽기가 나빠집니다.
  s = s.replace(/<\/?columns[^>]*>/gi, "");
  s = s.replace(/<\/?column[^>]*>/gi, "");

  // 동기화 블록 — 껍데기만 벗기고 내용은 남깁니다.
  s = s.replace(/<\/?synced_block[^>]*>/gi, "");

  // Notion 의 목차 블록 — 우리 사이트가 목차를 따로 만듭니다. 지웁니다.
  s = s.replace(/<table_of_contents\s*\/?>/gi, "");

  // 표는 HTML 그대로 두되, 우리 렌더러가 감싸는 것과 같은 껍데기를 붙입니다.
  s = s.replace(/<table(\s[^>]*)?>/gi, '<div class="tbl-wrap"><table>');
  s = s.replace(/<\/table>/gi, "</table></div>");

  // 파일·영상·음성·PDF — 내려받아 커밋한 뒤 링크로 둡니다.
  s = s.replace(
    /<(file|video|audio|pdf)\s+src=["']([^"']+)["']\s*>([\s\S]*?)<\/\1>/gi,
    (m, kind, url, caption) => {
      const label = (caption || "").trim() || kind.toUpperCase();
      return `[${label}](${url})`;
    },
  );

  /* 지원되지 않는 블록(북마크·임베드·링크 미리보기 등)은 <unknown> 으로
     옵니다. 조용히 지우면 글에 구멍이 생기니, 원본으로 가는 링크를 남깁니다. */
  s = s.replace(
    /<unknown\s+url=["']([^"']+)["']\s+alt=["']([^"']*)["']\s*\/?>/gi,
    (m, url, alt) => `[${alt || "Notion 블록"}](${url})`,
  );

  return s;
}

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

  /* 페이지·DB 멘션 → 링크. 가리키는 곳이 Notion 안이라 방문자에게는
     열리지 않지만, 글자를 지워 구멍을 내는 것보다 낫습니다. */
  s = s.replace(
    /<mention-(page|database)\b[^>]*\burl=["']([^"']+)["'][^>]*>([\s\S]*?)<\/mention-\1>/gi,
    (m, kind, url, label) => `[${(label || "").trim() || "Notion 페이지"}](${url})`,
  );
  // 날짜 멘션 등 남은 멘션은 껍데기만 벗깁니다.
  s = s.replace(/<mention-[a-z-]+[^>]*>([\s\S]*?)<\/mention-[a-z-]+>/gi, "$1");
  s = s.replace(/<mention-[a-z-]+[^>]*\/>/gi, "");

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

/* ── 5. 제목 한 단계 낮추기 ───────────────────────────────
   Notion 의 제목은 1·2·3 단계뿐이고, 사람들은 그중 1단계를 절 제목으로
   씁니다(가장 큰 것이니까요). 그걸 그대로 h1 으로 내면 두 가지가 깨집니다.

     · 글 제목이 이미 h1 입니다. h1 이 둘이 되면 문서 구조가 망가집니다.
     · 목차는 h2·h3 만 봅니다. 그래서 Notion 1단계 제목이 목차에서
       사라집니다. 실제로 "노션에서 제목을 넣었는데 목차에 없다" 는
       현상이 이것이었습니다.

   그래서 Notion 에서 온 글만 한 단계씩 낮춥니다.

     Notion 제목1 → h2   목차 1단
     Notion 제목2 → h3   목차 2단
     Notion 제목3 → h4   목차 3단

   손으로 쓴 글(content/writing/)은 건드리지 않습니다. 거기서는 ## 부터
   쓰는 것이 이미 규칙이고, 실제로 그렇게 쓰여 있습니다. */
export function demoteHeadings(src) {
  const guard = protectCode(src);
  // #{1,5} — h6 는 더 내릴 곳이 없으니 그대로 둡니다.
  const text = guard.text.replace(
    /^([ \t]{0,3})(#{1,5})(?=\s)/gm,
    (m, indent, hashes) => indent + hashes + "#",
  );
  return guard.restore(text);
}

/* ── 6. 넘어간 Notion 태그 찾기 ──────────────────────────
   Notion 은 블록 표기를 계속 늘립니다. 우리가 모르는 태그가 오면
   markdown-it 이 모르는 HTML 로 흘려보내고, 결국 방문자 화면에 글자로
   박힙니다. <empty-block/> 이 정확히 그랬습니다.

   그래서 빌드가 대신 봅니다. 검사는 코드 구간을 빼둔 상태에서 하므로,
   Notion 문법을 설명하는 글의 코드 예제는 걸리지 않습니다. */
const NOTION_TAGS =
  /<\/?(callout|columns?|synced_block|table_of_contents|unknown|empty-block|mention-[a-z-]+|emoji|citation|toggle|file|video|audio|pdf|image)\b/gi;

function leftoverTags(text) {
  const found = new Set();
  for (const m of text.matchAll(NOTION_TAGS)) found.add(m[1].toLowerCase());
  return [...found];
}

/* ── 전체 파이프라인 ─────────────────────────────────────
   프런트매터(---)를 이미 쓴 글은 그대로 존중하고, 없으면 Notion 식으로
   제목과 속성을 뽑습니다. */
export function normalize(source, { hasFrontmatter, demote = false }) {
  const guard = protectCode(source);
  let text = guard.text;

  text = normalizeApiBlocks(text);
  text = normalizeMath(text);
  text = normalizeNotionSyntax(text);
  text = normalizeAssetPaths(text);

  // 남은 Notion 태그는 여기서 셉니다 (코드는 아직 빠져 있는 상태).
  const leftover = leftoverTags(text);

  text = guard.restore(text);

  /* 제목 낮추기는 프런트매터를 뽑은 **뒤에** 해야 합니다. 프런트매터가
     없는 글은 첫 줄의 "# 제목" 이 글 제목이고, 먼저 낮추면 그걸 못 찾습니다. */
  const out = hasFrontmatter ? { data: {}, body: text } : extractFrontmatter(text);
  if (demote) out.body = demoteHeadings(out.body);
  out.leftover = leftover;
  return out;
}
