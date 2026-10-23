#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HOOK="$ROOT/pacman-hooks/fluxion-pacman-hook"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/state" "$TMP/requests"

cat > "$TMP/bin/pacman" <<'PACMAN'
#!/bin/bash
[[ "${FAKE_PACMAN_FAIL:-0}" == "22" ]] && exit 22
cat "$FLUXION_TEST_LISTING"
PACMAN
cat > "$TMP/bin/hostname" <<'HOSTNAME'
#!/bin/bash
if [[ "${1:-}" == "-f" ]]; then printf '%s\n' "${FAKE_HOSTNAME_F:-arch.test}"; else printf '%s\n' "${FAKE_HOSTNAME:-arch.test}"; fi
HOSTNAME
cat > "$TMP/bin/curl" <<'CURL'
#!/bin/bash
url=""; payload=""; headers=""; args="$*"
config=$(cat)
config_header=$(printf '%s' "$config" | sed -n 's/^header = "\(.*\)"$/\1/p' | head -n 1)
[[ -n "$config_header" ]] && headers="${headers}${config_header}"$'\n'
while (($#)); do
  case "$1" in
    -d) payload=$2; shift 2;;
    -H) headers="${headers}${2}"$'\n'; shift 2;;
    http:*|https:*) url=$1; shift;;
    *) shift;;
  esac
done
n=$(find "$FLUXION_REQUEST_DIR" -name 'body.*' | wc -l)
printf '%s' "$payload" > "$FLUXION_REQUEST_DIR/body.$n"
printf '%s' "$url" > "$FLUXION_REQUEST_DIR/url.$n"
printf '%s' "$headers" > "$FLUXION_REQUEST_DIR/headers.$n"
printf '%s\n' "$args" > "$FLUXION_REQUEST_DIR/args.$n"
printf '%s' "$config" > "$FLUXION_REQUEST_DIR/config.$n"
[[ "${FAKE_CURL_FAIL:-0}" == "22" ]] && exit 22
CURL
chmod 755 "$TMP/bin/"*
BEFORE="$TMP/before"; AFTER="$TMP/after"
printf 'bash 5.2.026-2\nvim 9.1.0785-1\ninetutils 2.5-1\n' > "$BEFORE"
printf 'bash 5.2.037-1\nvim 9.1.0785-1\nhtop 3.3.0-4\n' > "$AFTER"
export PATH="$TMP/bin:$PATH" FLUXION_STATE_DIR="$TMP/state" FLUXION_REQUEST_DIR="$TMP/requests"
export FLUXION_TEST_LISTING="$BEFORE" FLUXION_API_URL="https://fluxion.test/api/v1" FLUXION_API_KEY=k1

fail() { echo "FAIL: $1" >&2; exit 1; }
reset_requests() { rm -rf "$TMP/requests"; mkdir "$TMP/requests"; }

test_stage_then_report_sends_differences() {
  reset_requests
  export FLUXION_TEST_LISTING="$BEFORE"; "$HOOK" stage
  export FLUXION_TEST_LISTING="$AFTER"; "$HOOK" report
  [[ $(find "$TMP/requests" -name 'body.*' | wc -l) -eq 1 ]] || fail 'difference request count'
  python3 - "$TMP/requests/body.0" <<'PYBODY'
import json,sys
body=json.load(open(sys.argv[1]))
assert body['updates'] == [
 {'package_name':'bash','old_version':'5.2.026-2','new_version':'5.2.037-1','is_security':False},
 {'package_name':'htop','old_version':None,'new_version':'3.3.0-4','is_security':False},
 {'package_name':'inetutils','old_version':'2.5-1','new_version':'removed','is_security':False},
], body['updates']
PYBODY
  "$HOOK" report
  [[ $(find "$TMP/requests" -name 'body.*' | wc -l) -eq 1 ]] || fail 'report sent twice'
}

test_report_request_shape_and_chunks() {
  reset_requests
  cat > "$TMP/config" <<EOFCONFIG
FLUXION_API_URL=https://fluxion.test/api/v1
FLUXION_API_KEY=k1
FLUXION_LOG_FILE=$TMP/fluxion.log
EOFCONFIG
  export FLUXION_CONFIG_FILE="$TMP/config" FLUXION_API_URL="" FLUXION_API_KEY=""
  export FLUXION_TEST_LISTING="$BEFORE"; "$HOOK" stage
  for i in $(seq -w 1 150); do printf 'pkg%s 1\n' "$i" >> "$BEFORE.large" 2>/dev/null || true; done
  : > "$BEFORE"; : > "$AFTER"
  for i in $(seq -w 1 150); do printf 'pkg%s 1\n' "$i" >> "$BEFORE"; printf 'pkg%s 2\n' "$i" >> "$AFTER"; done
  export FAKE_HOSTNAME_F="arch/edge.test"
  export FLUXION_TEST_LISTING="$BEFORE"; "$HOOK" stage
  export FLUXION_TEST_LISTING="$AFTER"; "$HOOK" report
  [[ $(find "$TMP/requests" -name 'body.*' | wc -l) -eq 2 ]] || fail 'chunk request count'
  python3 - "$TMP/requests" <<'PYCHUNK'
import glob,json,sys
root=sys.argv[1]
urls=sorted(glob.glob(root+'/url.*')); bodies=sorted(glob.glob(root+'/body.*')); headers=sorted(glob.glob(root+'/headers.*'))
assert all(open(u).read() == 'https://fluxion.test/api/v1/updates/ingest/pacman' for u in urls)
assert all(open(h).read().splitlines().count('X-API-Key: k1') == 1 for h in headers)
chunks=[json.loads(open(f).read()) for f in bodies]
assert [len(c['updates']) for c in chunks] == [100,50]
names=[u['package_name'] for c in chunks for u in c['updates']]
assert len(names)==len(set(names))==150
assert all(c['hostname']=='arch/edge.test' for c in chunks)
for args_file in sorted(glob.glob(root+'/args.*')):
    assert 'k1' not in open(args_file).read()
PYCHUNK
  cat > "$TMP/pwned-config" <<'PWN'
FLUXION_API_URL=$(touch $TMP/pwned)
FLUXION_API_KEY=k1
PWN
  export FLUXION_CONFIG_FILE="$TMP/pwned-config" FLUXION_API_URL="" FLUXION_API_KEY=""
  "$HOOK" report
  [[ ! -e "$TMP/pwned" ]] || fail 'config was sourced'
  cat > "$TMP/no-key-config" <<'NOKEY'
FLUXION_API_URL=https://fluxion.test/api/v1
NOKEY
  reset_requests
  export FLUXION_CONFIG_FILE="$TMP/no-key-config" FLUXION_API_URL="" FLUXION_API_KEY=""
  export FLUXION_TEST_LISTING="$BEFORE"; "$HOOK" stage
  export FLUXION_TEST_LISTING="$AFTER"; "$HOOK" report
  [[ $(find "$TMP/requests" -name 'body.*' | wc -l) -eq 0 ]] || fail 'missing API key sent a request'
  cat > "$TMP/http-config" <<'HTTP'
FLUXION_API_URL=http://fluxion.test/api/v1
FLUXION_API_KEY=k1
HTTP
  reset_requests
  export FLUXION_CONFIG_FILE="$TMP/http-config" FLUXION_API_URL="" FLUXION_API_KEY=""
  export FLUXION_TEST_LISTING="$BEFORE"; "$HOOK" stage
  export FLUXION_TEST_LISTING="$AFTER"; "$HOOK" report
  [[ $(find "$TMP/requests" -name 'body.*' | wc -l) -eq 0 ]] || fail 'HTTP endpoint sent with API key'
}

test_hook_fail_safe() {
  reset_requests
  cat > "$TMP/config" <<EOFCONFIG2
FLUXION_API_URL=https://fluxion.test/api/v1
FLUXION_API_KEY=k1
FLUXION_LOG_FILE=$TMP/fluxion.log
EOFCONFIG2
  export FLUXION_CONFIG_FILE="$TMP/config" FLUXION_API_URL="" FLUXION_API_KEY="" FAKE_CURL_FAIL=22
  export FLUXION_TEST_LISTING="$BEFORE"; "$HOOK" stage
  export FLUXION_TEST_LISTING="$AFTER"; "$HOOK" report
  [[ $? -eq 0 ]] || fail 'curl failure exit'
  [[ ! -e "$TMP/state/pacman-before.list" ]] || fail 'staged file not removed'
  grep -q '\[ERROR\]' "$TMP/fluxion.log" || fail 'curl failure not logged'

  export FAKE_CURL_FAIL=0 FLUXION_CONFIG_FILE="$TMP/config" FLUXION_API_URL="" FLUXION_API_KEY=""
  export FLUXION_TEST_LISTING="$BEFORE"; "$HOOK" stage
  reset_requests
  export FAKE_PACMAN_FAIL=22; "$HOOK" report
  [[ $? -eq 0 ]] || fail 'pacman query failure exit'
  [[ ! -e "$TMP/state/pacman-before.list" ]] || fail 'pacman failure stage not removed'
  [[ $(find "$TMP/requests" -name 'body.*' | wc -l) -eq 0 ]] || fail 'pacman failure reported removals'

  export FAKE_PACMAN_FAIL=0; reset_requests
  export FLUXION_STATE_DIR="$TMP/state" FLUXION_API_URL="https://fluxion.test/api/v1" FLUXION_API_KEY=k1
  chmod 555 "$TMP/state"; "$HOOK" stage >/dev/null 2>&1 || fail 'stage exited nonzero on read-only state'
  chmod 755 "$TMP/state"

  export FLUXION_API_URL="" FLUXION_API_KEY="" FLUXION_CONFIG_FILE="$TMP/missing-config"
  rm -f "$TMP/state/pacman-before.list"; "$HOOK" stage; [[ $? -eq 0 ]] || fail 'stage no URL exit'
  [[ ! -e "$TMP/state/pacman-before.list" ]] || fail 'stage wrote without URL'
  "$HOOK" report; [[ $? -eq 0 ]] || fail 'report no staged file exit'
}

test_hook_files_register_stage_and_report() {
  python3 - "$ROOT" <<'PYPY'
import pathlib,sys
root=pathlib.Path(sys.argv[1])
def content(name):
 return [x.strip() for x in (root/'pacman-hooks'/name).read_text().splitlines() if x.strip() and not x.lstrip().startswith('#')]
stage=['[Trigger]','Operation = Install','Operation = Upgrade','Operation = Remove','Type = Package','Target = *','[Action]','Description = Recording package versions for Fluxion','When = PreTransaction','Exec = /usr/local/lib/fluxion/fluxion-pacman-hook stage']
report=['[Trigger]','Operation = Install','Operation = Upgrade','Operation = Remove','Type = Package','Target = *','[Action]','Description = Reporting package changes to Fluxion','When = PostTransaction','Exec = /usr/local/lib/fluxion/fluxion-pacman-hook report']
assert content('fluxion-stage.hook') == stage
assert content('fluxion-report.hook') == report
PYPY
}

test_stage_then_report_sends_differences
test_report_request_shape_and_chunks
test_hook_fail_safe
test_hook_files_register_stage_and_report

echo 'All pacman hook tests passed'
