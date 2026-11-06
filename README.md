# Inky (잉키) — Study Pet

PC로 공부하거나 연구하는 동안 화면 구석에서 같이 있어 주는 학습 동반자 펫. 자세한 계획은 [docs/PLAN.md](docs/PLAN.md).

현재 단계: **M0~M1 프로토타입**
- 투명·항상 위 펫 창 (잉키), 클릭하면 입력창, 드래그로 이동. 가만히 있을 때 깡총, 두리번, 기지개, 책 읽기, 손 흔들기, 졸기, 빙글, 화면 위 걷기 등을 한다
- 질문할 때 현재 화면 1장을 첨부해서 답변 (스트리밍)
  - **Claude 구독 (기본)**: `@anthropic-ai/claude-agent-sdk`로 이 Mac에 로그인된 Claude Code 인증을 그대로 쓴다. API 키 불필요, 모델 sonnet/opus/haiku. 앱에 Anthropic API 키를 넣으면 API 과금으로 전환. SDK 내장 실행 파일을 못 찾으면 설치된 `claude`(`~/.local/bin/claude` 등)를 쓴다
  - OpenAI 호환 API (Ollama Cloud / 직접 입력): API 키 필요. 로컬 Ollama는 쓰지 않는다
  - 대화와 화면 요약에 제공자·모델을 따로 고를 수 있다
- **공부 세션 + 화면 요약 기록**: 메뉴바에서 세션을 시작하면 1분마다(설정 가능) 화면을 찍어 Claude 구독 Sonnet으로 한 줄 요약하고 `timeline.jsonl`에 저장한다
  - 16×16 지문으로 직전 화면과 비교해 바뀌지 않았으면 요약 호출 없이 직전 기록을 이어 붙인다
  - 화면이 잠기면 바로, 입력도 화면 변화도 없이 5분이 지나면 자동 일시정지. 다시 입력이 생기면 잉키가 알려 주고 재개한다
  - 입력 없이 화면만 바뀔 때(강의 영상 등)는 3분 간격으로만 캡처·요약해서 사용량을 아낀다 (두 시간 모두 설정에서 변경)
  - 목표와의 관련도(on_task / related / off_task / break)를 기록하고, 몇 분째 딴 데 있으면 부드럽게 복귀를 제안한다
  - 민감한 화면(비밀번호, 금융 정보, 개인 메시지)은 내용 없이 기록하고 스크린샷을 바로 지운다. 제외 앱(1Password, 메시지, 카카오톡, Slack 등)은 찍지 않는다
  - 질문할 때 최근 기록을 맥락으로 쓴다
- **웹 검색 (TinyFish)**: 설정 → 웹 검색에 TinyFish API 키를 넣으면, 잉키가 필요할 때 알아서 검색하고 출처 URL을 붙여 답한다. 입력창의 🔎를 켜면 항상 먼저 검색한다
- **먼저 말 걸기**: 12~25분 간격으로 화면에 맞춘 격려, 가벼운 농담, 50분 넘게 집중하면 쉬자는 말 (설정에서 끄거나 간격 변경)
- 패널 창: 대화, 기록(타임라인), 설정
- 메뉴바 아이콘(🖋️● = 세션 중), 전역 단축키 `⌥Space` (안 되면 `⌘⇧Space`)
- API 키는 macOS Keychain에 저장. 스크린샷은 `~/Library/Application Support/dev.anselm.studypet/dev/shots`에 최근 20장, 최대 60분만 보관하고 자동 삭제 (설정에서 변경)

## 실행 (macOS)

```bash
# 1) Hutch 설치 (Electrobun 빌드 도구, 한 번만)
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh

# 2) 의존성 설치 후 실행
hutch run install
hutch run start
```

처음 실행하면 설정 패널이 열린다.
1. Claude Code에 로그인되어 있는지 확인한다 (터미널에서 `claude` 한 번 실행)
2. 대화·요약 제공자 **Claude 구독**, 모델 `sonnet` → **연결 확인** → **저장**
3. 화면 기록 권한을 허용하고 앱을 다시 실행한다 (개발 중에는 `hutch run start`를 실행한 터미널 앱에 권한이 필요할 수 있음)
4. 메뉴바 🖋️ → **공부 세션 시작**

구독 로그인 사용은 본인 Mac에서 본인 계정으로 쓰는 개인용 전제다.

## 구조

```
src/bun/          메인 프로세스 (창, 트레이, 단축키, 캡처, 세션·타임라인, LLM 호출, 설정)
src/bun/llm/      제공자 어댑터 (claudeSub: Agent SDK, openaiCompat) + router
src/shared/       Bun과 WebView가 같이 쓰는 RPC/타입
src/views/pet/    펫 창 (투명)
src/views/panel/  대화·기록·설정 패널
```

## 릴리스 설치 (/Applications)

```bash
hutch run build            # stable 채널 빌드 → build/stable-macos-arm64/
scripts/install-app.sh     # 앱을 풀어 LSUIElement(Dock 숨김) 패치, ad-hoc 재서명, /Applications/Inky.app 설치
open "/Applications/Inky.app"
```

- 아이콘: `assets/icon.svg`(잉키) → `scripts/make-icon.sh` → `assets/icon.iconset` (electrobun.config.ts의 `build.mac.icons`).
- stable 데이터 폴더: `~/Library/Application Support/dev.anselm.studypet/stable/` (dev는 `.../dev/`).
- 앱 이름은 Inky(번들 ID dev.anselm.studypet, Keychain 서비스도 동일). 개발 실행은 Inky-dev.
- 펫/패널 창 우클릭은 WebView 기본 메뉴 대신 앱 메뉴(ContextMenu)를 띄운다.
- ad-hoc 서명이라 재설치할 때마다 화면 기록 권한을 다시 켜야 할 수 있다.
