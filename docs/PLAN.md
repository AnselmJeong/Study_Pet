# Study Pet: 데스크톱 학습 동반자 펫 앱 상세 계획서

> 작성일: 2026-11-05 · v4 (2026-11-06: Claude 구독(Agent SDK)을 기본 제공자로, 1분 화면 요약을 Sonnet으로, 로컬 Ollama 제거, 세션 기반 캡처·화면 변화 감지·자동 일시정지·스크린샷 보관 기한·먼저 말 걸기 추가) · 상태: M0~M1 구현 중 · 대상 플랫폼: macOS 우선 (Windows는 2단계)

---

## 0. 한 줄 요약

화면 구석에 사는 작은 펫이 **최근 20분의 화면 맥락과 내가 첨부한 논문/책**을 알고 있는 상태에서,
(1) 집중이 흐트러지면 부드럽게 끌어오고, (2) 내가 물어보면 내 자료와 화면에 근거해 답하고, (3) 할 일을 제때 상기시키는 앱.

펫은 퀴즈를 내거나 학습 확인 질문을 먼저 던지지 않는다. 사용자가 물어볼 때만 답한다.

LLM은 **Claude 구독(기본) / Codex(ChatGPT) 구독 / OpenAI 호환 API(Ollama Cloud 등)** 중에서 고르고, 모델을 앱에서 직접 지정한다. Claude 구독은 이 Mac에 로그인된 Claude Code를 그대로 써서 API 키가 필요 없다. 로컬 Ollama는 쓰지 않는다.

핵심 설계 원칙 세 가지:

1. **방해하지 않는 것이 기본값이다.** 펫은 개입보다 관찰을 훨씬 많이 한다. 개입은 목표에서 벗어났다는 증거가 몇 분간 쌓였을 때만 한다.
2. **맥락은 텍스트로 압축해서 쌓는다.** 스크린샷 20장을 매번 모델에 보내지 않는다. 1분마다 **Claude 구독의 Sonnet**이 화면을 한 줄로 요약해 로컬 타임라인에 저장하고, 질문할 때는 이 요약 텍스트와 필요하면 현재 화면 1장만 붙인다.
3. **모든 데이터는 로컬에 두고, 모든 수집은 눈에 보이게 한다.** 캡처 중 표시, 즉시 일시정지 단축키, 앱 제외 목록, 20장 링버퍼 자동 삭제.

---

## 1. 참고 서비스와 차별점

| 서비스 | 무엇을 하는가 | 이 앱이 가져올 것 / 다르게 할 것 |
|---|---|---|
| Codex의 펫 (첨부 이미지) | 채팅 입력창 위에 떠 있는 캐릭터, 상태에 따라 표정이 바뀜 | "입력창 + 캐릭터"라는 최소 UI 형태만 참고. 캐릭터는 새로 디자인 (§4) |
| studypet.app | iOS 앱. 내 노트로 레슨·플래시카드·퀴즈를 만들고, 펫이 어려워하는 주제를 기억함 ("Never study alone again") | "혼자 공부하지 않는 느낌"이라는 정서만 참고. 퀴즈·플래시카드는 넣지 않는다. 이 앱은 **PC 작업 중 실시간 화면 맥락**을 안다는 점이 다르다 |
| 일반 포모도로/집중 앱 (Forest 등) | 타이머, 앱 차단, 보상 | 타이머는 넣되 **차단 대신 대화형 리다이렉션**. 연구 중 웹 탐색은 정당한 경우가 많아 단순 차단은 역효과 |

---

## 2. 학습 효율을 위한 UX 설계

### 2.1 근거로 삼는 원리

| 원리 | 앱에서의 구현 |
|---|---|
| 목표 설정 + 실행 의도: "무엇을/언제까지"를 미리 정하면 실행률이 오른다 | 세션 시작 시 목표 한 줄 입력 (선택, 건너뛰면 화면에서 추정) |
| 자기 모니터링: 자기 상태를 보는 것만으로 행동이 바뀐다 | 펫의 "잉크 게이지" (최근 20분 중 목표 관련 활동 비율) |
| 주의 회복은 처벌보다 부드러운 프롬프트가 효과적 | 개입 사다리(§2.3). 꾸짖지 않고 "아까 3장 읽던 중이었지?"처럼 **복귀 지점**을 보여준다 |
| 침투적 생각 오프로딩 | "주차장": 떠오른 딴 생각/할 일을 펫에게 던져두면 세션 후 보여준다. 지금 처리하러 이탈하지 않게 |
| 작은 성취의 가시화 | 세션 완료, 연속 학습일, 목표 달성 시 짧은 애니메이션 (과하지 않게) |

### 2.2 핵심 사용자 흐름

**A. 세션 시작 (10초)**
1. 단축키(⌥Space) 또는 펫 클릭 → "공부 시작"
2. 입력창에 목표 한 줄 (예: "Friston 2010 논문 3~4절 읽고 핵심 수식 정리"). 건너뛰면 첫 3분의 화면 요약으로 목표를 추정해서 표시만 한다. 펫이 되묻지 않는다
3. 시간(기본 50분)과 활성 문서(첨부 문서 중 자동 추천)는 기본값으로 바로 시작
4. 메뉴바 아이콘에 캡처 표시(●), 펫이 "집중 모드" 표정으로 바뀜

**B. 세션 중 (대부분 침묵)**
- 1분마다 화면 캡처 → 1분 요약 → 타임라인에 쌓음 (§5.4)
- 펫은 숨쉬기/눈 깜빡임 같은 미세 애니메이션만
- 언제든 펫 클릭이나 단축키로 입력창 호출
- 리마인더가 예정 시간이 되면 말풍선. 집중 중이면 다음 쉬는 시간으로 미룰 수 있다

**C. 사용자 질문에 답하기**
- "이 그림 무슨 뜻이야?" → 현재 화면 1장 + 최근 타임라인 + 관련 문서 조각으로 답변
- 답변에 근거 표시: `[논문 p.7]`, `[화면 14:32]`, `[웹: 출처]`
- 긴 답은 말풍선 대신 확장 패널로 (마크다운, 수식(KaTeX), 이미지)

**D. 이탈 감지 → 개입 (§2.3)**

**E. 세션 종료 (1분 이내, 응답 불필요)**
1. 오늘 한 일 요약 카드 (예: "논문 3절 완독, 4절 절반, 유튜브 6분")
2. 주차장 목록 → 할 일로 전환 (원클릭)
3. 자료 정리: "이 세션에 첨부한 문서를 유지할까, 제거할까?" (§5.6)

### 2.3 개입 사다리

이탈 판단은 1분 요약의 관련도 분류(`on_task / related / off_task / break`)로 한다.

| 단계 | 조건 (기본값, 설정 가능) | 펫의 행동 |
|---|---|---|
| 0. 관찰 | off_task 1~2분 | 아무것도 안 함 (잠깐 딴짓은 정상) |
| 1. 표정 | 최근 5분 중 off_task 3분 이상 | 펫이 사용자 쪽을 바라보며 고개를 갸웃. 텍스트 없음 |
| 2. 부드러운 말 | 최근 8분 중 off_task 5분 이상 | "아까 4.2절 수식 보던 중이었어. 돌아갈까?" + [돌아가기] [5분만 더] [쉬는 중이야] |
| 3. 재설정 제안 | 단계 2를 2번 무시 | "지금 집중이 잘 안 되는 것 같아. 10분 쉬고 목표를 작게 쪼개볼까?" |

규칙:
- `related`(논문 관련 검색, 레퍼런스 확인 등)는 이탈로 치지 않는다. 연구에서 탐색은 정상이다.
- "쉬는 중이야"를 누르면 휴식 타이머로 전환하고 그동안 개입하지 않는다.
- 말풍선 개입은 한 시간에 최대 3회.
- 개입 문구는 매번 다르게, **구체적 복귀 지점**(마지막 on_task 화면 요약)을 반드시 넣는다.
- 사용자 반응(돌아감/무시/쉼)을 기록해 임계값을 개인화한다.

### 2.4 펫의 성격과 말투

- 기본 페르소나: "같이 공부하는 조금 똑똑한 후배". 반말/존댓말 선택.
- 칭찬은 구체적으로 ("4절 끝까지 갔네, 어제보다 15분 빨라").
- 죄책감 유발 금지. "또 딴짓했네" 같은 표현은 시스템 프롬프트 금지 목록에 넣는다.
- 먼저 학습 내용을 묻거나 시험하지 않는다 (시스템 프롬프트에 명시).
- 말풍선은 2문장 이내, 상세 내용은 패널로.

### 2.5 리마인더 / 할 일

- 자연어 입력: "3시에 지도교수 메일 답장 리마인드해줘", "이 논문 다 읽으면 실험 코드 돌리라고 알려줘"(조건형)
- 조건형 리마인더는 타임라인 요약으로 조건 충족을 판단 (예: "논문 마지막 페이지 도달")
- 집중 중이면 다음 휴식 경계로 지연 가능 (긴급 플래그는 즉시)
- macOS 알림(Electrobun `Utils.showNotification`) + 펫 말풍선 동시. Apple Reminders/캘린더 연동은 2단계

### 2.6 문서 첨부 UX

- 펫이나 패널에 PDF/EPUB/MD를 드래그&드롭 → 라이브러리에 추가
- 상태 칩: `처리 중 → 준비됨`, 페이지 수, 토큰 추정치
- 세션마다 "이번 세션에서 쓸 문서" 체크 (전체 라이브러리와 활성 문서를 구분)
- 제거: 우클릭 → "제거" (원본 사본, 변환본, 색인까지 모두 삭제, §5.6)
- 화면에 보이는 PDF와 라이브러리 문서를 자동 매칭 (창 제목/요약) → "지금 읽는 그 논문"이라고 해도 통함

### 2.7 인터넷 검색 UX

- "이 개념 다른 설명 찾아줘", "이 뉴런 구조 그림 찾아줘"
- 텍스트 결과: 출처 링크 3~5개 + 요약
- 이미지 결과: 썸네일 그리드 (출처·라이선스 표시), 클릭 시 원본 페이지 열기, "저장" 버튼
- 검색 여부는 모델이 판단(`web_search` 도구). 입력창의 🔎를 켜면 답하기 전에 항상 검색한다
- 구현됨(2026-11-06): TinyFish Search API, 키는 설정 → 웹 검색에서 입력(Keychain 저장)

### 2.8 화면 구성

```
┌─────────────────────────────────────────────┐
│                                 (화면 우하단)│
│                        ╭──────────────╮      │
│                        │ 말풍선 (2문장)│      │
│                        ╰──────┬───────╯      │
│                            [ 펫 ]            │
│                     ┌──────────────────────┐ │
│                     │ + │ 무엇이든 물어봐… ↑│ │ ← 클릭/단축키 때만 표시
│                     └──────────────────────┘ │
└─────────────────────────────────────────────┘
```

- **펫 창**: 투명·타이틀바 없음·항상 위·모든 Space에 표시. 창 크기를 펫 크기에 딱 맞추고, 말풍선/입력창이 필요할 때만 `setFrame`으로 창을 키운다 (Electrobun의 `bunny` 템플릿이 정확히 이 구조).
- **확장 패널**: 펫 클릭 시 열리는 별도 창(400×600). 탭: 대화 / 타임라인 / 라이브러리 / 할 일 / 기록 / 설정.
- **메뉴바(Tray)**: 캡처 상태(● 캡처 중 / ❚❚ 일시정지), 빠른 메뉴, 현재 LLM 제공자 표시.
- 전체화면 영상/발표 중에는 자동 숨김.

---

## 3. 단계별 로드맵

| 단계 | 기간(1인 추정) | 범위 |
|---|---|---|
| **M0 프로토타입** | 1주 | Electrobun 투명 펫 창 + 입력창 + Claude 구독 / OpenAI 호환 대화 + 현재 화면 1장 첨부 질문 + 1분 화면 요약 타임라인(Sonnet) |
| **M1 맥락 인식 MVP** | 2~3주 | 세션 시작/종료, 관련도 분류, 개입 사다리 0~2, 제외 앱, 타임라인 SQLite 이전 |
| **M2 LLM 제공자 확장** | 1~2주 | Codex 구독 어댑터, 역할별 배정, Claude 툴(MCP) 연결 |
| **M3 자료 기반 답변** | 2주 | PDF/EPUB/MD 첨부·제거, 로컬 검색, 근거 인용 답변 |
| **M4 리마인더 & 검색** | 1~2주 | 자연어/조건형 리마인더, 웹 검색, 이미지 검색 그리드 |
| **M5 다듬기** | 2주 | 펫 애니메이션 완성, 개인화 임계값, 통계 화면, 서명·자동 업데이트 |
| **M6 (선택)** | - | Windows, Zotero/Obsidian 연동, 음성 입력 |

MVP 성공 기준 (본인 사용 2주 후):
- 하루 평균 세션 2회 이상 실제 사용
- 개입 후 3분 안에 on_task 복귀율 50% 이상
- 개입에 👎를 누른 비율 20% 이하
- 구독 사용 한도에 걸려 답을 못 받은 날이 주 1회 이하

---

## 4. 펫 캐릭터 디자인 (오리지널)

Codex 펫(구름 머리 + 모니터 얼굴 로봇)과 겹치지 않는 모티프를 쓴다.

**제안: "잉키(Inky)", 잉크 한 방울에서 태어난 책갈피 요정**
- 실루엣: 물방울 모양 몸통(짙은 남색 잉크), 머리 꼭대기가 살짝 뾰족, 꼬리 대신 **빨간 책갈피 리본**
- 얼굴: 큰 흰 점 두 개(눈). 입은 감정 표현 때만 나타남
- 손: 작은 잉크 방울 두 개. 펜을 쥐거나 책장을 넘기는 동작
- 집중하는 동안 몸 안의 잉크가 천천히 차오름 → 집중 게이지를 캐릭터 자체로 표현

대안 콘셉트: ① 램프 갓을 쓴 작은 나방 "루미" ② 책 더미 위에 사는 이끼 거북 "모스"

**상태별 애니메이션**

| 상태 | 트리거 | 연출 |
|---|---|---|
| idle | 세션 아님 | 느린 숨쉬기, 가끔 하품 |
| focus | 세션 중 on_task | 작은 책을 같이 읽는 자세, 잉크가 조금씩 차오름 |
| curious | 개입 단계 1 | 사용자 쪽으로 고개 갸웃 |
| nudge | 개입 단계 2 | 책갈피 리본을 흔들며 손짓 |
| thinking | 응답 생성 중 | 머리 위 잉크 방울 3개가 차례로 튐 |
| talking | 말풍선 표시 | 입 모양 |
| celebrate | 목표 달성 | 잉크가 별 모양으로 튀었다 돌아옴 |
| rest | 휴식 타이머 | 책을 덮고 누워 있음 |
| sleepy | 늦은 밤 / 장시간 | 꾸벅꾸벅 (휴식 권유) |
| paused | 캡처 일시정지 | 눈가리개 착용 (프라이버시 상태가 한눈에 보임) |

**제작 방식**
- 첫 버전: 픽셀아트 스프라이트 시트(64×64, 상태당 4~8프레임), CSS/Canvas로 재생
- 이후: **Rive**(`@rive-app/canvas`, 상태 머신 기반 벡터 애니메이션). 시스템 WebView(WKWebView)에서도 동작
- 렌더러를 `PetRenderer.setState(state)` 인터페이스로 감싸서 교체 비용을 줄인다

---

## 5. 기술 스펙

### 5.1 기술 스택

| 영역 | 선택 | 메모 |
|---|---|---|
| 앱 프레임워크 | **Electrobun 2.x** (Bun 메인 프로세스 + 시스템 WebView, 2026-11 기준 v2.0.6) | 번들이 작고(Chromium 미포함) 상주 앱에 적합. 필요한 기능이 모두 있음: `BrowserWindow({transparent: true, titleBarStyle: "hidden"})`, `setAlwaysOnTop`, `setVisibleOnAllWorkspaces`, `Tray`, `GlobalShortcut`, `Utils.showNotification`, `Screen.captureRegion`, `Utils.screenCapture.hasAccess/requestAccess`, 타입 안전 RPC(`BrowserView.defineRPC`), 내장 자동 업데이트, Hutch 빌드/서명 |
| UI | React + Vite + Tailwind (Electrobun `react-tailwind-vite` 템플릿에서 시작), KaTeX, react-markdown | 펫 창과 패널 창 각각 별도 view |
| 펫 렌더링 | CSS 스프라이트 → Rive | §4 |
| 로컬 DB | `bun:sqlite` (Bun 내장) + FTS5, 선택적으로 `sqlite-vec` | macOS 기본 SQLite는 확장 로드가 막혀 있어 `sqlite-vec`를 쓰려면 `Database.setCustomSQLite()`로 Homebrew/번들 SQLite 지정 필요 |
| LLM | 제공자 어댑터 3종 (§5.3) | Claude 구독(기본), Codex 구독, OpenAI 호환(Ollama Cloud 등) |
| 웹 검색 | TinyFish Search API (`GET https://api.search.tinyfish.ai?query=…`, `X-API-Key` 헤더, `domain_type` web/news/research_paper, 검색 무료) | 앱 자체 툴(`src/bun/search.ts`). Claude는 인프로세스 MCP 도구, OpenAI 호환은 function calling으로 같은 툴을 쓴다. 페이지 본문 가져오기(TinyFish Fetch)는 이후 |
| 이미지 검색 | Wikimedia Commons API (무료, 라이선스 명확) + 선택적으로 Brave Image Search API 키 | 검색 결과 페이지의 `og:image` 추출도 보조로 사용 |
| 문서 파싱 | PDF: `pdfjs-dist`(페이지별 텍스트), EPUB: EPUB 파서 → 장별 Markdown, MD: 그대로 | 변환 결과를 Markdown 캐시로 저장 |
| 이미지 처리 | `sharp` (RGBA → WebP/JPEG, 다운스케일) | 대안으로 macOS `screencapture` CLI가 바로 JPEG 파일을 만들어 줌 |
| 비밀 저장 | macOS Keychain (`security` CLI 또는 Bun FFI) | API 키 저장. WebView에는 절대 넘기지 않음 |

### 5.2 아키텍처

```
┌──────────────────────── Bun 메인 프로세스 (Electrobun) ─────────────────┐
│                                                                         │
│  CaptureService ──► ContextService ──► InterventionEngine               │
│   (1분 타이머,        (1분 요약,          (개입 사다리,                  │
│    링버퍼 20장)        타임라인 저장)      쿨다운/상한)                   │
│                                                                         │
│  LLMRouter ── 역할별 제공자 선택 ──┬─ ClaudeSubscriptionProvider         │
│   (chat / summarize / nudge)       ├─ CodexSubscriptionProvider          │
│                                    └─ OpenAICompatProvider (Ollama Cloud)│
│                                                                         │
│  ToolHost: web_search · web_fetch · image_search · get_screenshot ·     │
│            search_documents · create_reminder · add_to_parking_lot      │
│   (한 번 정의 → 제공자별로 MCP 또는 function calling으로 노출)            │
│                                                                         │
│  DocumentService · ReminderService · SettingsService(Keychain)          │
│  SQLite(bun:sqlite): sessions, timeline, documents, chunks, todos ...   │
│  링버퍼 폴더: ~/Library/Application Support/StudyPet/shots/             │
└───────────────▲─────────────────────────────────────▲───────────────────┘
                │ Electrobun RPC (타입 정의)            │
     ┌──────────┴─────────┐                  ┌─────────┴─────────┐
     │ 펫 창 (투명 WebView) │                  │ 패널 창 (WebView)  │
     │ 펫 + 말풍선 + 입력창  │                  │ 대화/타임라인/설정  │
     └────────────────────┘                  └───────────────────┘
```

네트워크 호출, 파일 접근, 비밀 값은 모두 Bun 쪽에서만 다룬다. WebView는 RPC로 화면 표시만 한다.

### 5.3 LLM 제공자 설계

**공통 인터페이스**

```ts
interface LLMProvider {
  id: "claude-sub" | "codex-sub" | "openai-compat";
  listModels(): Promise<ModelInfo[]>;          // 설정 화면 드롭다운
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  chat(req: {
    system: string;
    messages: ChatTurn[];                        // text + 이미지 파일 경로
    tools: ToolDef[];                            // ToolHost에서 받은 정의
    signal?: AbortSignal;
  }): AsyncIterable<ChatEvent>;                  // text-delta | tool-call | done | error
  capabilities: { vision: boolean; tools: boolean; streaming: boolean };
}
```

**① Claude 구독 (`claude-sub`)**
- 구현(`src/bun/llm/claudeSub.ts`): `@anthropic-ai/claude-agent-sdk`의 `query()`. 이 Mac에 로그인된 Claude Code 인증을 그대로 쓰므로 앱에는 API 키가 필요 없다. 앱에 키를 넣지 않았으면 환경의 `ANTHROPIC_API_KEY`를 지워서 항상 구독으로 나가고, 키를 넣으면 API 과금으로 전환한다. `tools: []`, `settingSources: []`, `persistSession: false`, `maxTurns: 1`로 도구·사용자 설정·CLAUDE.md를 끈다. 스트리밍은 `includePartialMessages`, 취소는 `abortController`. SDK 내장 실행 파일(`@anthropic-ai/claude-agent-sdk-darwin-arm64`)을 못 찾으면(앱 번들이 프로젝트 폴더 밖에 있을 때) 설치된 `claude`(`~/.local/bin/claude` 등)를 `pathToClaudeCodeExecutable`로 쓴다. Bun에서 텍스트·이미지·취소 동작 확인 완료(호출당 약 4~8초). 설정 화면에 "연결 확인" 버튼. 제공자 선택은 `src/bun/llm/router.ts`가 역할(대화/요약)별로 한다.
- 모델 선택: 드롭다운 (`opus`, `sonnet`, `haiku` 별칭 또는 전체 모델 ID 직접 입력).
- 툴(M2): ToolHost를 `createSdkMcpServer()`로 인프로세스 MCP 서버로 노출. 기본 내장 도구는 계속 막고 우리 툴과 `Read`(활성 문서 폴더 한정)만 허용.
- 이미지: 스트리밍 입력 모드에서 이미지 블록 전달, 또는 링버퍼 파일 경로를 주고 `Read`로 보게 한다.
- 세션 유지: M0은 매 질문마다 이전 대화(최근 12턴)를 텍스트로 붙인다. 이후 `resume`으로 이어가기를 검토.
- 주의: 이 방식은 **본인 PC에서 본인 계정으로 쓰는 개인용**을 전제로 한다. 앱을 다른 사람에게 배포하면서 claude.ai 구독 로그인을 제공하는 것은 Anthropic 정책상 허용되지 않으므로, 배포판에서는 API 키 모드만 남긴다.

**② Codex 구독 (`codex-sub`)**
- 구현: `@openai/codex-sdk`. 로컬 `codex` CLI를 실행하며, `codex login`으로 저장된 ChatGPT 로그인을 쓴다 (API 키를 넣으면 API 과금).
- 모델 선택: `startThread({ model, modelReasoningEffort })`. 모델은 설정에서 직접 입력 + 자주 쓰는 값 프리셋.
- 이미지: `thread.run([{type:"text", text}, {type:"local_image", path}])`로 링버퍼 이미지 경로를 그대로 전달.
- 안전: `sandboxMode: "read-only"`, `workingDirectory`는 앱 전용 빈 폴더, `skipGitRepoCheck: true`. 코딩 에이전트이므로 파일 쓰기/명령 실행은 막는다.
- 툴: Codex 설정의 MCP 서버로 ToolHost를 연결 (로컬 stdio MCP 서버로 실행).
- 스레드 유지: `resumeThread(id)`로 세션 동안 같은 스레드를 이어간다.

**③ OpenAI 호환 API (`openai-compat`, 보조)**
- 구현: `openai` npm SDK에 `baseURL` 지정. 프리셋:
  - Ollama Cloud: `https://ollama.com/v1` + Ollama API 키 (ollama.com에서 발급)
  - 기타: 사용자가 Base URL과 키를 직접 입력 (LM Studio, OpenRouter 등)
- 모델 선택: `GET /v1/models`로 목록을 불러오고, 실패하면 Ollama `GET /api/tags`로 대체, 직접 입력도 허용. 모델마다 "비전 가능" 표시 (연결 테스트 결과로 확정).
- 엔드포인트: `/v1/chat/completions` (스트리밍 + function calling). 이미지는 **base64 데이터 URL만** 지원되므로 링버퍼 파일을 base64로 인코딩해서 보낸다.
- 툴: ToolHost 정의를 function calling 스키마로 바꾸고, 앱이 직접 툴 실행 루프를 돈다.

**역할별 배정 (설정 화면)**

| 역할 | 빈도 | 기본 배정 | 이유 |
|---|---|---|---|
| 1분 화면 요약/관련도 분류 | 세션 중 분당 최대 1회 | **Claude 구독 Sonnet** (설정에서 제공자·모델·간격 변경) | 요약 품질 우선. 화면이 바뀌지 않으면 호출하지 않고, 입력이 없으면 3분 간격으로 줄이고, 화면 잠금 시 바로·입력도 변화도 없이 5분이면 자동 일시정지해서 사용량을 아낀다 |
| 먼저 말 걸기 (격려, 농담, 휴식 권유, 복귀 제안) | 12~25분 간격 + 딴짓 감지 시 | 요약 역할 제공자 | 자리 비움(5분 무입력)이나 대화 중에는 말 걸지 않음. 복귀 제안은 시간당 최대 3회 |
| 사용자 질문 답변, 세션 요약 | 요청 시 | 사용자가 고른 주 제공자 (Claude 구독 기본 / Codex 구독 / OpenAI 호환) | 최근 2시간 요약 타임라인을 시스템 프롬프트에 넣는다 |
| 개입 문구 생성 | 시간당 최대 3회 | 1분 요약과 같은 모델 | 짧은 문장, 빠른 응답 |

- 역할마다 "제공자 + 모델"을 따로 고를 수 있다. 주 제공자가 실패(한도 초과, 로그인 만료)하면 지정한 대체 제공자로 넘어가고 펫이 한 줄로 알린다.
- 제공자별 [연결 테스트] 버튼: 텍스트 1회 + 이미지 1장 테스트 결과를 보여준다.

### 5.4 스크린샷 파이프라인

**캡처**
- 주기: 60초 (30초~5분 설정). 기본은 세션 중에만 캡처, "항상 캡처"는 옵트인.
- 방법: Electrobun `Screen.captureRegion(활성 디스플레이 영역)` → RGBA 버퍼 → `sharp`로 긴 변 1568px 이하, WebP/JPEG q≈75. 대안: `Bun.spawn(["screencapture","-x","-t","jpg", path])`. `captureRegion`은 내부적으로 `CGWindowListCreateImage`를 쓰는데, 이 API는 macOS에서 지원 중단 대상이라 `screencapture` 경로를 대체 수단으로 함께 구현해 둔다.
- 권한: 첫 실행 온보딩에서 `Utils.screenCapture.hasAccess()` 확인 → 없으면 `requestAccess()` → `openSettings()` 안내 → 재실행.
- 저장: 장당 약 150~300KB, 20장 링버퍼 → 최대 약 6MB.
- 메타데이터: 시각, 활성 앱, 창 제목(`osascript` 또는 접근성 API), 화면 변화량.

**중복/무변화 처리**
- 구현: `sips`로 16×16 BMP로 줄여 밝기 지문을 만들고 직전 지문과 평균 밝기 차이를 비교한다(0~255, 2.5 미만이면 같은 화면). 같으면 스크린샷을 지우고 요약 호출 없이 직전 항목의 `repeats`만 늘린다. 링버퍼 20장이 "서로 다른 20개 장면"이 된다.
- 유휴: `ioreg`의 `HIDIdleTime`으로 입력 없음 시간을 잰다. 입력이 2분 넘게 없으면 기록 간격을 3분(`idleIntervalMin`)으로 늘린다. 입력이 없어도 화면이 바뀌면(강의 영상 등) 그 간격으로 계속 기록하고, 입력도 화면 변화도 없이 5분(`autoPauseMin`)이 지나면 자동 일시정지한다. 화면 잠금(`ioreg`의 `CGSSessionScreenIsLocked`)은 즉시 일시정지. 잠금이 풀리고 입력이 생기면 잉키가 한마디 하고 재개한다.
- 보관: 스크린샷은 개수(기본 20장)와 시간(기본 60분) 두 기준으로 자동 삭제한다. 텍스트 타임라인은 30일 보관.

**1분 요약**
- 새 캡처마다 요약 역할 모델에 이미지 1장 + 세션 목표 + 직전 요약 3개를 보내고 JSON으로 받는다 (OpenAI 호환은 `response_format: json_schema`, 미지원 모델은 프롬프트 지시 + 파싱 검증 후 1회 재시도).

```json
{
  "summary": "Friston 2010 PDF 6쪽, 식 (3) 자유에너지 분해를 보는 중",
  "activity": "reading",
  "relevance": "on_task",
  "doc_ref": {"doc_id": "d_12", "page": 6},
  "key_terms": ["free energy", "KL divergence"],
  "sensitive": false
}
```

- 결과는 `timeline` 테이블에 저장. 원본 이미지는 링버퍼에서 밀려나면 삭제되지만 **텍스트 요약은 세션 단위로 보존**해서 세션 요약과 통계에 쓴다.
- `sensitive: true`(비밀번호, 금융, 개인 메시지 등)이면 이미지 파일을 즉시 삭제하고 요약에는 "민감 화면(내용 생략)"만 남긴다.

**질문할 때 맥락 조립**
- 항상: 세션 목표 + 최근 20개 타임라인 요약(텍스트 수백 토큰)
- 기본: 가장 최근 원본 1장
- 질문이 과거를 가리키면("아까 본 그래프") 모델이 `get_screenshot(time|index)` 툴로 링버퍼 이미지를 추가로 요청
- 선택한 모델이 비전을 지원하지 않으면 이미지 대신 해당 시점 요약 텍스트만 넣고, 펫이 그 사실을 알린다

### 5.5 툴 정의 (ToolHost)

| 툴 | 설명 |
|---|---|
| `web_search(query, domain_type?)` | TinyFish Search API. 상위 6개 결과의 제목·URL·요약 반환 (구현됨) |
| `web_fetch(url)` | Ollama Web Fetch API. 본문과 링크 반환 |
| `image_search(query, n)` | Wikimedia Commons (+ Brave 키가 있으면 Brave). 썸네일 URL·출처·라이선스 반환, UI는 그리드로 렌더 |
| `get_screenshot(ref)` | 링버퍼의 특정 시점 이미지 |
| `search_documents(query, doc_ids?)` | 활성 문서 로컬 검색, 페이지/장 번호가 붙은 조각 반환 |
| `create_reminder(text, at?, condition?)` | 할 일/리마인더 생성 |
| `add_to_parking_lot(text)` | 주차장 메모 |

- 정의는 JSON Schema 한 벌로 관리하고, 제공자별로 MCP 툴(Claude/Codex) 또는 function calling 툴(OpenAI 호환)로 변환한다.
- 모든 툴 입력은 실행 전에 스키마로 검증한다.

### 5.6 문서 첨부 (PDF / EPUB / MD)

구독 CLI와 OpenAI 호환 API 모두에서 똑같이 동작하도록 **로컬 처리가 기본**이다.

**처리 파이프라인**
1. 드래그&드롭 → 원본을 앱 데이터 폴더로 복사, SHA-256으로 중복 방지
2. 파싱: PDF → 페이지별 텍스트 (스캔본이면 OCR 필요 경고), EPUB → 장별 Markdown, MD → 헤딩 단위로 분할
3. 메타데이터: 제목/저자/DOI(PDF 첫 페이지), 토큰 수 추정
4. 청크(약 800토큰, 페이지/장 경계 유지) → SQLite FTS5 색인. 임베딩은 선택: 임베딩 API를 쓸 수 있으면 `sqlite-vec`에 저장해서 하이브리드 검색
5. 상태 `ready`

**답변에 쓰는 방식**
- 활성 문서가 작으면(합계가 선택한 모델 컨텍스트의 약 1/4 이하) 변환된 Markdown 전체를 시스템 프롬프트 뒤에 고정 블록으로 넣는다. 세션 동안 바꾸지 않아 제공자 쪽 캐시가 잘 맞는다.
- 크면 `search_documents` 툴로 필요한 조각만 가져온다.
- Claude 구독 제공자는 활성 문서 폴더에 `Read` 권한을 주면 PDF 원본(그림·수식 포함)을 직접 볼 수 있다. 수식/그림이 많은 논문에서 품질이 가장 좋다.

**제거 (완전 삭제)**
- 원본 사본 → 변환 Markdown → 청크/FTS/벡터 행 삭제 → 타임라인의 `doc_ref`는 "삭제된 문서"로 익명화 → 진행 중인 제공자 세션(Claude/Codex 스레드)은 새로 시작해서 대화 맥락에 남은 내용도 끊는다
- "세션 종료 시 이 세션 문서 자동 제거" 옵션
- 삭제 결과를 체크리스트로 표시 (원본 ✓ / 색인 ✓ / 대화 맥락 초기화 ✓)

### 5.7 데이터 모델 (SQLite)

```sql
sessions(id, started_at, ended_at, goal, goal_inferred, planned_min,
         summary_md, provider_thread_id)
timeline(id, session_id, ts, duration_s, app, window_title, summary,
         activity, relevance, doc_id, page, key_terms_json, shot_path NULL)
documents(id, title, authors, kind, sha256, local_path, md_path, tokens,
          status, added_at)
chunks(id, doc_id, page_or_chapter, text)     -- + fts5, 선택적 vec0
messages(id, session_id, role, content_json, ts)
todos(id, text, due_at NULL, condition NULL, status, source)
parking_lot(id, session_id, text, ts, converted_todo_id NULL)
interventions(id, session_id, ts, level, message, user_response)
providers(id, kind, base_url, model_chat, model_summary, has_key, extra_json)
settings(key, value)
```

- 저장 위치: `~/Library/Application Support/StudyPet/` (DB, 문서, 링버퍼)
- API 키는 DB가 아닌 Keychain에 저장 (`providers.has_key`만 기록)

### 5.8 개입 엔진 로직 (의사코드)

```ts
onTimelineEntry(e) {
  if (!session.active || session.onBreak) return;
  const win5 = timeline.last(5), win8 = timeline.last(8);
  const off = (w) => w.filter(x => x.relevance === "off_task").length;

  if (off(win8) >= cfg.l2Threshold && cooldownOk("l2") && hourlyCount < 3) {
    const anchor = timeline.lastWhere(x => x.relevance === "on_task"); // 복귀 지점
    pet.say(await genNudge(session.goal, anchor), ["돌아가기", "5분만 더", "쉬는 중이야"]);
  } else if (off(win5) >= cfg.l1Threshold) {
    pet.setState("curious");
  } else if (e.relevance === "on_task") {
    pet.setState("focus");
  }
}
```
- "5분만 더" → 5분간 개입 억제 후 재평가. 60초 무응답이 2회 연속이면 단계 3.
- 오분류 대비: 말풍선에 "이건 공부 맞아" 버튼 → 해당 앱/사이트/창 제목을 세션 허용 목록에 추가하고 분류 프롬프트 예시로 반영.
- 요약 호출이 실패한 분은 `unknown`으로 기록하고 개입 판단에서 뺀다 (오류 때문에 잔소리하지 않음).

### 5.9 프라이버시 & 보안

- 스크린샷은 로컬에만 저장. 외부로는 1분 요약 호출과 질문 시점에만 나간다. 어느 제공자로 보내는지 설정 화면에 표시하고, 요약 기록 중에는 메뉴바에 🖋️●(일시정지 시 🖋️⏸)를 띄운다. 메뉴바에서 바로 일시정지할 수 있다.
- 캡처 제외 목록 기본값: 1Password, 키체인 접근, 은행/증권 앱, 메신저(카카오톡/Slack/메시지), 시스템 설정. 활성 앱이 목록에 있으면 그 분은 캡처하지 않는다.
- 즉시 일시정지: 전역 단축키(⌥⇧P, Electrobun `GlobalShortcut`), 메뉴바 클릭. 펫이 눈가리개 상태로 바뀐다.
- 민감 화면 자동 폐기 (§5.4).
- 보존: 원본 이미지 최대 20장, 텍스트 타임라인 기본 30일.
- 구독 제공자는 에이전트 CLI이므로 권한을 최소화한다: Claude는 `allowedTools`로 우리 툴과 문서 폴더 `Read`만, Codex는 `read-only` 샌드박스와 전용 작업 폴더.

### 5.10 macOS / Electrobun 구현 주의점

- 화면 기록 권한은 앱 서명/번들 ID에 묶인다. 개발 중에도 고정 번들 ID를 쓰고 Hutch로 서명한다.
- 시스템 WebView(WKWebView)라서 Chromium 전용 API는 못 쓴다. 투명 배경은 `html, body { background: transparent }` 필요.
- 투명 창 빈 영역의 클릭 통과는 창 크기를 펫 크기에 맞추는 방식으로 해결한다 (bunny 템플릿 방식). 말풍선이 열릴 때만 창을 키운다.
- 구독 CLI(`claude`, `codex`)는 앱이 띄우는 자식 프로세스다. 앱 번들의 PATH에는 Homebrew 경로가 없을 수 있으므로 CLI 경로를 설정에서 지정하거나 자동 탐색한다 (`/opt/homebrew/bin`, `~/.local/bin`, `~/.npm-global/bin` 등).
- Claude Agent SDK는 Bun에서 동작 확인 완료. Hutch 설치로도 플랫폼별 실행 파일 패키지가 깔린다. Codex SDK는 Node 기준이라 M2에서 Bun 동작을 확인하고, 문제가 있으면 Node 사이드카로 분리한다.
- 잠금/절전/유휴 감지는 `ioreg`의 HIDIdleTime 폴링 또는 FFI로 구현.

### 5.11 프로젝트 구조 (제안)

```
Study_Pet/
├─ docs/PLAN.md
├─ electrobun.config.ts / package.json / tsconfig.json
├─ src/
│  ├─ bun/                         # 메인 프로세스
│  │  ├─ index.ts                  # 창 생성, Tray, GlobalShortcut
│  │  ├─ rpc.ts                    # RPC 스키마 (펫/패널 공용 타입)
│  │  ├─ capture/{CaptureService,ringBuffer,dhash}.ts
│  │  ├─ context/{ContextService,summarizePrompt}.ts
│  │  ├─ intervention/InterventionEngine.ts
│  │  ├─ llm/{LLMRouter,types}.ts
│  │  ├─ llm/providers/{claudeSub,codexSub,openaiCompat}.ts
│  │  ├─ tools/{ToolHost,mcpServer,webSearch,imageSearch,docsSearch,reminders}.ts
│  │  ├─ docs/{DocumentService,parsers/{pdf,epub,md}}.ts
│  │  ├─ db/{schema.sql,db}.ts
│  │  └─ privacy/{exclusions,keychain}.ts
│  ├─ pet/                         # 펫 창 WebView (React)
│  └─ panel/                       # 패널 창 WebView (React): Chat, Timeline, Library, Todos, Stats, Settings
└─ tests/                          # bun test
```

### 5.12 테스트 & 평가

- 단위 테스트(`bun test`): 링버퍼(20장 초과 시 가장 오래된 것 삭제), dHash 중복 판정, 개입 엔진(가상 타임라인으로 단계 전이), 문서 삭제 3단계 완료, 툴 스키마 → MCP/function calling 변환.
- 제공자 계약 테스트: 세 어댑터에 같은 시나리오(텍스트, 이미지 1장, 툴 1회 호출)를 돌려 `ChatEvent` 순서가 같은지 확인.
- 분류 품질: 본인 화면 캡처 100장에 on/related/off 라벨을 붙이고 요약 모델별 정확도를 잰다. 목표 85% 이상. 이 결과로 요약 역할 기본 모델을 고른다.
- 답변 품질: 첨부 논문 3편, 질문 20개로 인용 페이지가 맞는지 수동 점검.

---

## 6. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 개입이 짜증나서 앱을 끄게 됨 | 보수적인 기본값, 시간당 상한, 👎 피드백으로 임계값 자동 완화, "오늘은 조용히" 모드 |
| 관련도 오분류 (연구 중 웹 탐색을 딴짓으로 판정) | `related` 클래스, 세션 허용 목록, "이건 공부 맞아" 버튼 |
| 구독 사용 한도 소진 / 로그인 만료 | 1분 요약은 구독을 쓰지 않음, 역할별 대체 제공자, 연결 테스트 버튼 |
| 구독 CLI 응답 지연 (프로세스 시작 수 초) | 세션 동안 스레드/세션 재사용, 펫 thinking 애니메이션, 짧은 질문은 Haiku로 보내는 "빠른 답" 옵션 |
| OpenAI 호환 모델마다 비전/툴 지원이 다름 | 연결 테스트로 기능을 확인해 모델별 capability 저장, 미지원이면 텍스트 요약으로 대체 |
| Electrobun이 비교적 새 프레임워크 | M0에서 투명 창·캡처·트레이·단축키·자식 프로세스를 먼저 검증. 막히는 부분은 Bun FFI로 macOS API 직접 호출 |
| `CGWindowListCreateImage` 지원 중단 | `screencapture` CLI 대체 경로를 함께 구현 |
| 구독 로그인 사용 정책 | 개인용으로만 사용, 배포판은 API 키 모드 |

---

## 7. 결정이 필요한 사항 (기본값으로 진행 가능)

1. **캐릭터**: 잉키(잉크 요정, 기본) / 루미(램프 나방) / 모스(이끼 거북)
2. **주 답변 제공자 기본값**: Claude 구독(기본) / Codex 구독 / OpenAI 호환(Ollama Cloud 등)
3. **1분 요약 모델**: Claude 구독 Sonnet으로 결정 (2026-11-06)
4. **캡처 범위**: 세션 중에만(기본) / 항상
5. **이미지 검색**: Wikimedia Commons(무료, 기본) / Brave 키 추가
6. **말투**: 반말 친근형(기본) / 존댓말

---

## 8. 바로 다음 단계

1. M0~M1 (진행 중): 투명 펫 창과 행동 애니메이션 + 입력창 + Claude 구독 대화 + 현재 화면 1장 첨부 질문 + 세션 기반 1분 Sonnet 화면 요약 타임라인 + 화면 변화 감지·자동 일시정지 + 먼저 말 걸기 (구현됨)
2. Bun 환경의 Codex SDK 동작 확인
3. 잉키 스프라이트 시안(idle/focus/curious/thinking) 제작
4. 본인 화면 캡처 100장 라벨링으로 1분 요약 모델 선택
