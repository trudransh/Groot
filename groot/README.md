# groot

Voice (and in-call text) chat with Groot over LiveKit. Lean port of the solenegpt interface: one character, no sign-in, no payments.

- `agent/`: LiveKit Agents worker (Python, uv). Deepgram STT, OpenRouter LLM, ElevenLabs TTS (falls back to OpenRouter TTS).
- `client/`: Next.js app. `/api/connection-details` mints a room token and dispatches the `groot` agent.

Persona: `agent/voice_agent/persona.py` (`PERSONA` is empty for now). UI copy and greeting: `client/config/persona.config.ts`. Keep the greeting in sync in both.

## Run

```bash
cd groot/agent
cp .env.example .env        # LiveKit, Deepgram, OpenRouter, optional ElevenLabs
uv sync
uv run -m voice_agent download-files
uv run -m voice_agent dev

cd groot/client
cp .env.example .env        # same LiveKit project
pnpm install
pnpm dev                    # http://localhost:3000
```

`LIVEKIT_AGENT_NAME` must match in both (default `groot`).
