#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HOOK="$ROOT/apt-hooks/99fluxion"
source "$HOOK"

fake_policy_fixture() {
  local d=$1
  cat >"$d/apt-cache" <<'SH'
#!/bin/bash
case "${APT_FAKE_CASE:-$2}" in
openssl) if [[ "$APT_CACHE_FAIL_PKG:-" == "openssl" ]]; then exit 1; fi
  if [[ "${APT_EXACT_ONLY:-}" == "1" && "${APT_EXPECTED_VERSION:-}" != "${3:-}" ]]; then exit 0; fi
  case "${APT_SECURITY_FIXTURE:-ubuntu}" in
    ubuntu) cat <<'OUT'
  Version table:
 *** 3.0.2-0ubuntu1.20 500
        archive.ubuntu.com/ubuntu noble-security/main amd64 Packages
        release v=24.04,o=Ubuntu,a=noble-security,n=noble,l=Ubuntu,c=main
     8.5.0 500
        archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages
        release v=24.04,o=Ubuntu,a=noble-updates,n=noble,l=Ubuntu,c=main
OUT
    ;;
    debian) cat <<'OUT'
  Version table:
 *** 3.0.14-1~deb12u2 500
        http://security.debian.org/debian-security bookworm-security/main amd64 Packages
        release v=12,o=Debian,a=bookworm-security,n=bookworm,l=Debian-Security,c=main
OUT
    ;;
    other_version) cat <<'OUT'
  Version table:
 *** 1.0 500
        ppa.launchpadcontent.net/x/y noble/main amd64 Packages
        release v=24.04,o=Ubuntu,a=noble-security,n=noble,c=main
     3.0.2-0ubuntu1.20 500
        archive.ubuntu.com/ubuntu noble/main amd64 Packages
OUT
    ;;
    no_release) cat <<'OUT'
  Version table:
 *** 3.0.2-0ubuntu1.20 500
        http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages
OUT
    ;;
  esac
  ;;
curl) echo '  Installed: 8.4'; echo '  8.5.0-2ubuntu10.6 500'; echo '    archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages';;
nginx) [[ -n "${APT_NGINX_FAIL:-}" ]] && exit 1 || true; echo '' ;;
*) echo '';;
esac
SH
  chmod +x "$d/apt-cache"
}

test_detect_security_update_matches_exact_security_version() {
  local d=$(mktemp -d)
  fake_policy_fixture "$d"; export PATH="$d:$PATH"
  [[ $(detect_security_update openssl 3.0.2-0ubuntu1.20) == true ]]
  export APT_SECURITY_FIXTURE=debian
  [[ $(detect_security_update openssl 3.0.14-1~deb12u2) == true ]]
  export APT_SECURITY_FIXTURE=other_version
  [[ $(detect_security_update openssl 3.0.2-0ubuntu1.20) == false ]]
  export APT_SECURITY_FIXTURE=no_release
  [[ $(detect_security_update openssl 3.0.2-0ubuntu1.20) == false ]]
  printf 'ok - exact security origin matching\n'
}

test_detect_security_update_rejects_nonsecurity_and_unavailable_origins() {
  local d=$(mktemp -d)
  fake_policy_fixture "$d"; export PATH="$d:$PATH"
  export APT_NGINX_FAIL=1
  [[ $(detect_security_update curl 8.5.0-2ubuntu10.6) == false ]]
  [[ $(detect_security_update nginx 1.2.3) == false ]]
  export PATH=/usr/bin:/bin
  [[ $(detect_security_update nginx 1.2.3) == false ]]
  printf 'ok - conservative nonsecurity and unavailable fallbacks\n'
}

test_reported_batch_flags_upgrades_removals_and_continues() {
  local d=$(mktemp -d)
  cat >"$d/apt-cache" <<'SH'
#!/bin/bash
case "$2" in
openssl) echo ' *** 3.0.2-0ubuntu1.20 500'; echo ' archive.ubuntu.com/ubuntu noble-security/main amd64 Packages'; echo ' release o=Ubuntu,a=noble-security';;
curl) echo ' *** 8.5.0-2ubuntu10.6 500'; echo ' archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages'; echo ' release o=Ubuntu,a=noble-updates';;
nginx) exit 1;;
*) exit 1;;
esac
SH
  cat >"$d/curl" <<'SH'
#!/bin/bash
last=''
for a in "$@"; do
  if [[ "$last" == "-d" ]]; then printf '%s' "$a" >"$CAPTURE"; fi
  last="$a"
done
exit 0
SH
  chmod +x "$d/apt-cache" "$d/curl"
  export PATH="$d:$PATH" FLUXION_STATE_DIR="$d/state" FLUXION_STATE_FILE="$d/state/apt-operation.data"
  export FLUXION_API_URL=https://fluxion.invalid FLUXION_LOG_FILE="$d/log" CAPTURE="$d/payload"
  printf 'VERSION 2\nupgrade openssl 1.0 3.0.2-0ubuntu1.20 amd64\nupgrade curl 8.4 8.5.0-2ubuntu10.6 amd64\nremove nginx 1.2.3 <none> amd64\nupgrade nginx 1.2.3 1.2.4 amd64\n' | "$HOOK" --stage
  "$HOOK" --report
  python3 - "$d/payload" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
assert p['updates']==[
 {'package_name':'openssl','old_version':'1.0','new_version':'3.0.2-0ubuntu1.20','is_security':True},
 {'package_name':'curl','old_version':'8.4','new_version':'8.5.0-2ubuntu10.6','is_security':False},
 {'package_name':'nginx','old_version':'1.2.3','new_version':'-','is_security':False},
 {'package_name':'nginx','old_version':'1.2.3','new_version':'1.2.4','is_security':False},]
PY
  [[ ! -e "$FLUXION_STATE_FILE" ]]
  printf 'ok - batch flags, removals, continuation\n'
}

test_apt_config_registers_staging_and_post_operation_hooks() {
  [[ -x "$HOOK" ]]
  grep -Fq '/etc/apt/apt.conf.d/99fluxion --stage' "$ROOT/apt-hooks/99fluxion.conf"
  grep -Fq '/etc/apt/apt.conf.d/99fluxion --report' "$ROOT/apt-hooks/99fluxion.conf"
  local d=$(mktemp -d)
  printf 'VERSION 2\nupgrade openssl 1 2 amd64\nremove nginx 1 <none> amd64\n' | FLUXION_STATE_DIR="$d" FLUXION_STATE_FILE="$d/data" "$HOOK" --stage
  grep -Fq 'openssl|1|2' "$d/data"
  grep -Fq 'nginx|1|-' "$d/data"
  FLUXION_STATE_DIR="$d" FLUXION_STATE_FILE="$d/data" "$HOOK" --report >/dev/null 2>&1 || true
  printf 'ok - apt configuration and staged operation data\n'
}

test_security_detection_suite_covers_required_behaviors() {
  test_detect_security_update_matches_exact_security_version
  test_detect_security_update_rejects_nonsecurity_and_unavailable_origins
  test_reported_batch_flags_upgrades_removals_and_continues
  test_apt_config_registers_staging_and_post_operation_hooks
}

test_security_detection_suite_covers_required_behaviors
