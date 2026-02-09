# Agent

A voice-based AI agent platform for debt collection, combining real-time voice interactions with reinforcement learning for policy optimization.

## Architecture

```
React UI (Next.js)  <-->  Node.js Server (Socket.io)  <-->  OpenAI Realtime API
                               |
                     FSM Engine + Policy Engine
                               |
                     RL Framework (Bandit / Q-learning)
                               |
                     Borrower Simulator + Evaluation
```

**Core layers:**

- **Voice Agent** — Real-time WebSocket connection to OpenAI Realtime API with VAD, Whisper transcription, TTS, and floor control for turn-taking
- **FSM Choreography** — 14-state finite state machine governing the call flow (opening → disclosure → identity verification → negotiation → payment setup), with LLM-based state classification and policy compliance enforcement
- **RL Training** — Contextual bandit and Q-learning implementations with an OpenAI Gym-like environment wrapper, reward shaping, and LLM-powered borrower simulation
- **Interactive UI** — 3-pane layout with live FSM visualization, synchronized transcript/audio playback, decision trace panel, and RL metrics dashboard

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16, React 19 |
| Styling | Tailwind CSS 4, shadcn/ui |
| State | Zustand |
| Real-time | Socket.io |
| Voice | OpenAI Realtime API, Whisper, TTS, VAD |
| LLM | GPT-4 |
| RL | Custom bandit + Q-learning implementations |
| Database | SQLite (better-sqlite3) |
| Visualization | React Flow, Recharts |

## Setup

```bash
# Install dependencies
yarn install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your OpenAI API key

# Start development server (WebSocket + Next.js)
yarn dev        # WebSocket server with hot reload
yarn dev:next   # Next.js dev server (separate terminal)
```

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start WebSocket server with nodemon |
| `yarn dev:next` | Start Next.js dev server |
| `yarn dev:demo` | Start Next.js in demo mode |
| `yarn build` | Production build |
| `yarn test` | Run tests |
| `yarn lint` | Run ESLint |

## Project Structure

```
src/
├── app/                  # Next.js app router (pages + API routes)
├── components/           # React components (UI, FSM viz, voice, RL dashboard)
├── hooks/                # React hooks (audio capture, playback, sockets)
├── stores/               # Zustand state stores
├── lib/
│   ├── agent/            # Unified agent abstraction + I/O adapters
│   ├── engine/           # FSM, policy engine, turn processor, validators
│   ├── voice/            # Voice session, floor control, state classification
│   ├── llm/              # OpenAI client + prompt templates
│   ├── db/               # SQLite queries
│   └── types.ts          # Core domain types
├── rl/
│   ├── learners/         # Bandit, Q-learning, baselines
│   ├── environment/      # Gym-like wrapper, state extraction, rewards
│   ├── simulator/        # LLM-powered borrower personas
│   └── evaluation/       # Metrics + evaluation runner
└── simulation/           # Voice-to-voice simulation orchestrator
server.ts                 # Node.js WebSocket/HTTP server
```
