#!/usr/bin/env bash
#
# 배포할 산출물을 _site/ 하나로 모읍니다.
#
#   1. 글 빌드 (마크다운 → HTML, 수식·코드 강조 포함)
#   2. 올릴 파일만 골라 _site/ 로 복사 (허용 목록)
#   3. 비밀 값이 섞였으면 멈춤
#
# 배포 경로가 셋(GitHub Pages · Amplify 레포연동 · Amplify 수동)이라
# 각자 따로 이 로직을 갖고 있으면 반드시 어긋납니다. 그래서 여기 한 곳에만
# 둡니다. 허용 목록을 고칠 일이 생기면 이 파일만 고치면 됩니다.
#
# 쓰는 곳
#   amplify.yml                        (Amplify 레포 연동)
#   .github/workflows/deploy.yml       (GitHub Pages)
#   .github/workflows/amplify.yml      (Actions → Amplify 수동 업로드)
#   deploy/deploy.sh                   (로컬에서 수동 배포)

set -euo pipefail
shopt -s nullglob

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="${1:-_site}"

echo "▸ 글 빌드"
npm run build

echo "▸ 산출물 모으기 → $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

# ── 허용 목록 ────────────────────────────────────────────
# 목록에 없는 것은 올라갈 수 없습니다. content/ · build/ · deploy/ ·
# views/ · secret/ · design.md · package.json 등은 저장소에만 남습니다.
# 제외 목록(denylist) 방식을 쓰지 않는 이유: secret/ 이 한 번 새면
# 되돌릴 수 없습니다. 빠뜨려서 못 올라가는 편이 훨씬 낫습니다.
for f in *.html *.css *.js *.svg *.txt *.webmanifest; do
  cp "$f" "$OUT/"
done

for d in assets .well-known writing; do
  if [ -d "$d" ]; then
    cp -R "$d" "$OUT/"
  fi
done

# 맥에서 만든 zip 에 섞여 들어가는 것들
find "$OUT" -name '.DS_Store' -delete 2>/dev/null || true
find "$OUT" -name '._*' -delete 2>/dev/null || true

echo "  파일 $(find "$OUT" -type f | wc -l | tr -d ' ')개"

# ── 비밀 값 검사 ─────────────────────────────────────────
echo "▸ 비밀 값 유출 검사"
fail=0

if find "$OUT" -type f \( -name '*.pem' -o -name '*.key' \
     -o -name '*.p12' -o -name '*.pfx' -o -name '.env*' \) -print | grep -q .; then
  echo "  키 파일이 있습니다:"
  find "$OUT" -type f \( -name '*.pem' -o -name '*.key' \
    -o -name '*.p12' -o -name '*.pfx' -o -name '.env*' \) -print
  fail=1
fi

if grep -rIlE -- '-----BEGIN[ A-Z]*PRIVATE KEY-----' "$OUT" 2>/dev/null; then
  echo "  개인키 블록이 있습니다."
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "중단합니다. 위 파일을 빼거나 .gitignore 를 확인하세요." >&2
  exit 1
fi

echo "  통과: 비밀 값 없음"
echo "완료 → $OUT"
