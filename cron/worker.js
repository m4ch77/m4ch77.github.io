/* ============================================================
   Notion 동기화 타이머 (Cloudflare Workers Cron Trigger)

   왜 이걸 따로 두는가
     GitHub 의 schedule 은 보장이 아니라 최선 노력입니다. cron 을
     "*/5 * * * *" 로 두었는데 실제로는 2~2.7시간에 한 번 돌았습니다.
     실측한 스케줄 실행 시각(UTC)이 05:35 · 08:06 · 10:48 · 12:50 였습니다.
     87번 돌아야 할 자리에 3번 돌았습니다. cron 문법으로 고칠 수 있는
     문제가 아닙니다.

     Cloudflare 의 Cron Trigger 는 지켜집니다. 그래서 시계는 여기에 두고,
     GitHub 에는 "지금 돌아라" 만 알립니다.

   왜 조회수 Worker 와 합치지 않았는가
     저기에는 누구나 부를 수 있는 HTTP 엔드포인트가 있습니다. 거기에
     GitHub 쓰기 토큰을 같이 두면, 그 핸들러에 언젠가 생길 수 있는 실수
     하나가 토큰 유출로 이어집니다. 이 Worker 에는 fetch 핸들러가 아예
     없고 workers.dev 주소도 끄므로, 바깥에서 부를 수 있는 문이 없습니다.

   토큰 권한
     GitHub 세분화된 PAT, 이 레포 하나에만, Actions: Read and write.
     그것뿐입니다. 코드를 쓰지 못하고, 다른 레포를 보지 못합니다.
     (커밋은 워크플로 안에서 GITHUB_TOKEN 이 합니다)

   올리기 — cron/ 폴더에서
     npx wrangler secret put GH_TOKEN     ← 붙여넣기 (여기 채팅에 남기지 마세요)
     npx wrangler deploy

   손으로 한 번 돌려 보기
     npx wrangler dev --test-scheduled
     curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
   ============================================================ */

const OWNER = "m4ch77";
const REPO = "m4ch77.github.io";
const WORKFLOW = "notion-sync.yml";
const REF = "main";

/* GitHub 은 User-Agent 없는 요청을 거절합니다. */
const UA = "m4ch77-sync-cron";

export default {
  async scheduled(event, env, ctx) {
    if (!env.GH_TOKEN) {
      // 토큰이 없으면 조용히 넘어갑니다. 매분 오류를 쌓는 것보다 낫습니다.
      console.log("GH_TOKEN 이 없습니다. wrangler secret put GH_TOKEN 으로 넣어 주세요.");
      return;
    }

    const url =
      `https://api.github.com/repos/${OWNER}/${REPO}` +
      `/actions/workflows/${WORKFLOW}/dispatches`;

    /* ctx.waitUntil 로 감싸지 않습니다. scheduled 는 await 를 기다려 주고,
       기다려야 결과를 로그로 남길 수 있습니다. */
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GH_TOKEN}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        "user-agent": UA,
      },
      body: JSON.stringify({ ref: REF }),
    });

    // 성공은 204 No Content 입니다.
    if (res.status === 204) {
      console.log(`동기화를 깨웠습니다 (${event.cron})`);
      return;
    }

    const body = await res.text().catch(() => "");
    console.log(`GitHub 이 거절했습니다: ${res.status} ${body.slice(0, 300)}`);

    /* 자주 보는 것들
         401  토큰이 틀렸거나 만료 — 다시 발급해 secret 을 갱신
         403  권한 부족 — PAT 의 Actions 를 Read and write 로
         404  레포/워크플로 이름이 틀렸거나 PAT 가 이 레포를 못 봄
         422  ref 가 없음 — 기본 브랜치 이름 확인 */
  },
};
