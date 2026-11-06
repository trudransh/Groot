#!/usr/bin/env bash
# Runs two Groot instances side by side: agent groot1 + client :3010, agent groot2 + client :3011.
# Each agent reads agent/grootN.env (its own private key, agent name, state) on top of agent/.env.
set -euo pipefail
cd "$(dirname "$0")"

# Make sure each plant has its ENS subname under the forest (registers only the missing ones).
plants=()
for i in 1 2; do
  plants+=("$(cd agent && set -a && . "./groot$i.env" && set +a && uv run python -c 'from voice_agent import wallet; import os; a = wallet.address(); print(os.environ["PLANT_LABEL"] + ":" + a + ":" + a)')")
done
if grep -qE '^GUARDIAN_KEY=.+' ../scripts/ens/.env 2>/dev/null; then
  (cd ../scripts/ens && [ -d node_modules ] || pnpm install --silent) && (cd ../scripts/ens && PLANTS="$(IFS=,; echo "${plants[*]}")" pnpm -s deploy-forest)
else
  echo "skipping ENS: set GUARDIAN_KEY in scripts/ens/.env" >&2
fi

pids=()
trap 'kill "${pids[@]}" 2>/dev/null' EXIT INT TERM

for i in 1 2; do
  env_file="agent/groot$i.env"
  [ -f "$env_file" ] || { echo "missing $env_file" >&2; exit 1; }
  (cd agent && set -a && . "./groot$i.env" && set +a && exec uv run -m voice_agent dev) &
  pids+=($!)
  (cd client && LIVEKIT_AGENT_NAME="groot$i" NEXT_PUBLIC_ENS_NAME="$(grep ^PLANT_LABEL= ../agent/groot$i.env | cut -d= -f2).vantaraa.eth" NEXT_DIST_DIR=".next-groot$i" exec pnpm exec next dev -p $((3009 + i))) &
  pids+=($!)
done

wait
