#!/bin/bash
while true; do
  if ! curl -m 3 -s -o /dev/null http://localhost:3000 2>/dev/null; then
    echo "$(date): Server down, restarting..." >> /tmp/next-watchdog.log
    cd /home/z/my-project
    npx next start -p 3000 >> /tmp/next-watchdog.log 2>&1 &
    sleep 8
  fi
  sleep 3
done
