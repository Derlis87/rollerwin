#!/bin/bash
cd /home/z/my-project
LOG=dev.log
while true; do
    node .next/standalone/server.js -p 3000 >> $LOG 2>&1
    echo "[$(date)] Restarting server..." >> $LOG
    sleep 2
done
