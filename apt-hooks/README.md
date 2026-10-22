# APT Hooks for Fluxion

The executable hook and APT configuration are separate:

- `99fluxion` is installed executable at `/etc/apt/apt.conf.d/99fluxion`.
- `99fluxion.conf` is installed as `/etc/apt/apt.conf.d/99fluxion.conf` and registers the hook with APT.

The configuration registers:

```apt
DPkg::Pre-Install-Pkgs { "/etc/apt/apt.conf.d/99fluxion --stage"; };
DPkg::Post-Invoke { "/etc/apt/apt.conf.d/99fluxion --report"; };
```

The version 2 `DPkg::Pre-Install-Pkgs` stream is staged under `/var/lib/fluxion/apt-operation.data` before dpkg runs. The post-invoke hook reads that file, sends one batch request, and removes it. Removals are reported with `new_version` set to `-` and `is_security=false`.

Security classification calls `apt-cache policy` for the exact package version. It is `true` only when that exact version has a release origin where both publisher `o=Ubuntu`/`o=Debian` and an archive ending in `-security`, such as `a=noble-security` or `a=bookworm-security`, are present. Repository URLs and hostnames are ignored. Ordinary, missing, third-party, and unavailable-cache results are `false`.

Set these environment variables at deployment or through the hook environment:

| Variable | Default | Purpose |
|---|---:|---|
| `FLUXION_API_URL` | empty | API base URL, required for reporting |
| `FLUXION_API_KEY` | empty | Optional API key header |
| `FLUXION_TIMEOUT` | `5` | curl timeout in seconds |
| `FLUXION_LOG_FILE` | `/var/log/fluxion-hook.log` | Hook log |
| `FLUXION_DETECT_SECURITY` | `true` | Enable exact-origin security classification |
| `FLUXION_STATE_DIR` | `/var/lib/fluxion` | Staging directory |

```bash
sudo install -m 0755 apt-hooks/99fluxion /etc/apt/apt.conf.d/99fluxion
sudo install -m 0644 apt-hooks/99fluxion.conf /etc/apt/apt.conf.d/99fluxion.conf
apt-config dump | grep -E 'Pre-Install-Pkgs|Post-Invoke'
apt-hooks/tests/test_security_detection.sh
```
