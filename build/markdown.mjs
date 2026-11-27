/* ============================================================
   마크다운 → HTML

   수식과 코드 강조를 모두 **빌드 시점에** 처리합니다.
   방문자에게는 완성된 HTML 만 갑니다. KaTeX JS 도, 하이라이터 JS 도
   내려가지 않습니다. 수식이 있는 글만 katex.css 를 링크합니다.

   - 수식   $...$  ·  $$...$$   (KaTeX → MathML + HTML)
   - 코드   ```js               (Shiki, 라이트/다크 두 테마를 CSS 변수로)
   - 각주   [^1]
   - 제목   자동 id (목차가 이걸 씁니다)
   ============================================================ */

import MarkdownIt from "markdown-it";
import anchorPlugin from "markdown-it-anchor";
import footnotePlugin from "markdown-it-footnote";
import katexPlugin from "@vscode/markdown-it-katex";
import { createHighlighter, bundledLanguages } from "shiki";

const CODE_THEMES = { light: "github-light", dark: "github-dark" };

/* 제목 → id
   한글을 퍼센트 인코딩하지 않고 그대로 둡니다. HTML5 에서 유효하고,
   주소창에서도 읽힙니다. 공백만 하이픈으로 바꾸고 구두점을 지웁니다. */
export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[\s\u00a0]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}\-_]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

/* 코드 펜스에 쓰인 언어를 모아옵니다.
   markdown-it 의 highlight 훅은 동기라서 Shiki 에 미리 다 넣어야 합니다. */
export function collectFenceLangs(sources) {
  const found = new Set();
  for (const src of sources) {
    for (const m of src.matchAll(/^[ \t]*(?:`{3,}|~{3,})[ \t]*([A-Za-z0-9_+#-]+)/gm)) {
      found.add(m[1].toLowerCase());
    }
  }
  // Shiki 가 모르는 이름은 버립니다 (버리지 않으면 하이라이터 생성이 실패합니다)
  return [...found].filter((l) => l in bundledLanguages);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

/* 렌더러를 하나 만듭니다. langs 는 collectFenceLangs 결과를 넘기세요. */
export async function createRenderer(langs = []) {
  const highlighter = await createHighlighter({
    themes: [CODE_THEMES.light, CODE_THEMES.dark],
    langs,
  });
  const loaded = new Set(highlighter.getLoadedLanguages());

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    // 한글에서 따옴표·말줄임표를 멋대로 바꾸면 어색해집니다. 끕니다.
    typographer: false,
    highlight(code, lang) {
      const language = (lang || "").toLowerCase();
      if (language && loaded.has(language)) {
        return highlighter.codeToHtml(code, {
          lang: language,
          themes: CODE_THEMES,
          // 기본색을 넣지 않으면 --shiki-light / --shiki-dark 변수만 남습니다.
          // 테마 전환이 CSS 로만 됩니다.
          defaultColor: false,
        });
      }
      // 모르는 언어는 강조 없이, 대신 이스케이프는 확실히 합니다.
      return `<pre class="shiki shiki-plain"><code>${escapeHtml(code)}</code></pre>`;
    },
  });

  md.use(katexPlugin.default ?? katexPlugin);
  md.use(footnotePlugin);
  md.use(anchorPlugin, {
    level: [2, 3, 4],
    slugify,
    permalink: anchorPlugin.permalink.linkInsideHeader({
      symbol: "#",
      placement: "after",
      class: "hd-anchor",
      ariaHidden: false,
    }),
  });

  /* 바깥으로 나가는 링크는 새 탭 + rel 을 붙입니다. */
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet("href") || "";
    if (/^https?:\/\//i.test(href) && !href.includes("m4ch77.com")) {
      tokens[idx].attrSet("target", "_blank");
      tokens[idx].attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  /* ── 그림 ────────────────────────────────────────────
     혼자 한 문단을 차지한 그림은 <figure> 로 세우고, 설명(Notion 의
     캡션 = 마크다운의 alt)이 있으면 아래에 보여줍니다. Notion 에서
     캡션은 화면에 보이는 글이라, alt 에만 두면 사라집니다.

     크기는 두 가지로 정합니다.
       · 기본: 그림 파일에서 읽은 "찍었던 화면에서의 크기" (images.mjs).
         본문 폭보다 크면 본문 폭까지만 줄어듭니다.
       · 직접: 캡션 끝에 {50%} 나 {400px} 를 적으면 그 크기로 그립니다.
         Notion 에서 손으로 줄인 크기는 API 가 알려주지 않아서, 꼭
         맞춰야 하는 그림은 이렇게 적어 둡니다. 이 표기는 화면에서는
         지워집니다. */
  md.core.ruler.push("lone_image_figure", (state) => {
    const t = state.tokens;
    for (let i = 1; i < t.length - 1; i++) {
      if (t[i].type !== "inline") continue;
      if (t[i - 1].type !== "paragraph_open" || t[i + 1].type !== "paragraph_close") continue;
      if (t[i - 1].hidden) continue; // 촘촘한 목록 안의 문단은 건드리지 않습니다
      const kids = (t[i].children || []).filter(
        (c) => !(c.type === "text" && !c.content.trim()) && c.type !== "softbreak",
      );
      if (kids.length !== 1 || kids[0].type !== "image") continue;
      t[i - 1].meta = { ...(t[i - 1].meta || {}), figure: true };
      t[i + 1].meta = { ...(t[i + 1].meta || {}), figure: true };
      kids[0].meta = { ...(kids[0].meta || {}), figure: true };
    }
  });

  const defaultParaOpen =
    md.renderer.rules.paragraph_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  const defaultParaClose =
    md.renderer.rules.paragraph_close ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) =>
    tokens[idx].meta?.figure ? '<figure class="wr-fig">' : defaultParaOpen(tokens, idx, options, env, self);
  md.renderer.rules.paragraph_close = (tokens, idx, options, env, self) =>
    tokens[idx].meta?.figure ? "</figure>\n" : defaultParaClose(tokens, idx, options, env, self);

  const SIZE_HINT = /\s*\{\s*(\d{1,4})\s*(%|px)?\s*\}\s*$/i;

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const tok = tokens[idx];
    const src = tok.attrGet("src") || "";
    const title = tok.attrGet("title");

    let caption = self.renderInlineAsText(tok.children || [], options, env).trim();
    let want = null;
    caption = caption.replace(SIZE_HINT, (_m, n, unit) => {
      want = { n: Number(n), unit: unit === "%" ? "%" : "px" };
      return "";
    }).trim();
    if (want && want.unit === "%" && (want.n < 1 || want.n > 100)) want = null;

    let key = src;
    try { key = decodeURIComponent(src); } catch {}
    const natural = env?.imageSizes?.[key] || null;

    const attrs = [`src="${escapeHtml(src)}"`, `alt="${escapeHtml(caption)}"`];
    if (title) attrs.push(`title="${escapeHtml(title)}"`);

    if (want?.unit === "px") {
      // 가로를 정하면 세로는 원래 비율로 맞춥니다.
      attrs.push(`width="${want.n}"`);
      if (natural) attrs.push(`height="${Math.round((want.n * natural.h) / natural.w)}"`);
    } else if (natural) {
      // 크기를 적어 두면 그림이 내려오기 전에도 자리가 잡혀 화면이 밀리지 않습니다.
      attrs.push(`width="${natural.w}"`, `height="${natural.h}"`);
    }
    if (want?.unit === "%") attrs.push(`style="width:${want.n}%"`);

    attrs.push('loading="lazy"', 'decoding="async"');
    const img = `<img ${attrs.join(" ")}>`;

    if (tok.meta?.figure && caption) {
      return `${img}<figcaption>${escapeHtml(caption)}</figcaption>`;
    }
    return img;
  };

  /* ── 코드 블록 ───────────────────────────────────────
     복사 버튼을 달 자리를 만듭니다. 버튼은 main.js 가 붙입니다.
     <pre> 는 가로로 스크롤되므로 버튼을 그 안에 두면 같이 밀려납니다.
     그래서 바깥에 한 겹 감쌉니다. */
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) =>
    `<div class="wr-code">${defaultFence(tokens, idx, options, env, self).trimEnd()}</div>\n`;

  /* 표를 감싸서 좁은 화면에서 가로로만 스크롤되게 합니다. */
  md.renderer.rules.table_open = () => '<div class="tbl-wrap"><table>';
  md.renderer.rules.table_close = () => "</table></div>";

  return { md, highlighter };
}

/* 본문을 렌더링하고, 목차와 수식 사용 여부를 함께 돌려줍니다. */
export function render(md, source, { imageSizes = {} } = {}) {
  const env = { imageSizes };
  const tokens = md.parse(source, env);
  const html = md.renderer.render(tokens, md.options, env);

  /* 목차 — h2·h3·h4 까지 씁니다. h5 아래는 넣지 않습니다. 그 아래까지
     넣으면 목차가 본문만큼 길어집니다.

     h4 를 넣는 이유: Notion 글은 제목을 한 단계 낮춰 들어옵니다
     (Notion 제목1→h2, 2→h3, 3→h4). h3 까지만 보면 Notion 의 3단계
     제목이 목차에서 빠집니다. 손으로 쓴 글은 h4 를 쓰지 않으므로
     기존 글의 목차는 그대로입니다. */
  const toc = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "heading_open") continue;
    if (t.tag !== "h2" && t.tag !== "h3" && t.tag !== "h4") continue;
    const inline = tokens[i + 1];
    if (!inline) continue;
    const text = inline.children
      ? inline.children.filter((c) => c.type === "text" || c.type === "code_inline")
          .map((c) => c.content).join("")
      : inline.content;
    const id = t.attrGet("id") || slugify(text);
    if (text.trim()) toc.push({ level: Number(t.tag.slice(1)), text: text.trim(), id });
  }

  return {
    html,
    toc,
    hasMath: html.includes('class="katex'),
    hasCode: html.includes('class="shiki'),
  };
}

/* 읽는 시간 — 한글은 글자 수, 라틴은 단어 수로 셉니다.
   코드 블록은 읽는 속도가 다르므로 따로 셉니다. */
export function readingMinutes(source) {
  const withoutCode = source.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  const codeLines = (source.match(/```[\s\S]*?```/g) || [])
    .reduce((n, b) => n + b.split("\n").length, 0);

  const hangul = (withoutCode.match(/[\uac00-\ud7a3]/g) || []).length;
  const latin = (withoutCode.match(/[A-Za-z0-9]+/g) || []).length;

  // 한글 500자/분, 영어 220단어/분, 코드 12줄/분
  const minutes = hangul / 500 + latin / 220 + codeLines / 12;
  return Math.max(1, Math.round(minutes));
}

/* 요약이 없을 때 본문 첫 문단에서 만들어 씁니다. */
export function excerptFrom(source, limit = 160) {
  const text = source
    .replace(/^---[\s\S]*?---/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+.*$/gm, "")
    // <br> · 빈 블록 같은 태그가 요약에 글자로 남지 않게 걷어 냅니다.
    .replace(/<[^>\n]+>/g, " ")
    .replace(/[*_`>#|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return text.slice(0, limit).replace(/\s+\S*$/, "") + "…";
}
