# dnf5 Actions Hook for Fluxion

This hook reports Fedora package installs, upgrades, downgrades, and removals to Fluxion.

## Installation

Install the dnf5 actions plugin package:

```bash
sudo dnf install libdnf5-plugin-actions
```

Install the hook at `/usr/local/lib/fluxion/fluxion-dnf-hook` with mode 755:

```bash
sudo install -D -m 755 dnf-hooks/fluxion-dnf-hook /usr/local/lib/fluxion/fluxion-dnf-hook
```

Install the actions file at `/etc/dnf/libdnf5-plugins/actions.d/fluxion.actions`:

```bash
sudo install -D -m 644 dnf-hooks/fluxion.actions /etc/dnf/libdnf5-plugins/actions.d/fluxion.actions
```

## Configuration

Create `/etc/fluxion/config` and set the required `FLUXION_API_KEY`:

```text
FLUXION_API_URL=https://your-fluxion.example/api/v1
FLUXION_API_KEY=your-api-key
```

`FLUXION_API_KEY` is required. Fluxion delivery failures never fail dnf5 transactions. The hook stages package versions before each transaction and reports differences afterward.
