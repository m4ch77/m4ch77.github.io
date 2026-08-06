# 배포 — m4ch77.com

푸시하면 두 곳이 **각자 알아서** 배포합니다. 손으로 할 일은 없습니다.

```
git push
   │
   ├──▶ GitHub Actions ─────────────────▶ m4ch77.github.io   (GitHub Pages)
   │
   └──▶ GitHub 이 푸시 알림(webhook)
            │
            ▼
        AWS Amplify 가 스스로 저장소를 내려받아 빌드 ──▶ m4ch77.com
```

Amplify 는 GitHub 의 기능이 아닙니다. **Amplify 쪽에 GitHub App 이 설치되어
푸시 알림을 구독**하는 구조입니다. 그래서 GitHub 설정에 Amplify 메뉴가
보이지 않습니다.

---

## 지금 상태

| 항목 | 값 |
| --- | --- |
| Amplify 앱 | `m4ch77-site` |
| 앱 ID | `d1v3ewzehdgjdi` |
| 리전 | `ap-northeast-2` |
| 저장소 연동 | **있음** — `m4ch77/m4ch77.github.io`, `main` |
| 빌드 설정 | 저장소의 `amplify.yml` |
| 임시 주소 | `main.d1v3ewzehdgjdi.amplifyapp.com` |
| 커스텀 도메인 | `m4ch77.com`, `www.m4ch77.com` |
| DNS | Cloudflare (프록시 끄기 · 회색 구름) |

예전에는 zip 을 손으로 올리는 앱(`d2szwegb9si7cs`)이었습니다. 저장소 연동으로
바꾸면서 앱을 새로 만들었고, 옛 앱은 삭제했습니다.

**AWS 액세스 키를 아무 데도 저장하지 않습니다.** Amplify 가 GitHub App 으로
직접 저장소를 가져가므로 유출될 키가 없습니다. root 액세스 키를 아직 지우지
않았다면 지우세요. 이제 배포에 쓰이지 않습니다.

---

## 빌드가 하는 일

`amplify.yml` 은 한 줄만 실행합니다.

```yaml
build:
  commands:
    - bash deploy/assemble.sh
```

여러 줄 스크립트를 `amplify.yml` 에 직접 쓰면 **Amplify 콘솔이 그것을 한 줄
입력칸에 밀어 넣으면서 일부만 남기고 뭉갭니다.** 실제로 겪었습니다
(`npm run build` 가 빠진 채 비밀값 검사만 남았습니다).

`deploy/assemble.sh` 가 세 가지를 합니다.

1. `npm run build` — 마크다운을 HTML 로 (수식·코드 강조까지)
2. 올릴 파일만 `_site/` 로 모음 (**허용 목록**)
3. 비밀 값이 섞였으면 **멈춤**

배포 경로가 둘(Pages · Amplify)이라 각자 목록을 갖고 있으면 반드시
어긋납니다. 그래서 이 파일 하나만 씁니다. 두 경로가 같은 파일을 만드는지
대조해서 확인했습니다.

### 허용 목록

```
루트의  *.html *.css *.js *.svg *.txt *.webmanifest
디렉터리 assets/  .well-known/  writing/
```

제외 목록이 아니라 허용 목록입니다. `secret/` 이 한 번 새면 되돌릴 수
없어서, 빠뜨려서 못 올라가는 편이 낫습니다. 새 정적 파일을 넣으면 이 목록도
고쳐야 합니다.

`content/` · `build/` · `views/` · `deploy/` · `design.md` · `package.json` 은
목록에 없으므로 **구조적으로 올라갈 수 없습니다.** 배포본에서 404 인 것을
확인했습니다.

---

## DNS (Cloudflare)

새 앱은 **옛 앱과 다른 CloudFront 배포**를 씁니다. 앱을 바꾸면 아래 값이 전부
바뀌므로, Amplify 콘솔의 "DNS 레코드" 화면에 나오는 값을 그대로 넣으세요.

| Type | Name | 비고 |
| --- | --- | --- |
| CNAME | `_`로 시작하는 긴 이름 | 인증서 검증용. **검증 뒤에도 지우지 마세요** (자동 갱신에 씁니다) |
| ANAME/CNAME | `@` | 새 앱의 CloudFront 도메인 |
| CNAME | `www` | 같은 값 |

세 개 모두 **프록시 끄기(회색 구름, DNS only)** 여야 합니다. 주황 구름을 켜면
CNAME 이 Cloudflare IP 로 해석돼서 Amplify 의 도메인 검증이 통과하지 못합니다.

`@` 는 최상위 도메인에 CNAME 을 거는 것이라 DNS 규칙상 원래 안 되는 일입니다.
Cloudflare 의 CNAME 평탄화가 처리해 줍니다. **A 레코드를 쓰면 안 됩니다.**
Amplify 에는 고정 IP 가 없습니다.

Cloudflare SSL/TLS 모드는 **Full (strict)** 여야 합니다. Flexible 이면
리다이렉트 루프가 생깁니다.

---

## 상태 확인

```bash
# 도메인 — AVAILABLE 이면 정상, PENDING_VERIFICATION 이면 DNS 대기
aws amplify get-domain-association --app-id d1v3ewzehdgjdi \
  --domain-name m4ch77.com --region ap-northeast-2 \
  --query 'domainAssociation.{status:domainStatus,subs:subDomains[].dnsRecord}'

# 최근 빌드
aws amplify list-jobs --app-id d1v3ewzehdgjdi --branch-name main \
  --region ap-northeast-2 --max-results 5 \
  --query 'jobSummaries[].{job:jobId,status:status,commit:commitId}' --output table

# 실제 응답
curl -sI https://m4ch77.com | head -3
```

---

## 비용

| 항목 | 월 |
| --- | --- |
| Amplify 호스팅 (전송·저장) | 무료 한도 안이면 $0 |
| **Amplify 빌드 시간** | **과금 대상** — 푸시가 잦으면 한도를 넘길 수 있습니다 |
| 인증서 (Amplify 관리 ACM) | $0 |
| DNS (Cloudflare) | $0 |

저장소 연동으로 바꾸면서 **빌드가 Amplify 쪽에서 돌게 됐습니다.** 빌드 시간은
과금 대상입니다. 사이트가 작아 금액은 미미하겠지만, **월 $1 예산 알림을
걸어두세요** (Billing → Budgets, 예산 2개까지 무료). 프리티어에서 돈이 새는
것을 알아차리는 가장 확실한 방법입니다.

---

## 남아 있는 것

`cloudformation.yaml` 은 S3 + CloudFront 구성의 템플릿입니다. **지금 쓰이지
않습니다.** 전송량이 크게 늘어 Amplify 비용이 문제가 되면 옮길 수 있는
선택지로 남겨 둡니다.

`assemble.sh` 는 로컬에서도 돌려볼 수 있습니다. 배포와 똑같은 산출물을
`_site/` 에 만듭니다.

```bash
bash deploy/assemble.sh
```

로컬 미리보기는 `npm run dev` 를 쓰세요. 배포와 같은 방식으로 주소를 풀고
허용 목록도 같게 맞춰 두었습니다.
