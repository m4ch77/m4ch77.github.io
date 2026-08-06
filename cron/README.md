# Notion 동기화 타이머

5분마다 GitHub 의 `Notion 동기화` 워크플로를 깨우는 Cloudflare Worker 입니다.

## 왜 필요한가

GitHub 의 `schedule` 은 보장이 아니라 최선 노력입니다. `*/5 * * * *` 로
두었더니 실제로는 이렇게 돌았습니다 (UTC).

```
05:35  →  08:06  →  10:48  →  12:50
        2h31m     2h42m     2h02m
```

87번 돌아야 할 자리에 3번입니다. cron 문법을 고쳐서 되는 문제가 아닙니다.
Cloudflare 의 Cron Trigger 는 지켜지므로, 시계만 여기로 옮겼습니다.

GitHub 쪽 `schedule` 은 한 시간에 한 번으로 낮춰 **보험**으로 남겨 뒀습니다.
이 Worker 나 토큰이 죽어도 사이트가 영원히 멈추지는 않게요.

## 왜 조회수 Worker 와 따로 두는가

조회수 Worker 에는 누구나 부를 수 있는 HTTP 엔드포인트가 있습니다. 거기에
GitHub 쓰기 토큰을 같이 두면, 그 핸들러에 언젠가 생길 수 있는 실수 하나가
토큰 유출로 이어집니다.

이 Worker 에는 `fetch` 핸들러가 아예 없고 `workers_dev = false` 라 바깥에서
부를 수 있는 문이 없습니다. 오직 Cloudflare 의 시계만 깨울 수 있습니다.

## 설치

### 1. GitHub 토큰 만들기

Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token

| 항목 | 값 |
|---|---|
| Repository access | Only select repositories → `m4ch77/m4ch77.github.io` |
| Repository permissions | **Actions: Read and write** — 이것만 |
| Expiration | 원하는 기간 (만료되면 401 이 찍히고 동기화가 멈춥니다) |

`Contents` 권한은 주지 마세요. 커밋은 워크플로 안에서 `GITHUB_TOKEN` 이
합니다. 이 토큰은 "돌아라" 만 말할 수 있으면 됩니다.

### 2. 시크릿으로 넣고 올리기

```sh
cd cron
npm install
npx wrangler secret put GH_TOKEN     # 프롬프트에 붙여넣기
npx wrangler deploy
```

토큰은 프롬프트에만 넣으세요. 파일이나 명령줄에 적으면 셸 히스토리에
남습니다.

### 3. 확인

```sh
npx wrangler tail
```

5분 안에 `동기화를 깨웠습니다 (*/5 * * * *)` 가 흐르면 된 것입니다.

손으로 한 번 돌려 보려면

```sh
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

## 자주 보는 오류

| 로그 | 뜻 | 할 것 |
|---|---|---|
| `401` | 토큰이 틀렸거나 만료 | 토큰 재발급 후 `secret put` 다시 |
| `403` | 권한 부족 | PAT 의 Actions 를 Read and write 로 |
| `404` | PAT 가 이 레포를 못 봄 | Repository access 에 레포 추가 |
| `422` | `ref` 가 없음 | 기본 브랜치 이름 확인 (`main`) |

## 비용

Cloudflare 무료 요금제로 됩니다. Cron Trigger 는 Worker 당 최대 3개,
최소 간격 1분입니다. 5분 간격이면 하루 288번이고, 무료 한도(하루 10만 요청)
안에서 넉넉합니다.

깨우는 쪽이 아니라 깨워지는 쪽도 봐야 하는데, 이 레포는 **공개**라서
GitHub Actions 시간이 무료입니다. 그리고 워크플로는 글이 바뀌지 않으면
빌드까지 가지 않고 끝나도록 순서를 바꿔 뒀습니다.
