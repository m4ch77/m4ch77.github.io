/* ============================================================
   조회수 Worker (Cloudflare Workers + D1)

   왜 이걸 직접 만들었나
     GoatCounter 의 카운터 표시는 최대 4시간 캐시됩니다. "바로바로" 와
     맞지 않아서, 숫자만 직접 셉니다. 일반 분석(유입 경로 등)은
     GoatCounter 가 계속 담당합니다.

   왜 AWS 가 아닌가
     나중에 AWS 계정을 옮겨도 영향이 없어야 한다고 하셨습니다.
     Cloudflare 에 두면 AWS 이관과 무관해집니다.

   엔드포인트
     POST /view    { "path": "/writing/이름" }  → 1 올리고 현재 수 반환
     GET  /view?path=/writing/이름              → 올리지 않고 현재 수만
     GET  /views                                → 전체 { path: count }
                                                  (목록 조회수 정렬용)

   같은 사람이 새로고침해도 오르지 않게 하는 판단은 **브라우저**가 합니다
   (localStorage 에 24시간 표시). 서버에 방문자 식별 정보를 두지 않기
   위해서입니다. 서버는 명백한 크롤러만 걸러냅니다.
   ============================================================ */

const ALLOWED_ORIGINS = [
  "https://m4ch77.com",
  "https://www.m4ch77.com",
  "https://m4ch77.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];

/* 아무 경로나 넣어 표를 더럽히지 못하게 형태를 제한합니다.
   글 주소와 홈만 받습니다. */
const PATH_OK = /^\/(?:|writing\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;

/* 명백한 크롤러는 세지 않습니다. 완벽할 수는 없지만 대부분을 걸러냅니다. */
const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|curl|wget|headless|lighthouse|pagespeed|python-requests|axios|okhttp/i;

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const json = (data, origin, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // 숫자는 즉시 반영돼야 하므로 캐시하지 않습니다.
      "cache-control": "no-store",
      ...cors(origin),
    },
  });

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // 전체 목록 — 목록 페이지에서 조회수 순으로 다시 정렬할 때 씁니다.
    if (url.pathname === "/views" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT path, count FROM views ORDER BY count DESC",
      ).all();
      const out = {};
      for (const r of results || []) out[r.path] = r.count;
      return json({ views: out }, origin);
    }

    if (url.pathname !== "/view") {
      return json({ error: "not found" }, origin, 404);
    }

    // 읽기만 — 올리지 않습니다.
    if (request.method === "GET") {
      const p = url.searchParams.get("path") || "";
      if (!PATH_OK.test(p)) return json({ error: "bad path" }, origin, 400);
      const row = await env.DB.prepare("SELECT count FROM views WHERE path = ?")
        .bind(p)
        .first();
      return json({ path: p, count: row ? row.count : 0 }, origin);
    }

    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, origin, 405);
    }

    // 우리 사이트에서 온 요청만 셉니다.
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: "forbidden" }, origin, 403);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, origin, 400);
    }

    const p = String(body && body.path ? body.path : "");
    if (!PATH_OK.test(p)) return json({ error: "bad path" }, origin, 400);

    // 크롤러는 현재 수만 돌려주고 올리지 않습니다.
    const ua = request.headers.get("user-agent") || "";
    if (!ua || BOT.test(ua)) {
      const row = await env.DB.prepare("SELECT count FROM views WHERE path = ?")
        .bind(p)
        .first();
      return json({ path: p, count: row ? row.count : 0, counted: false }, origin);
    }

    const now = new Date().toISOString();
    // 있으면 +1, 없으면 1 로 시작. 한 문장으로 처리해 경쟁 상태를 피합니다.
    const row = await env.DB.prepare(
      `INSERT INTO views (path, count, first_seen, updated_at)
       VALUES (?1, 1, ?2, ?2)
       ON CONFLICT(path) DO UPDATE SET
         count = count + 1,
         updated_at = ?2
       RETURNING count`,
    )
      .bind(p, now)
      .first();

    return json({ path: p, count: row ? row.count : 1, counted: true }, origin);
  },
};
