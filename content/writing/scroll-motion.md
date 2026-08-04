---
title: 라이브러리 없이 만든 스크롤 모션
summary: IntersectionObserver 와 rAF 만으로 어디까지 되는지, 그리고 어디서 멈춰야 하는지.
date: 2026-08-01
tags: [frontend, motion]
---

스크롤 모션에 라이브러리를 쓰지 않았습니다. 이유는 단순합니다. 이 사이트가
필요한 것은 네 가지뿐이었고, 그 네 가지는 브라우저가 이미 다 해줍니다.

- 화면에 들어오면 나타나기
- 스크롤 속도에 따라 살짝 기울기
- 손을 뗀 뒤 섹션에 맞춰 붙기
- 시차를 두고 배경이 천천히 움직이기

## 나타나기는 관찰자에게 맡깁니다

`scroll` 이벤트에서 `getBoundingClientRect()` 를 재는 방식은 요소가 늘어나면
그만큼 비용이 늘어납니다. `IntersectionObserver` 는 한 번 등록하고 잊으면 됩니다.

```js
function observeOnce(els, cb, opts) {
  if (!els.length) return;
  var io = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      cb(e.target);
      obs.unobserve(e.target);   // 한 번 나타났으면 더 볼 일이 없습니다
    });
  }, opts || { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  els.forEach(function (el) { io.observe(el); });
}
```

핵심은 `obs.unobserve` 입니다. 등장 애니메이션은 한 번만 돌면 되니까
관찰을 끊습니다. 이걸 빼면 스크롤을 올렸다 내릴 때마다 콜백이 계속 돕니다.

형제 순서대로 지연을 주는 건 CSS 변수 하나로 충분합니다.

```js
el.style.setProperty("--d", Math.min(n, 8) * 65 + "ms");
```

`Math.min(n, 8)` 로 상한을 둔 이유는, 목록이 20개일 때 마지막 항목이
1.3초 뒤에 나타나면 고장난 것처럼 보이기 때문입니다.

## 스냅은 CSS 대신 직접 굴렸습니다

`scroll-snap-type` 은 걸리는 순간이 갑작스럽고 **속도를 조절할 수 없습니다.**
그래서 직접 굴렸습니다. 규칙은 세 개입니다.

1. 스크롤이 멈춘 것을 확인한 뒤에만 움직인다 (160ms 대기)
2. 거리에 비례해 300~560ms 동안 붙인다
3. 사용자가 다시 손을 대면 **즉시** 멈춘다

3번이 가장 중요합니다. 애니메이션 도중 입력을 무시하면 사이트가 사용자와
싸우기 시작합니다.

```js
["wheel", "touchstart", "pointerdown", "keydown"].forEach(function (ev) {
  window.addEventListener(ev, function () {
    if (!animating) return;
    stopAnim();
    quietUntil = now() + 220;
  }, { passive: true });
});
```

### 화면보다 긴 섹션은 대상에서 뺍니다

이걸 놓치면 안쪽을 볼 수 없는 섹션이 생깁니다.

```js
if (r.height > vh + 8) return;   // 화면보다 길면 정렬하지 않습니다
```

## 곡선은 하나만 씁니다

등장에 쓰는 곡선은 `cubic-bezier(0.22, 1, 0.36, 1)` 하나입니다. 3차 베지에
곡선은 두 제어점 $P_1, P_2$ 로 정의되고, 시간 $t \in [0, 1]$ 에 대해

$$B(t) = 3(1-t)^2 t \, P_1 + 3(1-t) t^2 P_2 + t^3$$

입니다. 시작점 $P_0 = 0$, 끝점 $P_3 = 1$ 은 생략했습니다.

직접 굴리는 애니메이션에는 베지에 대신 `easeInOutCubic` 을 씁니다. 역함수를
구할 필요가 없어서 코드가 짧습니다.

$$
f(p) = \begin{cases}
4p^3 & p < 0.5 \\
1 - \dfrac{(-2p + 2)^3}{2} & p \geq 0.5
\end{cases}
$$

```js
var e = p < 0.5
  ? 4 * p * p * p
  : 1 - Math.pow(-2 * p + 2, 3) / 2;
```

두 곡선을 섞어 쓰지 않는 이유는, 사이트 안에서 움직임의 성격이 하나로
읽혀야 하기 때문입니다. 길이만 바꿉니다.

| 용도 | 길이 |
| --- | --- |
| 색 · 테두리 | 180ms |
| 형태 | 400ms |
| 등장 | 880ms |
| 스냅 | 300~560ms (거리 비례) |

## 어디서 멈췄나

`data-flow` 로 기우는 각도는 **최대 2.6도**입니다. 그 이상은 싸구려로
보입니다.[^1] 그리고 매 프레임 `style.transform` 을 쓰지 않도록, 값이 같으면
쓰지 않고 멈추면 `requestAnimationFrame` 루프 자체를 끊습니다.

> 같은 값을 계속 쓰는 것만으로도 포인터가 느려집니다.

`prefers-reduced-motion` 에서는 전부 끕니다. 이건 취향이 아니라 접근성입니다.

[^1]: 숫자에 근거는 없습니다. 4도까지 올려보고 되돌렸습니다.
