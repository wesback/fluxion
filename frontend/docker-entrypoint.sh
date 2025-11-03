#!/bin/sh
set -e

# Function to handle shutdown
shutdown() {
    echo "Shutting down gracefully..."
    kill -TERM $NEXTJS_PID $NGINX_PID 2>/dev/null || true
    wait $NEXTJS_PID $NGINX_PID 2>/dev/null || true
    exit 0
}

# Trap signals
trap shutdown TERM INT

echo "Starting Next.js server..."
# Start Next.js in the background
# Set HOSTNAME to 0.0.0.0 to listen on all interfaces (not just pod IP)
HOSTNAME=0.0.0.0 node server.js &
NEXTJS_PID=$!

# Wait for Next.js to be ready
echo "Waiting for Next.js to be ready..."
# Give Next.js time to start listening on port 3000
# The readiness probe will handle actual health checking
sleep 5
echo "Next.js startup delay complete"

echo "Starting Nginx..."
# Start Nginx in the foreground
nginx -g "daemon off;" &
NGINX_PID=$!

echo "Application started successfully"
echo "Next.js PID: $NEXTJS_PID"
echo "Nginx PID: $NGINX_PID"

# Monitor both processes - POSIX compliant approach
while true; do
    # Check if Next.js is still running
    if ! kill -0 $NEXTJS_PID 2>/dev/null; then
        echo "Next.js process exited"
        shutdown
    fi
    
    # Check if Nginx is still running
    if ! kill -0 $NGINX_PID 2>/dev/null; then
        echo "Nginx process exited"
        shutdown
    fi
    
    sleep 5
done
