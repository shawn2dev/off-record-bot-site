# 오프레코드 대시보드

바닐라 ES Modules 기반 AEM Edge Delivery Services 앱입니다. 빌드 단계나
런타임 의존성은 없습니다. Discord 인증·권한 판정·SQLite 거래·작업 실행은
별도 Oracle API가 담당하며, 이 저장소는 화면과 공개 설정만 제공합니다.

## 공개 전 필수 설정

`scripts/off-record-config.js`:

```js
export const API_ORIGIN = '';
export const APP_PATH = '/dashboard';
export const ALLOW_LOCALHOST_API = false;
```

- `API_ORIGIN`은 **실제로 확보한 고정 HTTPS API Origin**으로 변경합니다.
  경로, 쿼리, 해시, 사용자명, 비밀번호는 허용하지 않습니다.
  기본값은 의도적으로 비어 있습니다. 이 상태에서는 한국어 연결 설정 안내만
  표시하며 사이트 상대 `/api` 요청, 가짜 데이터, 성공 응답을 만들지 않습니다.
- `APP_PATH`는 로그인 복귀가 허용된 정확한 앱 경로입니다. 기본 진입점은
  `/dashboard`입니다. 다른 경로를 쓰려면 API 복귀 주소 허용 목록도 함께 바꿉니다.
  빈 문자열은 현재 페이지의 실제 경로를 사용합니다.
- HTTP는 `ALLOW_LOCALHOST_API=true`일 때 `localhost`, `127.0.0.1`, `::1` 개발 서버만
  허용합니다. 운영 설정에서는 켜지 않습니다.
- 봇 토큰, Discord OAuth 비밀키, Tunnel 자격 증명, 세션 비밀값은 절대 넣지 않습니다.
  저장소의 파일은 공개 제공됩니다.

API/Discord/Cloudflare 운영 준비:

1. 고정 API HTTPS 호스트 → Cloudflare Tunnel → Oracle 루프백 API를 연결합니다.
2. Discord 애플리케이션의 OAuth 콜백을 실제 API 콜백 주소로 등록합니다.
3. API의 공식 사이트 Origin을
   `https://main--off-record-bot-site--shawn2dev.aem.live`로 정확히 제한합니다.
4. 로그인 `return_to` 허용 주소를
   `https://main--off-record-bot-site--shawn2dev.aem.live/dashboard`로 등록합니다.
   쿼리·해시는 붙지 않습니다. 임의 브랜치 미리보기 주소는 운영에 허용하지 않습니다.
5. API CORS에서 `Authorization`, `Content-Type`, GET/POST/PUT/OPTIONS를 허용하고
   `Retry-After`를 노출합니다. 인증 응답은 `Cache-Control: no-store`여야 합니다.
6. 별도 개발 API와 정확한 로컬/미리보기 Origin·복귀 주소 허용 목록을 준비한 후
   실제 로그인·멤버/권한 변경·만료·로그아웃을 검증합니다.

고정 호스트와 운영 자격 증명이 아직 없으므로 **실제 OAuth 로그인이나 운영 배포를
완료한 상태가 아닙니다.** 로컬 테스트 fixture는 실제 로그인이나 결제 증거가 아닙니다.

## da.live에서 한 번만 작성·발행

1. `da.live`에서 조직 `shawn2dev`, 저장소 `off-record-bot-site`를 엽니다.
2. 루트에 **`dashboard` 페이지**를 만듭니다. AEM 경로는 `/dashboard`입니다.
3. 본문에 다음 URL로 연결되는 **일반 링크 하나만, 단독 문단으로** 넣습니다.
   별도 블록 표나 관리자 메뉴·상품·설정 문서는 만들지 않습니다.

   ```text
   /widgets/off-record/off-record.html
   ```

   링크 표시 텍스트도 같은 URL로 두면 됩니다. 절대 URL을 요구하는 편집기에서는
   `https://main--off-record-bot-site--shawn2dev.aem.live/widgets/off-record/off-record.html`
   을 사용합니다. 경로는 같아야 합니다.
4. 저장한 뒤 AEM Sidekick에서 **Preview**를 실행합니다.
5. 코드가 해당 브랜치에 동기화된 뒤 다음 미리보기에서 확인합니다.
   `https://{branch}--off-record-bot-site--shawn2dev.aem.page/dashboard`
6. 본문을 **Publish**합니다. 실제 공개 진입 주소는 다음과 같습니다.

   **https://main--off-record-bot-site--shawn2dev.aem.live/dashboard**

코드 배포와 콘텐츠 발행은 별개입니다. 코드의 `main` 반영은 코드 배포이며
da.live 콘텐츠를 자동 발행하지 않습니다. 최초 링크 발행 후 상품·설정·메뉴는
앱/API에서 관리합니다. `/nav`, `/footer` authored 콘텐츠는 필요하지 않습니다.
앱 진입 페이지에서는 기존 AEM 헤더/푸터 로딩을 우회합니다. 다른 AEM 페이지의
기존 헤더/푸터 동작은 유지됩니다. `scripts/aem.js`는 수정하지 않습니다.

실제 `.plain.html`의 최소 형태:

```html
<div>
  <p><a href="/widgets/off-record/off-record.html">/widgets/off-record/off-record.html</a></p>
</div>
```

개발 전 로컬 `localhost:3000/dashboard.plain.html`은 연결되지 않았으며,
승인된 현재 운영 `/index.plain.html` 응답은 `<div></div>`였습니다.
위젯/자동 블록의 기존 구조를 읽고 그 구조를 사용했습니다. 발행 후에는 반드시
`curl https://main--off-record-bot-site--shawn2dev.aem.live/dashboard.plain.html`로
실제 작성 마크업을 확인합니다.

## 화면과 권한

단일 페이지 해시 경로이므로 별도 AEM 하위 문서나 서버 rewrite가 필요하지 않습니다.

| 해시 경로 | 화면 | 권한 |
| --- | --- | --- |
| `#/shop` | 상점·상품 버전/구매 후 잔액·레벨 확인 | 서버원 |
| `#/ranking` | XP·누적·연속 출석 순위 및 본인 순위 | 서버원 |
| `#/me` | XP·출석·구매 내역·원장·선물·XP 게임 | 서버원 |
| `#/admin` | 운영 요약 | `admin.view` |
| `#/admin/attendance` | 출석 보상 | `attendance.manage` |
| `#/admin/lifecycle` | 탈퇴·재가입 초기화 | `lifecycle.manage` |
| `#/admin/gift` | 선물 활성화·수수료 | `gift.manage` |
| `#/admin/nickname` | 접두사·제외 역할·동기화·작업 현황 | `nickname.manage` |
| `#/admin/games` | 기본/고급 게임 표·RTP·역할/채널·상한 | `games.manage` |
| `#/admin/raffle` | 추첨 한도·후보 스냅샷·확정 실행 | `raffle.manage` / `raffle.execute` |
| `#/admin/products` | 상품·Discord/웹 미리보기 | `shop.manage` |
| `#/admin/orders` | 주문 재시도·완료·환불 | `orders.manage` |
| `#/admin/audit` | 관리 기록 | `audit.view` |
| `#/admin/xp` | XP 추가·제거 | `xp.adjust` |
| `#/admin/access` | 역할별 권한 합산 정책 | 오너만 |

메뉴는 `/api/me.permissions`와 서버의 `owner` 값으로 계산합니다.
`access.manage`를 일반 관리자에게 넣어도 오너 화면은 열리지 않습니다.
모든 실제 권한은 서버가 다시 검사해야 하며 메뉴 숨김은 보안 경계가 아닙니다.
오너는 기존 Discord 관리자·상위 역할에도 앱 권한을 명시적으로 부여할 수 있습니다.
이 권한은 자동 부여되지 않으며 역할 판매 제한과 별개입니다. 상품과 충돌하거나
삭제된 역할은 API가 거절합니다.

## 인증·복구 동작

- `head.html`의 동기 nonce 스크립트가 **AEM/RUM 모듈 실행 이전에**
  `offrecord_code`/`offrecord_error`를 URL에서 제거합니다.
  일회용 응답은 메모리로만 전달하고 앱이 소비 즉시 삭제합니다.
  `Referrer-Policy: no-referrer` 메타도 외부 리소스보다 먼저 둡니다.
- verifier(43자)와 별도 attempt(32바이트 난수)를 생성하고 SHA-256 PKCE challenge를
  `/auth/start`로 전달합니다. 최상위 탐색만 사용하며 iframe/쿠키 fetch를 사용하지 않습니다.
- `POST /auth/exchange {code,verifier,attempt}` 결과의 접근 토큰은 **메모리 전용**입니다.
  URL, localStorage, sessionStorage에는 넣지 않습니다.
- 일반 요청은 `Authorization: Bearer …`, `credentials: 'omit'`, `cache: 'no-store'`입니다.
- sessionStorage에는 verifier/attempt/복귀 해시/폼 초안/미확정 요청만 임시 보관합니다.
  초안은 계정별로 분리하고 로그아웃은 자동 복원을 억제합니다.
- 새로고침·토큰 만료는 `restore=1` 최상위 복원을 한 번 시도합니다.
  연속 복원은 30초 가드로 차단하고 복원 실패 후에는 명시적 로그인이 필요합니다.
- 변경 요청은 확인한 본문과 중복 방지 키를 보관합니다. 인증 복귀/네트워크 재시도는
  **자동 재전송하지 않습니다.** 미확정 요청 패널에서 원문으로 직접 재확인합니다.
- HTTP 409는 폼을 지우지 않습니다. 최신 값 비교 후 서버 값으로 교체하거나,
  명시적 확인으로 최신 버전에 수정안을 다시 적용합니다.
- 별명 전체 동기화는 처음 최대 50명을 예약합니다. `scheduled:true`이면 서버가
  저장된 cursor로 계속 처리합니다. 자동 요청 루프는 없으며 구형 수동 cursor도
  초안에 유지합니다. 진행 확인은 사용자가 새로고침합니다.

## API 연동 표면

공유 모듈:

- `scripts/off-record-config.js`: 공개 주소·경로 및 Origin 검증
- `scripts/off-record-auth.js`: `OffRecordClient`, `makeProof`,
  `captureAuthCallback`, `base64url`, `randomKey`
- `scripts/off-record-core.js`: 경로/권한, 상품 검증, 순수 RTP/배당 계산
- `scripts/off-record-locale.js`: 한국어 UI 리소스·숫자·날짜
- `scripts/off-record-dashboard.js`: `mountDashboard(widget, {client})`,
  안전한 `element`, 서버와 같은 `levelForXp`
- `widgets/off-record/off-record.{html,js,css}`: AEM 위젯 진입점

기본 API 계약은 `/api/me`, `/api/rankings?kind=xp|total|streak`,
`/api/settings`, `/api/roles`, `/api/shop`, `/api/purchases`, `/api/products`,
`/api/orders`, `/api/xp/adjust`, `/api/gifts`, `/api/games/:game`,
`/api/raffles/preview`, `/api/raffles`, `/api/jobs`, `/api/jobs/sync`,
`/api/admin/summary`, `/api/audit`, `/api/ledger`입니다.
목록은 `{items,nextCursor}`이며 주문/원장/감사 목록은 `before`, 상점은 `after`입니다.
역할이 50개를 넘으면 `/api/roles`도 `nextCursor`와 `after`를 지원해야 합니다.
클라이언트는 역할을 최대 10페이지까지 합치고 이름으로 검색합니다.
개인 신원은 Bearer 토큰으로 결정합니다. 사용자 ID는 선물/XP 조정의 **대상**으로만 보냅니다.

설정 응답은 `{sections:{section:{version,value}}}`이며 PUT은
`{version,patch}`입니다. 상품 생성/수정은 `{product,version,key}`이며 생성 시
`version:0`을 보냅니다. 상품·금전 변경의 `key`는 필수 중복 방지 값입니다.
설정은 낙관적 버전 검사로 보호하며, 별명 동기화는 작업 합치기로 보호합니다.
설정과 동기화 요청에 계약에 없는 `key`를 추가하지 않습니다.
상품 본문에는 `title`, `description`, `roleId`, `priceXp`, `enabled`,
`sortOrder` 여섯 필드만 넣습니다. 조회 응답의 `id`, `version`, 구매 상태 같은
메타데이터는 상품 본문으로 다시 보내지 않습니다. 역할 목록은 50개씩 반환하며
`nextCursor`를 다음 요청의 `after`로 전달해 선택 목록을 완성합니다.

경제 모듈과 맞춘 설정:

```text
attendance {rewardXp}
lifecycle  {resetOnLeave}
access     {adminRoles:{roleId:[permissionId]}}
gift       {enabled,feePercent}
shop       {enabled}
nickname   {enabled,template,excludedRoleIds}
raffle     {maxWinners,maxAmountXp,maxTotalXp,previewTtlSeconds}
games      {slots,wheel,oddEven,dice}
  각 게임 {enabled,mode,targetRtp,minBetXp,maxBetXp,cooldownSeconds,
           maxPayoutXp,allowedRoleIds,allowedChannelIds,
           outcomes:[{id,weight,multiplierMilli}]}
```

게임 지급은 **0.001 XP** 단위입니다. 정수 XP 베팅 × 정수 `multiplierMilli`를
밀리 XP로 정확히 계산하며 내림하거나 상한에서 잘라 지급하지 않습니다.
기본 모드는 서버와 동일한 고정 가중치에 RTP 계수를 적용합니다.
홀짝/주사위 RTP는 선택한 결과에 대해서만 계산합니다. 고급 결과표만 JSON 편집이며
기본 설정은 모두 실제 폼 컨트롤입니다. 레벨 미리보기 공식은
`floor(sqrt((3 * floor(xp) + 4) / 100))`입니다.

## 개발·검증

```sh
npm ci
npm run lint
npm test
```

개발 의존성은 기존 lint 도구뿐입니다. 설치된 stylelint 18은
Node 22.22.2+ 또는 24.15+를 권장합니다. Node 22.14에서도 현재 lint/순수 테스트를
검증했으나 의존성의 엔진 경고는 환경 업그레이드로 해결합니다.

실제 AEM 콘텐츠 개발은 기존 AEM CLI가 있는 환경에서 `aem up`을 사용합니다.
이미 발행된 `/dashboard` 콘텐츠와 로컬 코드를 조합해 확인합니다.

의존성 없는 UI 검증용 서버:

```sh
node test/browser-server.mjs
# http://127.0.0.1:4173/dashboard     실제 AEM 자동 블록 + 빈 API 설정
# http://127.0.0.1:4173/test/fixture#/shop
# 두 번째 주소만 명시적인 테스트 fixture이며 운영 앱에 기본 데이터는 없습니다.
```

`test/` 전체는 `.hlxignore`로 공개 제공에서 제외됩니다. 브라우저 검증 후 서버를 종료합니다.
실제 로그인/역할 지급/Oracle 쓰기를 확인하려면 위의 운영 연결 준비가 먼저 필요합니다.

현재 순수 테스트는 23개 통과했습니다. 별도로 실제 로컬 API·SQLite·경제 서비스에
브라우저를 연결해 15개 화면 조회, 설정 저장, 상품 생성·수정·구매, 추첨,
별명 동기화와 관리자 역할 지정을 확인했습니다. Discord 역할·별명 호출은 모의
어댑터였으며 운영 API 설정·실제 OAuth 로그인·실서버 지급 검증을 대신하지 않습니다.
