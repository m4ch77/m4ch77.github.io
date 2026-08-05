# Notion 문법 확인용 글

Tags: notion, test
Created: August 4, 2026
Summary: Notion 에서 그대로 붙여넣은 문법이 제대로 나오는지 보는 글입니다.
Draft: true

이 글은 **프런트매터가 없습니다.** 제목과 속성을 위쪽 Notion 형식에서
읽어옵니다.

## 인라인 수식

Notion 에서는 인라인 수식도 달러 두 개로 씁니다. 문장 중간에 $$E = mc^2$$
처럼 넣어도, 줄 맨 앞에 $$a^2 + b^2 = c^2$$ 처럼 넣어도 인라인으로
나와야 합니다.

표준 문법인 $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$ 도 그대로 됩니다.

## 별행 수식

제 줄을 온전히 차지하면 별행 수식입니다.

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

한 줄로 써도 됩니다.

$$\lim_{n \to \infty} \left(1 + \frac{1}{n}\right)^n = e$$

## 콜아웃

<aside>
💡 Notion 의 콜아웃은 `<aside>` 로 나옵니다. 앞의 이모지를 아이콘으로
떼어내고 나머지를 본문으로 둡니다.
</aside>

<aside>
⚠️ 이모지가 없는 콜아웃도 됩니다.
</aside>

## 토글

<details><summary>접힌 내용 열기</summary>

토글 안에도 마크다운이 그대로 듭니다.

- 목록
- 코드 `inline`

</details>

## 글자 꾸미기

<span underline="true">밑줄</span> 과 <span color="blue">파란 글씨</span>,
<span color="red">빨간 글씨</span>, <span color="yellow_bg">노란 배경</span>
입니다.

## 코드 안은 건드리지 않습니다

아래 블록 안의 `$$` 와 `<aside>` 는 그대로 남아야 합니다.

```md
문장 중간에 $$x^2$$ 를 쓰면 인라인이 됩니다.
<aside>💡 이건 변환되지 않습니다</aside>
```

인라인 코드도 마찬가지입니다. `$$y^2$$` 와 `<span color="red">x</span>`.

## 표

| 항목 | Notion | 표준 |
| --- | --- | --- |
| 인라인 수식 | `$$x$$` | `$x$` |
| 별행 수식 | `$$` 별행 | 같음 |
| 콜아웃 | `<aside>` | 없음 |
