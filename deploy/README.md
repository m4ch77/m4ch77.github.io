# AWS 배포 — m4ch77.com

이 사이트는 완전한 정적 사이트입니다(서버 통신 코드 0건). **AWS Amplify Hosting** 에 올라가 있습니다.
EC2 를 쓰지 않으므로 열어야 할 포트도, 패치할 OS 도 없습니다. 인증서도 Amplify 가 발급하고 갱신합니다.

```
방문자 → Amplify Hosting (CloudFront + HTTPS, 캐시) → Amplify 가 관리하는 저장소
```

DNS 는 Cloudflare 에서 관리합니다. Route 53 호스팅 영역을 만들지 않았으므로 월 $0.50 이 들지 않습니다.

---

## 지금 상태

| 항목 | 값 |
| --- | --- |
| Amplify 앱 | `m4ch77-site` |
| 앱 ID | `d2szwegb9si7cs` |
| 리전 | `ap-northeast-2` |
| 브랜치 | `main` (PRODUCTION) |
| 기본 도메인 | `main.d2szwegb9si7cs.amplifyapp.com` |
| 커스텀 도메인 | `m4ch77.com`, `www.m4ch77.com` — 둘 다 서비스 중 |
| 인증서 | Amplify 관리(`AMPLIFY_MANAGED`), `*.m4ch77.com` + `m4ch77.com` |
| 저장소 연동 | 없음 — zip 수동 배포 |

**배포 방식이 저장소 연동이 아니라 수동 zip 업로드입니다.** 프로젝트가 git 저장소가 아니었기 때문입니다.
git 을 붙이면 저장소 연동이나 GitHub Actions 로 바꿀 수 있습니다(아래 *아직 안 한 것* 참고).

---

## 배포

파일을 고친 다음 이것만 실행하면 됩니다.

```bash
cp deploy/config.sh.example deploy/config.sh   # 처음 한 번만
./deploy/deploy.sh
```

스크립트가 하는 일입니다.

1. 올릴 파일만 골라 임시 디렉터리에 모읍니다
2. 개인키·`.env`·`config.sh` 같은 것이 섞였으면 **거기서 멈춥니다**
3. zip 으로 묶어 Amplify 가 준 presigned URL 로 올립니다
4. 배포를 시작하고 끝날 때까지 기다립니다. 실패하면 0 이 아닌 값으로 종료합니다

올릴 파일은 `deploy.sh` 의 `FILES` / `DIRS` 에 **화이트리스트로** 적혀 있습니다.
제외 패턴을 쓰지 않는 이유는 `secret/` 이 한 번 새면 되돌릴 수 없기 때문입니다.
정적 파일을 새로 추가하면 이 목록에도 넣어야 합니다.

### 캐시는 신경 쓰지 않아도 됩니다

Amplify 가 모든 파일을 이렇게 내려줍니다.

```
cache-control: public, max-age=0, s-maxage=31536000
```

브라우저는 매번 확인하고, CDN 이 길게 들고 있다가 배포할 때 엣지 캐시가 비워집니다.
파일 이름에 해시가 없어도 수정이 바로 반영됩니다. 파일별 `cache-control` 지정이나 수동 무효화가 필요 없습니다.

HTTP 로 들어오면 HTTPS 로 301 리다이렉트됩니다. 이것도 기본 동작입니다.

---

## DNS (Cloudflare)

지금 들어가 있는 레코드입니다. 세 개 모두 **프록시 끄기(회색 구름, DNS only)** 상태여야 합니다.
주황 구름을 켜면 CNAME 이 Cloudflare IP 로 해석돼서 Amplify 의 도메인 검증이 통과하지 못합니다.

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `_dee1f830ff88f743f78a13d509e378b2` | `_5a060847233ce274ae73751ba178871e.jkddzztszm.acm-validations.aws` |
| CNAME | `@` | `d3qo7x8g2lav59.cloudfront.net` |
| CNAME | `www` | `d3qo7x8g2lav59.cloudfront.net` |

첫 줄은 인증서 검증용입니다. **검증이 끝난 뒤에도 지우지 마세요.** 자동 갱신에 계속 쓰입니다.

`@` 는 최상위 도메인에 CNAME 을 거는 건데, DNS 규칙상 원래 안 되는 일입니다.
Cloudflare 의 CNAME 평탄화가 이걸 처리해 줍니다. 그래서 A 레코드가 필요 없습니다.

**Amplify 에 A 레코드를 쓰면 안 됩니다.** 고정 IP 가 없습니다.
지금 조회해 보면 TTL 60초짜리 CloudFront 엣지 IP 가 나오는데, 예고 없이 바뀝니다.

Cloudflare SSL/TLS 모드는 **Full (strict)** 여야 합니다. Flexible 이면 리다이렉트 루프가 생깁니다.

---

## 서브도메인 추가 (`resume.`, `blog.`)

인증서가 이미 와일드카드(`*.m4ch77.com`)입니다. **인증서를 다시 발급할 필요가 없습니다.**

```bash
# 1. 브랜치를 만듭니다 (사이트마다 브랜치를 나누는 구성이면)
aws amplify create-branch --app-id d2szwegb9si7cs \
  --branch-name blog --stage PRODUCTION --region ap-northeast-2

# 2. 도메인 연결에 서브도메인을 추가합니다 (기존 것도 함께 적어야 덮이지 않습니다)
cat > /tmp/subs.json <<'JSON'
[
  { "prefix": "",     "branchName": "main" },
  { "prefix": "www",  "branchName": "main" },
  { "prefix": "blog", "branchName": "blog" }
]
JSON
aws amplify update-domain-association --app-id d2szwegb9si7cs \
  --domain-name m4ch77.com --sub-domain-settings file:///tmp/subs.json \
  --region ap-northeast-2

# 3. 발급된 CNAME 대상을 확인합니다
aws amplify get-domain-association --app-id d2szwegb9si7cs \
  --domain-name m4ch77.com --region ap-northeast-2 \
  --query 'domainAssociation.subDomains[].dnsRecord' --output table
```

그다음 Cloudflare 에 `blog` CNAME 하나만 추가하면 됩니다(DNS only).

---

## 상태 확인

```bash
# 도메인 상태 — AVAILABLE 이면 정상
aws amplify get-domain-association --app-id d2szwegb9si7cs \
  --domain-name m4ch77.com --region ap-northeast-2 \
  --query 'domainAssociation.{status:domainStatus,subs:subDomains[].{rec:dnsRecord,ok:verified}}'

# 최근 배포 작업
aws amplify list-jobs --app-id d2szwegb9si7cs --branch-name main \
  --region ap-northeast-2 --max-results 5 \
  --query 'jobSummaries[].{job:jobId,status:status,end:endTime}' --output table

# 실제 응답
curl -sI https://m4ch77.com | head -3
```

---

## 예상 비용

| 항목 | 월 비용 |
| --- | --- |
| Amplify Hosting (전송·저장) | 무료 한도 안이면 $0 |
| 인증서 (Amplify 관리 ACM) | $0 |
| DNS (Cloudflare) | $0 |
| Route 53 호스팅 영역 | 안 씀 — $0 |

**주의.** Amplify Hosting 의 무료 한도는 CloudFront 처럼 무기한이 아니라 **계정 생성 시점 기준으로 기간 제한이 있습니다.**
한도가 끝나면 전송량·저장량 기준으로 과금됩니다. 현재 사이트 전체가 200KB 남짓이라 실제 금액은 미미할 것으로 보이지만,
정확한 현행 조건은 [Amplify 요금 페이지](https://aws.amazon.com/amplify/pricing/)에서 확인하세요.
(라이선스 준수를 위해 출처 내용을 요약했습니다.)

전송량이 크게 늘어 비용이 문제가 되면 S3 + CloudFront 로 옮기는 선택지가 있습니다.
그 구성의 CloudFormation 템플릿이 `cloudformation.yaml` 에 남아 있습니다. **지금은 쓰이지 않습니다.**

### 예산 알림을 먼저 걸어두세요

프리티어에서 돈이 새는 걸 알아차리는 가장 확실한 방법입니다. 예산 2개까지 무료입니다.
콘솔에서 **Billing → Budgets → 월 $1 비용 예산 + 이메일 알림** 을 만드세요.

---

## 아직 안 한 것

**GitHub Actions CI/CD.** `m4ch77/m4ch77.github.io` 레포는 만들어져 있지만 비어 있고, 이 프로젝트는 아직 git 저장소가 아닙니다.
푸시하려면 인증 수단이 필요합니다(이 머신에 `gh` CLI 도, SSH 키도, GitHub 자격증명도 없습니다).

푸시하기 전에 반드시 처리할 것이 있습니다. **`secret/webserver.pem` 은 RSA 개인키이고 그 레포는 public 입니다.**
`.gitignore` 로 `secret/`, `*.pem`, `*.key`, `deploy/config.sh` 를 먼저 제외해야 합니다.

CI 에서 AWS 로 인증할 때는 액세스 키를 GitHub Secrets 에 넣는 대신 **OIDC 역할**을 쓰는 편이 낫습니다.
장기 자격증명이 저장소에 남지 않습니다.

**예산 알림.** 위에 적어둔 월 $1 예산이 아직 없습니다.

**root 자격증명.** 지금 배포에 쓰는 자격증명이 계정 root 입니다(`aws sts get-caller-identity` → `.../root`).
root 액세스 키는 권한을 줄일 수 없습니다. Amplify 배포 권한만 가진 IAM 사용자나 역할로 바꾸고 root 키는 삭제하는 편이 안전합니다.

---

## 확인한 것

아래는 실제로 응답을 받아 확인한 내용입니다.

- `m4ch77.com`, `www.m4ch77.com` 둘 다 HTTPS 200, 내려온 내용이 로컬 원본과 SHA-256 일치
- 인증서 SAN 에 `m4ch77.com` 과 `*.m4ch77.com` 둘 다 포함, 발급자 Amazon RSA 2048 M04
- HTTP 요청은 두 호스트 모두 301 로 HTTPS 로 넘어감
- `secret/webserver.pem`, `design.md`, `deploy/*` 는 배포본에서 404 — 올라가지 않았음
- 도메인 연결 상태 `AVAILABLE`

Amplify API 의 `subDomains[].verified` 값은 apex 쪽이 `false` 로 보일 때가 있습니다.
실제 응답은 정상이므로 표시 지연으로 보입니다. 판단 기준은 `domainStatus` 와 실제 HTTP 응답입니다.
