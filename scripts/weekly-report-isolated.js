const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID_ALL = process.env.NOTION_DB_ID;
const NOTION_DB_ID_REPORTS = process.env.NOTION_DB_ID_REPORTS;
const GEMINI_MODEL = 'gemini-2.5-flash';

async function fetchPastWeekRecords() {
    console.log("Fetching the last 7 days of intelligence from Notion...");
    const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID_ALL}/query`;

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                filter: {
                    and: [
                        { property: "Date", date: { on_or_after: sevenDaysAgo.toISOString().split('T')[0] } },
                        { property: "Date", date: { on_or_before: today.toISOString().split('T')[0] } }
                    ]
                },
                page_size: 100
            })
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        return data.results.map(page => {
            const props = page.properties;
            const getProp = name => {
                const key = Object.keys(props).find(k => k.trim().toLowerCase() === name.toLowerCase());
                return key ? props[key] : null;
            };
            const getValue = p => {
                if (!p) return '';
                if (p.type === 'title') return p.title.map(t => t.plain_text).join('');
                if (p.type === 'rich_text') return p.rich_text.map(t => t.plain_text).join('');
                if (p.type === 'select') return p.select ? p.select.name : '';
                return '';
            };

            return {
                title: getValue(getProp('Title')),
                summary: getValue(getProp('Summary')),
                detailAbout: getValue(getProp('Description')),
                detailImpact: getValue(getProp('Impact')),
                source: getValue(getProp('Source'))
            };
        });
    } catch (e) {
        console.error("Failed to fetch past week records:", e);
        return [];
    }
}

async function generateWeeklyReport(articles) {
    if (articles.length === 0) {
        console.log("No articles found in the past 7 days. AI synthesis aborted.");
        return null;
    }

    console.log(`Synthesizing weekly report from ${articles.length} records...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const articleData = articles.map(a => `Title: ${a.title}\nSummary: ${a.summary}\nSource: ${a.source}\n---\n`).join('\n');

    const prompt = `You are an elite intelligence analyst. 
Analyze the following news articles collected over the past week and synthesize a master weekly report.

Use this EXACT JSON structure for your output:
{
  "title": "A catchy, high-level title summarizing the dominant theme of the week",
  "summary": "A 1-2 sentence executive summary of the week's events.",
  "description": "A detailed synthesis (3-4 paragraphs) breaking down the key narratives, tech advancements, or business shifts that emerged this week across the collected articles.",
  "reddit_sentiment": "A generalized 1-paragraph summary inferring the broader online pulse or sentiment based on these events."
}

Collected Intelligence:
${articleData}`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 }
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();
        const resultText = data.candidates[0].content.parts[0].text;
        const cleaned = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);

    } catch (e) {
        console.error("Failed to generate report via Gemini:", e);
        return null;
    }
}

async function saveReportToNotion(reportObj) {
    if (!reportObj) return;

    console.log("Saving new Weekly Report to Notion...");
    const url = 'https://api.notion.com/v1/pages';
    const apiDateString = new Date().toLocaleDateString('en-CA');

    const payload = {
        parent: { database_id: NOTION_DB_ID_REPORTS },
        properties: {
            "Title": { title: [{ text: { content: reportObj.title.substring(0, 2000) } }] },
            "Date": { date: { start: apiDateString } },
            "Summary": { rich_text: [{ text: { content: reportObj.summary.substring(0, 2000) } }] },
            "Description": { rich_text: [{ text: { content: reportObj.description.substring(0, 2000) } }] },
            "Impact": { rich_text: [{ text: { content: (reportObj.impact || '').substring(0, 2000) } }] },
            "Reddit sentiment": { rich_text: [{ text: { content: reportObj.reddit_sentiment.substring(0, 2000) } }] }
        }
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("Notion save FAILED:", errText);
            return;
        }
        console.log("Weekly Report successfully saved to Notion!");
    } catch (e) {
        console.error("Failed to save report to Notion:", e);
    }
}

async function run() {
    try {
        const articles = await fetchPastWeekRecords();
        if (articles.length > 0) {
            const report = await generateWeeklyReport(articles);
            await saveReportToNotion(report);
        } else {
            console.log("Week was empty; no report to generate. Exiting.");
        }
    } catch (e) {
        console.error("Fatal sequence error:", e);
    }
}

run();