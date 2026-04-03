#!/bin/bash
cd /home/z/my-project
while true; do
    echo "[$(date)] Starting server..."
    node .next/standalone/server.js -p 3000 2>&1 | tee -a dev.log
    echo "[$(date)] Server died, restarting in 3s..."
    sleep 3
done
