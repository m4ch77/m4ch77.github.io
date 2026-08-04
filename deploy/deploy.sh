#!/usr/bin/env bash
#
# m4ch77.com 배포
#   ./deploy/deploy.sh
#
# 필요한 값 (환경변수 또는 deploy/config.sh):
#   SITE_BUCKET   S3 버킷 이름            (스택 출력 BucketName)
#   SITE_DIST_ID  CloudFront 배포판 ID    (스택 출력 DistributionId)
#   AWS_PROFILE   (선택) 쓸 자격증명 프로필
#
# 캐시 정책
#   파일 이름에 해시가 없으므로 CSS·JS 를 오래 캐시하면 수정이 반영되지
#   않습니다. 짧게 잡고 배포마다 무효화합니다.
#     index.html            매번 확인
#     css · js              5분
#     svg · 이미지          1일
#   무효화는 경로 /* 하나로 처리합니다 (월 1,000 경로까지 무료).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[ -f deploy/config.sh ] && source deploy/config.sh

: "${SITE_BUCKET:?SITE_BUCKET 을 지정하세요 (deploy/config.sh 또는 환경변수)}"
: "${SITE_DIST_ID:?SITE_DIST_ID 을 지정하세요 (deploy/config.sh 또는 환경변수)}"

command -v aws >/dev/null || { echo "aws CLI 가 없습니다."; exit 1; }

S3="aws s3"
CF="aws cloudfront"

echo "▸ 대상   s3://$SITE_BUCKET  (배포판 $SITE_DIST_ID)"
echo "▸ 경로   $ROOT"
echo

# 올리지 않을 것들 — 저장소 안에만 두는 파일
EXCLUDES=(
  --exclude ".*"
  --exclude ".*/*"
  --exclude "deploy/*"
  --exclude "design.md"
  --exclude "_shot.html"
  --exclude "*.md"
)

# ── 1. 정적 자원 먼저 (HTML 보다 먼저 올려야 새 HTML 이 빈 곳을 가리키지 않습니다)
echo "▸ 이미지·아이콘"
$S3 sync . "s3://$SITE_BUCKET" \
  "${EXCLUDES[@]}" \
  --exclude "*" --include "assets/*" --include "favicon.svg" \
  --cache-control "public, max-age=86400" \
  --content-type "image/svg+xml" \
  --no-progress

# ── 2. 스타일과 스크립트
echo "▸ CSS · JS"
$S3 sync . "s3://$SITE_BUCKET" \
  "${EXCLUDES[@]}" \
  --exclude "*" --include "*.css" \
  --cache-control "public, max-age=300, stale-while-revalidate=86400" \
  --content-type "text/css; charset=utf-8" \
  --no-progress

$S3 sync . "s3://$SITE_BUCKET" \
  "${EXCLUDES[@]}" \
  --exclude "*" --include "*.js" \
  --cache-control "public, max-age=300, stale-while-revalidate=86400" \
  --content-type "text/javascript; charset=utf-8" \
  --no-progress

# ── 3. security.txt (charset 을 명시해야 깨지지 않습니다)
if [ -f .well-known/security.txt ]; then
  echo "▸ .well-known/security.txt"
  $S3 cp .well-known/security.txt "s3://$SITE_BUCKET/.well-known/security.txt" \
    --cache-control "public, max-age=3600" \
    --content-type "text/plain; charset=utf-8" \
    --no-progress
fi

# ── 4. HTML 마지막
echo "▸ HTML"
$S3 sync . "s3://$SITE_BUCKET" \
  "${EXCLUDES[@]}" \
  --exclude "*" --include "*.html" \
  --cache-control "no-cache" \
  --content-type "text/html; charset=utf-8" \
  --no-progress

# ── 5. 지운 파일 정리 (위 업로드가 모두 끝난 뒤에만)
echo "▸ 남은 파일 정리"
$S3 sync . "s3://$SITE_BUCKET" "${EXCLUDES[@]}" --delete --size-only --no-progress

# ── 6. 엣지 캐시 비우기
echo "▸ 캐시 무효화"
INV_ID=$($CF create-invalidation \
  --distribution-id "$SITE_DIST_ID" \
  --paths "/*" \
  --query "Invalidation.Id" --output text)
echo "  무효화 $INV_ID 요청됨 (반영까지 보통 1분 이내)"

echo
echo "완료. 확인:"
$CF get-distribution --id "$SITE_DIST_ID" \
  --query "Distribution.{도메인:DomainName,별칭:DistributionConfig.Aliases.Items,상태:Status}" \
  --output table
