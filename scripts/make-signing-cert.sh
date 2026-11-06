#!/bin/zsh
# 로컬 코드서명 인증서 "Inky Local Signing"을 로그인 키체인에 만든다 (한 번만).
# 고정된 서명 ID로 서명하면 재설치해도 화면 기록 권한이 유지된다.
# 개인 키는 임시 폴더에서만 만들고 키체인에 넣은 뒤 지운다 (프로젝트에 저장하지 않음).
set -euo pipefail
NAME="Inky Local Signing"
KC="$HOME/Library/Keychains/login.keychain-db"

if security find-certificate -c "$NAME" "$KC" >/dev/null 2>&1; then
  echo "이미 있음: $NAME"; security find-identity -p codesigning "$KC" | grep "$NAME" || true; exit 0
fi

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
cat > "$T/ext.cnf" <<CNF
[req]
distinguished_name=dn
x509_extensions=ext
prompt=no
[dn]
CN=$NAME
[ext]
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
subjectKeyIdentifier=hash
CNF

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$T/ext.cnf" \
  -keyout "$T/key.pem" -out "$T/cert.pem" 2>/dev/null
PW="$(openssl rand -hex 16)"
# macOS security는 OpenSSL 3 기본 p12 암호화를 못 읽으므로 -legacy를 먼저 시도한다
openssl pkcs12 -export -legacy -inkey "$T/key.pem" -in "$T/cert.pem" -name "$NAME" \
  -out "$T/id.p12" -passout "pass:$PW" 2>/dev/null \
  || openssl pkcs12 -export -inkey "$T/key.pem" -in "$T/cert.pem" -name "$NAME" \
       -out "$T/id.p12" -passout "pass:$PW"
security import "$T/id.p12" -k "$KC" -P "$PW" -T /usr/bin/codesign

echo "만들었음: $NAME (10년)"
security find-identity -p codesigning "$KC" | grep "$NAME" \
  || echo "참고: 신뢰 설정이 없어 'valid'로는 안 보일 수 있지만 codesign -s \"$NAME\" 은 동작한다."
