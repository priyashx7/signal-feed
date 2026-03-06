import fs from 'fs';
import Parser from 'rss-parser';

const parser = new Parser();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DB_ID;

if (!GEMINI_API_KEY || !NOTION_TOKEN || !NOTION_DB_ID) {
    console.error("Missing required environment variables.");
    process.exit(1);
}

async function callGemini(prompt, systemInstruction = "") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-12b-it:generateContent?key=${GEMINI_API_KEY}`;
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

async function saveToNotion(article) {
    const url = 'https://api.notion.com/v1/pages';
    const payload = {
        parent: { database_id: NOTION_DB_ID },
        properties: {
            Title: { title: [{ text: { content: article.title.substring(0, 2000) } }] },
            Topic: { rich_text: [{ text: { content: article.topic } }] },
            Source: { rich_text: [{ text: { content: article.source } }] },
            URL: { url: article.url },
            Summary: { rich_text: [{ text: { content: article.summary.substring(0, 2000) } }] },
            Type: { select: { name: "Daily Feed" } }
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
        const articles = [...hn, ...gn].filter((v, i, a) => a.findIndex(t => (t.title === v.title)) === i);

        if (articles.length === 0) continue;

        const articlesJson = JSON.stringify(articles.map((a, i) => ({ id: i, title: a.title, source: a.source })));
        const prompt = `Process these articles and provide a 30-50 word summary for each:\n${articlesJson}`;
        const sys = `Return ONLY a valid JSON array of objects format: [{"id": 0, "summary": "..."}]`;

        try {
            const aiRes = await callGemini(prompt, sys);
            const summaries = JSON.parse(aiRes.replace(/```json/g, '').replace(/```/g, '').trim());

            for (let i = 0; i < articles.length; i++) {
                const s = summaries.find(x => x.id === i);
                articles[i].summary = s ? s.summary : articles[i].title;
                await saveToNotion(articles[i]);
            }
            console.log(`Saved ${articles.length} items for ${topic}`);
        } catch (e) {
            console.error("Summarization error for topic", topic, e);
        }
    }
}

run();
