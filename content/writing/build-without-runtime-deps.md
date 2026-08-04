---
title: 빌드는 두고, 런타임 의존성은 0으로
summary: 마크다운을 쓰려면 빌드가 필요합니다. 그렇다고 방문자가 파서를 내려받을 이유는 없습니다.
date: 2026-08-05
tags: [static, tooling]
---

이 사이트는 오랫동안 빌드 단계가 없었습니다. HTML 을 고치고 올리면
끝이었습니다. 글을 마크다운으로 쓰기로 하면서 그 규칙을 깼습니다.

깨야 했던 이유와, 깨면서도 지킨 것을 적어 둡니다.

## 의존성 0 은 두 가지를 뜻합니다

섞어 쓰기 쉬운데 완전히 다른 얘기입니다.

| | 누가 받나 | 이 사이트 |
| --- | --- | --- |
| 런타임 의존성 | 방문자의 브라우저 | **0** |
| 빌드 의존성 | CI 러너 | 6개 |

지키고 싶었던 건 앞쪽입니다. 방문자가 마크다운 파서를, 수식 렌더러를,
문법 강조기를 내려받는 건 이상합니다. 그건 **제 컴퓨터가 한 번 하면 되는
일**입니다.

## 그래서 전부 빌드 시점에 합니다

수식은 KaTeX 가 빌드할 때 HTML 과 MathML 로 바꿔 둡니다.

```js
md.use(katexPlugin);
```

브라우저에는 이렇게 생긴 것이 도착합니다. JS 는 한 줄도 필요 없습니다.

```html
<span class="katex">
  <span class="katex-mathml"><math>…</math></span>
  <span class="katex-html" aria-hidden="true">…</span>
</span>
```

문법 강조도 같습니다. Shiki 를 빌드 시점에 돌리고, 두 테마를 CSS 변수로
남깁니다.

```js
highlighter.codeToHtml(code, {
  lang: language,
  themes: { light: "github-light", dark: "github-dark" },
  defaultColor: false,   // 색을 고정하지 않고 변수만 남깁니다
});
```

`defaultColor: false` 가 핵심입니다. 이러면 토큰마다
`--shiki-light` 와 `--shiki-dark` 두 값이 붙고, 테마 전환이 CSS 로만
끝납니다.

```css
[data-theme="dark"] .shiki span { color: var(--shiki-dark); }
[data-theme="light"] .shiki span { color: var(--shiki-light); }
```

### 배경색은 빌려 쓰지 않습니다

Shiki 가 주는 배경색을 그대로 쓰면 서피스가 세 단계가 됩니다. 색만 빌리고
배경과 테두리는 사이트 토큰으로 그립니다.

```css
.wr-prose pre {
  background: var(--card) !important;
  border: 1px solid var(--line);
}
```

## 수식이 없는 글은 한 바이트도 더 받지 않습니다

KaTeX 는 CSS 24KB 에 woff2 폰트가 20개 붙습니다. 이걸 모든 페이지에
링크하면 수식 없는 글에도 비용이 붙습니다. 그래서 빌드가 글마다
판단합니다.

```js
const head = post.hasMath
  ? `<link rel="stylesheet" href="../katex/katex.min.css">`
  : "";
```

`hasMath` 는 렌더 결과에 `class="katex` 가 있는지로 정합니다. 프런트매터에
`math: true` 를 적게 하는 방법도 있었지만, 적는 걸 잊으면 수식이 깨진 채로
배포됩니다. **판단은 사람이 아니라 빌드가 해야 합니다.**

## 파일 이름이 주소입니다

`content/writing/이-파일.md` 는 `/writing/이-파일` 이 됩니다. 날짜는 파일
이름에 넣지 않고 프런트매터에서 읽습니다. 이름에 날짜를 넣으면
`2026-08-05-제목` 같은 주소가 되고, 나중에 날짜를 고칠 때 주소가 바뀌어
링크가 깨집니다.

이름 규칙은 빌드가 강제합니다.

```js
const SLUG_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
```

## 잃은 것

정직하게 적자면, 잃은 것이 있습니다.

- `index.html` 을 고치고 새로고침하면 끝나던 것이, 이제 `npm run build` 를 거칩니다
- CI 에 Node 설치와 `npm ci` 가 붙어 빌드가 몇 초 늘어납니다
- `node_modules` 가 생겼습니다

방문자가 받는 것은 그대로 HTML 과 CSS 뿐입니다. 그 선만 지켰습니다.
