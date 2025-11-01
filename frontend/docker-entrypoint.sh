#!/bin/sh
set -e

# Function to handle shutdown
shutdown() {
    echo "Shutting down gracefully..."
    kill -TERM $NEXTJS_PID $NGINX_PID 2>/dev/null || true
    wait $NEXTJS_PID $NGINX_PID
    exit 0
}

# Trap signals
trap shutdown TERM INT

echo "Starting Next.js server..."
# Start Next.js in the background
node server.js &
NEXTJS_PID=$!

# Wait for Next.js to be ready
echo "Waiting for Next.js to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
        echo "Next.js is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Next.js failed to start"
        exit 1
    fi
    sleep 1
done

echo "Starting Nginx..."
# Start Nginx in the foreground
nginx -g "daemon off;" &
NGINX_PID=$!

echo "Application started successfully"
echo "Next.js PID: $NEXTJS_PID"
echo "Nginx PID: $NGINX_PID"

# Wait for either process to exit
wait -n $NEXTJS_PID $NGINX_PID

# If we get here, one process exited
EXIT_CODE=$?
echo "Process exited with code $EXIT_CODE, shutting down..."
shutdown
