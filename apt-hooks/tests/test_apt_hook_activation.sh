#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HOOK="$ROOT/apt-hooks/99fluxion"
CONF="$ROOT/apt-hooks/99fluxion.conf"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/state" "$TMP/config"

fail() { echo "FAIL: $1" >&2; exit 1; }

cat > "$TMP/bin/curl" <<'CURL'
#!/bin/bash
payload=""
url=""
header=""
while (($#)); do
    case "$1" in
        -d) payload="$2"; shift 2;;
        -H) [[ "$2" == X-API-Key:* ]] && header="$2"; shift 2;;
        *://*) url="$1"; shift;;
        *) shift;;
    esac
done
count=$(find "$FLUXION_REQUEST_DIR" -maxdepth 1 -name 'payload.*.json' 2>/dev/null | wc -l)
printf '%s' "$payload" > "$FLUXION_REQUEST_DIR/payload.$count.json"
printf '%s\n%s\n' "$url" "$header" >> "$FLUXION_REQUEST_DIR/calls.log"
[[ "${FAKE_CURL_FAIL:-0}" == 1 ]] && exit 22
CURL
cat > "$TMP/bin/hostname" <<'EOF'
#!/bin/bash
printf 'apt.test\n'
EOF
cat > "$TMP/bin/gpgv" <<'GPGV'
#!/bin/bash
keyring=""
file=""
while (($#)); do
    case "$1" in
        --keyring) keyring="$2"; shift 2;;
        --output) shift 2;;
        *) file="$1"; shift;;
    esac
done
if [[ -s "$keyring" && -f "$file" ]]; then cat "$file"; else exit 1; fi
GPGV
cat > "$TMP/bin/apt-cache" <<'APT'
#!/bin/bash
if [[ "${1:-}" == policy && $# -eq 2 ]]; then
    case "$2" in
        openssl) cat <<'EOF'
 *** 3.0.2-0ubuntu1.20 500
        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages
EOF
;;
        curl) cat <<'EOF'
 *** 8.5.0-2ubuntu10.6 500
        500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages
EOF
;;
        *) echo 'Package: unknown' ;; 
    esac
elif [[ "${1:-}" == policy && $# -eq 1 ]]; then
    cat <<'EOF'
500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages
     release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main,b=amd64
500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages
     release v=24.04,o=Ubuntu,a=noble-updates,n=noble,l=Ubuntu,c=main,b=amd64
EOF
fi
APT
chmod 755 "$TMP/bin/"*
export PATH="$TMP/bin:$PATH" FLUXION_REQUEST_DIR="$TMP/requests"
mkdir -p "$TMP/requests" "$TMP/lists"
export FLUXION_STATE_DIR="$TMP/state" FLUXION_API_URL="https://fluxion.test/api/v1" FLUXION_API_KEY="k1"
export FLUXION_LOG_FILE="$TMP/fluxion.log" FLUXION_APT_LISTS_DIR="$TMP/lists"
printf 'fixture-keyring\n' > "$TMP/ubuntu-keyring.gpg"
export FLUXION_APT_UBUNTU_KEYRING="$TMP/ubuntu-keyring.gpg"

# Security fixtures use source policy rather than real InRelease signatures.
mkdir -p "$TMP/lists"
printf 'Origin: Ubuntu\nSuite: noble-security\n' > "$TMP/lists/security.ubuntu.com_ubuntu_dists_noble-security_InRelease"


test_apt_config_registers_stage_and_report() {
    command -v apt-config >/dev/null || fail "apt-config missing"
    local dump
    dump=$(apt-config -c "$CONF" dump)
    grep -Fq '/usr/local/lib/fluxion/99fluxion stage' <<< "$dump" || fail "Pre-Install-Pkgs registration missing"
    grep -Fq 'DPkg::Tools::Options::/usr/local/lib/fluxion/99fluxion::Version "2";' <<< "$dump" || grep -Fq 'Version "2"' <<< "$dump" || fail "Tools Version 2 missing"
    grep -Fq '/usr/local/lib/fluxion/99fluxion report || true' <<< "$dump" || fail "Post-Invoke registration missing"
    local missing="$TMP/99fluxion.missing.conf"
    grep -v 'Post-Invoke' "$CONF" > "$missing"
    dump=$(apt-config -c "$missing" dump)
    ! grep -Fq '/usr/local/lib/fluxion/99fluxion report || true' <<< "$dump" || fail "copy unexpectedly registered Post-Invoke"
}

test_stage_then_report_sends_operations_once() {
    rm -rf "$TMP/state" "$TMP/requests"; mkdir -p "$TMP/state" "$TMP/requests"
    cat <<'EOF' | "$HOOK" stage
VERSION 2
Config: value

openssl 3.0.2-0ubuntu1.19 < 3.0.2-0ubuntu1.20 /var/cache/apt/archives/openssl.deb
curl 8.5.0-2ubuntu10.5 < 8.5.0-2ubuntu10.6 /var/cache/apt/archives/curl.deb
htop - < 3.3.0-4 /var/cache/apt/archives/htop.deb
telnet 0.17-44 > - **REMOVE**
openssl 3.0.2-0ubuntu1.19 < 3.0.2-0ubuntu1.20 **CONFIGURE**
EOF
    "$HOOK" report
    python3 - "$TMP/requests" <<'PY'
import glob,json,sys
files=glob.glob(sys.argv[1]+'/payload.*.json')
assert len(files)==1, files
body=json.load(open(files[0]))
assert [(u['package_name'],u['old_version'],u['new_version'],u['is_security']) for u in body['updates']] == [
 ('openssl','3.0.2-0ubuntu1.19','3.0.2-0ubuntu1.20',True),
 ('curl','8.5.0-2ubuntu10.5','8.5.0-2ubuntu10.6',False),
 ('htop',None,'3.3.0-4',False),
 ('telnet','0.17-44','removed',False)], body
PY
    rm -f "$TMP/requests/calls.log" "$TMP/requests/payload."*.json
    before=$(find "$TMP/requests" -type f | wc -l)
    "$HOOK" report
    after=$(find "$TMP/requests" -type f | wc -l)
    [[ "$before" == "$after" ]] || fail "second report sent a request"
}

test_stage_and_report_fail_safe() {
    rm -rf "$TMP/state"; mkdir -p "$TMP/state"; chmod 555 "$TMP/state"
    printf 'VERSION 2\n\ngzip - < 1.12 < /gzip.deb\n' | "$HOOK" stage
    chmod 755 "$TMP/state"
    [[ -f "$TMP/state/apt-operation.data" ]] && fail "read-only state was written"

    rm -rf "$TMP/state" "$TMP/requests"; mkdir -p "$TMP/state" "$TMP/requests"
    printf 'VERSION 2\n\ngzip 1.0 < 1.1 /gzip.deb\n' | "$HOOK" stage
    export FAKE_CURL_FAIL=1
    "$HOOK" report
    unset FAKE_CURL_FAIL
    [[ ! -e "$TMP/state/apt-operation.data" ]] || fail "failed send left staged data"
    grep -Fq 'ERROR' "$FLUXION_LOG_FILE" || fail "failed send was not logged"

    rm -rf "$TMP/state"; mkdir -p "$TMP/state"; export FLUXION_API_URL=""
    printf 'VERSION 2\n\ngzip 1.0 < 1.1 /gzip.deb\n' | "$HOOK" stage
    [[ ! -f "$TMP/state/apt-operation.data" ]] || fail "stage stored data without API URL"
    "$HOOK" report

    rm -rf "$TMP/state" "$TMP/requests"; mkdir -p "$TMP/state" "$TMP/requests"
    export FLUXION_API_URL="https://fluxion.test/api/v1"
    printf 'VERSION 2\n\n' > "$TMP/state/input"
    for i in $(seq 1 150); do printf 'pkg%d - < 1.%d /pkg.deb\n' "$i" "$i" >> "$TMP/state/input"; done
    "$HOOK" stage < "$TMP/state/input"
    "$HOOK" report
    python3 - "$TMP/requests" <<'PY'
import glob,json,sys
files=sorted(glob.glob(sys.argv[1]+'/payload.*.json'))
assert len(files)==2, len(files)
counts=[]
for f in files: counts.append(len(json.load(open(f))['updates']))
assert counts==[100,50], counts
allnames=[u['package_name'] for f in files for u in json.load(open(f))['updates']]
assert len(allnames)==len(set(allnames)), 'duplicate package'
PY

    rm -rf "$TMP/state" "$TMP/requests" "$TMP/config"/*; mkdir -p "$TMP/state" "$TMP/requests" "$TMP/config"
    cat > "$TMP/config/fluxion.conf" <<'EOF'
FLUXION_API_URL=https://fluxion.test/api/v1
FLUXION_API_KEY=k1
EOF
    unset FLUXION_ALLOW_HTTP
    export FLUXION_CONFIG_FILE="$TMP/config/fluxion.conf"
    unset FLUXION_API_URL FLUXION_API_KEY
    printf 'VERSION 2\n\ngzip 1.0 < 1.1 /gzip.deb\n' | "$HOOK" stage
    "$HOOK" report
    grep -Fq $'https://fluxion.test/api/v1/updates/batch\nX-API-Key: k1' "$TMP/requests/calls.log" || fail "config URL and key were not loaded"

    rm -rf "$TMP/state" "$TMP/requests"; mkdir -p "$TMP/state" "$TMP/requests"
    cat > "$TMP/config/fluxion.conf" <<'EOF'
FLUXION_API_URL=https://config.test/api/v1
FLUXION_API_KEY=config-key
EOF
    export FLUXION_API_URL="https://env.test/api/v1" FLUXION_API_KEY="env-key"
    printf 'VERSION 2\n\ngzip 1.0 < 1.1 /gzip.deb\n' | "$HOOK" stage
    "$HOOK" report
    grep -Fq $'https://env.test/api/v1/updates/batch\nX-API-Key: env-key' "$TMP/requests/calls.log" || fail "environment values did not win config precedence"

    rm -rf "$TMP/state" "$TMP/requests"; mkdir -p "$TMP/state" "$TMP/requests"
    cat > "$TMP/config/fluxion.conf" <<'EOF'
FLUXION_API_URL=HTTP://fluxion.test/api/v1
FLUXION_API_KEY=k1
EOF
    unset FLUXION_API_URL FLUXION_API_KEY FLUXION_ALLOW_HTTP
    printf 'VERSION 2\n\ngzip 1.0 < 1.1 /gzip.deb\n' | "$HOOK" stage
    "$HOOK" report
    [[ ! -e "$TMP/requests/calls.log" ]] || fail "plain HTTP sent an API key without opt-in"
    grep -Fq 'ERROR: refusing to send the API key over plain HTTP; set FLUXION_ALLOW_HTTP=true only on a trusted network' "$FLUXION_LOG_FILE" || fail "HTTP refusal was not logged"

    rm -rf "$TMP/state" "$TMP/requests"; mkdir -p "$TMP/state" "$TMP/requests"
    export FLUXION_ALLOW_HTTP=true
    printf 'VERSION 2\n\ngzip 1.0 < 1.1 /gzip.deb\n' | "$HOOK" stage
    "$HOOK" report
    grep -Fq $'http://fluxion.test/api/v1/updates/batch\nX-API-Key: k1' "$TMP/requests/calls.log" || fail "HTTP opt-in did not send request"

    rm -rf "$TMP/state" "$TMP/requests"; mkdir -p "$TMP/state" "$TMP/requests"
    rm -f /tmp/pwned
    cat > "$TMP/config/fluxion.conf" <<'EOF'
FLUXION_API_URL=$(touch /tmp/pwned)
FLUXION_API_KEY=k1
EOF
    unset FLUXION_API_URL FLUXION_API_KEY FLUXION_ALLOW_HTTP
    printf 'VERSION 2\n\ngzip 1.0 < 1.1 /gzip.deb\n' | "$HOOK" stage
    "$HOOK" report
    [[ ! -e /tmp/pwned ]] || fail "config command substitution executed"
    [[ ! -e "$TMP/state/apt-operation.data" ]] || fail "command-like URL left staged data"
    [[ ! -e "$TMP/requests/calls.log" ]] || fail "command-like URL sent a request"
}

test_apt_config_registers_stage_and_report
test_stage_then_report_sends_operations_once
test_stage_and_report_fail_safe
echo 'All APT hook activation tests passed'
