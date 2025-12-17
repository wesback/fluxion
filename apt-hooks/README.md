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

## Hook Script

The `99fluxion` hook script:
- ✅ Automatically detects package install/upgrade/remove operations
- ✅ Extracts package name, old version, new version
- ✅ Auto-detects OS information from `/etc/os-release`, `lsb_release`, or `/etc/issue`
- ✅ Sends data to Fluxion API via HTTP POST (supports both single and batch mode)
- ✅ Handles errors gracefully (never blocks APT operations)
- ✅ Supports API key authentication
- ✅ Configurable timeout and logging

## Installation Instructions

### Quick Install

```bash
# Download the hook script
sudo wget https://raw.githubusercontent.com/wesback/fluxion/main/apt-hooks/99fluxion \
  -O /etc/apt/apt.conf.d/99fluxion

# Make it executable
sudo chmod +x /etc/apt/apt.conf.d/99fluxion
```

### Configuration

Configure the hook by setting environment variables in `/etc/environment` or creating a config file:

```bash
# Option 1: Add to /etc/environment (system-wide)
echo 'FLUXION_API_URL="https://your-fluxion-api.example.com/api/v1"' | sudo tee -a /etc/environment

# Option 2: Create a dedicated config file
sudo tee /etc/fluxion/config > /dev/null <<EOF
FLUXION_API_URL=https://your-fluxion-api.example.com/api/v1
FLUXION_API_KEY=your-api-key-here
FLUXION_BATCH_MODE=true
FLUXION_TIMEOUT=5
FLUXION_LOG_FILE=/var/log/fluxion-hook.log
EOF

# Then source it in the hook or export it system-wide
```

### Configuration Options

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `FLUXION_API_URL` | Fluxion API endpoint URL | - | Yes |
| `FLUXION_API_KEY` | API authentication key | - | No |
| `FLUXION_BATCH_MODE` | Send updates in batch | `true` | No |
| `FLUXION_TIMEOUT` | HTTP request timeout (seconds) | `5` | No |
| `FLUXION_LOG_FILE` | Log file path | `/var/log/fluxion-hook.log` | No |

## How It Works

The hook script performs the following when APT operations occur:

1. **OS Detection**: Automatically detects the operating system using:
   - `/etc/os-release` (preferred, modern standard)
   - `lsb_release -d` (fallback)
   - `/etc/issue` (final fallback)

2. **Package Tracking**: Reads package information from APT via stdin:
   - Package name (with architecture suffix removed)
   - Old version (or `-` for new installations)
   - New version

3. **Data Transmission**:
   - **Batch Mode** (default): Collects all packages and sends in one request
   - **Single Mode**: Sends each package update individually
   - Uses HTTP POST with JSON payload
   - Includes API key header if configured

4. **Error Handling**: All errors are logged but never block APT operations

## Security Considerations

- Hook runs with root privileges during APT operations
- Must validate and sanitize all data before sending
- Should not block APT operations if API is unavailable
- Use HTTPS for API communication in production
- Consider API authentication/authorization

## Testing

### Test the Hook Manually

```bash
# 1. Test OS detection
sudo /etc/apt/apt.conf.d/99fluxion <<< ""
# Check the log file to see detected OS

# 2. Simulate package update
sudo apt-get update
sudo apt-get upgrade nginx

# 3. Check Fluxion logs
tail -f /var/log/fluxion-hook.log

# 4. Check APT logs
journalctl -u apt -n 20

# 5. Verify in Fluxion UI or API
curl -H "X-API-Key: your-api-key" \
  https://your-fluxion-api.example.com/api/v1/hosts
```

### Test with Mock Data

```bash
# Create test input simulating APT output
echo "nginx 1.18.0-6ubuntu14.4 1.18.0-6ubuntu14.5" | \
  sudo /etc/apt/apt.conf.d/99fluxion

# Check if the update was sent
tail /var/log/fluxion-hook.log
```

## Dependencies

- `curl` or `wget` for HTTP requests
- `jq` for JSON formatting (optional)
- Standard shell utilities (`hostname`, `lsb_release`, etc.)

## License

MIT License - see [LICENSE](../LICENSE) file for details.
