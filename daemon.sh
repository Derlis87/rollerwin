#!/bin/bash
cd /home/z/my-project
while true; do
    bun .next/standalone/server.js -p 3000 2>>server.log
    sleep 2
done
