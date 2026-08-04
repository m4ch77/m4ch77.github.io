# AWS 온보딩 — m4ch77.com

이 사이트는 완전한 정적 사이트입니다(서버 통신 코드 0건). 그래서 **S3 + CloudFront** 로 올립니다.
EC2 를 쓰지 않으므로 **열어야 할 포트도, 패치할 OS 도, 갱신할 인증서도 없습니다.**

CloudFront 무료 한도는 기간 제한이 없습니다(월 1TB 전송 + 1,000만 요청). EC2 프리티어처럼 6개월 뒤 끊기지 않습니다.

```
방문자 → CloudFront (HTTPS, 캐시) → S3 (비공개, CloudFront만 읽음)
```

---

## 0. 준비물

```bash
# AWS CLI (이 머신에 아직 없습니다)
brew install awscli
aws --version

# 자격증명
aws configure          # 또는 aws configure sso
aws sts get-caller-identity   # 계정이 잡히는지 확인
```

도메인 `m4ch77.com` 은 이미 있다고 가정합니다. 없으면 Route 53 이나 다른 등록업체에서 먼저 등록하세요.

---

## 1. 먼저 도메인 없이 올려서 확인

한 번에 도메인까지 붙이려 하면 인증서 검증에서 막혔을 때 원인을 찾기 어렵습니다. 두 단계로 갑니다.

```bash
aws cloudformation deploy \
  --template-file deploy/cloudformation.yaml \
  --stack-name m4ch77-site \
  --region ap-northeast-2 \
  --capabilities CAPABILITY_IAM
```

5~10분 걸립니다. 끝나면 출력값을 봅니다.

```bash
aws cloudformation describe-stacks \
  --stack-name m4ch77-site --region ap-northeast-2 \
  --query "Stacks[0].Outputs" --output table
```

`BucketName` 과 `DistributionId` 를 설정 파일에 적습니다.

```bash
cp deploy/config.sh.example deploy/config.sh
$EDITOR deploy/config.sh
```

첫 배포.

```bash
./deploy/deploy.sh
```

출력된 `DistributionDomainName`(`dxxxx.cloudfront.net`)으로 접속해 사이트가 제대로 뜨는지 확인합니다.
여기까지 되면 나머지는 도메인 연결뿐입니다.

---

## 2. 인증서 발급 (반드시 us-east-1)

CloudFront 는 **버지니아 북부(us-east-1)** 인증서만 받습니다. 서울에서 발급하면 붙지 않습니다.

```bash
aws acm request-certificate \
  --region us-east-1 \
  --domain-name m4ch77.com \
  --subject-alternative-names "*.m4ch77.com" \
  --validation-method DNS \
  --query CertificateArn --output text
```

와일드카드를 함께 넣어두면 나중에 `resume.` `blog.` 를 추가할 때 인증서를 다시 발급하지 않아도 됩니다.

검증용 CNAME 레코드를 확인해서 DNS 에 추가합니다.

```bash
aws acm describe-certificate --region us-east-1 \
  --certificate-arn <위에서 받은 ARN> \
  --query "Certificate.DomainValidationOptions[].ResourceRecord" --output table
```

레코드를 넣고 몇 분 뒤 `Status` 가 `ISSUED` 로 바뀌면 됩니다.

```bash
aws acm describe-certificate --region us-east-1 \
  --certificate-arn <ARN> --query "Certificate.Status" --output text
```

---

## 3. 도메인 붙이기

```bash
aws cloudformation deploy \
  --template-file deploy/cloudformation.yaml \
  --stack-name m4ch77-site \
  --region ap-northeast-2 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      DomainName=m4ch77.com \
      CertificateArn=arn:aws:acm:us-east-1:<계정>:certificate/<id>
```

그다음 DNS 를 CloudFront 로 향하게 합니다. **여기서 선택이 갈립니다.**

| 방식 | 최상위 도메인(`m4ch77.com`) | 비용 |
| --- | --- | --- |
| Route 53 | A 레코드 **별칭(Alias)** → CloudFront | 호스팅 영역당 **월 $0.50** (프리티어 없음) |
| Cloudflare DNS | CNAME → CloudFront (CNAME 평탄화로 최상위도 됨) | 무료 |
| 일반 등록업체 | ALIAS/ANAME 지원 여부에 따라 다름 | 보통 무료 |

`www` 는 어디서든 CNAME 으로 됩니다. 문제는 최상위 도메인인데, CNAME 을 최상위에 걸 수 없다는 DNS 규칙 때문입니다. Route 53 의 별칭이나 Cloudflare 의 평탄화가 그걸 우회해 줍니다.

Route 53 을 쓴다면:

```bash
# 호스팅 영역이 있다고 가정 (없으면 create-hosted-zone)
# CloudFront 의 고정 호스팅 영역 ID 는 Z2FDTNDATAQYW2 입니다 (모든 배포판 공통)
cat > /tmp/dns.json <<'JSON'
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "m4ch77.com",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z2FDTNDATAQYW2",
        "DNSName": "dxxxxxxxx.cloudfront.net",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
JSON
aws route53 change-resource-record-sets \
  --hosted-zone-id <내 영역 ID> --change-batch file:///tmp/dns.json
```

IPv6 도 쓰려면 같은 내용으로 `"Type": "AAAA"` 하나를 더 넣습니다.

---

## 4. 예산 알림 (먼저 걸어두세요)

프리티어에서 돈이 새는 것을 알아차리는 가장 확실한 방법입니다. 예산 2개까지 무료입니다.

콘솔에서 **Billing → Budgets → 월 $1 비용 예산 + 이메일 알림** 을 만드세요.

---

## 5. 이후 배포

파일을 고친 다음 이것만 실행하면 됩니다.

```bash
./deploy/deploy.sh
```

- 이미지 → CSS/JS → HTML 순서로 올립니다. HTML 이 마지막이라 방문자가 없는 파일을 가리키는 순간이 없습니다.
- 파일 이름에 해시가 없으므로 CSS/JS 는 5분만 캐시하고, 배포마다 엣지 캐시를 비웁니다.
- `deploy/`, `design.md`, `*.md` 는 올리지 않습니다.

---

## 예상 비용

| 항목 | 월 비용 |
| --- | --- |
| CloudFront 전송·요청 | $0 (1TB / 1,000만 요청 무료, 기간 제한 없음) |
| S3 저장 | 사실상 $0 (전체 1MB 미만) |
| ACM 인증서 | $0 |
| Route 53 호스팅 영역 | $0.50 — 외부 DNS 쓰면 $0 |

**월 $0 ~ $0.50** 입니다. EC2 로 올리면 프리티어가 끝난 뒤 월 $10 안팎이 됩니다.

---

## 나중에 글 등록 기능을 붙일 때

정적 파일은 그대로 CloudFront 가 내려주고, **API 만 따로** 두는 구성이 프리티어를 가장 오래 버팁니다.

지금 코드는 그때를 위해 데이터와 화면을 분리해 뒀습니다.

- TIL: `index.html` 의 `data-til="YYYY-MM-DD"` 하나만 보고 잔디·연속일수·최근 7일이 계산됩니다
- 링크 목록: `index.html` 의 `<script type="application/json" id="destinations">` 한 곳

이 두 곳을 API 응답으로 갈아끼우면 화면 코드는 손대지 않아도 됩니다.

---

## 확인하지 못한 것

이 머신에 AWS CLI 가 없어서 **템플릿을 AWS 로 검증하지는 못했습니다.** 배포 전에 한 번 돌려보시면 좋습니다.

```bash
aws cloudformation validate-template \
  --template-body file://deploy/cloudformation.yaml
```

관리형 정책 ID 두 개(`CachingOptimized`, `SecurityHeadersPolicy`)는 AWS 문서와 공개 모듈에서 값이 일치하는 것을 확인했습니다.
