#!/bin/bash
# Persistent keep-alive loop for Next.js dev server
# Restarts the server immediately if it dies
while true; do
  cd /home/z/my-project
  /usr/local/bin/bun run dev >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Server died, restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
