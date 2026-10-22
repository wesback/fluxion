#!/bin/bash
set -euo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/fluxion-dnf-hook"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
mkdir -p "$ROOT/bin"

make_fakes() {
    cat > "$ROOT/bin/rpm" <<'EOF'
#!/bin/bash
cat "$FAKE_RPM_OUTPUT"
EOF
    cat > "$ROOT/bin/hostname" <<'EOF'
#!/bin/bash
if [[ "$1" == "-f" ]]; then printf '%s\n' "fake.example.test"; else printf '%s\n' "fake.example.test"; fi
EOF
    cat > "$ROOT/bin/curl" <<'EOF'
#!/bin/bash
url=""; header=""; payload=""
while (($#)); do
    case "$1" in
        -H) header="$2"; [[ "$header" == X-API-Key:* ]] && printf '%s\n' "$header" >> "$FAKE_CURL_HEADERS"; shift 2;;
        -d) payload="$2"; shift 2;;
        http:*|https:*) url="$1"; shift;;
        *) shift;;
    esac
done
printf '%s\n' "$url" >> "$FAKE_CURL_URLS"
printf '%s\n' "$payload" >> "$FAKE_CURL_PAYLOADS"
exit "${FAKE_CURL_EXIT:-0}"
EOF
    chmod +x "$ROOT/bin/rpm" "$ROOT/bin/hostname" "$ROOT/bin/curl"
}
make_fakes

setup_case() {
    CASE="$ROOT/$1"; rm -rf "$CASE"; mkdir -p "$CASE/bin" "$CASE/state"
    cp "$ROOT/bin/rpm" "$CASE/bin/rpm"; cp "$ROOT/bin/hostname" "$CASE/bin/hostname"; cp "$ROOT/bin/curl" "$CASE/bin/curl"
    export PATH="$CASE/bin:/usr/bin:/bin"
    export FLUXION_STATE_DIR="$CASE/state" FLUXION_CONFIG_FILE="$CASE/config"
    export FAKE_RPM_OUTPUT="$CASE/rpm.list" FAKE_CURL_URLS="$CASE/urls" FAKE_CURL_HEADERS="$CASE/headers" FAKE_CURL_PAYLOADS="$CASE/payloads"
    : > "$FAKE_CURL_URLS"; : > "$FAKE_CURL_HEADERS"; : > "$FAKE_CURL_PAYLOADS"
    unset FLUXION_API_URL FLUXION_API_KEY FLUXION_TIMEOUT FLUXION_LOG_FILE FAKE_CURL_EXIT
}

write_config() { printf '%s\n' "$1" >> "$FLUXION_CONFIG_FILE"; }

assert_json() {
    python3 - "$@" <<'PY'
import json, sys
payload_file, check, *args = sys.argv[1:]
payloads = [json.loads(x) for x in open(payload_file) if x.strip()]
if check == "differences":
    expected = [
      {"package_name":"bash","old_version":"5.2.26-3.fc40","new_version":"5.2.32-1.fc40","is_security":False},
      {"package_name":"htop","old_version":None,"new_version":"3.3.0-4.fc40","is_security":False},
      {"package_name":"telnet","old_version":"1:0.17-92.fc40","new_version":"removed","is_security":False},
    ]
    assert payloads[0]["updates"] == expected, payloads
elif check == "shape_chunks":
    assert len(payloads) == 2
    assert [len(x["updates"]) for x in payloads] == [100, 50]
    assert payloads[0]["hostname"] == "fake.example.test"
    names = [u["package_name"] for x in payloads for u in x["updates"]]
    assert len(names) == len(set(names))
elif check == "count":
    assert len(payloads) == int(args[0]), payloads
PY
}

test_stage_then_report_sends_differences() {
    setup_case "differences"
    write_config 'FLUXION_API_URL=http://fluxion.test/api/v1'
    write_config 'FLUXION_API_KEY=k1'
    cat > "$FAKE_RPM_OUTPUT" <<'EOF'
bash.x86_64 bash 5.2.26-3.fc40
vim-minimal.x86_64 vim-minimal 2:9.1.393-1.fc40
telnet.x86_64 telnet 1:0.17-92.fc40
EOF
    bash "$HOOK" stage || exit 1
    cat > "$FAKE_RPM_OUTPUT" <<'EOF'
bash.x86_64 bash 5.2.32-1.fc40
vim-minimal.x86_64 vim-minimal 2:9.1.393-1.fc40
htop.x86_64 htop 3.3.0-4.fc40
EOF
    bash "$HOOK" report || exit 1
    assert_json "$FAKE_CURL_PAYLOADS" differences
    bash "$HOOK" report || exit 1
    assert_json "$FAKE_CURL_PAYLOADS" count 1
}

test_report_request_shape_and_chunks() {
    setup_case "shape"
    write_config 'FLUXION_API_URL=http://fluxion.test/api/v1'
    write_config 'FLUXION_API_KEY=k1'
    {
      for i in $(seq 1 150); do printf 'pkg%03d.x86_64 pkg%03d 1\n' "$i" "$i"; done
    } > "$FAKE_RPM_OUTPUT"
    bash "$HOOK" stage
    {
      for i in $(seq 1 150); do printf 'pkg%03d.x86_64 pkg%03d 2\n' "$i" "$i"; done
    } > "$FAKE_RPM_OUTPUT"
    bash "$HOOK" report
    assert_json "$FAKE_CURL_PAYLOADS" shape_chunks
    grep -Fx 'http://fluxion.test/api/v1/updates/ingest/dnf' "$FAKE_CURL_URLS" >/dev/null
    grep -Fx 'X-API-Key: k1' "$FAKE_CURL_HEADERS" >/dev/null
}

test_hook_fail_safe() {
    setup_case "safe"
    write_config 'FLUXION_API_URL=http://fluxion.test/api/v1'
    write_config 'FLUXION_API_KEY=k1'
    export FLUXION_LOG_FILE="$CASE/hook.log"
    mkdir -p "$CASE/readonly"; chmod 0555 "$CASE/readonly"
    FLUXION_STATE_DIR="$CASE/readonly" bash "$HOOK" stage; [[ $? -eq 0 ]]
    setup_case "curlfail"
    write_config 'FLUXION_API_URL=http://fluxion.test/api/v1'; write_config 'FLUXION_API_KEY=k1'
    export FLUXION_LOG_FILE="$CASE/hook.log"
    printf 'a.x86_64 a 1\n' > "$FAKE_RPM_OUTPUT"; bash "$HOOK" stage
    printf 'b.x86_64 b 2\n' > "$FAKE_RPM_OUTPUT"; export FAKE_CURL_EXIT=22
    bash "$HOOK" report; [[ $? -eq 0 ]]; [[ ! -e "$FLUXION_STATE_DIR/dnf-before.list" ]]; grep -q '\[ERROR\]' "$FLUXION_LOG_FILE"
}

test_actions_file_registers_stage_and_report() {
    local actions="$(dirname "$HOOK")/fluxion.actions"
    mapfile -t lines < <(grep -Ev '^([[:space:]]*#|[[:space:]]*$)' "$actions")
    [[ "${lines[0]}" == 'pre_transaction::::/usr/local/lib/fluxion/fluxion-dnf-hook stage' ]]
    [[ "${lines[1]}" == 'post_transaction::::/usr/local/lib/fluxion/fluxion-dnf-hook report' ]]
    [[ ${#lines[@]} -eq 2 ]]
}

test_stage_then_report_sends_differences
test_report_request_shape_and_chunks
test_hook_fail_safe
test_actions_file_registers_stage_and_report
printf 'All DNF hook tests passed\n'
