#!/bin/bash
cd /home/z/my-project
while true; do
  npx next dev -p 3000 2>&1
  sleep 3
done
