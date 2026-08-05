/* ============================================================
   m4ch77 — interactions (의존성 없음)
     01 유틸
     02 테마
     03 인트로 로더
     04 커스텀 커서
     05 헤더 · 서피스 동기화 · 스크롤 진행 · 점 내비
     06 단어 스플릿 · 리빌 · 스크램블 · 닉네임 잭팟
     07 패럴랙스
     08 히어로 배경 격자
     09 티커
     10 블로그 캐러셀
     11 TIL (잔디 · 숫자 · 날짜)
     12 FAQ 아코디언 · 푸터 링크 스왑
     13 마그네틱 버튼
     14 목적지 · 섹션 데이터
     15 빠른 이동 (커맨드 팔레트)
     16 터미널
     17 스크롤 정렬 (부드러운 스냅)
     18 잡동사니 (시계 · 연도 · 위로)
     19 글 목록 태그 필터        (/writing)
     20 글 목차 스크롤 스파이     (/writing/<이름>)

   06d 에 있던 "스크롤 속도에 따라 기우는 글자"(data-flow)는 없앴습니다.
   섹션별 등장 모션이 그 자리를 대신하고, 전부 CSS 입니다.
   ============================================================ */

(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "m4ch77-theme";
  var SEEN_KEY = "m4ch77-seen";
  var RECENT_KEY = "m4ch77-recent";
  var BRAND = "m4ch77";

  /* ══ 01 유틸 ═══════════════════════════════════════════ */
  function mq(q) {
    if (typeof window.matchMedia === "function") return window.matchMedia(q);
    return { matches: false, addEventListener: function () {}, addListener: function () {} };
  }

  var reduceMotion = mq("(prefers-reduced-motion: reduce)").matches;
  var canHover = mq("(hover: hover) and (pointer: fine)").matches;
  var hasIO = "IntersectionObserver" in window;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function now() { return typeof performance === "object" ? performance.now() : Date.now(); }

  // rAF로 묶어 실행하는 스크롤 핸들러
  function rafLoop(fn) {
    var queued = false;
    return function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        fn();
        queued = false;
      });
    };
  }

  function markReady() {
    if (root.classList.contains("is-ready")) return;
    root.classList.add("is-ready");
    document.dispatchEvent(new Event("m4ch77:ready"));
  }

  function whenReady(fn) {
    if (root.classList.contains("is-ready")) fn();
    else document.addEventListener("m4ch77:ready", fn, { once: true });
  }

  function observeOnce(els, cb, opts) {
    if (!els.length) return;
    if (!hasIO) { els.forEach(cb); return; }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cb(e.target);
        obs.unobserve(e.target);
      });
    }, opts || { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  }

  /* ══ 01b 언어 ══════════════════════════════════════════
     저장값이 있으면 그것, 없으면 navigator.languages 를 봅니다.
     한국어면 한국어, 그 밖의 모든 경우는 영어입니다.
     마크업은 한국어가 원본이고, 영어일 때만 data-en 값으로 바꿉니다.
     (data-en-html 은 제가 직접 쓴 정적 문자열만 들어갑니다.) */
  var LANG_KEY = "m4ch77-lang";

  var LANG = (function () {
    var saved = store(LANG_KEY);
    if (saved === "ko" || saved === "en") return saved;
    var list = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || "en"];
    for (var i = 0; i < list.length; i++) {
      if (/^ko\b/i.test(list[i])) return "ko";
    }
    return "en";
  })();

  var isEN = LANG === "en";

  function t(ko, en) { return isEN ? en : ko; }

  (function applyLang() {
    root.setAttribute("lang", LANG);
    root.setAttribute("data-lang", LANG);

    var badge = $("#lang-current");
    if (badge) badge.textContent = LANG.toUpperCase();

    var btn = $("#lang-toggle");
    if (btn) {
      btn.addEventListener("click", function () {
        store(LANG_KEY, isEN ? "ko" : "en");
        // 터미널 문구까지 한 번에 맞추려면 새로 그리는 편이 확실합니다.
        location.reload();
      });
    }

    if (!isEN) return;

    $$("[data-en]").forEach(function (el) {
      if (el.tagName === "META") el.setAttribute("content", el.getAttribute("data-en"));
      else el.textContent = el.getAttribute("data-en");
    });
    $$("[data-en-html]").forEach(function (el) {
      el.innerHTML = el.getAttribute("data-en-html");
    });
    $$("[data-en-label]").forEach(function (el) {
      el.setAttribute("aria-label", el.getAttribute("data-en-label"));
    });
    $$("[data-en-ph]").forEach(function (el) {
      el.setAttribute("placeholder", el.getAttribute("data-en-ph"));
    });
    $$("[data-cursor-label-en]").forEach(function (el) {
      el.setAttribute("data-cursor-label", el.getAttribute("data-cursor-label-en"));
    });
    $$("[data-section-en]").forEach(function (el) {
      el.setAttribute("data-section", el.getAttribute("data-section-en"));
    });
  })();

  /* ══ 02 테마 ═══════════════════════════════════════════ */
  var themeBtn = $("#theme-toggle");

  function theme() { return root.dataset.theme === "light" ? "light" : "dark"; }

  function setTheme(next, persist) {
    root.dataset.theme = next === "light" ? "light" : "dark";
    if (themeBtn) {
      themeBtn.setAttribute("aria-label", t(
        theme() === "dark" ? "밝은 반전으로" : "어두운 반전으로",
        theme() === "dark" ? "Switch to light" : "Switch to dark"
      ));
    }
    if (persist) store(THEME_KEY, theme());
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme() === "dark" ? "#0a0b0d" : "#f4f4f1");
  }

  setTheme(theme(), false);
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      setTheme(theme() === "dark" ? "light" : "dark", true);
    });
  }

  /* ══ 글자 굴리기 (로더 · 브랜드 · 닉네임이 함께 씁니다) ══ */
  var GLYPHS = "abcdefghijkmnopqrstuvwxyz0123456789#$%&*<>/\\|+=?!";
  var DECOYS = ["mach77", "MACH77", "mach-7", "m4ch__", "77hc4m", "0x4d37", "m@ch77"];

  function randGlyph() {
    return GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
  }

  // 슬롯머신처럼 굴리다 왼쪽부터 차례로 멈춥니다.
  function rollText(el, target, duration, onDone) {
    var n = target.length;
    var lock = [];
    for (var i = 0; i < n; i++) lock.push(0.32 + (i / n) * 0.62);

    var t0 = 0;
    function frame(t) {
      if (!t0) t0 = t;
      var p = clamp((t - t0) / duration, 0, 1);
      var s = "";
      for (var i = 0; i < n; i++) {
        if (p >= lock[i]) { s += target.charAt(i); continue; }
        if (p < 0.3) {
          // 초반에는 아예 다른 단어들이 스쳐 지나갑니다.
          var w = DECOYS[Math.floor(t / 80) % DECOYS.length];
          s += w.charAt(i) || randGlyph();
        } else {
          s += randGlyph();
        }
      }
      el.textContent = s;
      if (p < 1) requestAnimationFrame(frame);
      else {
        el.textContent = target;
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  /* ══ 03 인트로 로더 ════════════════════════════════════ */
  (function loader() {
    var el = $("#loader");
    // 로더가 없는 페이지(글 목록 · 글 본문)도 준비 신호는 보내야 합니다.
    // 이걸 빼면 whenReady 가 걸린 등장 애니메이션이 영원히 시작되지 않습니다.
    if (!el) { markReady(); return; }

    var skip = root.classList.contains("no-loader") || reduceMotion;
    if (skip) {
      el.remove();
      markReady();
      return;
    }

    var markEl = $("#loader-mark");
    var countEl = $("#loader-count");
    var fillEl = $("#loader-fill");
    var start = 0;
    var duration = 1100;

    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (markEl) markEl.textContent = BRAND;
      el.classList.add("is-done");
      markReady();
      try { sessionStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
      setTimeout(function () { el.remove(); }, 1000);
    }

    function frame(t) {
      if (!start) start = t;
      var p = clamp((t - start) / duration, 0, 1);
      var eased = 1 - Math.pow(1 - p, 3);

      if (markEl) {
        if (p < 0.55) {
          var w = DECOYS[Math.floor(t / 90) % DECOYS.length];
          var s = "";
          for (var i = 0; i < BRAND.length; i++) {
            s += Math.random() < 0.45 && w.charAt(i) ? w.charAt(i) : randGlyph();
          }
          markEl.textContent = s;
        } else {
          var ratio = (p - 0.55) / 0.45;
          var shown = Math.floor(ratio * BRAND.length);
          var out = "";
          for (var j = 0; j < BRAND.length; j++) {
            out += j < shown ? BRAND.charAt(j) : randGlyph();
          }
          markEl.textContent = out;
        }
      }
      if (countEl) countEl.textContent = pad2(Math.round(eased * 100));
      if (fillEl) fillEl.style.width = eased * 100 + "%";

      if (p < 1) requestAnimationFrame(frame);
      else setTimeout(finish, 200);
    }
    requestAnimationFrame(frame);

    el.addEventListener("click", finish);
    window.addEventListener("keydown", function once(e) {
      if (e.key === "Escape" || e.key === "Enter") {
        finish();
        window.removeEventListener("keydown", once);
      }
    });
  })();

  /* ══ 04 커스텀 커서 ═══════════════════════════════════ */
  (function cursor() {
    var el = $("#cursor");
    if (!el || !canHover || reduceMotion) { if (el) el.remove(); return; }

    var dot = $("#cursor-dot");
    var ring = $("#cursor-ring");
    var frame = $("#cursor-frame");
    var label = $("#cursor-label");

    var target = { x: innerWidth / 2, y: innerHeight / 2 };
    var quick = { x: target.x, y: target.y };
    var slow = { x: target.x, y: target.y };
    var on = false;
    var boxed = null;
    var held = false; // 드래그 중에는 테두리를 감춥니다

    var HOT = "a, button, summary, [data-cursor-label], .bcard, .til-item";
    var TEXT = "input:not([type=button]), textarea, [contenteditable=true]";
    var BOX = "[data-cursor-box]";

    window.addEventListener("pointermove", function (e) {
      target.x = e.clientX;
      target.y = e.clientY;
      if (!on) { on = true; el.classList.add("is-on"); }
      root.style.setProperty("--mx", e.clientX + "px");
      root.style.setProperty("--my", e.clientY + "px");
    }, { passive: true });

    document.addEventListener("pointerleave", function () {
      on = false;
      el.classList.remove("is-on");
    });

    window.addEventListener("blur", function () {
      el.classList.remove("is-down");
      held = false;
    });
    window.addEventListener("pointerdown", function () {
      el.classList.add("is-down");
      held = true;
    }, { passive: true });
    window.addEventListener("pointerup", function () {
      el.classList.remove("is-down");
      held = false;
    }, { passive: true });

    // 카드가 가로로 흘러가는 동안에도 어긋나지 않게 매 프레임 다시 잽니다.
    // (트랜지션을 걸면 따라오다 밀려 보이므로 CSS에서 뺐습니다.)
    function placeFrame() {
      if (!frame) return;
      if (!boxed || held) {
        frame.classList.remove("is-on");
        return;
      }
      var r = boxed.getBoundingClientRect();
      if (r.bottom < -40 || r.top > innerHeight + 40 || r.right < -40 || r.left > innerWidth + 40) {
        frame.classList.remove("is-on");
        return;
      }
      frame.classList.add("is-on");
      // 크기는 대상과 똑같이. 좌표만 정수로 맞춥니다.
      // (소수점에 걸리면 1px 선이 반 픽셀로 번져 윗변이 어긋나 보입니다)
      frame.style.width = Math.round(r.width) + "px";
      frame.style.height = Math.round(r.height) + "px";
      frame.style.borderRadius = getComputedStyle(boxed).borderTopLeftRadius || "12px";
      frame.style.transform = "translate3d(" +
        Math.round(r.left) + "px," + Math.round(r.top) + "px,0)";
    }

    function clearFrame() {
      boxed = null;
      if (frame) frame.classList.remove("is-on");
      el.classList.remove("is-framed");
    }

    (function tick() {
      quick.x += (target.x - quick.x) * 0.42;
      quick.y += (target.y - quick.y) * 0.42;
      slow.x += (target.x - slow.x) * 0.2;
      slow.y += (target.y - slow.y) * 0.2;

      var q = "translate3d(" + quick.x + "px," + quick.y + "px,0)";
      if (dot) dot.style.transform = q;
      if (label) label.style.transform = q;
      if (ring) ring.style.transform = "translate3d(" + slow.x + "px," + slow.y + "px,0)";
      if (boxed) placeFrame();
      requestAnimationFrame(tick);
    })();

    document.addEventListener("pointerover", function (e) {
      var node = e.target;
      if (!node || !node.closest) return;

      if (node.closest(TEXT)) el.classList.add("is-text");

      var box = node.closest(BOX);
      if (box && box !== boxed) {
        boxed = box;
        el.classList.add("is-framed");
        placeFrame();
      }

      if (node.closest(HOT)) el.classList.add("is-hot");

      var named = node.closest("[data-cursor-label]");
      if (label) {
        var txt = named ? (named.getAttribute("data-cursor-label") || "") : "";
        label.textContent = txt;
        label.classList.toggle("is-on", !!txt);
      }
    });

    document.addEventListener("pointerout", function (e) {
      var to = e.relatedTarget;
      var stillIn = function (sel) { return to && to.closest && to.closest(sel); };

      if (e.target.closest && e.target.closest(TEXT) && !stillIn(TEXT)) {
        el.classList.remove("is-text");
      }
      if (boxed && !stillIn(BOX)) clearFrame();
      if (e.target.closest && e.target.closest(HOT) && !stillIn(HOT)) {
        el.classList.remove("is-hot");
        if (label) { label.textContent = ""; label.classList.remove("is-on"); }
      }
    });

    // 캐러셀 같은 내부 스크롤러도 잡으려면 캡처 단계로 들어야 합니다.
    var reframe = rafLoop(placeFrame);
    document.addEventListener("scroll", reframe, true);
    window.addEventListener("resize", reframe, { passive: true });
  })();

  /* ══ 05 헤더 · 서피스 · 진행 · 점 내비 ═════════════════ */
  var header = $("#header");
  var progressBar = $("#progress-bar");
  var surfaceSections = $$("main [data-surface][data-section]");
  var navTargets = $$("[data-section][id]");
  var headerLinks = $$(".header-nav a[href^='#']");
  var footerEl = $(".footer");
  var dotnavEl = $("#dotnav");
  // 서피스를 따라가야 하는 고정 요소들 (색 토큰이 비면 브라우저 기본색으로 떨어집니다)
  var floatEls = [dotnavEl, $("#cursor-frame"), $("#cursor-label")].filter(Boolean);

  /* 페이지 안에서 무언가를 열거나 접어 레이아웃이 바뀔 때, 그로 인한
     몇 px 의 스크롤 변화까지 "위로 스크롤"로 읽혀 숨은 헤더가 튀어나옵니다.
     그 순간만 헤더 판단을 잠시 멈춥니다. */
  var headerQuiet = 0;
  function quietHeader(ms) { headerQuiet = now() + (ms || 800); }
  var dotLinks = [];
  var lastY = window.scrollY;

  (function buildDotnav() {
    if (!dotnavEl) return;
    navTargets.forEach(function (sec) {
      var a = document.createElement("a");
      a.href = "#" + sec.id;
      a.setAttribute("data-for", sec.id);

      var labelText = sec.getAttribute("data-section") || sec.id;
      var lab = document.createElement("span");
      lab.className = "dotnav-label";
      lab.textContent = labelText;

      var tick = document.createElement("span");
      tick.className = "dotnav-tick";

      a.appendChild(lab);
      a.appendChild(tick);
      a.setAttribute("aria-label", labelText + " 섹션으로");
      a.setAttribute("data-cursor-label", labelText);
      dotnavEl.appendChild(a);
      dotLinks.push(a);
    });
  })();

  function setActiveNav(id) {
    headerLinks.forEach(function (a) {
      if (a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    dotLinks.forEach(function (a) {
      if (a.getAttribute("data-for") === id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  var onScroll = rafLoop(function () {
    var y = window.scrollY || 0;

    if (header) {
      header.classList.toggle("is-stuck", y > 24);
      var quiet = now() < headerQuiet;
      if (y > 320 && y - lastY > 6) header.classList.add("is-hidden");
      else if ((y < lastY - 24 && !quiet) || y < 320) header.classList.remove("is-hidden");
    }

    if (progressBar) {
      var max = root.scrollHeight - window.innerHeight;
      progressBar.style.width = (max > 0 ? clamp(y / max, 0, 1) * 100 : 0).toFixed(2) + "%";
    }

    // 첫 화면에서는 터미널과 겹치므로 히어로를 지난 뒤에 보여줍니다.
    if (dotnavEl) dotnavEl.classList.toggle("is-on", y > window.innerHeight * 0.65);

    var line = header ? header.offsetHeight * 0.5 : 32;

    // 헤더 아래에 놓인 섹션의 서피스를 헤더가 따라갑니다.
    var current = surfaceSections[0];
    for (var i = 0; i < surfaceSections.length; i++) {
      var r = surfaceSections[i].getBoundingClientRect();
      if (r.top <= line && r.bottom > line) { current = surfaceSections[i]; break; }
    }
    if (current && header) header.dataset.surface = current.getAttribute("data-surface");

    // 화면에 떠 있는 요소들은 그 높이의 서피스를 따라갑니다.
    if (floatEls.length) {
      var mid = window.innerHeight / 2;
      var atMid = null;
      for (var m = 0; m < surfaceSections.length; m++) {
        var mr = surfaceSections[m].getBoundingClientRect();
        if (mr.top <= mid && mr.bottom > mid) { atMid = surfaceSections[m]; break; }
      }
      var surf = atMid
        ? atMid.getAttribute("data-surface")
        : (footerEl ? footerEl.getAttribute("data-surface") : "1");
      floatEls.forEach(function (fe) {
        if (fe.dataset.surface !== surf) fe.dataset.surface = surf;
      });
    }

    var activeId = navTargets.length ? navTargets[0].id : "";
    for (var j = 0; j < navTargets.length; j++) {
      if (navTargets[j].getBoundingClientRect().top - line - 8 <= 0) activeId = navTargets[j].id;
    }
    setActiveNav(activeId);

    lastY = y;
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();

  /* ══ 06 스플릿 · 리빌 ══════════════════════════════════
     data-split="words" 는 단어 단위, "chars" 는 글자 단위입니다.
     글자 단위일 때는 단어를 .wg 로 묶어 중간에서 줄이 바뀌지 않게 합니다. */
  (function splitAndReveal() {
    function mask(text, delay) {
      var outer = document.createElement("span");
      outer.className = "w";
      var inner = document.createElement("span");
      inner.className = "wi";
      inner.textContent = text;
      inner.style.setProperty("--d", delay + "ms");
      outer.appendChild(inner);
      return outer;
    }

    $$("[data-split]").forEach(function (el) {
      var chars = el.getAttribute("data-split") === "chars";
      var stepMs = chars ? 26 : 58;
      var i = 0;

      (function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (child) {
          if (child.nodeType === 3) {
            if (!child.nodeValue || !child.nodeValue.trim()) return;
            var frag = document.createDocumentFragment();
            child.nodeValue.split(/(\s+)/).forEach(function (part) {
              if (!part) return;
              if (/^\s+$/.test(part)) {
                frag.appendChild(document.createTextNode(" "));
                return;
              }
              if (chars) {
                var group = document.createElement("span");
                group.className = "wg";
                part.split("").forEach(function (ch) {
                  group.appendChild(mask(ch, i * stepMs));
                  i++;
                });
                frag.appendChild(group);
              } else {
                frag.appendChild(mask(part, i * stepMs));
                i++;
              }
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1 && child.tagName !== "BR") {
            // 따로 애니메이션이 붙는 요소는 건드리지 않습니다. (닉네임 잭팟)
            if (child.hasAttribute && child.hasAttribute("data-nosplit")) return;
            walk(child);
          }
        });
      })(el);
    });

    var items = $$("[data-reveal]");
    var seen = new Map();
    items.forEach(function (el) {
      var p = el.parentElement;
      var n = seen.get(p) || 0;
      seen.set(p, n + 1);
      // 형제 순서대로 지연. 전체 모션을 느리게 잡았으니 간격도 함께 늘립니다.
      el.style.setProperty("--d", Math.min(n, 8) * 90 + "ms");
    });

    whenReady(function () {
      observeOnce($$("[data-split]"), function (el) { el.classList.add("is-in"); },
        { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });
      observeOnce(items, function (el) { el.classList.add("is-in"); });
    });
  })();

  /* ══ 06b 브랜드 스크램블 (헤더) ════════════════════════ */
  (function brandScramble() {
    var el = $("[data-scramble]");
    if (!el) return;
    var target = el.getAttribute("data-scramble") || el.textContent;
    if (reduceMotion) { el.textContent = target; return; }

    var busy = false;
    function run(ms) {
      if (busy) return;
      busy = true;
      rollText(el, target, ms, function () { busy = false; });
    }

    whenReady(function () { run(680); });
    if (canHover) el.addEventListener("mouseenter", function () { run(420); });
  })();

  /* ══ 06c 닉네임 잭팟 ═══════════════════════════════════
     슬롯머신처럼 칸마다 따로 돌다가 왼쪽부터 하나씩 멈춥니다. */
  (function jackpot() {
    var el = $("[data-jackpot]");
    if (!el) return;
    var target = (el.getAttribute("data-jackpot") || el.textContent).trim();

    if (reduceMotion) { el.textContent = target; return; }

    // 글자마다 칸(릴)을 만듭니다.
    var cells = [];
    el.textContent = "";
    target.split("").forEach(function (ch) {
      var s = document.createElement("span");
      s.className = "jp-ch is-spin";
      s.setAttribute("data-final", ch);
      s.textContent = randGlyph();
      el.appendChild(s);
      cells.push(s);
    });

    var busy = false;

    function run(opts) {
      if (busy) return;
      busy = true;
      opts = opts || {};
      var lead = opts.lead || 420;   // 첫 칸이 멈추기까지
      var per = opts.per || 240;     // 칸 사이 간격
      var tickMs = opts.tick || 58;  // 글자가 바뀌는 속도

      var locked = 0;
      cells.forEach(function (c) { c.className = "jp-ch is-spin"; });

      var spin = setInterval(function () {
        for (var i = locked; i < cells.length; i++) cells[i].textContent = randGlyph();
      }, tickMs);

      cells.forEach(function (c, i) {
        setTimeout(function () {
          c.textContent = c.getAttribute("data-final");
          c.className = "jp-ch is-locked";
          locked = i + 1;
          if (locked >= cells.length) {
            clearInterval(spin);
            busy = false;
          }
        }, lead + i * per);
      });
    }

    whenReady(function () { setTimeout(function () { run(); }, 200); });
    if (canHover) el.addEventListener("mouseenter", function () { run({ lead: 240, per: 130, tick: 45 }); });
    el.addEventListener("click", function () { run(); });
  })();

  /* ══ 06d (없앰) 스크롤 속도에 반응하는 기울기 ════════════
     data-flow 로 스크롤 속도만큼 skewY 를 걸던 모듈이 여기 있었습니다.
     뺐습니다. 이유는 두 가지입니다.

       · 기울기가 "고급스럽게" 읽히는 폭이 아주 좁고, 대부분은 글자가
         출렁이는 렌더링 오류처럼 보입니다.
       · 매 프레임 transform 을 쓰는 비용이 있습니다.

     대신 섹션마다 다른 등장 모션을 넣었습니다. 전부 CSS 이고,
     [data-reveal] 의 값(wipe · slide · rise · draw · fill)으로 갈립니다.
     JS 는 기존처럼 .is-in 만 붙입니다. styles.css 3절을 보세요. */

  /* ══ 06e 이스터에그 ─ mach 버스트 ══════════════════════
     터미널의 숨은 명령어, 또는 코나미 코드로 실행됩니다. */
  (function warp() {
    var busy = false;

    function burst() {
      if (busy || reduceMotion) return;
      busy = true;
      root.classList.add("is-warp");

      var layer = document.createElement("div");
      layer.className = "warp";
      layer.setAttribute("aria-hidden", "true");

      for (var i = 0; i < 34; i++) {
        var line = document.createElement("span");
        line.className = "warp-line";
        line.style.width = (18 + Math.random() * 46).toFixed(1) + "vw";
        line.style.top = (Math.random() * 100).toFixed(2) + "%";
        line.style.height = (Math.random() < 0.25 ? 3 : 1.5) + "px";
        line.style.setProperty("--dur", (620 + Math.random() * 620).toFixed(0) + "ms");
        line.style.setProperty("--delay", (Math.random() * 900).toFixed(0) + "ms");
        layer.appendChild(line);
      }
      document.body.appendChild(layer);

      setTimeout(function () {
        root.classList.remove("is-warp");
        layer.remove();
        busy = false;
      }, 2300);
    }

    document.addEventListener("m4ch77:warp", burst);

    // 코나미 코드도 같은 것을 부릅니다.
    var seq = ["arrowup", "arrowup", "arrowdown", "arrowdown",
               "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
    var at = 0;
    window.addEventListener("keydown", function (e) {
      var k = (e.key || "").toLowerCase();
      if (k === seq[at]) {
        at++;
        if (at === seq.length) { at = 0; burst(); }
      } else {
        at = k === seq[0] ? 1 : 0;
      }
    });
  })();

  /* ══ 07 패럴랙스 ══════════════════════════════════════ */
  (function parallax() {
    var els = $$("[data-parallax]");
    if (!els.length || reduceMotion) return;

    var move = rafLoop(function () {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var factor = parseFloat(el.getAttribute("data-parallax")) || 0.1;
        var offset = (r.top + r.height / 2 - vh / 2) * factor;
        el.style.transform = "translateY(" + (-offset).toFixed(1) + "px)";
      });
    });
    window.addEventListener("scroll", move, { passive: true });
    window.addEventListener("resize", move, { passive: true });
    move();
  })();

  /* ══ 08 히어로 배경 격자 ═══════════════════════════════ */
  (function field() {
    var canvas = $("#bg-field");
    if (!canvas || typeof canvas.getContext !== "function") return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var hero = $(".hero");
    if (!hero) { canvas.remove(); return; }
    hero.appendChild(canvas);

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, gap = 34, cols = 0, rows = 0, ox = 0, oy = 0;
    var running = false, rafId = 0, visible = true;
    var pointer = { x: -9999, y: -9999 };
    var smooth = { x: -9999, y: -9999 };
    var rgb = "230, 232, 236";

    function readColor() {
      var v = getComputedStyle(hero).getPropertyValue("--fg-rgb").trim();
      if (v) rgb = v;
    }

    function resize() {
      var r = hero.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / gap) + 1;
      rows = Math.ceil(h / gap) + 1;
      ox = (w - (cols - 1) * gap) / 2;
      oy = (h - (rows - 1) * gap) / 2;
      readColor();
      draw(0, true);
    }

    var R = 190, R2 = R * R;

    function draw(time, staticOnly) {
      ctx.clearRect(0, 0, w, h);
      if (!staticOnly) {
        smooth.x += (pointer.x - smooth.x) * 0.11;
        smooth.y += (pointer.y - smooth.y) * 0.11;
      }
      var t = time * 0.0005;
      for (var i = 0; i < cols; i++) {
        var x = ox + i * gap;
        for (var j = 0; j < rows; j++) {
          var y = oy + j * gap;
          var a = 0.06;
          var s = 1.2;
          if (!staticOnly) {
            a += Math.sin(t + i * 0.3 + j * 0.22) * 0.022;
            var dx = x - smooth.x, dy = y - smooth.y;
            var d2 = dx * dx + dy * dy;
            if (d2 < R2) {
              var f = 1 - Math.sqrt(d2) / R;
              f *= f;
              a += f * 0.42;
              s += f * 1.9;
            }
          }
          if (a <= 0.01) continue;
          ctx.globalAlpha = a;
          ctx.fillStyle = "rgb(" + rgb + ")";
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
    }

    function loop(time) {
      draw(time, false);
      if (running) rafId = requestAnimationFrame(loop);
    }
    function start() {
      if (running || reduceMotion || !canHover || !visible) return;
      running = true;
      rafId = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    if (canHover && !reduceMotion) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
      }, { passive: true });
      hero.addEventListener("pointerleave", function () {
        pointer.x = -9999;
        pointer.y = -9999;
      });
    }

    var timer;
    window.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(resize, 150);
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });

    if (hasIO) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }, { threshold: 0 }).observe(hero);
    }

    new MutationObserver(function () {
      readColor();
      if (!running) draw(0, true);
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    resize();
    start();
  })();

  /* ══ 09 티커 ═══════════════════════════════════════════ */
  (function ticker() {
    var track = $("#ticker-track");
    if (!track) return;
    track.innerHTML = track.innerHTML + track.innerHTML;
    track.setAttribute("aria-hidden", "true");
  })();

  /* ══ 10 블로그 캐러셀 ══════════════════════════════════ */
  (function blogCarousel() {
    var track = $("#blog-track");
    if (!track) return;

    var cards = $$(".bcard", track);
    if (!cards.length) return;

    var prev = $("#blog-prev");
    var next = $("#blog-next");
    var fill = $("#blog-fill");
    var dotsWrap = $("#blog-dots");
    var curEl = $("#blog-current");
    var totalEl = $("#blog-total");

    function gapPx() {
      var n = parseFloat(getComputedStyle(track).columnGap);
      return isNaN(n) ? 16 : n;
    }
    function step() { return cards[0].getBoundingClientRect().width + gapPx(); }
    function maxScroll() { return Math.max(0, track.scrollWidth - track.clientWidth); }
    function index() {
      var s = step();
      return s ? clamp(Math.round(track.scrollLeft / s), 0, cards.length - 1) : 0;
    }

    // 지금 화면에 보이는 카드 수 (점 캡슐의 길이를 정합니다)
    function perView() {
      var s = step();
      if (!s) return 1;
      return clamp(Math.round((track.clientWidth + gapPx()) / s), 1, cards.length);
    }

    var dots = [];
    var thumb = null;
    if (dotsWrap) {
      cards.forEach(function (card, i) {
        var b = document.createElement("button");
        b.type = "button";
        var name = card.classList.contains("bcard-more")
          ? t("더보기 칸으로", "Go to the more card")
          : t(i + 1 + "번째 글로", "Go to post " + (i + 1));
        b.setAttribute("aria-label", name);
        b.addEventListener("click", function () { goTo(i); });
        dotsWrap.appendChild(b);
        dots.push(b);
      });
      // 보이는 카드들을 감싸며 늘어나는 캡슐
      thumb = document.createElement("span");
      thumb.className = "cd-thumb";
      dotsWrap.appendChild(thumb);
    }

    function placeThumb(first) {
      if (!thumb || !dots.length) return;
      var last = clamp(first + perView() - 1, first, dots.length - 1);
      var a = dots[first];
      var b = dots[last];
      thumb.style.transform = "translateX(" + a.offsetLeft + "px)";
      thumb.style.width = (b.offsetLeft + b.offsetWidth - a.offsetLeft) + "px";
    }

    function goTo(i) {
      track.scrollTo({
        left: clamp(i, 0, cards.length - 1) * step(),
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }

    var update = rafLoop(function () {
      var max = maxScroll();
      var i = index();
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max - 2;
      if (curEl) curEl.textContent = pad2(i + 1);
      if (totalEl) totalEl.textContent = pad2(cards.length);
      dots.forEach(function (d, n) {
        if (n === i) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
      placeThumb(i);
      if (fill) {
        var ratio = clamp(track.clientWidth / track.scrollWidth, 0.08, 1);
        var pos = max > 0 ? track.scrollLeft / max : 0;
        fill.style.width = ratio * 100 + "%";
        fill.style.transform = "translateX(" + pos * (100 / ratio - 100) + "%)";
      }
    });

    if (prev) prev.addEventListener("click", function () {
      track.scrollBy({ left: -step(), behavior: reduceMotion ? "auto" : "smooth" });
    });
    if (next) next.addEventListener("click", function () {
      track.scrollBy({ left: step(), behavior: reduceMotion ? "auto" : "smooth" });
    });

    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); track.scrollBy({ left: step(), behavior: "smooth" }); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); track.scrollBy({ left: -step(), behavior: "smooth" }); }
      else if (e.key === "Home") { e.preventDefault(); goTo(0); }
      else if (e.key === "End") { e.preventDefault(); goTo(cards.length - 1); }
    });

    /* 끌어서 넘기기

       손으로 미는 느낌을 내려면 브라우저가 기본으로 하는 두 가지를
       막아야 합니다. 둘 다 카드 안에 <a> 와 <img> 가 있어서 생깁니다.

         1. 네이티브 드래그 — 링크나 이미지를 잡으면 반투명 유령이 딸려
            나옵니다. dragstart 를 막습니다.
         2. 텍스트 선택 — 옆으로 끌면 제목과 본문이 파랗게 잡힙니다.
            끄는 동안만 선택을 끕니다.

       그리고 끌고 나서 손을 뗄 때 클릭이 따라 발생합니다. 그대로 두면
       카드가 열립니다. 예전에는 클릭 리스너를 하나 붙여 첫 클릭을
       삼키게 했는데, 클릭이 오지 않으면 그 리스너가 남아서 **다음에
       진짜로 누른 클릭**을 삼켰습니다. 이제는 시간으로 판단합니다. */
    if (canHover) {
      var dragging = false, moved = 0, x0 = 0, s0 = 0, pid = null;
      var suppressUntil = 0;

      // 네이티브 드래그(유령 이미지)를 막습니다.
      track.addEventListener("dragstart", function (e) { e.preventDefault(); });

      track.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 || e.pointerType !== "mouse") return;
        dragging = true;
        moved = 0;
        x0 = e.clientX;
        s0 = track.scrollLeft;
        pid = e.pointerId;
        try { track.setPointerCapture(pid); } catch (err) {}
      });

      track.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var dx = e.clientX - x0;
        if (Math.abs(dx) > 4 && !track.classList.contains("is-dragging")) {
          // 스냅과 선택을 끄는 것은 실제로 끌기 시작한 뒤에만 합니다.
          track.classList.add("is-dragging");
        }
        moved = Math.max(moved, Math.abs(dx));
        track.scrollLeft = s0 - dx;
      });

      var endDrag = function () {
        if (!dragging) return;
        dragging = false;
        track.classList.remove("is-dragging");
        if (pid !== null) {
          try { track.releasePointerCapture(pid); } catch (err) {}
          pid = null;
        }
        if (moved > 8) {
          // 손을 뗀 직후에 오는 클릭 한 번만 무시합니다.
          suppressUntil = now() + 250;
          goTo(index());
        }
      };
      track.addEventListener("pointerup", endDrag);
      track.addEventListener("pointercancel", endDrag);
      track.addEventListener("lostpointercapture", endDrag);

      // 리스너는 하나만 두고, 삼킬지 말지는 시각으로 정합니다.
      track.addEventListener("click", function (e) {
        if (now() >= suppressUntil) return;
        e.preventDefault();
        e.stopPropagation();
      }, true);
    }

    update();
  })();

  /* ══ 11 TIL ─ 잔디 · 숫자 · 날짜 ═══════════════════════
     기록은 HTML 의 data-til="YYYY-MM-DD" 하나만 보고 만듭니다. */
  (function til() {
    var items = $$("[data-til]");
    if (!items.length) return;

    var heat = $("#til-heat");
    var DOW = isEN
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["일", "월", "화", "수", "목", "금", "토"];

    function parse(s) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
      return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
    }
    function key(d) {
      return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }

    var counts = {};
    items.forEach(function (li) {
      var d = parse(li.getAttribute("data-til"));
      if (!d) return;
      var k = key(d);
      counts[k] = (counts[k] || 0) + 1;

      var timeEl = $(".til-date", li);
      if (timeEl && !timeEl.textContent.trim()) {
        timeEl.setAttribute("datetime", k);
        timeEl.textContent = pad2(d.getMonth() + 1) + "." + pad2(d.getDate()) + " " + DOW[d.getDay()];
      }
    });

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    /* ── 하루 고르기 ────────────────────────────────────
       기본은 최신순 전체 목록입니다. 기록이 있는 칸을 누르면
       그날 기록만 남고, 다시 누르거나 "전체 보기"로 풀립니다. */
    var pickBar = $("#til-filter");
    var fDate = $("#til-filter-date");
    var fCount = $("#til-filter-count");
    var fClear = $("#til-filter-clear");
    var picked = null;

    // 목록이 줄어들어도 섹션 높이가 변하지 않게 처음 높이를 잡아 둡니다.
    // (높이가 바뀌면 섹션이 다시 중앙 정렬되면서 화면이 밀립니다)
    var listEl = $("#til-list");
    function lockListHeight() {
      if (!listEl) return;
      listEl.style.minHeight = "";
      var h = listEl.getBoundingClientRect().height;
      if (h > 0) listEl.style.minHeight = Math.round(h) + "px";
    }
    whenReady(function () { requestAnimationFrame(lockListHeight); });
    window.addEventListener("resize", rafLoop(function () {
      if (!picked) lockListHeight();
    }), { passive: true });

    function applyPick(k) {
      picked = k || null;
      quietHeader(700); // 목록이 바뀌는 순간 헤더가 내려오지 않게

      items.forEach(function (li) {
        li.hidden = !!picked && li.getAttribute("data-til") !== picked;
      });

      $$("button.til-cell").forEach(function (b) {
        var on = !!picked && b.getAttribute("data-date") === picked;
        b.classList.toggle("is-sel", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });

      if (pickBar) {
        pickBar.hidden = !picked;
        if (picked) {
          if (fDate) {
            fDate.setAttribute("datetime", picked);
            fDate.textContent = picked.replace(/-/g, ".");
          }
          if (fCount) {
            var n = counts[picked] || 0;
            fCount.textContent = t("· 기록 " + n + "개", "· " + n + (n === 1 ? " note" : " notes"));
          }
        }
      }
    }

    if (fClear) fClear.addEventListener("click", function () { applyPick(null); });

    if (heat) {
      heat.setAttribute("role", "group");

      /* ── 칸 위 날짜 쪽지 ──────────────────────────────
         칸마다 data-tip 에 "며칠인지"를 넣어 두고, 포인터가 올라가면
         그 칸 위(자리가 없으면 아래)에 작게 띄웁니다. */
      var hWrap = heat.closest(".til-heat-wrap") || heat.parentNode;
      var tip = document.createElement("span");
      tip.className = "til-tip";
      tip.setAttribute("aria-hidden", "true"); // 읽어 줄 내용은 버튼의 aria-label 에 있습니다
      hWrap.appendChild(tip);

      function hideTip() { tip.classList.remove("is-on"); }

      function showTip(cell) {
        var txt = cell.getAttribute("data-tip");
        if (!txt) return;
        tip.textContent = txt;

        // 확대 애니메이션 중에 쪽지가 흔들리지 않도록 변형 전 자리로 계산합니다.
        var cx = cell.offsetLeft - heat.scrollLeft + cell.offsetWidth / 2;
        var cy = cell.offsetTop;
        var pad = 6;
        var half = tip.offsetWidth / 2;
        tip.style.left = Math.round(clamp(cx, half + pad, hWrap.clientWidth - half - pad)) + "px";

        // 기본은 칸 위. 화면 위쪽으로 잘릴 때만 칸 아래로 뒤집습니다.
        // (카드 위로 살짝 나가는 건 괜찮습니다. 아래로 뒤집으면 잔디를 덮습니다)
        var vTop = hWrap.getBoundingClientRect().top + cy;
        var below = vTop - tip.offsetHeight - 7 < 8;
        tip.classList.toggle("is-below", below);
        tip.style.top = Math.round(below ? cy + cell.offsetHeight : cy) + "px";

        tip.classList.add("is-on");
      }

      var tipTarget = function (e) {
        var n = e.target;
        return n && n.closest ? n.closest(".til-cell") : null;
      };
      heat.addEventListener("pointerover", function (e) {
        var cell = tipTarget(e);
        if (cell) showTip(cell);
      });
      heat.addEventListener("pointerout", function (e) {
        if (tipTarget(e)) hideTip();
      });
      heat.addEventListener("pointerleave", hideTip);
      heat.addEventListener("focusin", function (e) {
        var cell = tipTarget(e);
        if (cell) showTip(cell);
      });
      heat.addEventListener("focusout", hideTip);
      heat.addEventListener("scroll", hideTip, { passive: true });

      var WEEKS = 26;
      var end = new Date(today);
      end.setDate(end.getDate() + (6 - end.getDay())); // 이번 주 토요일
      var start = new Date(end);
      start.setDate(start.getDate() - (WEEKS * 7 - 1));

      // 하루 한 칸. 기록이 있는 날만 버튼으로 만들어 Tab 순서를 짧게 둡니다.
      var makeCell = function (day) {
        var k = key(day);
        var c = counts[k] || 0;
        var label = k.replace(/-/g, ".");
        var dayLabel = label + " " + DOW[day.getDay()];
        var cls = "til-cell";
        if (c) cls += " lv" + Math.min(3, c);
        if (day > today) cls += " is-future";

        var cell;
        if (c > 0) {
          cell = document.createElement("button");
          cell.type = "button";
          cell.setAttribute("data-date", k);
          cell.setAttribute("aria-pressed", "false");
          cell.setAttribute("aria-label", t(
            label + " 기록 " + c + "개만 보기",
            "Show only " + label + " (" + c + ")"
          ));
          cell.setAttribute("data-tip", t(
            dayLabel + " · 기록 " + c + "개",
            dayLabel + " · " + c + (c === 1 ? " note" : " notes")
          ));
          cell.addEventListener("click", function () {
            applyPick(picked === k ? null : k);
          });
        } else {
          cell = document.createElement("i");
          cell.setAttribute("aria-hidden", "true");
          cell.setAttribute("data-tip", dayLabel);
        }
        cell.className = cls;
        return cell;
      };

      var frag = document.createDocumentFragment();
      for (var w = 0; w < WEEKS; w++) {
        var col = document.createElement("div");
        col.className = "til-col";
        for (var d = 0; d < 7; d++) {
          var day = new Date(start);
          day.setDate(day.getDate() + w * 7 + d);
          col.appendChild(makeCell(day));
        }
        frag.appendChild(col);
      }
      heat.replaceChildren(frag);
      heat.scrollLeft = heat.scrollWidth; // 최근이 보이도록
    }

    // "이번 주"로 세면 일요일마다 0으로 떨어져 지표가 쓸모없어집니다.
    // 최근 7일(오늘 포함)로 셉니다.
    var since = new Date(today);
    since.setDate(since.getDate() - 6);

    var week = 0;
    Object.keys(counts).forEach(function (k) {
      var d = parse(k);
      if (d && d >= since) week += counts[k];
    });

    var streak = 0;
    var cur = new Date(today);
    if (!counts[key(cur)]) cur.setDate(cur.getDate() - 1); // 오늘 아직 안 썼으면 어제부터
    while (counts[key(cur)]) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }

    function num(sel, v) {
      var el = $(sel);
      if (!el) return;
      if (reduceMotion) { el.textContent = String(v); return; }
      var t0 = 0;
      requestAnimationFrame(function frame(t) {
        if (!t0) t0 = t;
        var p = clamp((t - t0) / 800, 0, 1);
        el.textContent = String(Math.round((1 - Math.pow(1 - p, 3)) * v));
        if (p < 1) requestAnimationFrame(frame);
      });
    }

    var fired = false;
    var run = function () {
      if (fired) return;
      fired = true;
      num("#til-total", items.length);
      num("#til-week", week);
      num("#til-streak", streak);
    };
    observeOnce([$("#til-total") || document.body], run, { threshold: 0.4 });
  })();

  /* ══ 11b 푸터 워드마크 ─ 내려올수록 벌어집니다 ═════════ */
  (function footerLife() {
    var mark = $("#footer-mark");
    var foot = $(".footer");
    if (!mark || !foot || reduceMotion) return;

    var run = rafLoop(function () {
      var r = foot.getBoundingClientRect();
      var p = clamp(1 - r.top / window.innerHeight, 0, 1);
      mark.style.letterSpacing = (-0.05 + p * 0.038).toFixed(4) + "em";
      mark.style.transform = "translateY(" + ((1 - p) * 16).toFixed(2) + "%)";
      mark.style.opacity = (0.3 + p * 0.7).toFixed(3);
    });

    window.addEventListener("scroll", run, { passive: true });
    window.addEventListener("resize", run, { passive: true });
    run();
  })();

  /* ══ 12 FAQ 아코디언 ═══════════════════════════════════ */
  (function faq() {
    function afterTransition(el, prop, ms, cb) {
      var settled = false;
      function settle() {
        if (settled) return;
        settled = true;
        el.removeEventListener("transitionend", onEnd);
        cb();
      }
      function onEnd(ev) {
        if (ev.target !== el || ev.propertyName !== prop) return;
        settle();
      }
      el.addEventListener("transitionend", onEnd);
      setTimeout(settle, ms + 120);
    }

    $$(".faq-item").forEach(function (item) {
      var summary = $("summary", item);
      var body = $(".faq-body", item);
      if (!summary || !body) return;
      if (reduceMotion) return;

      var animating = false;
      body.style.height = item.open ? "auto" : "0px";

      summary.addEventListener("click", function (e) {
        e.preventDefault();
        if (animating) return;
        animating = true;
        quietHeader(900); // 여닫는 동안 헤더가 내려오지 않게

        if (!item.open) {
          item.open = true;
          body.style.height = "0px";
          var target = body.scrollHeight;
          requestAnimationFrame(function () {
            body.style.transition = "height 420ms cubic-bezier(0.22,1,0.36,1)";
            body.style.height = target + "px";
          });
          afterTransition(body, "height", 420, function () {
            body.style.transition = "";
            body.style.height = "auto";
            animating = false;
          });
        } else {
          body.style.height = body.scrollHeight + "px";
          requestAnimationFrame(function () {
            body.style.transition = "height 320ms cubic-bezier(0.22,1,0.36,1)";
            body.style.height = "0px";
          });
          afterTransition(body, "height", 320, function () {
            body.style.transition = "";
            item.open = false;
            animating = false;
          });
        }
      });
    });
  })();

  /* ══ 12b 푸터 링크 스왑 ════════════════════════════════
     밑줄은 링크에 두고, 글자만 클립 안에서 굴립니다. */
  (function footerSwap() {
    $$("[data-swap]").forEach(function (a) {
      var text = a.getAttribute("data-swap") || a.textContent.trim();
      a.textContent = "";

      var clip = document.createElement("span");
      clip.className = "fl-clip";
      var inner = document.createElement("span");
      inner.className = "fl-in";

      var one = document.createElement("span");
      one.textContent = text;
      var two = document.createElement("span");
      two.className = "fl-alt";
      two.textContent = text;

      inner.appendChild(one);
      inner.appendChild(two);
      clip.appendChild(inner);
      a.appendChild(clip);
    });
  })();

  /* ══ 13 마그네틱 버튼 ══════════════════════════════════ */
  (function magnet() {
    if (!canHover || reduceMotion) return;
    $$("[data-magnet]").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * 0.14;
        var dy = (e.clientY - (r.top + r.height / 2)) * 0.22;
        el.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
      });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
    });
  })();

  /* ══ 14 목적지 · 섹션 데이터 ═══════════════════════════ */
  var destinations = (function () {
    var node = $("#destinations");
    if (node) {
      try {
        var list = JSON.parse(node.textContent);
        if (Array.isArray(list)) return list;
      } catch (e) {}
    }
    return [];
  })();

  function destLabel(d) { return (isEN && d.label_en) ? d.label_en : d.label; }
  function destDesc(d) { return (isEN && d.desc_en) ? d.desc_en : d.desc; }

  var pageSections = navTargets.map(function (node) {
    return {
      id: node.id,
      label: node.getAttribute("data-section") || node.id,
      node: node,
    };
  });

  function goToSection(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    // 이동하는 동안에는 스크롤 정렬이 끼어들지 않게 알립니다.
    document.dispatchEvent(new Event("m4ch77:jump"));
    try {
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    } catch (e) {
      if (typeof el.scrollIntoView === "function") el.scrollIntoView();
    }
    return true;
  }

  function openDestination(dest, forceTab) {
    if (!dest) return "none";
    if (dest.status === "soon") return "soon";
    if (/^mailto:/.test(dest.url) && !forceTab) {
      window.location.href = dest.url;
      return "mail";
    }
    var win = window.open(dest.url, "_blank", "noopener");
    return win ? "opened" : "blocked";
  }

  function focusTerminal() {
    goToSection("top");
    var ti = $("#term-input");
    if (!ti) return;
    setTimeout(function () {
      try { ti.focus({ preventScroll: true }); } catch (e) { ti.focus(); }
    }, reduceMotion ? 0 : 500);
  }

  var heroTermBtn = $("#hero-term-focus");
  if (heroTermBtn) heroTermBtn.addEventListener("click", focusTerminal);

  /* ══ 15 빠른 이동 ══════════════════════════════════════ */
  var palette = (function () {
    var wrap = $("#palette");
    if (!wrap) return { open: function () {}, isOpen: function () { return false; } };

    var input = $("#palette-input");
    var list = $("#palette-list");
    var scrim = $("#palette-scrim");
    var closeBtn = $("#palette-close");
    var openBtn = $("#palette-open");
    var countEl = $("#palette-count");

    var entries = [];

    pageSections.forEach(function (s) {
      entries.push({
        key: "sec:" + s.id,
        group: t("섹션", "Sections"),
        icon: "§",
        name: s.label,
        hint: "#" + s.id,
        run: function () { goToSection(s.id); },
      });
    });

    destinations.forEach(function (d) {
      var soon = d.status === "soon";
      entries.push({
        key: "dest:" + d.id,
        group: t("링크", "Links"),
        icon: soon ? "…" : "↗",
        name: destLabel(d),
        hint: (soon ? t("준비 중 · ", "soon · ") : "") +
          d.url.replace(/^https?:\/\//, "").replace(/^mailto:/, "").replace(/^www\./, ""),
        run: function (alt) { openDestination(d, alt); },
      });
    });

    [
      { name: t("테마 반전", "Toggle theme"), hint: "dark / light", icon: "◐", run: function () { setTheme(theme() === "dark" ? "light" : "dark", true); } },
      { name: t("터미널에 커서 두기", "Focus the terminal"), hint: t("첫 화면 오른쪽", "right of the first screen"), icon: "$", run: focusTerminal },
      { name: t("맨 위로", "Back to top"), hint: "#top", icon: "↑", run: function () { goToSection("top"); } },
      { name: t("메일 쓰기", "Write an email"), hint: "m4ch77@gmail.com", icon: "@", run: function () { window.location.href = "mailto:m4ch77@gmail.com"; } },
      { name: t("언어 바꾸기", "Change language"), hint: isEN ? "EN → KO" : "KO → EN", icon: "文", run: function () {
        store(LANG_KEY, isEN ? "ko" : "en");
        location.reload();
      } },
    ].forEach(function (a, i) {
      entries.push({ key: "act:" + i, group: t("동작", "Actions"), icon: a.icon, name: a.name, hint: a.hint, run: a.run });
    });

    var byKey = {};
    entries.forEach(function (e) { byKey[e.key] = e; });

    function fuzzy(text, q) {
      var t = text.toLowerCase();
      var score = 0;
      var pos = [];
      var ti = 0;
      var streak = 0;
      for (var qi = 0; qi < q.length; qi++) {
        var c = q[qi];
        var found = -1;
        while (ti < t.length) {
          if (t[ti] === c) { found = ti; break; }
          ti++;
        }
        if (found === -1) return null;
        pos.push(found);
        var atStart = found === 0 || /[\s\-_.#/@]/.test(t[found - 1]);
        score += 10 + (atStart ? 12 : 0) + streak * 6;
        streak = qi > 0 && pos[qi - 1] === found - 1 ? streak + 1 : 0;
        ti = found + 1;
      }
      score -= pos[0] * 0.6;
      score -= (t.length - q.length) * 0.12;
      return { score: score, pos: pos };
    }

    function search(q) {
      var s = q.trim().toLowerCase();
      if (!s) return entries.map(function (e) { return { e: e, pos: null, score: 0 }; });

      var out = [];
      entries.forEach(function (e) {
        var onName = fuzzy(e.name, s);
        var onHint = fuzzy(e.hint, s);
        var onGroup = fuzzy(e.group, s);
        var best = null;
        var pos = null;
        if (onName) { best = onName.score + 30; pos = onName.pos; }
        if (onHint && onHint.score + 6 > (best === null ? -1e9 : best)) {
          best = onHint.score + 6;
          if (!onName) pos = null;
        }
        if (onGroup && onGroup.score - 10 > (best === null ? -1e9 : best)) best = onGroup.score - 10;
        if (best === null) return;
        out.push({ e: e, pos: pos, score: best });
      });
      out.sort(function (a, b) { return b.score - a.score; });
      return out;
    }

    function recents() {
      var raw = store(RECENT_KEY);
      if (!raw) return [];
      return raw.split(",").map(function (k) { return byKey[k]; }).filter(Boolean).slice(0, 4);
    }
    function remember(item) {
      if (!item) return;
      var keys = [item.key].concat(recents().map(function (e) { return e.key; }))
        .filter(function (k, i, arr) { return arr.indexOf(k) === i; })
        .slice(0, 4);
      store(RECENT_KEY, keys.join(","));
    }

    var flat = [];
    var active = 0;
    var lastFocus = null;
    var query = "";

    function highlight(name, pos) {
      var frag = document.createDocumentFragment();
      if (!pos || !pos.length) {
        frag.appendChild(document.createTextNode(name));
        return frag;
      }
      var set = {};
      pos.forEach(function (p) { set[p] = true; });
      var buf = "";
      var mode = false;
      function flush() {
        if (!buf) return;
        if (mode) {
          var m = document.createElement("mark");
          m.textContent = buf;
          frag.appendChild(m);
        } else {
          frag.appendChild(document.createTextNode(buf));
        }
        buf = "";
      }
      for (var i = 0; i < name.length; i++) {
        var hit = !!set[i];
        if (hit !== mode) { flush(); mode = hit; }
        buf += name[i];
      }
      flush();
      return frag;
    }

    function row(item, pos, idx) {
      var li = document.createElement("li");
      li.className = "palette-item";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", idx === active ? "true" : "false");
      li.id = "palette-opt-" + idx;

      var icon = document.createElement("span");
      icon.className = "pi-icon";
      icon.textContent = item.icon || "·";

      var body = document.createElement("span");
      body.className = "pi-body";
      var name = document.createElement("span");
      name.className = "pi-name";
      name.appendChild(highlight(item.name, pos));
      var hint = document.createElement("span");
      hint.className = "pi-hint";
      hint.textContent = item.hint;
      body.appendChild(name);
      body.appendChild(hint);

      var go = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      go.setAttribute("class", "pi-go");
      go.setAttribute("viewBox", "0 0 16 16");
      go.setAttribute("aria-hidden", "true");
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M3 8h9M8.5 4.5 12 8l-3.5 3.5");
      go.appendChild(p);

      li.appendChild(icon);
      li.appendChild(body);
      li.appendChild(go);

      li.addEventListener("click", function (e) { choose(idx, e.altKey); });
      li.addEventListener("pointerenter", function () { active = idx; sync(); });
      return li;
    }

    function groupHead(text) {
      var li = document.createElement("li");
      li.className = "palette-group";
      li.setAttribute("role", "presentation");
      li.textContent = text;
      return li;
    }

    function render() {
      var results = search(query);
      list.replaceChildren();
      flat = [];

      if (countEl) countEl.textContent = results.length ? results.length + t("개", "") : "";

      if (!results.length) {
        var p = document.createElement("li");
        p.className = "palette-empty";
        p.textContent = t("찾는 게 없네요.", "Nothing here.");
        var s = document.createElement("span");
        s.textContent = t(
          "섹션 이름, 사이트 이름, 또는 theme 처럼 입력해 보세요.",
          "Try a section name, a site name, or something like theme."
        );
        p.appendChild(s);
        list.appendChild(p);
        if (input) input.setAttribute("aria-activedescendant", "");
        return;
      }

      if (!query.trim()) {
        var rec = recents();
        if (rec.length) {
          list.appendChild(groupHead(t("최근", "Recent")));
          rec.forEach(function (e) {
            var idx = flat.length;
            flat.push({ item: e, pos: null });
            list.appendChild(row(e, null, idx));
          });
        }
        [t("섹션", "Sections"), t("링크", "Links"), t("동작", "Actions")].forEach(function (g) {
          var inGroup = results.filter(function (r) { return r.e.group === g; });
          if (!inGroup.length) return;
          list.appendChild(groupHead(g));
          inGroup.forEach(function (r) {
            var idx = flat.length;
            flat.push({ item: r.e, pos: null });
            list.appendChild(row(r.e, null, idx));
          });
        });
      } else {
        results.forEach(function (r) {
          var idx = flat.length;
          flat.push({ item: r.e, pos: r.pos });
          list.appendChild(row(r.e, r.pos, idx));
        });
      }

      active = clamp(active, 0, flat.length - 1);
      sync();
    }

    function sync() {
      var rows = $$(".palette-item", list);
      rows.forEach(function (li, idx) {
        li.setAttribute("aria-selected", idx === active ? "true" : "false");
      });
      var el = rows[active];
      if (input) input.setAttribute("aria-activedescendant", el ? el.id : "");
      if (el && typeof el.scrollIntoView === "function") {
        try { el.scrollIntoView({ block: "nearest" }); } catch (e) {}
      }
    }

    function move(delta) {
      if (!flat.length) return;
      active = (active + delta + flat.length) % flat.length;
      sync();
    }

    function choose(idx, alt) {
      var hit = flat[typeof idx === "number" ? idx : active];
      if (!hit) return;
      close();
      remember(hit.item);
      hit.item.run(!!alt);
    }

    function open() {
      lastFocus = document.activeElement;
      wrap.hidden = false;
      requestAnimationFrame(function () { wrap.classList.add("is-open"); });
      query = "";
      active = 0;
      if (input) { input.value = ""; input.focus(); }
      render();
    }

    function close() {
      wrap.classList.remove("is-open");
      var done = function () { wrap.hidden = true; };
      if (reduceMotion) done();
      else setTimeout(done, 220);
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    function isOpen() { return !wrap.hidden; }

    if (input) {
      input.addEventListener("input", function () {
        query = input.value;
        active = 0;
        render();
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
        else if (e.key === "PageDown") { e.preventDefault(); move(5); }
        else if (e.key === "PageUp") { e.preventDefault(); move(-5); }
        else if (e.key === "Home") { e.preventDefault(); active = 0; sync(); }
        else if (e.key === "End") { e.preventDefault(); active = flat.length - 1; sync(); }
        else if (e.key === "Enter") { e.preventDefault(); choose(undefined, e.altKey); }
        else if (e.key === "Escape") { e.preventDefault(); close(); }
        else if (e.key === "Tab" && !e.shiftKey && closeBtn) { e.preventDefault(); closeBtn.focus(); }
        else if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("keydown", function (e) {
        if (e.key === "Tab") {
          e.preventDefault();
          if (input) input.focus();
        }
      });
      closeBtn.addEventListener("click", close);
    }
    if (scrim) scrim.addEventListener("click", close);
    if (openBtn) openBtn.addEventListener("click", open);

    window.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || "");
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        isOpen() ? close() : open();
      } else if (e.key === "Escape" && isOpen()) {
        close();
      } else if (e.key === "/" && !isOpen() && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        open();
      }
    });

    return { open: open, close: close, isOpen: isOpen };
  })();

  /* ══ 16 터미널 ═════════════════════════════════════════ */
  (function terminal() {
    var screen = $("#term-screen");
    var out = $("#term-out");
    var form = $("#term-form");
    var input = $("#term-input");
    var clearBtn = $("#term-clear");
    if (!screen || !out || !form || !input) return;

    /* 터미널 문구는 출력 직전에 한 번 걸러 번역합니다.
       (한국어 원문을 키로 씁니다. 없으면 그대로 내보냅니다.) */
    var EN = {
      "명령어 목록": "list commands",
      "간단한 소개": "about me",
      "지금 접속한 사람": "who is here",
      "학력": "education",
      "약력": "career",
      "발표 · 수상 · CTF": "talks, awards, CTF",
      "글 목록": "posts",
      "매일의 기록": "daily notes",
      "이 페이지의 구성": "sections of this page",
      "섹션으로 스크롤 (예: go blog)": "scroll to a section (e.g. go blog)",
      "이어지는 사이트와 링크": "sites and links",
      "링크 열기 (예: open github)": "open a link (e.g. open github)",
      "open 과 동일": "same as open",
      "연락 방법": "how to reach me",
      "보안 신고 방법": "how to report security issues",
      "빠른 이동 열기 (⌘K)": "open jump to (⌘K)",
      "테마 반전": "flip the theme",
      "현재 시간 (서울)": "current time (Seoul)",
      "그대로 출력": "print as is",
      "명령어 기록": "command history",
      "시작 화면 다시 보기": "show the intro again",
      "화면 지우기": "clear the screen",
      "권한 상승": "escalate privileges",
      "종료": "exit",
      "go <섹션>": "go <section>",
      "go <이름>": "go <name>",
      "open <이름>": "open <name>",
      "echo <문자열>": "echo <text>",
      "사용 가능한 명령어": "available commands",
      "  자동완성": "  complete",
      "  이전 명령어": "  previous command",
      "  화면 지우기": "  clear the screen",
      "  같은 목록을 빠른 이동으로": "  same list in jump to",
      "여기 없는 명령어가 하나 더 있습니다. 힌트는 닉네임.":
        "There is one more command not listed here. The hint is the nickname.",
      " — 개인 허브": " — personal hub",
      "만드는 걸 좋아합니다. 고려대학교를 나왔습니다.":
        "I like making things. Korea University alum.",
      "이 사이트는 다른 곳들로 가는 입구 역할을 합니다.":
        "This site is the door to the other places.",
      " 로 갈 곳을, ": " lists where to go, ",
      " 로 이 페이지의 구성을 볼 수 있습니다.": " shows how this page is built.",
      " — 반갑습니다.": " — good to see you.",
      "고려대학교": "Korea University",
      "아직 없습니다.": "nothing yet.",
      " 으로 이동합니다.": " to move.",
      " 으로 이동할 수 있습니다.": " to jump there.",
      "사용법: ": "usage: ",
      " 로 목록 확인": " lists them",
      "이동: ": "moved: ",
      "가능한 이름: ": "names: ",
      " 로 확인하세요.": " to check.",
      "여는 중: ": "opening: ",
      "팝업이 막혔습니다. 위 링크를 눌러 주세요.": "The popup was blocked. Use the link above.",
      "메일이 가장 확실합니다. 보통 24시간 내에 답합니다.":
        "Email is surest. I usually reply within a day.",
      "보안 이슈는 메일로 알려주세요. 공개 전에 먼저 연락 주시면 감사합니다.":
        "Please email me about security issues. I appreciate hearing from you before it goes public.",
      "빠른 이동을 열었습니다.": "Opened jump to.",
      "테마: ": "theme: ",
      "기록이 없습니다.": "no history yet.",
      "준비 중": "coming soon",
      "  준비 중": "  coming soon",
      " 는 아직 준비 중입니다.": " is not open yet.",
      " 는 곧 열립니다.": " opens soon.",
      "visitor 는 sudoers 파일에 없습니다. 이 시도는 기록됩니다.":
        "visitor is not in the sudoers file. This incident will be reported.",
      "…농담입니다. 아무것도 기록하지 않습니다.": "…just kidding. Nothing is logged.",
      "여기서는 나갈 수 없습니다. 대신 ": "You cannot leave from here. Try ",
      " 를 해보세요.": " instead.",
      " 를 입력하면 목록을 볼 수 있습니다.": " lists everything.",
      "만드는 걸 좋아하는 사람. 고려대학교 졸업.":
        "Someone who likes making things. Korea University graduate.",
      " 로 시작하세요.": " to start.",
      "소리보다 빠르게. 화면을 보세요.": "Faster than sound. Watch the screen.",
      " 로도 됩니다.)": " works too.)",
      "연속 ": "streak ",
      "이번 주 ": "last 7 days ",
      "전체 ": "total ",
      "일": "d",
      "개": "",
      "' 섹션이 없습니다.": "' is not a section.",
      "' 은(는) 없는 이름입니다. ": "' is not a name here. ",
    };

    function tr(s) {
      if (!isEN || typeof s !== "string") return s;
      return EN[s] !== undefined ? EN[s] : s;
    }

    function span(text, cls) {
      var s = document.createElement("span");
      if (cls) s.className = cls;
      s.textContent = tr(text);
      return s;
    }

    function lineNode(spec) {
      var div = document.createElement("div");
      div.className = "term-res";
      if (typeof spec === "string") {
        div.appendChild(document.createTextNode(tr(spec)));
        return div;
      }
      spec.forEach(function (seg) {
        if (seg && seg.link) {
          var a = document.createElement("a");
          a.href = seg.link;
          a.textContent = tr(seg.text);
          if (/^https?:/.test(seg.link)) { a.target = "_blank"; a.rel = "noopener"; }
          div.appendChild(a);
        } else if (Array.isArray(seg)) {
          div.appendChild(span(seg[0], seg[1]));
        } else {
          div.appendChild(document.createTextNode(tr(String(seg))));
        }
      });
      return div;
    }

    function toBottom() { screen.scrollTop = screen.scrollHeight; }

    function print(lines, opts) {
      opts = opts || {};
      var block = document.createElement("div");
      block.className = "term-block";
      out.appendChild(block);
      var list = Array.isArray(lines) ? lines : [lines];

      if (reduceMotion || !opts.stagger) {
        list.forEach(function (l) { block.appendChild(lineNode(l)); });
        toBottom();
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        var i = 0;
        (function nextLine() {
          if (i >= list.length) { resolve(); return; }
          var node = lineNode(list[i]);
          node.style.opacity = "0";
          block.appendChild(node);
          requestAnimationFrame(function () {
            node.style.transition = "opacity 180ms ease";
            node.style.opacity = "1";
          });
          i++;
          toBottom();
          setTimeout(nextLine, 65);
        })();
      });
    }

    function echo(cmd) {
      var div = document.createElement("div");
      div.className = "term-echo";
      div.appendChild(span("visitor@m4ch77:~$", "p"));
      div.appendChild(document.createTextNode(" " + cmd));
      out.appendChild(div);
      toBottom();
    }

    function pad(s, n) {
      s = String(s);
      while (s.length < n) s += " ";
      return s;
    }

    var commands = {};
    function define(name, meta) { commands[name] = meta; }

    define("help", {
      desc: "명령어 목록",
      run: function () {
        var rows = [[["사용 가능한 명령어", "hl"]], ""];
        Object.keys(commands).filter(function (k) { return !commands[k].hidden; }).sort()
          .forEach(function (k) {
            // 번역 후에 자리를 맞춰야 열이 흐트러지지 않습니다.
            rows.push([["  " + pad(tr(commands[k].usage || k), 20), "key"], [commands[k].desc, ""]]);
          });
        rows.push("");
        rows.push([["  Tab", "mut"], ["  자동완성", "mut"]]);
        rows.push([["  ↑ ↓", "mut"], ["  이전 명령어", "mut"]]);
        rows.push([["  Ctrl+L", "mut"], ["  화면 지우기", "mut"]]);
        rows.push([["  ⌘K", "mut"], ["  같은 목록을 빠른 이동으로", "mut"]]);
        rows.push("");
        rows.push([["여기 없는 명령어가 하나 더 있습니다. 힌트는 닉네임.", "mut"]]);
        return print(rows);
      },
    });

    define("about", {
      desc: "간단한 소개",
      run: function () {
        return print([
          [["m4ch77", "hl"], [" — 개인 허브", "mut"]],
          "",
          "만드는 걸 좋아합니다. 고려대학교를 나왔습니다.",
          "이 사이트는 다른 곳들로 가는 입구 역할을 합니다.",
          "",
          [["ls", "key"], [" 로 갈 곳을, ", ""], ["sections", "key"], [" 로 이 페이지의 구성을 볼 수 있습니다.", ""]],
        ]);
      },
    });

    define("whoami", { desc: "지금 접속한 사람", run: function () {
      return print([[["visitor", "hl"], [" — 반갑습니다.", "mut"]]]);
    } });

    define("edu", { desc: "학력", run: function () {
      return print([[["고려대학교", "hl"], ["  Korea University", "mut"]]]);
    } });

    define("timeline", { desc: "약력", run: function () {
      goToSection("timeline");
      var rows = [];
      $$(".timeline li").forEach(function (li) {
        rows.push([
          [pad(($(".tl-year", li) || {}).textContent || "", 7), "key"],
          [pad(($(".tl-title", li) || {}).textContent || "", 24), "hl"],
          [($(".tl-desc", li) || {}).textContent || "", "mut"],
        ]);
      });
      return print(rows.length ? rows : [[["아직 없습니다.", "mut"]]]);
    } });

    define("log", { desc: "발표 · 수상 · CTF", run: function () {
      goToSection("timeline");
      var rows = [];
      $$(".log-list li").forEach(function (li) {
        rows.push([
          [pad(($(".log-kind", li) || {}).textContent || "", 6), "key"],
          [pad(($(".log-title", li) || {}).textContent || "", 24), "hl"],
          [($(".log-when", li) || {}).textContent || "", "mut"],
        ]);
      });
      return print(rows.length ? rows : [[["아직 없습니다.", "mut"]]]);
    } });

    define("blog", { desc: "글 목록", run: function () {
      goToSection("blog");
      var rows = [];
      $$(".bcard").forEach(function (card, i) {
        rows.push([
          [pad(pad2(i + 1), 5), "mut"],
          [pad(($(".bcard-date", card) || {}).textContent || "", 13), "mut"],
          [($(".bcard-title", card) || {}).textContent || "", "hl"],
        ]);
      });
      rows.push("");
      rows.push([["blog.m4ch77.com", "hl"], ["  준비 중", "warn"]]);
      return print(rows);
    } });

    define("til", { desc: "매일의 기록", run: function () {
      goToSection("til");
      var readN = function (sel) { return (($(sel) || {}).textContent || "0"); };
      var rows = [[
        ["연속 ", "key"], [readN("#til-streak"), "hl"], ["일", "mut"], ["    ", ""],
        ["이번 주 ", "key"], [readN("#til-week"), "hl"], ["개", "mut"], ["    ", ""],
        ["전체 ", "key"], [readN("#til-total"), "hl"], ["개", "mut"],
      ], ""];
      $$(".til-item").forEach(function (li) {
        rows.push([
          [pad(($(".til-date", li) || {}).textContent || "", 10), "key"],
          [pad(($(".til-tag", li) || {}).textContent || "", 8), "hl"],
          [($(".til-text", li) || {}).textContent || "", "mut"],
        ]);
      });
      return print(rows);
    } });

    define("sections", { desc: "이 페이지의 구성", run: function () {
      var rows = [[["total " + pageSections.length, "mut"]]];
      pageSections.forEach(function (s, i) {
        rows.push([
          [pad(pad2(i + 1), 5), "mut"],
          [pad(s.label, 12), "hl"],
          ["#" + s.id, "key"],
        ]);
      });
      rows.push("");
      rows.push([["go <이름>", "key"], [" 으로 이동합니다.", "mut"]]);
      return print(rows);
    } });

    define("go", {
      usage: "go <섹션>",
      desc: "섹션으로 스크롤 (예: go blog)",
      run: function (args) {
        var q = (args[0] || "").toLowerCase();
        if (!q) return print([[["사용법: ", "mut"], ["go <섹션>", "key"], ["  ", ""], ["sections", "key"], [" 로 목록 확인", "mut"]]]);
        var hit = pageSections.filter(function (s) {
          return s.id === q || s.label.toLowerCase() === q;
        })[0];
        if (!hit) return print([[["'" + q, "err"], ["' 섹션이 없습니다.", "err"]]]);
        goToSection(hit.id);
        return print([[["이동: ", "mut"], [hit.label, "hl"], ["  #" + hit.id, "mut"]]]);
      },
    });

    define("ls", {
      desc: "이어지는 사이트와 링크",
      run: function () {
        var rows = [[["total " + destinations.length, "mut"]]];
        destinations.forEach(function (d) {
          var host = d.url.replace(/^https?:\/\//, "").replace(/^mailto:/, "").replace(/^www\./, "");
          rows.push([
            [pad(d.id, 10), "key"],
            [pad(host, 26), "hl"],
            [d.status === "soon" ? "준비 중" : destDesc(d), "mut"],
          ]);
        });
        rows.push("");
        rows.push([["open <이름>", "key"], [" 으로 이동할 수 있습니다.", "mut"]]);
        return print(rows);
      },
    });

    define("open", {
      usage: "open <이름>",
      desc: "링크 열기 (예: open github)",
      run: function (args) {
        var name = (args[0] || "").toLowerCase();
        if (!name) {
          return print([
            [["사용법: ", "mut"], ["open <이름>", "key"]],
            [["가능한 이름: ", "mut"], [destinations.map(function (d) { return d.id; }).join(", "), "hl"]],
          ]);
        }
        var dest = destinations.filter(function (d) {
          return d.id === name || (d.label || "").toLowerCase() === name;
        })[0];
        if (!dest) {
          return print([[
            ["'" + name, "err"], ["' 은(는) 없는 이름입니다. ", "err"],
            ["ls", "key"], [" 로 확인하세요.", "mut"],
          ]]);
        }

        var result = openDestination(dest);
        if (result === "soon") {
          return print([
            [[destLabel(dest), "warn"], [" 는 아직 준비 중입니다.", "warn"]],
            [[dest.url.replace(/^https?:\/\//, ""), "mut"], [" 는 곧 열립니다.", "mut"]],
          ]);
        }
        print([[["여는 중: ", "mut"], { text: dest.url, link: dest.url }]]);
        if (result === "blocked") print([[["팝업이 막혔습니다. 위 링크를 눌러 주세요.", "warn"]]]);
        return Promise.resolve();
      },
    });

    define("goto", { hidden: true, desc: "open 과 동일", run: function (a) { return commands.open.run(a); } });

    define("contact", { desc: "연락 방법", run: function () {
      goToSection("contact");
      return print([
        [["메일이 가장 확실합니다. 보통 24시간 내에 답합니다.", ""]],
        [["  "], { text: "m4ch77@gmail.com", link: "mailto:m4ch77@gmail.com" }],
      ]);
    } });

    define("security", { desc: "보안 신고 방법", run: function () {
      return print([
        [["보안 이슈는 메일로 알려주세요. 공개 전에 먼저 연락 주시면 감사합니다.", ""]],
        [["  "], { text: "m4ch77@gmail.com", link: "mailto:m4ch77@gmail.com" }],
      ]);
    } });

    define("palette", { desc: "빠른 이동 열기 (⌘K)", run: function () {
      palette.open();
      return print([[["빠른 이동을 열었습니다.", "mut"]]]);
    } });

    define("theme", {
      usage: "theme [dark|light]",
      desc: "테마 반전",
      run: function (args) {
        var v = (args[0] || "").toLowerCase();
        if (v !== "dark" && v !== "light") v = theme() === "dark" ? "light" : "dark";
        setTheme(v, true);
        return print([[["테마: ", "mut"], [v, "hl"]]]);
      },
    });

    define("date", { desc: "현재 시간 (서울)", run: function () {
      var s;
      try { s = new Date().toLocaleString(isEN ? "en-GB" : "ko-KR", { timeZone: "Asia/Seoul", hour12: false }); }
      catch (e) { s = new Date().toString(); }
      return print([[[s, "hl"], ["  KST", "mut"]]]);
    } });

    define("echo", { usage: "echo <문자열>", desc: "그대로 출력", run: function (args) {
      return print([args.join(" ")]);
    } });

    define("history", { desc: "명령어 기록", run: function () {
      if (!hist.length) return print([[["기록이 없습니다.", "mut"]]]);
      return print(hist.map(function (h, i) { return [[pad(i + 1, 5), "mut"], [h, ""]]; }));
    } });

    define("banner", { desc: "시작 화면 다시 보기", run: function () { return boot(false); } });

    define("clear", { desc: "화면 지우기", run: function () {
      out.replaceChildren();
      return Promise.resolve();
    } });

    /* 숨은 명령어 ─ 화면을 가로지르는 속도선 */
    function machBurst() {
      document.dispatchEvent(new Event("m4ch77:warp"));
      return print([
        [["  ┌──────────────────────────────────┐", "key"]],
        [["  │   M A C H   7 7   ·   ENGAGED    │", "hl"]],
        [["  └──────────────────────────────────┘", "key"]],
        "",
        [["소리보다 빠르게. 화면을 보세요.", "mut"]],
        [["(", "mut"], ["↑↑↓↓←→←→BA", "key"], [" 로도 됩니다.)", "mut"]],
      ], { stagger: true });
    }

    define("mach", { hidden: true, desc: "??", run: machBurst });
    define("mach77", { hidden: true, desc: "??", run: machBurst });
    define("warp", { hidden: true, desc: "??", run: machBurst });
    define("boost", { hidden: true, desc: "??", run: machBurst });

    define("sudo", { hidden: true, desc: "권한 상승", run: function () {
      return print([
        [["visitor 는 sudoers 파일에 없습니다. 이 시도는 기록됩니다.", "err"]],
        [["…농담입니다. 아무것도 기록하지 않습니다.", "mut"]],
      ]);
    } });

    define("exit", { hidden: true, desc: "종료", run: function () {
      return print([[["여기서는 나갈 수 없습니다. 대신 ", "mut"], ["ls", "key"], [" 를 해보세요.", "mut"]]]);
    } });

    var hist = [];
    var histIndex = -1;

    function execute(raw) {
      var text = raw.trim();
      echo(text);
      if (!text) return;

      hist.push(text);
      histIndex = hist.length;

      var parts = text.split(/\s+/);
      var name = parts[0].toLowerCase();
      var args = parts.slice(1);
      var cmd = commands[name];

      if (!cmd) {
        print([
          [["zsh: command not found: " + name, "err"]],
          [["help", "key"], [" 를 입력하면 목록을 볼 수 있습니다.", "mut"]],
        ]);
        return;
      }
      cmd.run(args);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value;
      input.value = "";
      execute(v);
    });

    function caretEnd() {
      var n = input.value.length;
      requestAnimationFrame(function () {
        try { input.setSelectionRange(n, n); } catch (e) {}
      });
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!hist.length) return;
        histIndex = Math.max(0, histIndex - 1);
        input.value = hist[histIndex] || "";
        caretEnd();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!hist.length) return;
        histIndex = Math.min(hist.length, histIndex + 1);
        input.value = histIndex === hist.length ? "" : hist[histIndex];
        caretEnd();
      } else if (e.key === "Tab") {
        e.preventDefault();
        complete();
      } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        out.replaceChildren();
      } else if (e.key === "c" && e.ctrlKey) {
        e.preventDefault();
        echo(input.value + "^C");
        input.value = "";
      } else if (e.key === "u" && e.ctrlKey) {
        e.preventDefault();
        input.value = "";
      }
    });

    function complete() {
      var parts = input.value.split(/\s+/);

      if (parts.length > 1 && /^(open|goto)$/i.test(parts[0])) {
        var frag = (parts[parts.length - 1] || "").toLowerCase();
        var ids = destinations.map(function (d) { return d.id; })
          .filter(function (id) { return id.indexOf(frag) === 0; });
        if (ids.length === 1) { parts[parts.length - 1] = ids[0]; input.value = parts.join(" "); caretEnd(); }
        else if (ids.length > 1) print([[[ids.join("   "), "mut"]]]);
        return;
      }

      if (parts.length > 1 && /^go$/i.test(parts[0])) {
        var f2 = (parts[parts.length - 1] || "").toLowerCase();
        var secs = pageSections.map(function (s) { return s.id; })
          .filter(function (id) { return id.indexOf(f2) === 0; });
        if (secs.length === 1) { parts[parts.length - 1] = secs[0]; input.value = parts.join(" "); caretEnd(); }
        else if (secs.length > 1) print([[[secs.join("   "), "mut"]]]);
        return;
      }

      var frag3 = parts[0].toLowerCase();
      if (!frag3) return;
      var names = Object.keys(commands).filter(function (k) {
        return !commands[k].hidden && k.indexOf(frag3) === 0;
      });
      if (names.length === 1) {
        input.value = names[0] + (commands[names[0]].usage ? " " : "");
        caretEnd();
      } else if (names.length > 1) {
        print([[[names.join("   "), "mut"]]]);
      }
    }

    screen.addEventListener("mousedown", function (e) {
      if (e.target.closest("a")) return;
      var sel = window.getSelection && window.getSelection();
      if (sel && String(sel).length) return;
      e.preventDefault();
      input.focus();
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        out.replaceChildren();
        input.focus();
      });
    }

    function boot(withStagger) {
      return print([
        [["m4ch77", "hl"], [" // personal hub", "mut"]],
        [["────────────────────────────", "mut"]],
        [["만드는 걸 좋아하는 사람. 고려대학교 졸업.", ""]],
        "",
        [["help", "key"], [" · ", "mut"], ["ls", "key"], [" · ", "mut"], ["sections", "key"], [" 로 시작하세요.", "mut"]],
      ], { stagger: withStagger !== false });
    }

    whenReady(function () { boot(true); });
  })();

  /* ══ 17 스크롤 정렬 ─ 손을 뗀 뒤 천천히 맞춰 붙습니다 ═══
     CSS scroll-snap 은 걸리는 순간이 갑작스럽고 속도를 조절할 수
     없어서 직접 굴립니다. 스크롤이 멈춘 것을 확인한 뒤에만 움직이고,
     사용자가 다시 손을 대면 즉시 멈춥니다. */
  (function scrollAlign() {
    if (reduceMotion) return;

    var wide = mq("(min-width: 48rem)");
    var stops = $$(".hero, .section, .footer");
    if (stops.length < 2) return;

    var animating = false;
    var rafId = 0;
    var quietUntil = 0;
    var idle = null;

    function stopAnim() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      animating = false;
      root.style.scrollBehavior = "";
    }

    function limit() {
      return Math.max(0, root.scrollHeight - window.innerHeight);
    }

    function points() {
      var y = window.scrollY;
      var lim = limit();
      var vh = window.innerHeight;
      var out = [];
      stops.forEach(function (el) {
        var r = el.getBoundingClientRect();
        // 화면보다 긴 섹션은 정렬 대상에서 뺍니다. 안쪽을 못 보면 안 되니까요.
        if (r.height > vh + 8) return;
        out.push(clamp(Math.round(r.top + y), 0, lim));
      });
      return out;
    }

    function glide(to) {
      var from = window.scrollY;
      var dist = to - from;
      if (Math.abs(dist) < 2) return;

      // 거리에 따라 0.6 ~ 1.0초. 예전보다 느리고 완만합니다.
      var dur = clamp(300 + Math.abs(dist) * 0.42, 300, 560);
      var t0 = 0;
      animating = true;
      root.style.scrollBehavior = "auto"; // CSS 부드러운 스크롤과 겹치지 않게

      function step(t) {
        if (!t0) t0 = t;
        var p = clamp((t - t0) / dur, 0, 1);
        // 천천히 떠나 천천히 멈추는 곡선
        var e = p < 0.5
          ? 4 * p * p * p
          : 1 - Math.pow(-2 * p + 2, 3) / 2;
        window.scrollTo(0, from + dist * e);
        if (p < 1) rafId = requestAnimationFrame(step);
        else {
          stopAnim();
          quietUntil = now() + 180;
        }
      }
      rafId = requestAnimationFrame(step);
    }

    function settle() {
      if (animating || !wide.matches) return;
      if (now() < quietUntil) return;
      if (palette.isOpen && palette.isOpen()) return;

      var y = window.scrollY;
      var vh = window.innerHeight;
      var list = points();

      var best = -1;
      var bd = Infinity;
      list.forEach(function (p) {
        var d = Math.abs(p - y);
        if (d < bd) { bd = d; best = p; }
      });

      if (best < 0 || bd < 3) return;
      // 화면 절반을 넘게 떨어져 있으면 긴 섹션 안이라는 뜻이므로 두고 봅니다.
      if (bd > vh * 0.58) return;
      glide(best);
    }

    window.addEventListener("scroll", function () {
      if (animating) return;
      clearTimeout(idle);
      idle = setTimeout(settle, 80);
    }, { passive: true });

    // 다시 손을 대면 즉시 양보합니다.
    ["wheel", "touchstart", "pointerdown", "keydown"].forEach(function (ev) {
      window.addEventListener(ev, function () {
        if (!animating) return;
        stopAnim();
        quietUntil = now() + 220;
      }, { passive: true });
    });

    // 바로가기로 이동하는 중에는 끼어들지 않습니다.
    document.addEventListener("m4ch77:jump", function () { quietUntil = now() + 1100; });
    window.addEventListener("hashchange", function () { quietUntil = now() + 1100; });
  })();

  /* ══ 18 잡동사니 ═══════════════════════════════════════ */
  (function misc() {
    var clock = $("#clock");
    if (clock) {
      var tick = function () {
        try {
          clock.textContent = new Date().toLocaleTimeString(isEN ? "en-GB" : "ko-KR", {
            hour12: false, timeZone: "Asia/Seoul",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          });
        } catch (e) {
          clock.textContent = new Date().toTimeString().slice(0, 8);
        }
      };
      tick();
      setInterval(tick, 1000);
    }

    var year = $("#year");
    if (year) year.textContent = String(new Date().getFullYear());

    var toTop = $("#to-top");
    if (toTop) {
      toTop.addEventListener("click", function () {
        document.dispatchEvent(new Event("m4ch77:jump"));
        try { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); }
        catch (e) { window.scrollTo(0, 0); }
      });
    }
  })();

  /* ══ 19 글 목록 태그 필터 ═══════════════════════════════
     /writing 에서만 씁니다. 목록이 없으면 조용히 빠집니다.
     줄어드는 목록이라 높이를 먼저 잠가 둡니다. 잠그지 않으면 걸러낼
     때마다 페이지가 짧아지면서 화면이 위로 끌려갑니다. */
  (function writingFilter() {
    var list = $("#wr-list");
    if (!list) return;

    var chips = $$(".wr-chip");
    if (!chips.length) return;

    var items = $$(".wr-item", list);
    var shown = $("#wr-shown");
    var empty = $("#wr-empty");

    // 처음 높이를 최소 높이로 잠급니다 (design.md 6절).
    var locked = 0;
    function lock() {
      var h = list.getBoundingClientRect().height;
      if (h > locked) {
        locked = h;
        list.style.minHeight = Math.round(h) + "px";
      }
    }

    function apply(tag, quiet) {
      var n = 0;
      items.forEach(function (li) {
        var tags = (li.getAttribute("data-tags") || "").split(/\s+/);
        var on = !tag || tags.indexOf(tag) !== -1;
        li.hidden = !on;
        if (on) n++;
      });

      chips.forEach(function (c) {
        var mine = (c.getAttribute("data-tag") || "") === tag;
        c.classList.toggle("is-on", mine);
        if (mine) c.setAttribute("aria-current", "true");
        else c.removeAttribute("aria-current");
      });

      if (shown) shown.textContent = String(n);
      if (empty) empty.hidden = n !== 0;

      // 레이아웃이 바뀌는 순간에는 헤더 판단을 잠시 멈춥니다.
      quietHeader(600);

      if (!quiet) {
        var url = tag
          ? location.pathname + "?tag=" + encodeURIComponent(tag)
          : location.pathname;
        try { history.replaceState(null, "", url); } catch (e) {}
      }
    }

    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        lock();
        apply(c.getAttribute("data-tag") || "");
      });
    });

    // 주소에 ?tag= 가 있으면 그대로 걸러진 상태로 엽니다.
    var initial = "";
    try {
      initial = new URLSearchParams(location.search).get("tag") || "";
    } catch (e) {}

    if (initial && chips.some(function (c) { return c.getAttribute("data-tag") === initial; })) {
      whenReady(function () { lock(); apply(initial, true); });
    } else {
      whenReady(lock);
    }
  })();

  /* ══ 20 글 목차 — 지금 읽는 절 표시 ═════════════════════
     목차가 장식이 아니라 위치 표시기가 되게 합니다.
     계층은 CSS(패딩·서체·안내선)가 보여주고, 여기서는 "어디쯤인지"만
     맡습니다. 표시는 aria-current 로 붙여서 화면과 스크린리더가 같은
     것을 알게 합니다. 글 페이지가 아니면 조용히 빠집니다. */
  (function tocSpy() {
    var toc = $(".wr-toc");
    if (!toc) return;

    var items = $$("a[href^='#']", toc).map(function (a) {
      var id = a.getAttribute("href").slice(1);
      try { id = decodeURIComponent(id); } catch (e) {}
      return { a: a, el: document.getElementById(id) };
    }).filter(function (o) { return o.el; });

    if (!items.length) return;

    var current = null;

    function mark(next) {
      if (current === next) return;
      if (current) current.a.removeAttribute("aria-current");
      current = next;
      if (!next) return;
      next.a.setAttribute("aria-current", "true");

      // 목차 자체가 길어 스크롤될 때, 활성 항목이 화면 밖이면 끌어옵니다.
      if (toc.scrollHeight > toc.clientHeight + 4) {
        var r = next.a.getBoundingClientRect();
        var t = toc.getBoundingClientRect();
        if (r.top < t.top + 8 || r.bottom > t.bottom - 8) {
          toc.scrollTop += r.top - t.top - toc.clientHeight * 0.35;
        }
      }
    }

    var onScroll = rafLoop(function () {
      // 헤더 아래로 지나간 마지막 제목이 "지금 읽는 절"입니다.
      var line = (header ? header.offsetHeight : 0) + 24;
      var found = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].el.getBoundingClientRect().top - line <= 0) found = items[i];
      }
      // 첫 제목에 아직 닿지 않았으면 첫 항목을 켜 둡니다.
      mark(found || items[0]);
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
  })();
})();
