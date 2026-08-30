#!/usr/bin/env bash

# Charger l'environnement Node (nécessaire si tu utilises NVM, Homebrew, etc.)
export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:~/.nvm/versions/node/$(ls ~/.nvm/versions/node 2>/dev/null | tail -n 1)/bin

# Se déplacer dans le dossier de l'application

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

kill -9 $(lsof -t -i :5173) 2>/dev/null

# 3. Lancer le serveur Node
npm run dev &
NODE_PID=$!

sleep 2

# 4. Lancer Brave en mode app 
"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --app="http://localhost:5173" >/dev/null 2>&1 &
#"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="http://localhost:5173" >/dev/null 2>&1 & # for Google Chrome

sleep 2

# 5. Boucle de détection : on vérifie toutes les 2 secondes si une fenêtre Brave affiche localhost:5173
while lsof -i :5173 | grep -q "Brave"; do
#while lsof -i :5173 | grep -qi "Google"; do # for Google Chrome
    sleep 2
done

echo "Brave Browser has been closed"
# echo "Google Chrome has been closed" # for Google Chrome

# 6. Fermer le serveur Node
pkill -P $NODE_PID
kill $NODE_PID
echo "Node server has been closed"
