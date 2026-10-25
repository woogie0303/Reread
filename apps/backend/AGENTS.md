# Reread — 백엔드

NestJS 11 / MongoDB(Mongoose). 도메인 단어는 루트 `CONTEXT.md`가 정한 것을 그대로
쓴다 — Reader·Book·Sentence·Lexical Item·Encounter·Re-encounter. 코드에서 Word나
단어장 같은 말을 새로 만들지 않는다.

## 띄우기

```bash
docker compose up -d          # 로컬 몽고 하나 (27017)
cp .env.example .env          # 값을 채운다
pnpm --filter backend dev     # http://localhost:4000/api
```

몽고가 없으면 `mongod --dbpath <경로>`로 띄워도 된다. 스키마 마이그레이션은
없다 — 인덱스는 Mongoose가 부팅할 때 만든다.

## 구조

```
src/
  common/     가드 · 현재 독자 데코레이터 · ObjectId 파이프
  auth/       소셜 로그인 · 토큰 두 장   (oauth/ 안에 제공자 셋)
  readers/    독자
  books/      내 책과 진도
  sentences/  책에서 옮겨 적은 줄
  items/      어휘 항목과 만남 — 재회가 일어나는 곳
  asks/       문장을 통째로 묻는 일 (model/ 안에 모델 호출 — 공급자마다 파일 하나)
  retells/    챕터를 제 말로 옮겨 적어 남긴 것
  reading/    하루에 몇 쪽 읽었는지 — 진도가 앞으로 갈 때 저절로 쌓인다
```

## 지켜야 할 것

- **소유는 언제나 readerId로 거른다.** 가드는 '누구인가'만 확인하고, '무엇을 볼
  수 있는가'는 서비스가 `{ _id, readerId }`로 함께 찾아서 답한다. 남의 문서는
  403이 아니라 404다 — 있다는 사실 자체를 알려줄 이유가 없다.
- **재회는 유일 인덱스가 만든다.** `lexical_items`의 `(readerId, term)`이 유일하고,
  같은 표현을 또 담으면 문서를 만드는 대신 `encounters`에 문장을 하나 더 붙인다.
  이 규칙을 우회하는 저장 경로를 만들지 않는다.
- **문장에 '좋아서 담았음'을 적지 않는다.** 어휘 항목이 딸렸는지는 만남 쪽에
  물어본다(`GET /sentences?liked=true`). 같은 사실을 두 군데 적으면 어긋난다.
  예외는 하트(`favorite`) 하나다 — 표현을 담은 문장도 마음에 든 문장으로 두고
  싶다는 독자의 뜻이라 만남에서 셀 수 없다. `liked=true`는 이 둘을 합쳐 준다. 물어본
  문장은 뺀다 — 담은 표현 쪽에 선다. 그 표현을 독자가 모두 지우면 서버가 문장과 질문을 함께
  지운다(`ItemsService.forgetOrphans`): 어느 갈래에도 안 서는 문장을 보이지 않게 남겨두지 않는다.
  하트를 켠 문장·기다리는 질문이 있는 문장·묻지 않고 담아둔 문장은 지우지 않는다. 묻지 않고
  담아둔 문장(마음에 들었던 문장)을 `sentenceId`로 물으면 그 순간 하트를 켜 둔다 — 안 그러면
  '원래 마음에 든 문장이었다'는 기록이 없어 표현을 지울 때 함께 지워진다. 내 생각은 마음에
  든 문장에서만 달 수 있어서, 하트 없이 생각이 달린 옛 문장은 지우지 않고 하트를 켠다.
- **로그인은 카카오·네이버·구글·Apple 넷뿐이다.** 비밀번호를 맡지 않는다. 이메일이
  같다고 다른 제공자 계정을 자동으로 합치지 않는다 — 남의 계정을 넘겨받는 길이 된다.
- **로그인 없이도 쓴다**(`POST /auth/anonymous`). 소셜 계정이 하나도 없는 독자이고, 토큰
  두 장을 똑같이 받는다. 다른 점은 질문 몫(`ASK_ANON_BUDGET_USD`, 약 5번)뿐이다 — 앱을
  다시 깔면 익명 독자가 새로 생겨서 정식 몫을 주면 재설치로 질문을 계속 받을 수 있다. 만드는
  길은 IP당 한 시간에 10번으로 막는다(`RATE_LIMIT.anonymous`). 질문 없이 '그냥 담아둔 문장'도
  익명 독자는 5개까지다(`ANON_SENTENCE_LIMIT`, 넘으면 403) — 비용이 아니라 로그인을 권하는 선이다.
  앱이 그 403을 로그인 안내로 바꾼다. 물어본 문장은 세지 않는다(질문 몫이 따로 막는다).
- **익명 독자가 로그인하면 그 기록을 로그인한 계정으로 옮긴다**(`ReaderMergeService`). 로그인하는
  세 길(`exchange`·`review`·`:provider`)은 토큰이 붙어 오면 받는다(`OptionalJwtAuthGuard`). 붙은
  토큰이 틀리면 401 — 조용히 무시하면 만료된 익명 토큰으로 로그인할 때 기록이 주인 없이 남는다.
  새 소셜 계정이면 빈 독자로 옮겨지고, 이미 쓰던 계정이면 합쳐진다. 같은 표현은 만남을 이어
  붙이고 그 표현을 가리키던 질문·헷갈리는 짝을 돌린다(유일 인덱스가 재회를 만든다). 넘겨주는
  쪽은 **익명 독자일 때만**이다. **독자가 맡기는 컬렉션을 새로 만들면 계정 삭제와 함께 이
  서비스에도 넣는다** — 안 넣으면 로그인할 때 그 기록이 두고 와진다.
- **계정 삭제는 독자 문서를 맨 마지막에 지운다**(`readers/account-deletion.service.ts`).
  몽고가 단일 서버면 트랜잭션이 없어 중간에 끊길 수 있는데, 독자가 먼저 사라지면 남은
  문서가 주인 없이 영영 남고 다시 시도할 길도 없다. 독자가 남아 있으면 같은 요청으로
  이어서 지울 수 있다. **독자가 맡기는 컬렉션을 새로 만들면 이 서비스에도 넣는다** —
  안 넣으면 탈퇴한 사람의 데이터가 남는다.
- **호출 횟수 제한은 로그인한 독자를 독자 id로, 아니면 IP로 센다**(`common/rate-limit.ts`).
  IP로만 세면 통신사 망의 여러 사람이 한 통을 나눠 쓰고, 프록시 설정이 틀리면 모두가 한
  IP가 된다. 독자 id는 **서명을 검증한 토큰에서만** 읽는다 — 검증 없이 `sub`를 믿으면 호출마다
  새 독자를 지어내 한도를 피할 수 있다. 숫자는 `RATE_LIMIT` 한 곳에 있다: 바닥 120/분, 모델을
  부르는 길(`/asks` 셋) 10/분, 로그인 쪽 20/분, 책 검색 30/분, 익명 독자 만들기 10/시간. 총량은 월 질문 한도가 따로
  막으니 둘의 숫자를 맞추려 들지 않는다. 새 길을 만들 때 모델이나 외부 API를 부르면
  `@Throttle({ default: RATE_LIMIT.… })`를 단다.
- **`TRUST_PROXY`는 틀리면 조용히 망가진다.** 운영 호스팅의 프록시 단 수를 숫자로 적는다
  (비우면 운영 1, 개발 0). 부팅 로그의 '프록시 신뢰 단 수'로 확인한다. 저장소는 서버 메모리라
  인스턴스를 여럿 띄우면 인스턴스마다 따로 센다 — 그때는 Redis 저장소로 바꾼다.
- **리프레시 토큰은 해시로만 저장하고 쓰면 회전시킨다.** 폐기된 토큰이 다시 오면
  그 독자의 세션을 전부 끊는다.
- **묻는 단위는 문장과, 독자가 그 안에서 고른 표현이다**(ADR-0001). 표현만 떼어 받는
  길을 만들지 않는다 — 문장이 없으면 그 문장에서의 뜻을 고를 수 없다. 무엇을 모르는지는
  독자가 고르고, 모델은 고른 표현마다 표제형(`term`)과 그 문장에서의 뜻을 채운다.
  **표제형은 꼭 모델이 정한다** — 'brushed it off'와 'brushes it off'가 둘 다
  'brush it off'로 담겨야 (readerId, term) 유일 인덱스가 재회를 만든다.
- **답이 오면 고른 표현을 서버가 바로 담는다**(`AsksService.keep` → `ItemsService.save`).
  독자가 이미 골랐으니 한 번 더 고르게 하지 않는다. 고른 표현 하나라도 답에서 빠지면
  그 문장은 담지 않고 '연결 실패'로 기다린다(`match-answer.ts`) — 빠진 채 담기면 다시
  고를 길이 없다.
- **한 쪽에서 고른 문장들은 한 번에 묻고 한 번으로 센다.** 문장마다 질문이 생기지만 같은
  `batchId`를 나눠 갖고, 모델은 묶음째 한 번 부른다. 월 몫은 이번 달에 답을 받은 묶음 수다
  (묶음이 생기기 전의 질문은 하나가 하나). 한 번에 5문장, 한 문장에 표현 8개까지 —
  앱도 같은 수에서 고르기를 막는다(`dto/ask.dto.ts`의 `MAX_SENTENCES`·`MAX_PICKS`).
  기다리던 질문을 다시 물으면 같은 묶음에서 기다리던 것도 함께 묻는다.
- **책의 언어를 따로 적지 않는다.** 외국어 문장이면 한국어로 옮기고, 한국어 문장이면
  쉬운 말로 풀어 쓰는데, 어느 쪽인지는 모델이 문장을 보고 정한다
  (`asks/model/prompt.ts`). 독자 레벨도 두지 않는다 — 사람 하나에
  레벨 하나로는 여러 언어를 담을 수 없다.
- **같은 글이 두 줄이 되게 두지 않는다**(ADR-0004). 담아둔 문장을 나중에 물을 때는
  `POST /api/asks`에 `sentenceId`를 보내 그 문장을 그대로 쓴다. 문장을 새로 만드는
  길은 옮겨 적는 순간 하나뿐이다.
- **담는 일은 실패하지 않는다**(ADR-0003). 질문을 다 썼든 모델이 답하지 않든 문장은
  먼저 저장되고, 답 없는 질문은 pending으로 기다린다. 이건 오류가 아니라 상태다.
- **월 할당량은 더하기만 한다.** 남은 몫을 어딘가에 적어두고 매달 0으로 되돌리지
  않는다. 이번 달에 답을 받은 질문의 비용(`Ask.cost`, 실제 토큰으로 매긴 달러)을 더할
  뿐이라, 되돌리다 실패할 일이 없다. 한도는 횟수가 아니라 예산(`ASK_MONTHLY_BUDGET_USD`)이고,
  앱에는 비율(`ratio`)과 어림 횟수(`remaining`)가 내려간다 — 금액은 보내지 않는다. 앱은
  비율만 퍼센트로 보이고, `remaining`은 0인지(더 물을 수 있는지)만 본다 — 문장 길이에
  따라 비용이 몇 배 달라서 횟수로 약속하지 않는다.
- **읽은 양을 따로 적게 하지 않는다.** 진도를 옮기면 그 차이가 그날 읽은 양이다.
  읽고 나서 한 번 더 적게 만들면 아무도 적지 않는다.
- **프롬프트의 붙박이 부분만 캐시에 올린다.** 책·문장처럼 요청마다 달라지는
  것은 system이 아니라 user 메시지에 싣는다 — 캐시는 앞에서 한 글자만 달라도 깨진다.

## 질문 모델은 갈아 끼운다 (`asks/model/`)

`AsksService`는 `AskModel` 인터페이스(`ask-model.ts`)만 안다. 어느 공급자의 어떤 모델이
답하는지는 환경 변수가 정하고(`model.factory.ts`), 새 모델은 `AskModel`을 구현한 파일 하나를
더하고 팩토리에 한 줄 등록하면 된다. 프롬프트와 응답 스키마(zod)는 모델과 무관한 공통이라
`prompt.ts` 한 곳에 있다 — 모델마다 규칙이 갈리면 바꿔 끼워 비교할 수 없다.

- **비용은 모델 파일이 자기 가격표로 매긴다**(`cost`). 월 할당량이 이 값을 더하기 때문에, 모델이
  바뀌면 `ASK_MONTHLY_BUDGET_USD`·`ASK_TYPICAL_COST_USD`·`ASK_AD_BONUS_USD`도 다시 잰다(ADR-0003).
- **구조화 출력을 모델이 강제하는지는 모델마다 다르다.** Anthropic은 SDK가 강제하지만
  Cloudflare(Gemma)는 JSON 모드로 부탁할 뿐이라, 받은 뒤 zod로 직접 검증하고 어긋나면 한 번
  다시 묻는다. 그래도 안 되면 `ModelUnavailable` — 질문은 대기로 남는다.
- **Gemma는 생각 모드를 꺼야 한다**(`chat_template_kwargs.enable_thinking=false`). 켜 두면 17~38초
  걸리고 보이지 않는 토큰이 과금된다. 새 모델을 가격표에 더할 때 이런 옵션이 있는지 먼저 한 번 불러
  본다 — 문서가 응답 모양을 다 알려 주지 않는다.

환경 변수:

```
ASK_PROVIDER=cloudflare            cloudflare(기본) | anthropic
ASK_MODEL=                         비우면 공급자의 기본 모델(Gemma 4 26B / Haiku 4.5). 공급자를 바꾸면 비운다
CLOUDFLARE_ACCOUNT_ID=             cloudflare일 때 — Workers AI 페이지의 Account ID
CLOUDFLARE_API_TOKEN=              cloudflare일 때 — 'Workers AI' 토큰(Read + Edit)
ANTHROPIC_API_KEY=                 anthropic일 때
ASK_MONTHLY_BUDGET_USD=0.006       한 달에 쓸 수 있는 모델 비용(달러) — 질문 1번 $0.0002로 약 30번
ASK_ANON_BUDGET_USD=0.001          로그인 없이 쓰는 독자의 한 달 몫 — 약 5번. 다 쓰면 앱이 로그인을 권한다
ANON_SENTENCE_LIMIT=5              로그인 없이 쓰는 독자가 질문 없이 담을 수 있는 문장 수
ASK_TYPICAL_COST_USD=0.0002        아직 몇 번 안 물은 독자의 '약 N번' 어림에 쓰는 질문 1번 비용
ASK_AD_BONUS_USD=0.0004            광고 한 번이 주는 사용량 — 약 2번
ASK_AD_DAILY_LIMIT=3               하루에 받을 수 있는 광고 횟수
```

## 길

로그인하는 길과 익명 독자 만들기를 뺀 나머지는 전부 `Authorization: Bearer <액세스 토큰>`이
필요하다. 로그인하는 길은 토큰이 있으면 받는다 — 익명 독자의 것이면 그 기록을 옮긴다.

로그인은 둘로 갈린다. Apple은 `/auth/apple`이 옛 방식 그대로 identityToken을
대조해 토큰 두 장을 바로 준다. 카카오·네이버·구글은 브라우저 동의 화면을
거친다 — `start`가 그 화면을 열고, provider가 `callback`으로 돌아오면 앱의
딥링크에 1회용 티켓만 실어 돌려보내고(액세스 토큰은 싣지 않는다), 앱은
`exchange`로 그 티켓과 자기만 아는 PKCE `code_verifier`를 들고 와야 진짜
토큰을 받는다(`auth/oauth-session.service.ts`).

```
POST   /api/auth/anonymous        로그인 없이 쓰는 독자를 만들어 토큰 두 장 — 몫이 작다
POST   /api/auth/apple            identityToken을 대조해 토큰 두 장 — Apple만 이 문을 쓴다
GET    /api/auth/:provider/start  kakao | naver | google — 동의 화면으로 302. ?challenge=&returnUrl=
GET    /api/auth/:provider/callback  provider가 돌아오는 곳. returnUrl?ticket=…&state=… 로 302
POST   /api/auth/exchange         { ticket, codeVerifier } → 토큰 두 장
POST   /api/auth/refresh          리프레시 회전
POST   /api/auth/logout           그 리프레시 하나만 폐기
GET    /api/auth/me               지금 로그인한 독자

GET    /api/readers/me            프로필
PATCH  /api/readers/me            닉네임 · 끝낸 권수
DELETE /api/readers/me            계정 삭제 — 책·문장·표현·질문·읽은 기록·토큰 전부. 204, 몇 번 불러도 같다

GET    /api/books/search ?q=       책 검색 — 한글은 카카오, 그 밖은 Open Library. :id보다 먼저 선언
                                  검색 결과에는 genre가 없다 — 등록 화면에서 독자가 고른다
GET    /api/books ?finished=      내 책장
POST   /api/books                 genre는 `book.schema.ts`의 GENRES 중 하나만(없어도 된다)
GET    /api/books/:id
PATCH  /api/books/:id             진도 · 다 읽은 날 · genre · pinned(홈에 고정, 한 권뿐)
DELETE /api/books/:id             문장·그 문장들의 질문·그 책에서만 만난 표현·읽은 기록까지 함께 지운다

GET    /api/sentences ?bookId= &liked=
POST   /api/sentences
GET    /api/sentences/:id
PATCH  /api/sentences/:id         글 · 쪽 · 메모 · 하트(favorite)
DELETE /api/sentences/:id         그 문장의 질문·그 문장에서만 만난 표현도 함께
DELETE /api/sentences/:id/expressions  담은 표현만 지운다 — 문장은 남는다(하트 문장을 '담은 표현'에서 지울 때)
POST   /api/sentences/:id/thoughts            이 문장에 대고 내 생각 하나 달기 { text }
DELETE /api/sentences/:id/thoughts/:thoughtId

GET    /api/asks/quota            이번 달 남은 질문
POST   /api/asks                  { bookId, page, sentences: [{ text, picks }] } — 문장들은 먼저 저장된다.
                                  문장 순서대로 질문들을 돌려준다. { sentenceId, picks }면 담아둔
                                  문장을 그대로 쓴다(새로 만들지 않는다)
GET    /api/asks ?status= &limit= &sentenceId=  status=pending이 '기다리는 문장', sentenceId는 문장 하나의 질문
GET    /api/asks/:id
POST   /api/asks/:id/resolve      기다리던 질문을 다시 물어본다 — 같은 묶음에서 기다리던 것도 함께
DELETE /api/asks/:id              질문만 지운다. 문장은 남는다

GET    /api/reading/week          이레치 날짜와 쪽수 · 읽은 날 · 연속 일수
GET    /api/reading/range         달력이 오갈 수 있는 달 — 가입한 달부터 이번 달(또는 마지막 기록의 달)까지
GET    /api/reading/days ?year= &month=  그 달 1일부터 마지막 날까지, 날짜와 쪽수(안 읽은 날은 0)
GET    /api/reading/genres        지금까지 읽은 쪽수를 책의 genre로 묶어서 — 장르 없는 책은 '장르 없음'

POST   /api/retells                옮겨 적은 글을 남긴다
GET    /api/retells ?bookId=
GET    /api/retells/:id
DELETE /api/retells/:id

POST   /api/items                 담기 — 이미 있으면 재회로 돌아온다
GET    /api/items ?status= &reencountered= &bookId=
GET    /api/items/:id             만난 문장과 그 책까지 이어서
PATCH  /api/items/:id             뜻 · 상태 · 헷갈리는 짝
POST   /api/items/:id/encounters
POST   /api/items/:id/encounters/remove   { sentenceIds } 고른 문장들에서 한꺼번에 뺀다 — 전부 빼면 표현도 사라진다
DELETE /api/items/:id/encounters/:sentenceId
DELETE /api/items/:id
```

`POST /api/items`의 답에 `reencountered`와 `gapDays`가 실린다. 며칠을 "2개월 만에"
같은 말로 옮기는 일은 앱이 한다 — 서버는 사실만 준다.

`POST /api/asks`의 답에는 문장과 책이 함께 실린다. 답을 받은 질문의 `picks`에는
표제형·뜻과 함께 담긴 어휘 항목(`itemId`)이 붙어 온다 — 이미 서랍에 있던 표현이면 그
순간이 재회다.

목록 응답(`GET /api/items`)은 항목마다 건너온 책들과 가장 최근 문장을 함께 싣는다.
클라이언트가 줄마다 다시 물어보게 두면 스무 줄짜리 서랍이 스물한 번을 부른다.

## 오류와 제한 시간

- **모델 호출은 한 번에 45초, 다시 시도는 한 번까지**(`asks/model/`). SDK 기본(10분, 두 번
  재시도)으로 두면 모델이 멈출 때 독자의 화면이 몇 분씩 돌았다. 넘으면 질문은 '연결 실패'로
  기다린다. 앱의 요청 제한(75초)보다 짧아야 앱이 먼저 포기하지 않는다.
- **검증 메시지는 한국어다.** DTO에 한국어 `message`를 달고, 달지 않은 것은 `validationException`이
  일반 문장으로 바꾼다(원문은 로그에). 영어 기본 메시지가 앱에 그대로 보이지 않게 — 새 DTO를
  만들 때 `message`를 단다.
- **서버 오류는 Sentry로 모인다**(`src/instrument.ts`, `main.ts` 맨 위에서 가져온다). 운영(`NODE_ENV=production`)에
  `SENTRY_DSN`이 있을 때만 켜지고, 처리되지 않은 5xx는 `SentryGlobalFilter`가 보낸다. 앱의 Sentry는
  다른 프로젝트다(`apps/mobile/AGENTS.md`). **독자의 글이 나가면 안 된다** — SDK 11의 `dataCollection`
  기본값은 거의 전부 수집이라 사용자·쿠키·헤더·요청 본문·스택의 지역 변수·DB 바인딩 값을 모두 껐다.
  새 보고를 더할 때도 문장·프롬프트·오류 메시지를 싣지 않는다.
- **모델이 답하지 못한 일은 오류가 아니라 상태(`pending`)라서 따로 보낸다**(`asks/model/report.ts`).
  각 모델 파일의 `unavailable()`이 분류(`timeout`·`rate_limit`·`auth`·`bad_format`·`not_configured`·
  `http_error`·`unavailable`)와 모델 이름·HTTP 상태만 Sentry에 보내고, 자세한 원문은 지금처럼 Render 로그에
  남는다. 같은 분류는 한 이슈로 묶여 횟수로 쌓인다. 앱 쪽에서는 이 일이 보이지 않는다.

## 아직 없는 것

**Apple 로그인 토큰 회수는 코드만 있고 Apple과 통신해 본 적이 없다.** 로그인 때 앱이 보낸
`authorizationCode`를 서버가 Apple에서 refresh token으로 바꿔 `accounts[].refreshToken`에 적어
두고(`AppleTokenService`), 계정을 지울 때 먼저 회수한다(`AccountDeletionService`). 유료 개발자
계정에서 만든 `.p8` 키로 서명해야 해서 `APPLE_TEAM_ID`·`APPLE_KEY_ID`·`APPLE_PRIVATE_KEY`가
없으면 아무 일도 하지 않는다 — 로그인과 삭제는 그대로 돈다. **출시 전에 그 셋을 채우고
실기기에서 로그인 → 삭제를 한 번 돌려 Apple 설정의 '앱 연결'에서 사라지는지 본다.** 키를 넣기 전에
만들어진 Apple 계정은 refresh token이 없어서 회수할 수 없다. 회수가 실패해도 삭제는 계속한다 —
Apple이 응답하지 않는다고 삭제 요청을 막을 수는 없어서, 대신 로그에 남긴다.

퀴즈는 MVP에서 뺀다는 결정으로 걷어냈다 — 아직 안 만든 게 아니라 이번 출시엔
안 낸다는 뜻이다. LexicalItem에 있던 review(streak·wrongCount) 서브스키마도
그 퀴즈만 읽고 쓰던 값이라 함께 지웠다.

카카오·네이버·구글 로그인은 **옛 네이티브 SDK 방식으로** 실기기에서 실제
제공자와 끝까지 도는 것을 확인한 적이 있다. 브라우저 동의 화면 + 서버
콜백으로 바꾼 지금 방식은 아직 실기기에서 확인하지 않았다 — 세 곳 콘솔에
새 redirect URI(`{PUBLIC_BASE_URL}/api/auth/{provider}/callback`)를 등록하고,
구글은 "웹 애플리케이션" 타입 클라이언트를 새로 만들어야 시험할 수 있다.
Apple 로그인과 모델 호출은 아직 실제로 통신해 본 적이 없다 — 각각 유료 개발자 계정과
API 키가 있어야 검증된다.
