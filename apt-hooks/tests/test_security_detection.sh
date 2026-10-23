#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HOOK="$ROOT/apt-hooks/99fluxion"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/requests" "$TMP/noapt" "$TMP/etc/apt/sources.list.d"
: > "$TMP/ubuntu-archive-keyring.gpg"
: > "$TMP/debian-archive-keyring.gpg"
printf 'Ubuntu archive signing key fixture\n' > "$TMP/ubuntu-archive-keyring.gpg"
printf 'Debian archive signing key fixture\n' > "$TMP/debian-archive-keyring.gpg"
export FLUXION_APT_UBUNTU_KEYRING="$TMP/ubuntu-archive-keyring.gpg"
export FLUXION_APT_DEBIAN_KEYRING="$TMP/debian-archive-keyring.gpg"
export FLUXION_APT_SOURCES_LIST="$TMP/sources.list"

cat > "$TMP/bin/apt-cache" <<'APT'
#!/bin/bash
[[ "${FAKE_APT_CACHE_FAIL:-0}" == 1 ]] && exit 1
if [[ "${1:-}" == policy && $# -eq 1 ]]; then
    cat "$FLUXION_APT_RELEASES"
elif [[ "${1:-}" == policy && $# -eq 2 ]]; then
    cat "$FLUXION_APT_PACKAGE_POLICY"
else
    exit 1
fi
APT
cat > "$TMP/bin/curl" <<'CURL'
#!/bin/bash
payload=""
while (($#)); do
    case "$1" in
        -d) payload="$2"; shift 2;;
        *) shift;;
    esac
done
printf '%s' "$payload" > "$FLUXION_REQUEST_DIR/payload.json"
CURL
cat > "$TMP/bin/hostname" <<'HOST'
#!/bin/bash
printf 'apt.test\n'
HOST
chmod 755 "$TMP/bin/apt-cache" "$TMP/bin/curl" "$TMP/bin/hostname"
export PATH="$TMP/bin:$PATH" FLUXION_REQUEST_DIR="$TMP/requests"
export FLUXION_API_URL="https://fluxion.test/api/v1" FLUXION_LOG_FILE="$TMP/fluxion.log"

fail() { echo "FAIL: $1" >&2; exit 1; }
source "$HOOK"

run_case() {
    local name="$1" package="$2" version="$3" package_block="$4" releases="$5" expected="$6"
    cat > "$TMP/package.policy" <<EOF
Package: $package
Installed: -
Candidate: $version
Version table:
$package_block
EOF
    printf '%s\n' "$releases" > "$TMP/releases.policy"
    export FLUXION_APT_PACKAGE_POLICY="$TMP/package.policy" FLUXION_APT_RELEASES="$TMP/releases.policy"
    local actual
    actual=$(detect_security_update "$package" "$version")
    [[ "$actual" == "$expected" ]] || fail "$name: expected $expected, got $actual"
}

test_detect_security_update_matches_exact_security_version() {
    run_case ubuntu-security openssl 3.0.2-0ubuntu1.20 \
' *** 3.0.2-0ubuntu1.20 500
        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages
        100 http://archive.ubuntu.com/ubuntu noble-security/main amd64 Packages
  *** 3.0.2-0ubuntu1.21 500
        500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages' \
$'500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main,b=amd64' true

    run_case archive-ubuntu openssl 3.0.2-0ubuntu1.20 \
' *** 3.0.2-0ubuntu1.20 500
        500 http://archive.ubuntu.com/ubuntu noble-security/main amd64 Packages' \
$'500 http://archive.ubuntu.com/ubuntu noble-security/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main,b=amd64' true

    run_case debian curl 3.0.14-1~deb12u2 \
' *** 3.0.14-1~deb12u2 500
        500 http://security.debian.org/debian-security bookworm-security/main amd64 Packages' \
$'500 http://security.debian.org/debian-security bookworm-security/main amd64 Packages\n     release v=12,o=Debian,a=bookworm-security,n=bookworm,l=Debian-Security,c=main,b=amd64' true

    run_case updates curl 8.5.0-2ubuntu10.6 \
' *** 8.5.0-2ubuntu10.6 500
        500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages' \
$'500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble-updates,n=noble,l=Ubuntu,c=main,b=amd64' false

    run_case ppa tool 1.0-1 \
' *** 1.0-1 500
        500 https://ppa.launchpadcontent.net/x/y/ubuntu noble/main amd64 Packages' \
$'500 https://ppa.launchpadcontent.net/x/y/ubuntu noble/main amd64 Packages\n     release v=24.04,o=LP-PPA-x-y,a=noble-security,n=noble,c=main' false

    run_case exact-version-only openssl 3.0.2-0ubuntu1.20 \
' *** 3.0.2-0ubuntu1.21 500
        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages' \
$'500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main,b=amd64' false

    run_case no-release openssl 3.0.2-0ubuntu1.20 \
' *** 3.0.2-0ubuntu1.20 500
        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages' \
$'500 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble,n=noble,l=Ubuntu,c=main,b=amd64' false

    printf '%s\n' 'deb [trusted=yes] http://security.ubuntu.com/ubuntu noble-security main' > "$TMP/sources.list"
    run_case trusted-yes openssl 3.0.2-0ubuntu1.20 \
' *** 3.0.2-0ubuntu1.20 500
        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages' \
$'500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main,b=amd64' false
    : > "$TMP/sources.list"

    printf '%s\n' 'deb [allow-insecure=yes] http://security.ubuntu.com/ubuntu noble-security main' > "$TMP/sources.list"
    run_case allow-insecure openssl 3.0.2-0ubuntu1.20 \
' *** 3.0.2-0ubuntu1.20 500
        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages' \
$'500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main,b=amd64' false
    : > "$TMP/sources.list"

    export FLUXION_APT_DEBIAN_KEYRING="$TMP/missing-debian-keyring.gpg"
    run_case missing-debian-keyring curl 3.0.14-1~deb12u2 \
' *** 3.0.14-1~deb12u2 500
        500 http://security.debian.org/debian-security bookworm-security/main amd64 Packages' \
$'500 http://security.debian.org/debian-security bookworm-security/main amd64 Packages\n     release v=12,o=Debian,a=bookworm-security,n=bookworm,l=Debian-Security,c=main,b=amd64' false
    export FLUXION_APT_DEBIAN_KEYRING="$TMP/debian-archive-keyring.gpg"
}

# Function-named tests accept both exact matching and fail-safe cases.
test_detect_security_update_falls_back_to_false() {
    run_case no-entry nginx 1.2.3 \
' *** 1.2.3-1ubuntu1 500
        500 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages' \
$'500 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble,n=noble,l=Ubuntu,c=main,b=amd64' false

    export FLUXION_APT_PACKAGE_POLICY="$TMP/package.policy" FLUXION_APT_RELEASES="$TMP/releases.policy"
    local old_path="$PATH" actual
    PATH="$TMP/noapt"
    actual=$(detect_security_update openssl 3.0.2-0ubuntu1.20)
    PATH="$old_path"
    [[ "$actual" == false ]] || fail "no apt-cache: expected false"

    export FAKE_APT_CACHE_FAIL=1
    actual=$(detect_security_update nginx 1.2.3)
    unset FAKE_APT_CACHE_FAIL
    [[ "$actual" == false ]] || fail "apt-cache exit: expected false, got $actual"

    export FLUXION_DETECT_SECURITY=false
    run_case disabled openssl 3.0.2-0ubuntu1.20 \
' *** 3.0.2-0ubuntu1.20 500
        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages' \
$'500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages\n     release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main,b=amd64' false
    unset FLUXION_DETECT_SECURITY

    cat > "$TMP/package.policy" <<'EOF'
Package: nginx
Version table:
 *** 1.2.3 500
        500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages
Package: openssl
Version table:
 *** 3.0.2-0ubuntu1.20 500
        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages
EOF
    cat > "$TMP/releases.policy" <<'EOF'
500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages
     release v=24.04,o=Ubuntu,a=noble-updates,n=noble,l=Ubuntu,c=main,b=amd64
500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages
     release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main,b=amd64
EOF
    export FLUXION_APT_PACKAGE_POLICY="$TMP/package.policy" FLUXION_APT_RELEASES="$TMP/releases.policy"
    export FAKE_APT_CACHE_FAIL=nginx
    rm -f "$TMP/requests/payload.json"
    printf 'nginx 1.2.2 1.2.3\nopenssl 3.0.2-0ubuntu1.19 3.0.2-0ubuntu1.20\n' | bash "$HOOK"
    python3 - "$TMP/requests/payload.json" <<'PY'
import json,sys
body=json.load(open(sys.argv[1]))
assert [(u['package_name'], u['is_security']) for u in body['updates']] == [('nginx', False), ('openssl', True)], body
PY
}

# Make the fake distinguish nginx failure; it needs this package-specific behavior in the batch test.
cat > "$TMP/bin/apt-cache" <<'APT'
#!/bin/bash
if [[ "${1:-}" == policy && $# -eq 2 && "$2" == nginx && "${FAKE_APT_CACHE_FAIL:-}" == nginx ]]; then exit 1; fi
if [[ "${1:-}" == policy && $# -eq 1 ]]; then cat "$FLUXION_APT_RELEASES"
elif [[ "${1:-}" == policy && $# -eq 2 ]]; then cat "$FLUXION_APT_PACKAGE_POLICY"
else exit 1; fi
APT
chmod 755 "$TMP/bin/apt-cache"

test_detect_security_update_matches_exact_security_version
test_detect_security_update_falls_back_to_false
echo 'All APT security detection tests passed'
