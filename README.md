# 🌸 LangTube

**Your favorite videos, now your language lessons.**

LangTube is a Chrome extension that turns any YouTube video into an interactive language lesson for English speakers learning **Spanish, French, or Tagalog**. Keep watching what you love, and LangTube adds the learning on top.

Built at **Knight Hacks IX**. Demo Video: https://www.youtube.com/watch?v=oJh2-I6yrz4&time_continue=7&source_ve_path=MjM4NTE&embeds_referring_euri=https%3A%2F%2Fdevpost.com%2F
<img width="1280" height="720" alt="image" src="https://github.com/user-attachments/assets/ad8a23e2-92a3-4135-a662-f93fde2e0990" />


---

## ✨ Features

LangTube is built around one learning loop: **watch → understand → listen → speak.**

| | Feature | What it does |
|---|---|---|
| 👀 | **Bilingual captions** | Color-matched captions in your target language and English, synced to the video |
| 💡 | **Phrase lookup** | Click any word or phrase for its meaning, grammar, why it's used here, an example, and formality |
| 🔖 | **Saved vocabulary** | Save words without leaving the video, then review them as flashcards |
| 🎧 | **Pronunciation** | Hear natural pronunciation of any phrase, at normal or slow speed |
| 🎙️ | **Speaking practice** | Say a line out loud and see which words were understood |
| 🌼 | **Luna, your AI tutor** | Live voice conversations at your level (A1–B1), scored out of 100 on understanding, relevance, vocabulary, and grammar |
| 📈 | **Progress dashboard** | Streaks, activity heatmap, top study videos, words to revisit, and mastery levels |

---

## 🛠️ Tech Stack

| Area | Tools |
|---|---|
| **Extension** | TypeScript, Vite, CRXJS, Chrome Manifest V3 |
| **AI** | **Gemini API**: caption translation and phrase alignment, phrase explanations, conversation grading |
| **Voice** | **ElevenLabs**: text-to-speech (pronunciation), Scribe v2 speech-to-text (speaking practice), Agents (Luna's live voice) |
| **Database** | **TigerData** (TimescaleDB on Postgres): vocabulary, conversations, scores, and a time-series hypertable of learning events |
| **Backend** | Node.js, Express, Google OAuth with JWT sessions |
| **Dashboard** | React, Vite, `@elevenlabs/react` |
| **Design** | Figma, Figma Make, Figma MCP |
| **Hosting** | Vercel (dashboard), Render (backend) |

---

## 📁 Project Structure

```
knighthacksix/
├── extension/   # Chrome extension: caption capture, overlay, learning panel
├── backend/     # Express API: translation, explanations, TTS/STT, auth, stats, Luna grading
│   └── db/      # TigerData schema and setup script
├── dashboard/   # React dashboard: progress, Study flashcards, Luna tutor
├── shared/      # Language config and helpers shared across apps
└── docs/        # Build notes, testing and deployment guides
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 22.18+** (Node 24 recommended)
- **Python 3** and the PostgreSQL **`psql`** client (for database setup)
- A **TigerData** service with TimescaleDB enabled
- API keys for **Gemini** and **ElevenLabs**
- Two **Google OAuth clients**: one of type *Chrome Extension*, one of type *Web application*

### 1. Install dependencies

```sh
git clone https://github.com/izzyaustt/knighthacksix.git
cd knighthacksix
npm ci --prefix backend
npm ci --prefix extension
npm ci --prefix dashboard
```

### 2. Set up the database

Put your TigerData connection string in a root `.env` file as `TIGER_DATA_CONNECTION_STRING`, then apply the schema:

```sh
python3 backend/db/setup.py apply
python3 backend/db/setup.py verify
```

See [`backend/db/README.md`](backend/db/README.md) for details.

### 3. Run the backend

```sh
cp backend/.env.example backend/.env   # then fill in your keys
cd backend
npm run setup:study                    # creates Luna's ElevenLabs agent (Spanish)
npm run setup:study -- fr              # optional: French
npm run setup:study -- fil             # optional: Tagalog
npm run dev                            # http://localhost:3000
```

Required variables: `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_EXTENSION_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID`.

> 💡 **No API keys yet?** Run `MOCK=1 npm start` to try the caption overlay with mocked translations and no paid calls.

### 4. Load the extension

```sh
cp extension/.env.example extension/.env   # set VITE_GOOGLE_CLIENT_ID
cd extension
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/dist` folder
4. Open any YouTube video with English captions and sign in from the LangTube panel

### 5. Run the dashboard

```sh
cp dashboard/.env.example dashboard/.env   # set VITE_GOOGLE_CLIENT_ID
cd dashboard
npm run dev                                # http://localhost:5173
```

Sign in with the same Google account you use in the extension.

---

## ☁️ Deployment

- **Backend:** Render, using the [`render.yaml`](render.yaml) blueprint (Docker, `AI_PROVIDER=gemini`)
- **Dashboard:** Vercel, using [`vercel.json`](vercel.json)

See [`docs/Deployment.md`](docs/Deployment.md) for the full steps.

---

## 🧪 Tests

```sh
npm test --prefix extension               # caption timing and parsing
npm run test:extension --prefix backend   # extension API, mocked, no paid calls
npm run test:study --prefix backend       # Luna sessions and grading
npm run test:ai --prefix backend          # AI provider, stubbed responses
```

---

## 🌱 What's Next

- 🧩 Publish to the Chrome Web Store
- 🌍 More languages, including learners who don't start from English
- 📺 Support for Netflix and other streaming platforms
- 🧠 Luna remembers past sessions
- 🎬 Luna conversations based on the video you just watched
- 🗣️ Pronunciation feedback on how you sound, not just what you said
- 🔁 Smarter vocabulary review timed from your learning history

---

## 👩‍💻 Team

Built with 💐 by Isabella Austin, Kamilla Mamatova, Schneidine Dorelien, and Simone Chrastek.
