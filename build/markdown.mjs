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

  /* 이미지는 지연 로딩하고 크기를 비워두지 않습니다. */
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet("loading", "lazy");
    tokens[idx].attrSet("decoding", "async");
    return defaultImage(tokens, idx, options, env, self);
  };

  /* 표를 감싸서 좁은 화면에서 가로로만 스크롤되게 합니다. */
  md.renderer.rules.table_open = () => '<div class="tbl-wrap"><table>';
  md.renderer.rules.table_close = () => "</table></div>";

  return { md, highlighter };
}

/* 본문을 렌더링하고, 목차와 수식 사용 여부를 함께 돌려줍니다. */
export function render(md, source) {
  const env = {};
  const tokens = md.parse(source, env);
  const html = md.renderer.render(tokens, md.options, env);

  // 목차 — h2/h3 만 씁니다. 그 아래까지 넣으면 목차가 본문만큼 길어집니다.
  const toc = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "heading_open") continue;
    if (t.tag !== "h2" && t.tag !== "h3") continue;
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
    .replace(/[*_`>#|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return text.slice(0, limit).replace(/\s+\S*$/, "") + "…";
}
