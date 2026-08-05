# 조회수 (Cloudflare Worker + D1)

글 조회수를 **즉시** 세고 즉시 보여주기 위한 작은 서버입니다.

## 왜 직접 만들었나

GoatCounter 의 카운터 표시는 **최대 4시간 캐시**됩니다(공식 문서). 숫자가
바로 보여야 해서 조회수만 따로 셉니다. 유입 경로·브라우저 같은 일반 분석은
GoatCounter 가 계속 담당합니다.

## 왜 AWS 가 아닌가

나중에 AWS 계정을 옮겨도 데이터가 그대로여야 한다고 하셨습니다.
Cloudflare 에 두면 **AWS 이관과 아무 상관이 없어집니다.**

## 무엇을 1회로 세는가

같은 브라우저는 **24시간에 1회**만 셉니다. 새로고침해도 오르지 않습니다.

그 판단은 **브라우저**가 `localStorage` 로 합니다. 서버에 방문자를 식별할
값을 남기지 않기 위해서입니다. 쿠키도 쓰지 않습니다. 서버는 명백한
크롤러만 걸러냅니다.

## 저장되는 것

```
path        /writing/scroll-motion
count       128
first_seen  2026-08-06T...
updated_at  2026-08-07T...
```

방문자에 대한 정보는 **한 줄도 저장하지 않습니다.**

## 처음 한 번 설정

`views/` 폴더에서 실행하세요.

```bash
npx wrangler login
npx wrangler d1 create m4ch77-views
#   → 출력의 database_id 를 wrangler.toml 의 빈칸에 붙여 넣습니다

npx wrangler d1 execute m4ch77-views --remote --file=./schema.sql
npx wrangler deploy
```

마지막에 `https://m4ch77-views.<계정>.workers.dev` 같은 주소가 나옵니다.
**그 주소를 알려주시면** 사이트에 붙입니다.

무료 한도는 **쓰기 10만 행/일, 읽기 500만 행/일, 저장 5GB** 입니다.
개인 블로그 조회수로는 남습니다.

## 백업

하루 한 번 GitHub Actions 가 전체 숫자를 읽어 저장소에 스냅샷으로
커밋합니다. **조회마다 커밋하지 않습니다.** 서비스를 바꾸거나 계정을 옮겨도
git 에 숫자 이력이 남게 하려는 보험입니다.

## 엔드포인트

| | |
| --- | --- |
| `POST /view` | 1 올리고 현재 수 반환 |
| `GET /view?path=…` | 올리지 않고 현재 수만 |
| `GET /views` | 전체 (목록 조회수 정렬용) |

우리 도메인에서 온 요청만 받고, 경로 형태도 `/` 와 `/writing/<이름>` 으로
제한합니다. 아무 경로나 넣어 표를 더럽히지 못하게 하려는 것입니다.
