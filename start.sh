#!/bin/bash
trap 'echo "Received signal: $?" >> /home/z/my-project/server.log' TERM INT HUP
cd /home/z/my-project
exec npx next start -p 3000 2>&1
