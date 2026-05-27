#!/bin/bash
# iFleetPro Service Startup Script
# Starts all required services in the background

PROJECT_DIR="/home/z/my-project"

# Start notification service
cd "$PROJECT_DIR/mini-services/notification-service"
mkdir -p logs
nohup bun --hot index.ts > logs/service.log 2>&1 &
echo "Notification service started (PID: $!)"

# Start tracking service
cd "$PROJECT_DIR/mini-services/tracking-service"
mkdir -p logs
nohup bun --hot index.ts > logs/service.log 2>&1 &
echo "Tracking service started (PID: $!)"

# Start dev-keepalive (which auto-starts Next.js if needed)
cd "$PROJECT_DIR/mini-services/dev-keepalive"
mkdir -p logs
nohup bun --hot index.ts > logs/service.log 2>&1 &
echo "Keepalive service started (PID: $!)"
