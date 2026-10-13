/**
 * 오류 수집(Sentry). **다른 import보다 먼저** 불려야 해서 `main.ts` 맨 위에서 가져온다.
 *
 * 켜지는 때: 운영(`NODE_ENV=production`)이고 `SENTRY_DSN`이 있을 때뿐이다. 로컬 개발은 터미널이
 * 이미 오류를 보여주고, 세션이 섞이면 운영 통계를 흐린다. (`.env`는 Nest가 이 파일보다 늦게 읽으니
 * 로컬에서는 어차피 DSN이 보이지 않는다.)
 *
 * 이 서버는 독자가 옮겨 적은 문장과 내 생각을 받는다. **글이 오류 정보에 실려 나가면 안 된다.**
 * SDK 11의 `dataCollection` 기본값은 거의 전부 수집이라, 쓰는 것만 빼고 모두 끈다:
 * - 사용자 정보·쿠키·헤더·쿼리·요청/응답 본문 — 끈다(본문에 문장이 있다).
 * - 스택 프레임의 지역 변수 — 끈다(문장을 든 변수가 오류 보고에 실린다).
 * - DB 쿼리의 바인딩 값 — 끈다(저장하는 문장이 값으로 들어간다).
 * - 모델에 보낸 프롬프트나 문장은 어떤 보고에도 싣지 않는다(`asks/model/report.ts`).
 * 성능 추적·로그는 켜지 않는다.
 */
import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;

if (dsn && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn,
    environment: 'production',
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      queues: false,
    },
  });
}
