#!/usr/bin/env bash
# Reproduce the cloud toolchain without writing into the host's read-only home.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p /workspace/.tools/downloads
fetch() {
  local url="$1" file="$2" algorithm="$3" expected="$4"
  if [[ ! -f "$file" ]]; then curl --fail --location --retry 2 "$url" -o "$file"; fi
  python3 - "$file" "$algorithm" "$expected" <<'PY'
import hashlib,sys
with open(sys.argv[1],'rb') as stream:
    digest=hashlib.file_digest(stream,sys.argv[2]).hexdigest()
if digest!=sys.argv[3]: raise SystemExit('Artifact checksum mismatch: '+sys.argv[1])
PY
}
fetch 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_x64_linux_hotspot_21.0.8_9.tar.gz' /workspace/.tools/downloads/jdk.tar.gz sha256 f2dc5418092c43003db8f9005c4a286e1c0104fea96ccdd49e8ebd037cac9219
if [[ ! -x /workspace/.tools/jdk-21.0.8+9/bin/javac ]]; then tar -xzf /workspace/.tools/downloads/jdk.tar.gz -C /workspace/.tools; fi
fetch 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip' /workspace/.tools/downloads/cli12.zip sha1 d313adb7aedccf6cf0cfca51ec180f0059f5f8f8
if [[ ! -x /workspace/.tools/cli12/cmdline-tools/bin/sdkmanager ]]; then mkdir -p /workspace/.tools/cli12; unzip -q /workspace/.tools/downloads/cli12.zip -d /workspace/.tools/cli12; fi
source scripts/cloud-env.sh
cp "$JAVA_HOME/lib/security/cacerts" /workspace/.tools/cacerts
if [[ -n "${CODEX_PROXY_CERT:-}" && -f "$CODEX_PROXY_CERT" ]]; then
  "$JAVA_HOME/bin/keytool" -importcert -noprompt -keystore /workspace/.tools/cacerts -storepass changeit -alias cloud-egress-proxy -file "$CODEX_PROXY_CERT"
fi
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djavax.net.ssl.trustStore=/workspace/.tools/cacerts"
python3 - <<'PY'
import os,pathlib,urllib.parse,subprocess
u=urllib.parse.urlparse(os.environ.get('HTTPS_PROXY',''))
props={'systemProp.javax.net.ssl.trustStore':'/workspace/.tools/cacerts'}
args=['/workspace/.tools/cli12/cmdline-tools/bin/sdkmanager','--sdk_root='+os.environ['ANDROID_HOME']]
if u.hostname:
    for scheme in ['http','https']:
        props['systemProp.'+scheme+'.proxyHost']=u.hostname
        props['systemProp.'+scheme+'.proxyPort']=str(u.port or 80)
    props['systemProp.http.nonProxyHosts']='localhost|127.*'
    args+=['--proxy=http','--proxy_host='+u.hostname,'--proxy_port='+str(u.port or 80)]
p=pathlib.Path(os.environ['GRADLE_USER_HOME'])/'gradle.properties'
existing=p.read_text().splitlines() if p.exists() else []
existing=[s for s in existing if s.partition('=')[0] not in props]
p.write_text('\n'.join(existing+[k+'='+v for k,v in props.items()])+'\n')
sdk=pathlib.Path(os.environ['ANDROID_HOME'])
if not all((sdk / path).exists() for path in ['platforms/android-35/android.jar','build-tools/35.0.0/apksigner','platform-tools/adb']):
    subprocess.run(args+['--licenses'],input=b'y\n'*100,check=True)
    subprocess.run(args+['platforms;android-35','build-tools;35.0.0','platform-tools'],input=b'y\n'*100,check=True)
PY
npm ci --ignore-scripts
npm test
./gradlew testDebugUnitTest lintRelease assembleDebug --no-daemon
