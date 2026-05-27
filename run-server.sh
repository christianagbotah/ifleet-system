#!/bin/bash
cd /home/z/my-project
export DATABASE_URL="mysql://ifleetpro_user:myjesus4mE2018@163.245.212.15:3306/ifleetpro_data"
while true; do
  echo "$(date) - Starting Next.js dev server..."
  bunx next dev -p 3000 2>&1
  echo "$(date) - Server exited with code $?. Restarting in 3s..."
  sleep 3
done
