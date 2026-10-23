# Pacman Hooks for Fluxion

These hooks report Arch Linux package installs, upgrades, downgrades, and removals to Fluxion.

## Installation

Install the script as `/usr/local/lib/fluxion/fluxion-pacman-hook` with mode 755:

```bash
sudo install -D -m 755 pacman-hooks/fluxion-pacman-hook /usr/local/lib/fluxion/fluxion-pacman-hook
```

Install both hook files:

```bash
sudo install -D -m 755 pacman-hooks/fluxion-stage.hook /etc/pacman.d/hooks/fluxion-stage.hook
sudo install -D -m 755 pacman-hooks/fluxion-report.hook /etc/pacman.d/hooks/fluxion-report.hook
```

## Configuration

Create `/etc/fluxion/config` with `FLUXION_API_KEY` required, plus the API URL and optional settings:

```text
FLUXION_API_URL=https://your-fluxion.example/api/v1
FLUXION_API_KEY=your-api-key
FLUXION_TIMEOUT=5
FLUXION_LOG_FILE=/var/log/fluxion-hook.log
FLUXION_STATE_DIR=/var/lib/fluxion
```

Environment variables override values from the config file. A missing API URL disables both hooks. Fluxion delivery failures never fail pacman transactions.

## Settings

| Setting | Default |
|---|---|
| `FLUXION_API_URL` | none |
| `FLUXION_API_KEY` | required |
| `FLUXION_TIMEOUT` | `5` |
| `FLUXION_LOG_FILE` | `/var/log/fluxion-hook.log` |
| `FLUXION_STATE_DIR` | `/var/lib/fluxion` |

The stage hook saves package versions before the transaction; the report hook compares them afterward and sends package-name-sorted differences in batches of at most 100.
