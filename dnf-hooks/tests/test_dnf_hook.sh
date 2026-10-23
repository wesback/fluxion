#!/bin/bash
set -u
HOOK=$(cd "$(dirname "$0")/.." && pwd)/fluxion-dnf-hook
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
setup() {
  export FLUXION_STATE_DIR="$TMP/state" FLUXION_CONFIG_FILE="$TMP/config" FLUXION_LOG_FILE="$TMP/fluxion.log" CURL_LOG="$TMP/curl.log"
  mkdir -p "$FLUXION_STATE_DIR" "$TMP/bin" "$TMP/rpm"
  unset FLUXION_API_URL FLUXION_API_KEY FLUXION_TIMEOUT FLUXION_ALLOW_HTTP
  rm -f "$FLUXION_CONFIG_FILE" "$FLUXION_LOG_FILE" "$CURL_LOG"
  cat > "$TMP/bin/rpm" <<'SH'
#!/bin/bash
cat "$RPM_FIXTURE/$RPM_PHASE"
SH
  cat > "$TMP/bin/hostname" <<'SH'
#!/bin/bash
printf 'fake-host.example\n'
SH
  cat > "$TMP/bin/curl" <<'SH'
#!/bin/bash
url=''; payload=''; key=''
while (($#)); do
  case "$1" in
    -d) payload="$2"; shift 2;;
    -H) [[ "$2" == X-API-Key:* ]] && key="$2"; shift 2;;
    http:*|https:*) url="$1"; shift;;
    *) shift;;
  esac
done
printf '%s\n%s\n%s\n' "$url" "$key" "$payload" >> "$CURL_LOG"
[[ "${FAKE_CURL_FAIL:-0}" == 1 ]] && exit 22
exit 0
SH
  chmod +x "$TMP/bin/rpm" "$TMP/bin/hostname" "$TMP/bin/curl"
  export PATH="$TMP/bin:$PATH" RPM_FIXTURE="$TMP/rpm"
}
test_stage_then_report_sends_differences() {
  setup
  printf '%s\n' 'bash.x86_64 bash 5.2.26-3.fc40' 'vim-minimal.x86_64 vim-minimal 2:9.1.393-1.fc40' 'telnet.x86_64 telnet 1:0.17-92.fc40' > "$TMP/rpm/stage"
  printf '%s\n' 'bash.x86_64 bash 5.2.32-1.fc40' 'vim-minimal.x86_64 vim-minimal 2:9.1.393-1.fc40' 'htop.x86_64 htop 3.3.0-4.fc40' > "$TMP/rpm/report"
  printf 'FLUXION_API_URL=https://fluxion.test/api/v1\nFLUXION_API_KEY=k1\n' > "$FLUXION_CONFIG_FILE"
  export RPM_PHASE=stage; "$HOOK" stage || return 1
  export RPM_PHASE=report; "$HOOK" report || return 1
  python3 - "$CURL_LOG" <<'PY'
import json,sys
lines=open(sys.argv[1]).read().splitlines()
assert lines[0]=='https://fluxion.test/api/v1/updates/ingest/dnf'
assert lines[1]=='X-API-Key: k1'
body=json.loads(lines[2]); assert body['updates']==[
 {'package_name':'bash','old_version':'5.2.26-3.fc40','new_version':'5.2.32-1.fc40','is_security':False},
 {'package_name':'htop','old_version':None,'new_version':'3.3.0-4.fc40','is_security':False},
 {'package_name':'telnet','old_version':'1:0.17-92.fc40','new_version':'removed','is_security':False}]
PY
  [[ $? == 0 ]] || return 1
  rm -f "$CURL_LOG"
  "$HOOK" report || return 1
  [[ ! -s "$CURL_LOG" ]]
}
test_report_request_shape_and_chunks() {
  setup
  : > "$TMP/rpm/stage"
  : > "$TMP/rpm/report"
  printf 'FLUXION_API_URL=https://fluxion.test/api/v1\nFLUXION_API_KEY=k1\n' > "$FLUXION_CONFIG_FILE"
  export RPM_PHASE=stage; "$HOOK" stage || return 1
  for i in $(seq 1 150); do printf 'pkg%d.x86_64 pkg%d 1\n' "$i" "$i"; done > "$TMP/rpm/report"
  export RPM_PHASE=report; "$HOOK" report || return 1
  python3 - "$CURL_LOG" <<'PY'
import json,sys
lines=open(sys.argv[1]).read().splitlines(); requests=[json.loads(lines[i+2]) for i in range(0,len(lines),3)]
assert len(requests)==2
assert len(requests[0]['updates'])==100 and len(requests[1]['updates'])==50
names=[u['package_name'] for r in requests for u in r['updates']]
assert len(names)==len(set(names))==150
assert requests[0]['hostname']=='fake-host.example'
PY
  [[ $? == 0 ]] || return 1
}
test_hook_fail_safe() {
  setup
  FLUXION_STATE_DIR="$TMP/readonly"; export FLUXION_STATE_DIR; mkdir -p "$FLUXION_STATE_DIR"; chmod 555 "$FLUXION_STATE_DIR"
  export RPM_PHASE=stage; "$HOOK" stage || return 1; chmod 755 "$FLUXION_STATE_DIR"
  setup
  export RPM_PHASE=report
  "$HOOK" report || return 1
  [[ ! -s "$CURL_LOG" ]] || return 1
  printf 'FLUXION_API_URL=http://fluxion.test/api/v1\nFLUXION_API_KEY=secret-key\n' > "$FLUXION_CONFIG_FILE"
  printf 'x.x86_64 x 1\n' > "$TMP/rpm/stage"
  printf 'x.x86_64 x 2\n' > "$TMP/rpm/report"
  export RPM_PHASE=stage; "$HOOK" stage || return 1
  rm -f "$CURL_LOG"
  export RPM_PHASE=report; "$HOOK" report || return 1
  [[ ! -s "$CURL_LOG" ]] || return 1
  grep -Fq 'ERROR: refusing to send the API key over plain HTTP; set FLUXION_ALLOW_HTTP=true only on a trusted network' "$FLUXION_LOG_FILE" || return 1

  setup
  printf 'FLUXION_API_URL=http://fluxion.test/api/v1\nFLUXION_API_KEY=k1\n' > "$FLUXION_CONFIG_FILE"
  printf 'x.x86_64 x 1\n' > "$TMP/rpm/stage"
  printf 'x.x86_64 x 2\n' > "$TMP/rpm/report"
  export RPM_PHASE=stage FLUXION_ALLOW_HTTP=true; "$HOOK" stage || return 1
  export RPM_PHASE=report; "$HOOK" report || return 1
  grep -Fxq 'http://fluxion.test/api/v1/updates/ingest/dnf' "$CURL_LOG" || return 1
  [[ ! -f "$FLUXION_STATE_DIR/dnf-before.list" ]] || return 1

  setup
  printf 'FLUXION_API_URL=http://fluxion.test/api/v1\nFLUXION_API_KEY=k1\nFLUXION_ALLOW_HTTP=true\n' > "$FLUXION_CONFIG_FILE"
  printf 'x.x86_64 x 1\n' > "$TMP/rpm/stage"
  printf 'x.x86_64 x 2\n' > "$TMP/rpm/report"
  export RPM_PHASE=stage; "$HOOK" stage || return 1
  export RPM_PHASE=report; "$HOOK" report || return 1
  grep -Fxq 'http://fluxion.test/api/v1/updates/ingest/dnf' "$CURL_LOG" || return 1

  printf 'FLUXION_API_URL=$(touch %s/pwned)\n' "$TMP" > "$FLUXION_CONFIG_FILE"
  export RPM_PHASE=stage; "$HOOK" stage || return 1
  export RPM_PHASE=report FAKE_CURL_FAIL=1
  printf 'x.x86_64 x 1\n' > "$TMP/rpm/stage"
  printf 'x.x86_64 x 2\n' > "$TMP/rpm/report"
  printf 'FLUXION_API_URL=http://fluxion.test/api/v1\n' > "$FLUXION_CONFIG_FILE"
  export RPM_PHASE=stage; "$HOOK" stage || return 1
  export RPM_PHASE=report FAKE_CURL_FAIL=1; "$HOOK" report || return 1
  grep -q 'ERROR' "$FLUXION_LOG_FILE" || return 1
  [[ ! -f "$FLUXION_STATE_DIR/dnf-before.list" ]] || return 1
  [[ ! -e "$TMP/pwned" ]] || return 1
}
for spec in 'stage_then_report_sends_differences|test_stage_then_report_sends_differences' 'report_request_shape_and_chunks|test_report_request_shape_and_chunks' 'hook_fail_safe|test_hook_fail_safe'; do
  name=${spec%%|*}; fn=${spec#*|}
  if "$fn"; then printf 'ok %s\n' "$name"; PASS=$((PASS+1)); else printf 'not ok %s\n' "$name"; FAIL=$((FAIL+1)); fi
done
printf '%s tests passed, %s failed\n' "$PASS" "$FAIL"
[[ $FAIL == 0 ]]
