#!/bin/bash
cd /home/z/my-project
while true; do
  date >> /home/z/my-project/dev.log
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "Restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
