# Study Pet (잉키)

PC로 공부하거나 연구하는 동안 화면 구석에서 같이 있어 주는 학습 동반자 펫. 자세한 계획은 [docs/PLAN.md](docs/PLAN.md).

현재 단계: **M0 프로토타입**
- 투명·항상 위 펫 창 (잉키), 클릭하면 입력창, 드래그로 이동
- 질문할 때 현재 화면 1장을 첨부해서 OpenAI 호환 API(Ollama Cloud / 로컬 Ollama / 직접 입력)로 답변 (스트리밍)
- 패널 창: 대화 기록, 설정 (Base URL, API 키, 모델 목록 불러오기, 연결 테스트)
- 메뉴바 아이콘, 전역 단축키 `⌥Space` (안 되면 `⌘⇧Space`)
- API 키는 macOS Keychain에 저장, 스크린샷은 `~/Library/Application Support/…/shots`에 최근 20장만 보관

## 실행 (macOS)

```bash
# 1) Hutch 설치 (Electrobun 빌드 도구, 한 번만)
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh

# 2) 의존성 설치 후 실행
hutch run install
hutch run dev
```

처음 실행하면 설정 패널이 열린다.
1. 종류에서 **Ollama Cloud**를 고르고 API 키를 넣는다 (ollama.com → Settings → API keys)
2. **목록 불러오기**로 모델을 고른다 (화면을 보려면 비전 모델, 예: qwen3-vl 계열)
3. **연결 테스트** → **저장**
4. 화면 기록 권한을 허용하고 앱을 다시 실행한다 (개발 중에는 `hutch run dev`를 실행한 터미널 앱에 권한이 필요할 수 있음)

## 구조

```
src/bun/          메인 프로세스 (창, 트레이, 단축키, 캡처, LLM 호출, 설정)
src/shared/       Bun과 WebView가 같이 쓰는 RPC/타입
src/views/pet/    펫 창 (투명)
src/views/panel/  대화·설정 패널
```
