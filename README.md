# 🏛️ KnessetTrack (מדד הכנסת)

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Backend - Python FastAPI](https://img.shields.io/badge/Backend-Python_FastAPI-3776AB?logo=python&logoColor=white)](apps/api)
[![Frontend - Next.js](https://img.shields.io/badge/Frontend-Next.js-000000?logo=next.js&logoColor=white)](apps/web)
[![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)

**KnessetTrack** is a state-of-the-art civic transparency web application designed to make the Israeli Parliament's (Knesset) legislative data clear, visual, and accessible. 

By aggregating and caching OData from the official Knesset databases, this platform tracks real-time bills, visualizes individual Member of Knesset (MK) voting breakdowns, and profiles party cohesion.

---

## 📸 Application Screenshots

### Main Dashboard Interface
![KnessetTrack Main Dashboard](docs/images/homepage_dashboard.png)

---

## ✨ Features

* 📊 **Interactive Knesset Seating Layout**: A beautifully rendered semi-circle seating map representing the 120 Members of Knesset, color-coded by party alignment.
* 🧠 **AI-Powered Parliamentary Explanations**: Contextual Hebrew explanations translating dry legal terms, committee clauses, and opposition objections into clear, citizen-friendly language.
* ⚡ **Instant Fallback Strategies**: Optimized TanStack Query configurations preventing loading deadlocks on bills that haven't yet been voted on.
* 🏢 **Party Cohesion & Voting Records**: Full party breakdowns showing who voted *For*, *Against*, or *Abstained*, down to individual MK records.
* 📱 **Modern Glassmorphic Design**: A premium responsive dashboard optimized for Right-to-Left (RTL) reading with smooth micro-animations.

---

## 🎨 Interface Walkthrough

| 🗳️ Vote Breakdown & AI Explanation | 📜 Bill Details & Voting Results | 🔍 Instant 404 Fallback |
|:---:|:---:|:---:|
| ![Vote details and AI explanation](docs/images/vote_details.png) | ![Bill details with voting results](docs/images/bill_details.png) | ![Bill details with no votes fallback](docs/images/bill_no_votes.png) |
| Detailed party voting breakdown and contextual explanation of the Police Ordinance Amendment. | Official overview of Moroccan Jewish Heritage Day Bill, including initiators and votes. | Clean fallback message when querying a bill that is in-committee and has no votes. |

---

## 🏗️ Architecture & Tech Stack

The application is structured as a **monorepo** managed by Turborepo:

```
├── apps
│   ├── api          # FastAPI Python backend (caching, OData client, DB, background sync)
│   └── web          # Next.js 14 React frontend (Tailwind CSS, TanStack Query)
├── packages
│   └── types        # Shared TypeScript type definitions
```

### Technical Stack
* **Frontend**: Next.js 14, React, Tailwind CSS, TanStack React Query, Lucide Icons, Recharts.
* **Backend**: Python 3.11, FastAPI, SQLAlchemy (Async), PostgreSQL, APScheduler (caching daemon).
* **Build System**: Turborepo, PNPM Workspaces.

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18.0.0+)
* PNPM (`npm install -g pnpm`)
* Python (v3.10+)
* PostgreSQL running locally or via a cloud host

### Installation & Environment Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/PrimeDaniel/KnessetTrack.git
   cd KnessetTrack
   ```

2. **Configure Environment Variables:**
   Create a `.env` file in `apps/api/` based on `apps/api/.env.example`:
   ```properties
   DATABASE_URL=postgresql+asyncpg://knesset:knesset@localhost:5432/knessetil
   ENVIRONMENT=development
   ```

3. **Install Dependencies:**
   ```bash
   pnpm install
   ```

4. **Initialize Backend Virtualenv & Sync:**
   ```bash
   cd apps/api
   python -m venv venv
   # Activate virtualenv:
   # Windows: .\venv\Scripts\activate
   # Linux/macOS: source venv/bin/activate
   pip install -r requirements.txt
   ```

5. **Start Dev Servers:**
   From the repository root, run:
   ```bash
   pnpm dev
   ```
   This will spin up both the FastAPI backend (`http://localhost:8000`) and the Next.js frontend (`http://localhost:3000`) concurrently.

---

## 🔌 Data Sources

All legislative records are sourced dynamically from the **Knesset OData v4 API**. KnessetTrack caches these records inside PostgreSQL and schedules updates via a background worker to ensure optimal query response times and compliance with Knesset service rate-limits.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
