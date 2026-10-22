# DNF5 Hooks for Fluxion

This directory contains a `libdnf5-plugin-actions` hook for reporting package installs, upgrades, downgrades, and removals to Fluxion.

## Requirements

Install `libdnf5-plugin-actions`, then deploy the hook and action files:

```bash
sudo dnf install libdnf5-plugin-actions
sudo install -D -m 755 fluxion-dnf-hook /usr/local/lib/fluxion/fluxion-dnf-hook
sudo install -D -m 644 fluxion.actions /etc/dnf/libdnf5-plugins/actions.d/fluxion.actions
```

## Configuration

Create `/etc/fluxion/config` with a required API key:

```text
FLUXION_API_URL=https://fluxion.example.com/api/v1
FLUXION_API_KEY=your-api-key-here
FLUXION_TIMEOUT=5
FLUXION_LOG_FILE=/var/log/fluxion-hook.log
FLUXION_STATE_DIR=/var/lib/fluxion
```

`FLUXION_API_KEY` is required for package reports. The hook also accepts these settings as environment variables, and environment values take precedence over config-file values. Set `FLUXION_CONFIG_FILE` to select a different config file.

The hook reads config files as data; it does not source them. Package reports are POSTed to `/api/v1/updates/ingest/dnf` and requests contain at most 100 updates. Errors are logged and never fail a dnf transaction.

## Staging and reporting

The actions plugin runs `pre_transaction` before the package transaction and `post_transaction` afterward. The hook snapshots installed RPM packages with `rpm -qa`, compares the snapshot against the post-transaction package list by `NAME.ARCH`, and removes the staged file after every report attempt.
