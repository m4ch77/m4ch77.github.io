/* ============================================================
   HTML 템플릿

   헤더 · 푸터 · 커서 · 빠른 이동은 index.html 과 **같은 마크업**을 씁니다.
   main.js 를 그대로 불러 쓰기 위해서입니다 (design.md 8절).
   main.js 의 모든 모듈은 요소가 없으면 조용히 빠지므로, 허브 전용
   기능(로더 · 터미널 · 캐러셀 · TIL · 배경 격자)은 마크업을 넣지 않는
   것만으로 꺼집니다.

   긴 본문에는 .hero / .section 클래스를 쓰지 않습니다. 그 클래스가
   스크롤 정렬(모듈 17)의 대상이라, 글을 읽는 중에 화면이 끌려갑니다.
   ============================================================ */

import { VIEWS_ENDPOINT } from "./config.mjs";

const SITE = "https://m4ch77.com";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

/* 날짜 표기 — 사이트 전체가 쓰는 형식 (2026.08.01) */
export function fmtDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${y}.${m}.${d}`;
}

/* ── 테마 · 언어 부트스트랩 ─────────────────────────────
   첫 페인트 전에 실행돼야 화면이 번쩍이지 않습니다.
   index.html 의 것과 같은 저장 키를 씁니다. 로더 부분만 뺐습니다. */
const BOOTSTRAP = `(function () {
  var r = document.documentElement;
  r.classList.add("js");
  try {
    var saved = localStorage.getItem("m4ch77-theme");
    if (saved) r.dataset.theme = saved;
  } catch (e) {}
  try {
    var lang = localStorage.getItem("m4ch77-lang");
    if (lang !== "ko" && lang !== "en") {
      var list = navigator.languages && navigator.languages.length
        ? navigator.languages : [navigator.language || "en"];
      lang = "en";
      for (var i = 0; i < list.length; i++) {
        if (/^ko\\b/i.test(list[i])) { lang = "ko"; break; }
      }
    }
    r.setAttribute("lang", lang);
    r.setAttribute("data-lang", lang);
  } catch (e) { r.setAttribute("data-lang", "ko"); }
})();`;

/* ── 브랜드 아이콘 (푸터·연락에서 씁니다) ───────────────── */
const SVG_DEFS = `<svg class="svg-defs" aria-hidden="true" focusable="false">
  <defs>
    <symbol id="i-github" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></symbol>
    <symbol id="i-mail" viewBox="0 0 16 16"><path d="M1.5 3h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm.4 1.6L8 8.9l6.1-4.3H1.9z"/></symbol>
    <symbol id="i-linkedin" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 2.063-2.065 2.064 2.064 0 0 1-2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></symbol>
  </defs>
</svg>`;

/* ── 목적지 목록 ────────────────────────────────────────
   빠른 이동(⌘K)과 터미널이 함께 쓰는 단일 출처입니다.
   허브의 것과 같되 글 목록을 더했습니다. */
const DESTINATIONS = JSON.stringify([
  { id: "writing", label: "글", label_en: "Writing", url: "/writing", status: "live", desc: "쓴 글 전체", desc_en: "all posts" },
  { id: "home", label: "홈", label_en: "Home", url: "/", status: "live", desc: "개인 허브", desc_en: "personal hub" },
  { id: "github", label: "GitHub", url: "https://github.com/m4ch77", status: "live", desc: "코드와 실험들", desc_en: "code and experiments" },
  { id: "mail", label: "Email", url: "mailto:m4ch77@gmail.com", status: "live", desc: "가장 확실한 연락 방법", desc_en: "the surest way to reach me" },
  { id: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com/in/m4ch77", status: "live", desc: "이력과 네트워크", desc_en: "career and network" },
  { id: "x", label: "X", url: "https://x.com/m4ch77", status: "live", desc: "짧은 기록과 잡담", desc_en: "short notes and chatter" },
  { id: "resume", label: "레쥬메", label_en: "Resume", url: "https://resume.m4ch77.com", status: "soon", desc: "경력과 작업 기록", desc_en: "career and work log" },
], null, 2);

const CURSOR = `<div class="cursor" id="cursor" aria-hidden="true">
  <span class="cursor-ring" id="cursor-ring"></span>
  <span class="cursor-dot" id="cursor-dot"></span>
</div>
<div class="cursor-frame" id="cursor-frame" data-surface="1" aria-hidden="true"></div>
<div class="cursor-label" id="cursor-label" data-surface="1" aria-hidden="true"></div>
<div class="bg-grain" aria-hidden="true"></div>`;

const PALETTE = `<div class="palette" id="palette" hidden>
  <div class="palette-scrim" id="palette-scrim"></div>
  <div class="palette-panel" role="dialog" aria-modal="true" aria-label="빠른 이동" data-en-label="Jump to" data-surface="1">
    <div class="palette-head">
      <svg class="palette-sign" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>
      <input id="palette-input" class="palette-input" type="text"
             placeholder="어디로 갈까요? 섹션 · 링크 · 명령어"
             data-en-ph="Where to? Sections · links · commands"
             autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true"
             aria-controls="palette-list" aria-autocomplete="list">
      <span class="palette-count" id="palette-count"></span>
      <button class="palette-close" id="palette-close" type="button" aria-label="닫기" data-en-label="Close">esc</button>
    </div>
    <ul class="palette-list" id="palette-list" role="listbox" aria-label="결과" data-en-label="Results"></ul>
    <p class="palette-foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> <span data-en="move">이동</span></span>
      <span><kbd>Enter</kbd> <span data-en="select">선택</span></span>
      <span><kbd>⌥</kbd><kbd>↵</kbd> <span data-en="new tab">새 탭</span></span>
      <span class="palette-foot-end"><kbd>Esc</kbd> <span data-en="close">닫기</span></span>
    </p>
  </div>
</div>`;

/* 허브 안쪽으로 가는 링크는 절대 경로로 둡니다.
   (블로그 페이지에는 그 섹션들이 없으므로 #앵커만으로는 못 갑니다) */
const HEADER = `<header class="header" id="header" data-surface="1">
  <div class="shell header-inner">
    <a class="brand" href="/" data-cursor-label="홈" data-cursor-label-en="Home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-text">m4ch77</span>
    </a>

    <nav class="header-nav" aria-label="섹션" data-en-label="Sections">
      <a href="/writing" data-en="Writing">글</a>
      <a href="/#timeline" data-en="Career">약력</a>
      <a href="/#til">TIL</a>
      <a href="/#contact" data-en="Contact">연락</a>
    </nav>

    <div class="header-right">
      <button class="kbd-btn" id="palette-open" type="button" aria-label="빠른 이동 열기" data-en-label="Open jump to">
        <span class="kbd-btn-text" data-en="Jump to">빠른 이동</span>
        <kbd>⌘</kbd><kbd>K</kbd>
      </button>
      <button class="lang-btn" id="lang-toggle" type="button" aria-label="언어 바꾸기" data-en-label="Change language">
        <span id="lang-current">KO</span>
      </button>
      <button id="theme-toggle" class="icon-btn" type="button" aria-label="테마 반전" data-en-label="Toggle theme">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>
      </button>
    </div>
  </div>
  <div class="scroll-progress" aria-hidden="true"><span id="progress-bar"></span></div>
</header>`;

const FOOTER = `<footer class="footer" data-surface="2">
  <div class="shell">
    <div class="footer-contact" id="contact" data-section="연락" data-section-en="Contact">
      <div class="fc-main">
        <span class="fc-key" data-en="Contact">연락</span>
        <a class="fc-mail" href="mailto:m4ch77@gmail.com" data-magnet data-cursor-label="쓰기" data-cursor-label-en="Write">
          <span>m4ch77@gmail.com</span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>
        </a>
      </div>
      <dl class="fc-meta">
        <div><dt data-en="Reply">응답</dt><dd data-en="usually within 24h">보통 24시간 내</dd></div>
        <div><dt data-en="Timezone">시간대</dt><dd>KST · UTC+9</dd></div>
        <div><dt data-en="Subscribe">구독</dt><dd><a href="/writing/rss.xml">RSS 구독</a></dd></div>
      </dl>
    </div>

    <div class="footer-top">
      <nav class="footer-links" aria-label="바로가기" data-en-label="Links">
        <a href="https://github.com/m4ch77" rel="me noopener" target="_blank" data-swap="GitHub">GitHub</a>
        <a href="https://www.linkedin.com/in/m4ch77" rel="me noopener" target="_blank" data-swap="LinkedIn">LinkedIn</a>
        <a href="https://x.com/m4ch77" rel="me noopener" target="_blank" data-swap="X">X</a>
      </nav>
    </div>

    <div class="footer-wordmark" aria-hidden="true"><span id="footer-mark">m4ch77</span></div>

    <div class="footer-bottom">
      <span>© <span id="year">2026</span> m4ch77</span>
      <span class="footer-bottom-mid">Seoul, KR</span>
      <button class="footer-top-btn" type="button" id="to-top"><span data-en="Top">위로</span> <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4.5 6.5 8 3l3.5 3.5"/></svg></button>
    </div>
  </div>
</footer>`;

/* ── 페이지 껍데기 ─────────────────────────────────────── */
function shell({ title, description, canonical, head = "", main, jsonLd, depth }) {
  // /writing/ 은 한 단계, /writing/<slug>/ 은 두 단계 위가 루트입니다.
  const up = "../".repeat(depth);
  return `<!DOCTYPE html>
<html lang="ko" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="m4ch77">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0a0b0d">

<meta property="og:type" content="${depth > 1 ? "article" : "website"}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary_large_image">

<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" type="application/rss+xml" title="m4ch77 — 글" href="/writing/rss.xml">
${VIEWS_ENDPOINT ? `<meta name="views-endpoint" content="${esc(VIEWS_ENDPOINT)}">` : "<!-- 조회수 꺼짐 — build/config.mjs 의 VIEWS_ENDPOINT 가 비어 있습니다 -->"}

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@200;300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">

<link rel="stylesheet" href="${up}theme.css">
<link rel="stylesheet" href="${up}styles.css">
<link rel="stylesheet" href="${up}writing.css">
${head}
<script>${BOOTSTRAP}</script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>

<body>
<a class="skip-link" href="#main" data-en="Skip to content">본문으로 건너뛰기</a>

${SVG_DEFS}

<script type="application/json" id="destinations">
${DESTINATIONS}
</script>

${CURSOR}
${PALETTE}
${HEADER}

<main id="main">
${main}
</main>

${FOOTER}

<script src="${up}main.js" defer></script>

<!-- 방문 집계 (GoatCounter)
     쿠키를 쓰지 않고 개인정보를 모으지 않아서 동의 배너가 필요 없습니다.
     조회수를 "어떻게 보여줄지"는 아직 정하는 중이지만, 집계는 소급이 안 되므로
     수집만 먼저 시작해 둡니다. 지우려면 이 두 줄만 지우면 됩니다. -->
<script data-goatcounter="https://m4ch77.goatcounter.com/count"
        async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

/* ── 태그 줄 ────────────────────────────────────────────── */
const tagList = (tags) =>
  (tags || []).length
    ? `<span class="wr-tags">${tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</span>`
    : "";

/* ══ 글 목록 (테크 피드) ═══════════════════════════════════ */
export function feedPage(posts, allTags) {
  /* 모든 행이 같은 결입니다. 평소에는 구분선만 있는 조용한 목록이고,
     포인터를 올린 행만 카드로 떠오릅니다(writing.css). */
  const items = posts
    .map(
      (p) => `
        <li class="wr-item" data-reveal="wipe" data-tags="${esc((p.tags || []).join(" "))}">
          <a class="wr-hit" href="/writing/${esc(p.slug)}" data-cursor-label="읽기" data-cursor-label-en="Read" data-cursor-box>
            <span class="wr-meta">
              <time class="wr-date" datetime="${esc(p.date)}">${fmtDate(p.date)}</time>
              <i>·</i>
              <span class="wr-read">${p.minutes}<span data-en="min">분</span></span>
              ${p.lang === "en" ? '<i>·</i><span class="wr-lang">EN</span>' : ""}
              <!-- 조회수는 JS 가 채웁니다. 값이 오기 전에는 자리를 차지하지 않습니다. -->
              <span class="wr-views" data-row-views hidden><i>·</i><span class="wr-views-n">—</span><span data-en=" views"> 회</span></span>
            </span>
            <span class="wr-title">${esc(p.title)}</span>
            <span class="wr-excerpt">${esc(p.summary)}</span>
            ${tagList(p.tags)}
          </a>
        </li>`,
    )
    .join("");

  const filters = allTags
    .map((t) => `<button class="wr-chip" type="button" data-tag="${esc(t)}">#${esc(t)}</button>`)
    .join("");

  const main = `
  <div class="wr-head" data-surface="1" data-section="글" data-section-en="Writing" id="writing">
    <div class="shell">
      <p class="section-kicker" data-reveal><span class="num">01</span> <span data-en="Writing">글</span></p>
      <h1 class="section-title" data-split="chars" data-split-dir="x">What I <span class="thin">Wrote</span></h1>
      <p class="section-tagline" data-reveal data-en="Notes on what I built and what broke.">만든 것과 부서진 것에 대한 기록입니다.</p>

      <div class="wr-bar" data-reveal>
        <p class="wr-count">
          <span id="wr-shown">${posts.length}</span><span class="wr-slash">/</span><span>${posts.length}</span>
          <span class="wr-count-unit" data-en="posts">편</span>
        </p>
        <div class="wr-controls">
          ${allTags.length ? `<div class="wr-filter" role="group" aria-label="태그로 걸러보기" data-en-label="Filter by tag">
            <button class="wr-chip is-on" type="button" data-tag="" data-en="All">전체</button>
            ${filters}
          </div>` : ""}
          <!-- 조회수 순은 Worker 주소가 설정돼 있을 때만 켜집니다 -->
          <div class="wr-sort" role="group" aria-label="정렬" data-en-label="Sort" data-sort hidden>
            <button class="wr-chip is-on" type="button" data-order="date" data-en="Newest">최신순</button>
            <button class="wr-chip" type="button" data-order="views" data-en="Most read">조회순</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="wr-body" data-surface="2" data-section="목록" data-section-en="Posts" id="list">
    <div class="shell">
      ${posts.length
        ? `<ol class="wr-list" id="wr-list">${items}</ol>
           <p class="wr-empty" id="wr-empty" hidden data-en="No posts with that tag.">그 태그로는 글이 없습니다.</p>`
        : `<p class="wr-empty" data-en="Nothing published yet. Add a markdown file under content/writing/.">아직 올린 글이 없습니다. content/writing/ 에 마크다운을 하나 넣어보세요.</p>`}
    </div>
  </div>`;

  return shell({
    title: "글 — m4ch77",
    description: "m4ch77이 쓴 글. 프론트엔드, 인프라, 그리고 만들다 부순 것들.",
    canonical: `${SITE}/writing`,
    main,
    depth: 1,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "m4ch77 — 글",
      url: `${SITE}/writing`,
      author: { "@type": "Person", name: "m4ch77", url: SITE },
    },
  });
}

/* ══ 글 본문 ═══════════════════════════════════════════════ */
export function postPage(post, prev, next) {
  const toc = post.toc.length > 1
    ? `<nav class="wr-toc" aria-label="목차" data-en-label="Contents">
         <p class="wr-toc-key" data-en="Contents">목차</p>
         <ol>${post.toc
           .map((h) => `<li class="lv${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`)
           .join("")}</ol>
       </nav>`
    : "";

  /* 왼쪽이 지난 글, 오른쪽이 최신 글입니다. 시간축을 왼→오로 둡니다.
     화살표 의미(← →)와 브라우저 뒤로·앞으로가 같은 방향을 가리키므로
     이 배치가 헷갈리지 않습니다. 라벨도 "이전/다음" 대신 "지난/최신"
     으로 두어 시간 기준임을 분명히 했습니다. */
  const arrowL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H4M7.5 4.5 4 8l3.5 3.5"/></svg>';
  const arrowR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>';

  const nav = (prev || next)
    ? `<nav class="wr-adj" aria-label="다른 글" data-en-label="Other posts">
         ${prev ? `<a class="wr-adj-item is-older" href="/writing/${esc(prev.slug)}" data-cursor-box>
            <span class="wr-adj-key">${arrowL}<span data-en="Older">지난 글</span></span>
            <span class="wr-adj-title">${esc(prev.title)}</span></a>` : "<span></span>"}
         ${next ? `<a class="wr-adj-item is-newer" href="/writing/${esc(next.slug)}" data-cursor-box>
            <span class="wr-adj-key"><span data-en="Newer">최신 글</span>${arrowR}</span>
            <span class="wr-adj-title">${esc(next.title)}</span></a>` : "<span></span>"}
       </nav>`
    : "";

  const main = `
  <article class="wr-article" data-surface="1" data-section="글" data-section-en="Post" id="post">
    <div class="shell">
      <p class="wr-back" data-reveal>
        <a href="/writing" data-cursor-label="목록" data-cursor-label-en="Index">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H4M7.5 4.5 4 8l3.5 3.5"/></svg>
          <span data-en="All posts">글 전체</span>
        </a>
      </p>

      <header class="wr-hero">
        <p class="wr-meta" data-reveal>
          <time datetime="${esc(post.date)}">${fmtDate(post.date)}</time>
          <i>·</i><span>${post.minutes}<span data-en="min">분</span></span>
          ${post.updated ? `<i>·</i><span data-en="updated ${fmtDate(post.updated)}">${fmtDate(post.updated)} 고침</span>` : ""}
          <!-- 조회수는 JS 가 채웁니다. 값이 오기 전에는 자리를 차지하지 않습니다. -->
          <span class="wr-views" data-views hidden><i>·</i><span class="wr-views-n">—</span><span data-en=" views"> 회</span></span>
        </p>
        <h1 class="wr-h1" data-split="words" data-split-dir="x">${esc(post.title)}</h1>
        ${post.summary ? `<p class="wr-lede" data-reveal>${esc(post.summary)}</p>` : ""}
        ${post.tags?.length ? `<p class="wr-hero-tags" data-reveal>${tagList(post.tags)}</p>` : ""}
      </header>

      <div class="wr-grid">
        ${toc}
        <div class="wr-prose">
${post.html}
        </div>
      </div>

      ${nav}
    </div>
  </article>`;

  // 수식이 있는 글만 KaTeX 스타일을 링크합니다. 없는 글은 한 바이트도 더 받지 않습니다.
  const head = post.hasMath
    ? `<link rel="stylesheet" href="../katex/katex.min.css">`
    : "";

  return shell({
    title: `${post.title} — m4ch77`,
    description: post.summary,
    canonical: `${SITE}/writing/${post.slug}`,
    head,
    main,
    depth: 2,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.summary,
      datePublished: post.date,
      ...(post.updated ? { dateModified: post.updated } : {}),
      keywords: (post.tags || []).join(", "),
      inLanguage: post.lang === "en" ? "en" : "ko",
      author: { "@type": "Person", name: "m4ch77", url: SITE },
      mainEntityOfPage: `${SITE}/writing/${post.slug}`,
    },
  });
}

/* ══ RSS ═══════════════════════════════════════════════════ */
export function rss(posts) {
  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE}/writing/${esc(p.slug)}</link>
      <guid isPermaLink="true">${SITE}/writing/${esc(p.slug)}</guid>
      <pubDate>${new Date(p.date + "T09:00:00+09:00").toUTCString()}</pubDate>
      <description>${esc(p.summary)}</description>
${(p.tags || []).map((t) => `      <category>${esc(t)}</category>`).join("\n")}
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>m4ch77 — 글</title>
    <link>${SITE}/writing</link>
    <atom:link href="${SITE}/writing/rss.xml" rel="self" type="application/rss+xml"/>
    <description>만든 것과 부서진 것에 대한 기록</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

/* ══ 허브(index.html) 캐러셀에 꽂아 넣을 카드 ═══════════════
   index.html 의 build:posts 표시 사이만 바꿉니다. */
export function hubCards(posts) {
  const cards = posts
    .slice(0, 6)
    .map(
      (p) => `
          <li class="bcard" data-reveal="slide">
            <a class="bcard-hit" href="/writing/${esc(p.slug)}" data-cursor-label="읽기" data-cursor-label-en="Read" data-cursor-box>
              <span class="bcard-media">
                <img src="${esc(p.cover)}" alt="" width="960" height="600" loading="lazy" decoding="async">
              </span>
              <span class="bcard-body">
                <span class="bcard-meta"><span class="bcard-date">${fmtDate(p.date)}</span><i>·</i><span>${p.minutes}<span data-en="min">분</span></span></span>
                <span class="bcard-title">${esc(p.title)}</span>
                <span class="bcard-excerpt">${esc(p.summary)}</span>
                ${tagList(p.tags)}
              </span>
            </a>
          </li>`,
    )
    .join("");

  /* 마지막에 "글 전체 보기" 칸을 두었다가 뺐습니다.
     캐러셀의 카드가 이미 각 글로 가고, 섹션 제목(What I Wrote)이 목록으로
     가는 문입니다. 같은 곳으로 가는 세 번째 입구는 군더더기였습니다. */
  return `${cards}
`;
}
