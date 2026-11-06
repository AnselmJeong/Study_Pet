# 캐릭터 팩: 잉키 대신 다른 캐릭터 쓰기

잉키 자리에 다른 캐릭터를 넣을 수 있게 "캐릭터 팩"이라는 폴더 형식을 만든다. 팩은 이미지 몇 장과 `pack.json` 하나로 이루어진 폴더이고, 설정 > 캐릭터에서 "폴더나 zip에서 가져오기"로 폴더 또는 그 폴더를 압축한 .zip을 넣고 고르면 바로 바뀐다.

## 1. 팩 폴더 구조

```
my-character/
  pack.json          ← 필수
  preview.png        ← 선택 (설정 화면 썸네일, 없으면 idle 첫 장)
  idle/              ← 폴더 안 이미지를 이름순으로 프레임으로 사용
    01.png
    02.png
  talk.png           ← 가로로 이어 붙인 스프라이트 시트도 가능
  sleep.gif          ← 움직이는 GIF/WebP/APNG 한 장도 가능
  happy.png          ← 정지 이미지 한 장도 가능
```

지원 이미지: PNG, WebP, GIF, JPG, SVG. 배경은 투명해야 펫처럼 보인다.

## 2. pack.json

```json
{
  "format": 1,
  "id": "my-character",
  "name": "내 캐릭터",
  "author": "Anselm",
  "description": "공부할 때 옆에 있는 친구",
  "height": 150,
  "fps": 6,
  "motion": true,
  "states": {
    "idle":  { "frames": ["idle/open.png", "idle/closed.png"], "durations": [3000, 150] },
    "talk":  { "sheet": "talk.png", "columns": 4, "count": 4, "fps": 8 },
    "think": "think.png",
    "happy": "happy.png",
    "sleep": "sleep.gif",
    "read":  "idle/",
    "wave":  { "frames": ["wave1.png", "wave2.png"], "fps": 4 }
  }
}
```

| 키 | 뜻 |
|---|---|
| `id` | 영문 소문자, 숫자, `-`만. 같은 id로 다시 가져오면 덮어쓴다 |
| `height` | 화면에 그릴 높이(px, 80~260). 폭은 이미지 비율대로 |
| `fps` | 기본 프레임 속도. 상태마다 따로 줄 수도 있다 |
| `motion` | `true`면 앱이 통통 튀기, 숨쉬기, 흔들기, 회전 같은 움직임을 이미지 전체에 덧입힌다. 이미지가 한 장뿐이어도 살아 있는 느낌이 난다 |
| `states` | 상태별 이미지. 문자열(파일, 폴더 `"dir/"`) 또는 객체 |

상태 객체 옵션: `frames`(파일 목록 또는 폴더), `sheet` + `columns` + `rows` + `count`(스프라이트 시트), `fps`, `durations`(프레임마다 ms, 눈 깜빡임에 유용), `loop`(기본 true).

### 상태 이름과 대체 규칙

`idle` 하나만 필수다. 없는 상태는 오른쪽 상태로 대신 그린다.

| 상태 | 언제 | 없으면 |
|---|---|---|
| `idle` | 가만히 있을 때 | (필수) |
| `talk` | 대답을 쓰는 중 | idle |
| `think` | 생각 중 | idle |
| `happy` | 대답을 끝냈을 때 | idle |
| `error` | 오류 | idle |
| `focus` | 공부 세션 중 | read → idle |
| `read` | 책 읽는 행동 | idle |
| `wave` | 손 흔들기, 먼저 말 걸 때 | happy → idle |
| `sleep` | 졸기 (밤늦게 자주) | idle |
| `walk` | 옆으로 걸을 때 | idle |
| `hop` `stretch` `spin` `look` | 짧은 행동 | idle |

## 3. 아바타 만드는 법

핵심은 "같은 캐릭터를 여러 포즈로 일관되게" 만드는 것이다. 순서는 이렇다.

1. **기준 이미지 한 장.** 정면, 전신, 2~3등신 치비 스타일, 흰 배경으로 만든다. 프롬프트 예: `chibi anime girl, full body, front view, short black bob hair, round glasses, beige cardigan, flat cel shading, clean line art, plain white background, sticker style`.
2. **같은 캐릭터로 포즈 바꾸기.** 기준 이미지를 첨부하고 "이 캐릭터 그대로, 눈만 감은 버전" 식으로 한 가지씩만 바꿔 달라고 하면 일관성이 가장 잘 유지된다. 추천 도구:
   - **Gemini (Nano Banana)**, **ChatGPT 이미지 생성**: 이미지 첨부 후 부분 수정이 쉽다. 가장 손쉬운 방법.
   - **Midjourney**: `--cref`/옴니 레퍼런스로 같은 캐릭터 유지.
   - **ComfyUI / Stable Diffusion**: IP-Adapter나 캐릭터 LoRA로 가장 세밀하게 제어. 손이 많이 간다.
   만들 것: idle(눈 뜸), idle(눈 감음), talk(입 벌림), happy(웃는 눈), think, sleep, read(책 든 포즈), wave(팔 올림 1~2장). 처음엔 idle 두 장과 talk 한 장만 있어도 충분하다.
3. **배경 지우기.** macOS에서는 Finder에서 이미지 우클릭 > 빠른 동작 > 배경 제거, 또는 미리보기 앱. 웹은 remove.bg, Photoroom. 결과를 투명 PNG로 저장.
4. **크기와 발 위치 맞추기.** 모든 프레임을 같은 캔버스(예: 512×512)에 놓고 발끝 높이를 맞춘다. Photopea(무료 웹 포토샵), Aseprite, Piskel이 편하다. 프레임마다 위치가 어긋나면 캐릭터가 떨려 보인다.
5. **폴더에 넣고 pack.json 작성** (위 예시 복사해서 파일 이름만 바꾸면 된다) → 설정 > 캐릭터 > 폴더나 zip에서 가져오기.

### 저작권 메모

기존 애니메이션 캐릭터(예: 보탄 카미이나)를 그대로 따라 그린 이미지나 공식 일러스트를 오려 쓰는 건 본인 컴퓨터에서 혼자 쓰는 정도로 두는 게 좋고, 앱과 함께 배포하거나 공유하면 안 된다. 그래서 앱에 기본으로 넣는 샘플은 직접 만든 오리지널 캐릭터로만 한다. 마음에 드는 캐릭터의 "분위기"(헤어스타일 계열, 색감, 표정 느낌)를 참고해 나만의 캐릭터를 디자인하는 쪽을 추천한다.

## 4. 앱에 들어가는 것

- 설정 > 캐릭터: 팩 목록(썸네일), 선택, 폴더에서 가져오기, 팩 폴더 열기, 삭제
- 기본 팩 두 개: 잉키(기존 SVG), 요미(오리지널 치비 샘플, 위 형식으로 만든 예제라 그대로 복사해서 고쳐 쓸 수 있다)
- 가져온 팩은 앱 데이터 폴더의 `packs/<id>/`에 복사된다
