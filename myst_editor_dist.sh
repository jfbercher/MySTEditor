#!/usr/bin/env bash

FILE_PATH="$1"

export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:~/.nvm/versions/node/$(ls ~/.nvm/versions/node 2>/dev/null | tail -n 1)/bin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

kill -9 $(lsof -t -i :5173) 2>/dev/null

node server.mjs &
NODE_PID=$!

sleep 2

if [ -n "$FILE_PATH" ]; then
  ENCODED_PATH=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$FILE_PATH")
  URL="http://localhost:5173/?path=${ENCODED_PATH}"
else
  URL="http://localhost:5173"
fi

"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --app="$URL" >/dev/null 2>&1 &
#"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="$URL" >/dev/null 2>&1 & # for Google Chrome

sleep 2

while lsof -i :5173 | grep -q "Brave"; do
    sleep 2
done

echo "Brave Browser has been closed"
# echo "Google Chrome has been closed" # for Google Chrome

pkill -P $NODE_PID
kill $NODE_PID
echo "Node server has been closed"