# SIGNAL. — Daily Intelligence Feed

> An AI-powered personal intelligence dashboard that automatically scrapes, summarizes, and syncs daily news to your Notion workspace.

📺 **[Watch Demo Video](https://drive.google.com/file/d/1-A1WCB5AFHmDFi3g01fyNvThD5Xos8bT/view?usp=sharing)** | 🌐 **[Live App](https://priyashx7.github.io/signal-feed/)**

---

## About the Project

SIGNAL is a personal daily briefing app I built for founders, researchers, and curious minds who want to stay on top of their niche without drowning in noise.

The problem it solves: most people want to stay informed about their specific interests but don't have the time to manually browse multiple sources every day. SIGNAL automates the entire pipeline — from fetching and summarizing news to storing it in Notion — so you just open the app and read.

---

## How It Works

Every morning at 6:00 AM, a GitHub Actions automation:
1. Scrapes the latest news from HackerNews, Google News, and Product Hunt
2. Passes each article through Google Gemini AI for summarization and impact analysis
3. Saves everything to a Notion database

You open the app, swipe through AI-summarized cards, bookmark what matters, and every Sunday a weekly synthesis report is auto-generated from your saved intel.

---

## Features

- **AI-Powered Summaries** — Each article gets a 30-50 word summary plus a detailed breakdown of what happened and its potential impact on the world
- **Swipeable Card UI** — Clean mobile-first interface designed for fast daily browsing
- **Notion Sync** — All articles automatically saved to Notion for long-term reference
- **Saved Intel** — Bookmark articles to revisit later
- **Weekly Reports** — Auto-generated every Sunday synthesizing the week's most important stories
- **Reddit Sentiment** — Public sentiment analysis pulled from Reddit discussions on each topic
- **Fully Automated** — Zero manual effort after initial setup

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript |
| AI | Google Gemini API (gemini-2.5-flash) |
| Database | Notion API |
| Hosting | GitHub Pages |
| Proxy & Secrets | Cloudflare Workers |
| Automation | GitHub Actions (3 workflows) |
| News Sources | HackerNews, Google News RSS, Product Hunt |

---

## Architecture

```
GitHub Actions (Daily 6AM Cron)
         ↓
   Fetches News Articles
         ↓
   Gemini AI Summarizes
         ↓
   Saves to Notion Database
         ↓
   GitHub Pages (Frontend)
         ↓
   Cloudflare Worker (Secure Proxy)
         ↓
   Displays in App
```

---

## Demo

📺 [Watch the full demo](https://drive.google.com/file/d/1-A1WCB5AFHmDFi3g01fyNvThD5Xos8bT/view?usp=sharing)

🌐 [Try the live app](https://priyashx7.github.io/signal-feed/)

---

*Built by Priyash — 2026*
