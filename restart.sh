#!/bin/bash
cd /home/z/my-project
while true; do
  rm -f dev.log
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  sleep 1
done
