import fs from 'fs';
import Parser from 'rss-parser';

const parser = new Parser();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DB_ID;
const GEMINI_MODEL = 'gemini-2.5-flash';

async function callGemini(prompt, systemInstruction = "") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 }
    };
    if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`Gemini API Error: ${(await res.text())}`);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
}

async function fetchHN(topic) {
    try {
        const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&numericFilters=created_at_i>${Math.floor(Date.now() / 1000) - 86400}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.hits.map(item => ({
            title: item.title,
            url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
            source: 'HackerNews',
            date: item.created_at,
            topic: topic
        })).slice(0, 3);
    } catch (e) { return []; }
}

async function fetchGoogleNews(topic) {
    try {
        const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${encodeURIComponent(topic + ' when:1d')}`);
        return feed.items.map(item => ({
            title: item.title,
            url: item.link,
            source: 'Google News',
            date: item.pubDate,
            topic: topic
        })).slice(0, 3);
    } catch (e) { return []; }
}

async function summarizeArticles(articles) {
    const articlesJson = JSON.stringify(articles.map((a, i) => ({ id: i, title: a.title, source: a.source })));

    const systemInstruction = `You are an elite daily intelligence AI.
For each article, generate:
1. A crisp 30-50 word summary.
2. "detail_about": Write about the news itself in detail.
3. "detail_impact": Write ONLY about how it could impact or bring change to the respective field or the world.
Return ONLY a valid JSON array: [{"id": 0, "summary": "...", "detail_about": "...", "detail_impact": "..."}]`;

    const prompt = `Process these articles:\n${articlesJson}`;

    try {
        const resultText = await callGemini(prompt, systemInstruction);
        const cleaned = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Summarization failed:", e);
        return articles.map((_, i) => ({ id: i, summary: "Summary unavailable.", detail_about: "", detail_impact: "" }));
    }
}

async function saveToNotion(article) {
    const url = 'https://api.notion.com/v1/pages';
    const payload = {
        parent: { database_id: NOTION_DB_ID },
        properties: {
            Title: { title: [{ text: { content: article.title.substring(0, 2000) } }] },
            Source: { select: { name: article.source || 'Unknown' } },
            URL: { url: article.url || null },
            Summary: { rich_text: [{ text: { content: (article.summary || '').substring(0, 2000) } }] },
            Description: { rich_text: [{ text: { content: (article.detailAbout || '').substring(0, 2000) } }] },
            Impact: { rich_text: [{ text: { content: (article.detailImpact || '').substring(0, 2000) } }] },
            "Reddit sentiment": { rich_text: [{ text: { content: '' } }] },
            Date: { date: { start: new Date().toLocaleDateString('en-CA') } }
        }
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${NOTION_TOKEN}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) console.error("Notion save error:", await res.text());
}

async function run() {
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
    console.log("Fetching for topics:", config.interests);

    for (const topic of config.interests) {
        console.log(`Processing topic: ${topic}`);
        const hn = await fetchHN(topic);
        const gn = await fetchGoogleNews(topic);
        const articles = [...hn, ...gn].filter((v, i, a) => a.findIndex(t => t.title === v.title) === i);

        if (articles.length === 0) continue;

        const summaries = await summarizeArticles(articles);

        for (let i = 0; i < articles.length; i++) {
            const s = summaries.find(x => x.id === i);
            articles[i].summary = s ? s.summary : articles[i].title;
            articles[i].detailAbout = s ? s.detail_about : '';
            articles[i].detailImpact = s ? s.detail_impact : '';
            await saveToNotion(articles[i]);
        }
        console.log(`Saved ${articles.length} items for ${topic}`);
    }
}

run();