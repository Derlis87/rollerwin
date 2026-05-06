#!/bin/bash
cd /home/z/my-project
while true; do
  node .next/standalone/server.js &>/tmp/srv.log &
  SRV=$!
  # Keep alive by pinging
  for i in $(seq 1 60); do
    sleep 5
    if ! kill -0 $SRV 2>/dev/null; then
      echo "Server died at $(date)" >> /tmp/srv.log
      break
    fi
    curl -s -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null
  done
  kill $SRV 2>/dev/null
  sleep 1
done
