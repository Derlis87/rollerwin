#!/bin/bash
cd /home/z/my-project
while true; do
  npx next start -p 3000 2>&1 | tee -a /tmp/next-server.log
  echo "Server crashed, restarting in 2s..." >> /tmp/next-server.log
  sleep 2
done
