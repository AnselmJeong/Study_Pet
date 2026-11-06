#!/bin/zsh
# stable 빌드 결과물(자가 압축 해제 래퍼)에서 실제 앱을 풀어,
# 메뉴 막대 앱(LSUIElement)으로 패치하고 ad-hoc 재서명한 뒤 /Applications에 설치한다.
# 사용: hutch run build && scripts/install-app.sh  (기존 /Applications/Inky.app은 덮어쓴다)
set -euo pipefail
cd "${0:A:h}/.."
NAME="Inky"
WRAP="build/stable-macos-arm64/$NAME.app"
DEST="/Applications/$NAME.app"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

[[ -d "$WRAP" ]] || { echo "먼저 hutch run build 를 실행하세요"; exit 1; }
zstd -dc "$WRAP"/Contents/Resources/*.tar.zst | tar -x -C "$STAGE"
APP="$STAGE/$NAME.app"
PLIST="$APP/Contents/Info.plist"

/usr/libexec/PlistBuddy -c "Delete :LSUIElement" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleName $NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Delete :CFBundleDisplayName" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string $NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Delete :CFBundleShortVersionString" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST")" "$PLIST"
/usr/libexec/PlistBuddy -c "Delete :NSScreenCaptureUsageDescription" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSScreenCaptureUsageDescription string 공부 세션 동안 1분마다 화면을 요약해 잉키가 도와주기 위해 사용합니다." "$PLIST"

codesign --force --deep -s - "$APP"
codesign --verify --deep --strict "$APP"

# 실행 중인 앱 종료 (예전 이름 Study Pet 포함)
pkill -f "/(Inky|Study Pet)(-dev)?.app/Contents/MacOS/" 2>/dev/null || true
sleep 1

rm -rf "$DEST"
ditto "$APP" "$DEST"
# Finder/LaunchServices가 새 아이콘과 LSUIElement를 다시 읽게 한다
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST"
touch "$DEST"
echo "설치 완료: $DEST"
