#!/bin/bash
cd /home/z/my-project
while true; do
  if ! curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ 2>/dev/null | grep -q "200"; then
    fuser -k 3000/tcp 2>/dev/null
    sleep 1
    node .next/standalone/server.js &>/dev/null &
  fi
  sleep 5
done
