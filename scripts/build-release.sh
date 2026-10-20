#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Cloud onboarding keeps the private signing material outside the checkout.
if [[ -z "${TODO_KEYSTORE:-}" && -f /workspace/.todo-signing/release.jks ]]; then
  export TODO_KEYSTORE=/workspace/.todo-signing/release.jks
  export TODO_STORE_PASSWORD="$(cat /workspace/.todo-signing/credentials)"
  export TODO_KEY_PASSWORD="$TODO_STORE_PASSWORD"
fi
: "${TODO_KEYSTORE:?Set TODO_KEYSTORE to the original release keystore}"
: "${TODO_STORE_PASSWORD:?Set TODO_STORE_PASSWORD}"
: "${TODO_KEY_PASSWORD:?Set TODO_KEY_PASSWORD}"
./gradlew testDebugUnitTest lintRelease assembleRelease --no-daemon "$@"
mkdir -p dist
cp app/build/outputs/apk/release/app-release.apk dist/My-TODO.apk
(cd dist && sha256sum My-TODO.apk > SHA256SUMS.txt)
"${ANDROID_HOME:?}/build-tools/35.0.0/apksigner" verify --verbose --print-certs dist/My-TODO.apk
