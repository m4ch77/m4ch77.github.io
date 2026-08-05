-- 조회수 저장소 (Cloudflare D1 · SQLite)
--
-- 한 줄이 글 하나입니다. 조회가 오면 count 를 1 올립니다.
-- 방문자 식별 정보는 저장하지 않습니다. 그래서 개인정보가 남지 않고,
-- "같은 사람이 또 봤는지" 판단은 브라우저 쪽에서 합니다(localStorage).

CREATE TABLE IF NOT EXISTS views (
  path       TEXT PRIMARY KEY,   -- 예: /writing/scroll-motion
  count      INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,      -- 처음 집계된 시각 (ISO)
  updated_at TEXT NOT NULL       -- 마지막으로 오른 시각 (ISO)
);

-- 조회수 순 정렬을 자주 하므로 인덱스를 둡니다.
CREATE INDEX IF NOT EXISTS views_count_idx ON views (count DESC);
