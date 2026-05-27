#!/bin/bash
cd /home/z/my-project
while true; do
    if ! ss -tlnp 2>/dev/null | grep -q ":3000 "; then
        # Port 3000 not listening, start/restart the server
        /usr/local/bin/bun run dev >> /home/z/my-project/dev.log 2>&1
    fi
    sleep 2
done
