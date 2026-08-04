#!/usr/bin/env bash
#
# m4ch77.com 배포 — AWS Amplify Hosting 수동 배포(zip 업로드)
#   ./deploy/deploy.sh
#
# 필요한 값 (환경변수 또는 deploy/config.sh):
#   AMPLIFY_APP_ID   Amplify 앱 ID       (필수)
#   AMPLIFY_BRANCH   배포할 브랜치       (기본 main)
#   AWS_REGION       리전                (기본 ap-northeast-2)
#   AWS_PROFILE      (선택) 쓸 자격증명 프로필
#
# 캐시
#   Amplify 가 CDN 캐시와 배포별 무효화를 직접 관리합니다. 모든 파일이
#   public, max-age=0, s-maxage=31536000 으로 내려갑니다. 브라우저는 매번
#   확인하고 CDN 이 길게 들고 있다가 배포 시 엣지가 비워집니다.
#   그래서 파일별 cache-control 지정도, 수동 무효화도 필요 없습니다.
#
# 올리는 것
#   아래 FILES / DIRS 에 적힌 것만 올라갑니다. 제외 패턴이 아니라
#   화이트리스트인 이유는 secret/ 같은 것이 한 번 새면 되돌릴 수 없기
#   때문입니다. 새 정적 파일을 추가하면 이 목록에도 넣어야 합니다.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck disable=SC1091
[ -f "$ROOT/deploy/config.sh" ] && source "$ROOT/deploy/config.sh"

: "${AMPLIFY_APP_ID:?AMPLIFY_APP_ID 을 지정하세요 (deploy/config.sh 또는 환경변수)}"
APP_ID="$AMPLIFY_APP_ID"
BRANCH="${AMPLIFY_BRANCH:-main}"
REGION="${AWS_REGION:-ap-northeast-2}"

command -v aws  >/dev/null || { echo "aws CLI 가 없습니다."; exit 1; }
command -v zip  >/dev/null || { echo "zip 이 없습니다."; exit 1; }
command -v curl >/dev/null || { echo "curl 이 없습니다."; exit 1; }

FILES=(
  index.html
  main.js
  styles.css
  theme.css
  favicon.svg
)

DIRS=(
  assets
  .well-known
)

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
SITE="$STAGE/site"
ZIP="$STAGE/site.zip"
mkdir -p "$SITE"

echo "▸ 앱     $APP_ID   브랜치 $BRANCH   리전 $REGION"
echo "▸ 경로   $ROOT"
echo

# ── 1. 번들 구성
echo "▸ 번들 구성"
for f in "${FILES[@]}"; do
  [ -f "$ROOT/$f" ] || { echo "  파일이 없습니다: $f"; exit 1; }
  cp "$ROOT/$f" "$SITE/"
done

for d in "${DIRS[@]}"; do
  [ -d "$ROOT/$d" ] || { echo "  디렉터리가 없습니다: $d"; exit 1; }
  cp -R "$ROOT/$d" "$SITE/"
done

find "$SITE" -name '.DS_Store' -delete
find "$SITE" -name '._*' -delete

# ── 2. 안전장치 — 올려서는 안 되는 것이 섞였으면 여기서 멈춥니다
LEAKED="$(find "$SITE" \
  \( -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' \
     -o -name 'config.sh' -o -name '.env' -o -name '*.md' \) -print)"
if [ -n "$LEAKED" ]; then
  echo
  echo "중단합니다. 번들에 올려서는 안 되는 파일이 있습니다:"
  echo "$LEAKED" | sed "s|$SITE/|  |"
  exit 1
fi

COUNT="$(find "$SITE" -type f | wc -l | tr -d ' ')"
echo "  파일 $COUNT 개"
find "$SITE" -type f | sed "s|$SITE/|    |" | sort

# ── 3. zip
( cd "$SITE" && zip -r -X -q "$ZIP" . )
echo "  zip $(wc -c < "$ZIP" | tr -d ' ') bytes"

# ── 4. 배포 슬롯 발급 + 업로드
#    presigned URL 은 자격증명이 들어 있으니 출력하지 않습니다.
echo "▸ 업로드"
read -r JOB_ID UPLOAD_URL <<<"$(aws amplify create-deployment \
  --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" \
  --query '[jobId,zipUploadUrl]' --output text)"

[ -n "${JOB_ID:-}" ] && [ -n "${UPLOAD_URL:-}" ] || {
  echo "  create-deployment 응답을 읽지 못했습니다."; exit 1; }

curl -fsS --upload-file "$ZIP" "$UPLOAD_URL" >/dev/null
echo "  job $JOB_ID 업로드 완료"

# ── 5. 배포 시작
echo "▸ 배포"
aws amplify start-deployment \
  --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
  --region "$REGION" >/dev/null

# ── 6. 끝날 때까지 기다립니다 (실패하면 0 이 아닌 값으로 종료)
DONE=""
for _ in $(seq 1 90); do
  STATUS="$(aws amplify get-job \
    --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
    --region "$REGION" --query 'job.summary.status' --output text)"
  case "$STATUS" in
    SUCCEED)
      echo "  $STATUS"
      DONE=1
      break
      ;;
    FAILED|CANCELLED)
      echo "  $STATUS"
      echo
      echo "로그를 보려면:"
      echo "  aws amplify get-job --app-id $APP_ID --branch-name $BRANCH \\"
      echo "    --job-id $JOB_ID --region $REGION"
      exit 1
      ;;
    *)
      sleep 4
      ;;
  esac
done

[ -n "$DONE" ] || { echo "  시간이 초과됐습니다. job $JOB_ID 상태를 직접 확인하세요."; exit 1; }

# ── 7. 확인
DEFAULT_DOMAIN="$(aws amplify get-app --app-id "$APP_ID" --region "$REGION" \
  --query 'app.defaultDomain' --output text)"

echo
echo "완료."
echo "  https://${BRANCH}.${DEFAULT_DOMAIN}"

CUSTOM="$(aws amplify list-domain-associations --app-id "$APP_ID" --region "$REGION" \
  --query 'domainAssociations[?domainStatus==`AVAILABLE`].domainName' --output text 2>/dev/null || true)"
for d in $CUSTOM; do
  echo "  https://$d"
done
