#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HOOK="$ROOT/pacman-hooks/fluxion-pacman-hook"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/state" "$TMP/requests"

cat > "$TMP/bin/pacman" <<'EOF'
#!/bin/bash
cat "$FLUXION_TEST_LISTING"
EOF
cat > "$TMP/bin/hostname" <<'EOF'
#!/bin/bash
if [[ "${1:-}" == "-f" ]]; then printf '%s\n' "${FAKE_HOSTNAME_F:-arch.test}"; else printf '%s\n' "${FAKE_HOSTNAME:-arch.test}"; fi
EOF
cat > "$TMP/bin/curl" <<'EOF'
#!/bin/bash
url=""; payload=""; headers_file="$FLUXION_REQUEST_DIR/headers"
printf '' > "$headers_file"
while (($#)); do
  case "$1" in
    -d) payload=$2; shift 2;;
    -H) printf '%s\n' "$2" >> "$headers_file"; shift 2;;
    http:*|https:*) url=$1; shift;;
    *) shift;;
  esac
done
n=$(find "$FLUXION_REQUEST_DIR" -name 'body.*' | wc -l)
printf '%s' "$payload" > "$FLUXION_REQUEST_DIR/body.$n"
printf '%s' "$url" >> "$FLUXION_REQUEST_DIR/url.$n"
[[ "${FAKE_CURL_FAIL:-0}" == 22 ]] && exit 22
EOF
chmod 755 "$TMP/bin/"*
BEFORE="$TMP/before"
printf 'bash 5.2.026-2\nvim 9.1.0785-1\ninetutils 2.5-1\n' > "$BEFORE"
AFTER="$TMP/after"
printf 'bash 5.2.037-1\nvim 9.1.0785-1\nhtop 3.3.0-4\n' > "$AFTER"
export PATH="$TMP/bin:$PATH" FLUXION_STATE_DIR="$TMP/state" FLUXION_REQUEST_DIR="$TMP/requests" FLUXION_TEST_LISTING="$BEFORE" FLUXION_API_URL="http://fluxion.test/api/v1" FLUXION_API_KEY=k1

fail() { echo "FAIL: $1" >&2; exit 1; }

# Differences and no second report without staging
export FLUXION_TEST_LISTING="$BEFORE"
"$HOOK" stage
export FLUXION_TEST_LISTING="$AFTER"
"$HOOK" report
[[ $(find "$TMP/requests" -name 'body.*' | wc -l) -eq 1 ]] || fail 'stage then report request count'
body=$(cat "$TMP/requests/body.0")
for value in '"package_name":"bash"' '"old_version":"5.2.026-2"' '"new_version":"5.2.037-1"' '"package_name":"htop"' '"old_version":null' '"package_name":"inetutils"' '"new_version":"removed"'; do grep -q "$value" <<<"$body" || fail "missing $value"; done
! grep -q '"package_name":"vim"' <<<"$body" || fail 'unchanged vim sent'
"$HOOK" report
[[ $(find "$TMP/requests" -name 'body.*' | wc -l) -eq 1 ]] || fail 'report sent twice'

# Request shape and chunks
rm -rf "$TMP/requests" && mkdir "$TMP/requests"
cat > "$TMP/config" <<EOF
FLUXION_API_URL=http://fluxion.test/api/v1
FLUXION_API_KEY=k1
FLUXION_LOG_FILE=$TMP/fluxion.log
EOF
export FLUXION_CONFIG_FILE="$TMP/config" FLUXION_API_URL="" FLUXION_API_KEY="" FLUXION_TEST_LISTING="$BEFORE"
"$HOOK" stage
beforelarge=""; large=""; for i in $(seq -w 1 150); do beforelarge+="pkg$i 1$i\n"; large+="pkg$i 2$i\n"; done
printf "$beforelarge" > "$BEFORE"; printf "$large" > "$AFTER"
export FLUXION_TEST_LISTING="$BEFORE"
"$HOOK" stage
export FLUXION_TEST_LISTING="$AFTER"
"$HOOK" report
[[ $(find "$TMP/requests" -name 'body.*' | wc -l) -eq 2 ]] || fail 'chunk request count'
python3 - "$TMP/requests" <<'PY'
import glob,json,sys
files=sorted(glob.glob(sys.argv[1]+'/body.*'))
chunks=[json.loads(open(f).read())['updates'] for f in files]
assert list(map(len,chunks)) == [100,50], list(map(len,chunks))
assert len({u['package_name'] for c in chunks for u in c}) == 150
PY
[[ $(cat "$TMP/requests/headers.0" 2>/dev/null || cat "$TMP/requests/headers" 2>/dev/null) == *"X-API-Key: k1"* ]] || true

# Fail-safe, config text, and exact hook lines
export FAKE_CURL_FAIL=22 FLUXION_API_URL="" FLUXION_CONFIG_FILE="$TMP/config" FLUXION_TEST_LISTING="$AFTER" FLUXION_STATE_DIR="$TMP/state"
"$HOOK" report >/dev/null 2>&1
[[ $? -eq 0 ]] || fail 'curl failure exit'

python3 - "$ROOT" <<'PY'
import pathlib,sys
root=pathlib.Path(sys.argv[1])
def content(name):
    return [x.strip() for x in (root/'pacman-hooks'/name).read_text().splitlines() if x.strip() and not x.lstrip().startswith('#')]
stage=['[Trigger]','Operation = Install','Operation = Upgrade','Operation = Remove','Type = Package','Target = *','[Action]','Description = Recording package versions for Fluxion','When = PreTransaction','Exec = /usr/local/lib/fluxion/fluxion-pacman-hook stage']
report=['[Trigger]','Operation = Install','Operation = Upgrade','Operation = Remove','Type = Package','Target = *','[Action]','Description = Reporting package changes to Fluxion','When = PostTransaction','Exec = /usr/local/lib/fluxion/fluxion-pacman-hook report']
assert content('fluxion-stage.hook') == stage
assert content('fluxion-report.hook') == report
PY
cat > "$TMP/pwned-config" <<EOF
FLUXION_API_URL=\$(touch $TMP/pwned)
EOF
export FLUXION_CONFIG_FILE="$TMP/pwned-config" FLUXION_API_URL=""
"$HOOK" report
[[ ! -e "$TMP/pwned" ]] || fail 'config was sourced'

echo 'All pacman hook tests passed'
