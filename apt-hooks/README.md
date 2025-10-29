# APT Hooks for Fluxion

This directory contains APT hook scripts that automatically report package updates to the Fluxion API.

## Overview

APT hooks are shell scripts placed in `/etc/apt/apt.conf.d/` on Linux hosts. They are automatically executed by APT when packages are installed, upgraded, or removed.

## How It Works

1. **Installation**: Deploy the hook script to `/etc/apt/apt.conf.d/99fluxion` on each host
2. **Configuration**: Set the `FLUXION_API_URL` to point to your Fluxion API endpoint
3. **Automatic Execution**: APT triggers the hook on package operations
4. **Data Collection**: Hook gathers package information from APT variables
5. **API Notification**: Sends HTTP POST to Fluxion API with update details

## Hook Script (To Be Implemented)

The hook will:
- Detect package install/upgrade/remove operations
- Extract package name, old version, new version
- Collect host information (hostname, OS details)
- Send data to Fluxion API via HTTP POST
- Handle errors gracefully (no blocking of APT operations)

## Installation Instructions (To Be Added)

```bash
# Install the hook script
sudo wget https://raw.githubusercontent.com/wesback/fluxion/main/apt-hooks/99fluxion \
  -O /etc/apt/apt.conf.d/99fluxion

# Make it executable
sudo chmod +x /etc/apt/apt.conf.d/99fluxion

# Configure the API endpoint
sudo sed -i 's|FLUXION_API_URL=.*|FLUXION_API_URL=https://your-fluxion-api.com/api/v1/updates|g' \
  /etc/apt/apt.conf.d/99fluxion
```

## Example Hook Script

```bash
#!/bin/bash
# Fluxion APT Hook
# Reports package updates to Fluxion API

# Configuration
FLUXION_API_URL="${FLUXION_API_URL:-http://localhost:8000/api/v1/updates}"
HOSTNAME=$(hostname)
OS_INFO=$(lsb_release -d | cut -f2-)

# APT provides these environment variables:
# DPkg::Pre-Install-Pkgs - package names being installed
# DPkg::Pre-Upgrade-Pkgs - package names being upgraded

# Extract package information and send to API
# Implementation to be added based on API specification
```

## Security Considerations

- Hook runs with root privileges during APT operations
- Must validate and sanitize all data before sending
- Should not block APT operations if API is unavailable
- Use HTTPS for API communication in production
- Consider API authentication/authorization

## Testing

Test the hook manually:
```bash
# Simulate package update
sudo apt-get update
sudo apt-get upgrade nginx

# Check logs
journalctl -u apt -n 20
```

## Dependencies

- `curl` or `wget` for HTTP requests
- `jq` for JSON formatting (optional)
- Standard shell utilities (`hostname`, `lsb_release`, etc.)

## License

MIT License - see [LICENSE](../LICENSE) file for details.
