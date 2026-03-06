import fs from 'fs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DB_ID;

if (!GEMINI_API_KEY || !NOTION_TOKEN || !NOTION_DB_ID) {
    console.error("Missing credentials.");
    process.exit(1);
}

async function callGemini(prompt, systemInstruction = "") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-12b-it:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
    };
    if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`Gemini Error: ${(await res.text())}`);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
}

async function runWeeklyReport() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`;
    const payload = {
        filter: {
            and: [
                { property: "Type", select: { equals: "Daily Feed" } },
                { timestamp: "created_time", created_time: { on_or_after: sevenDaysAgo.toISOString() } }
            ]
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
    const data = await res.json();

    if (data.results.length === 0) return console.log("No data for weekly report.");

    const articles = data.results.map(p => {
        const titleProp = p.properties.Title;
        const title = titleProp && titleProp.title.length > 0 ? titleProp.title[0].text.content : 'Untitled';
        return title;
    });

    const combined = articles.join(". ");
    const prompt = `Based on these recent news headlines from the past week, generate a highly valuable intelligence report.
1. Extract Top 5 key trends of the week.
2. Identify Emerging opportunities.
3. Provide Strategic recommendations for the founder.
News: ${combined}`;

    const reportText = await callGemini(prompt);

    // Save to Notion as a Weekly Report page
    const saveUrl = 'https://api.notion.com/v1/pages';
    const reportPayload = {
        parent: { database_id: NOTION_DB_ID },
        properties: {
            Title: { title: [{ text: { content: `Weekly Pattern Report - ${new Date().toLocaleDateString()}` } }] },
            Type: { select: { name: "Weekly Report" } },
            Summary: { rich_text: [{ text: { content: reportText.substring(0, 2000) } }] }
        },
        children: [
            {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{ type: 'text', text: { content: reportText.substring(0, 2000) } }]
                }
            }
        ]
    };

    await fetch(saveUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${NOTION_TOKEN}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify(reportPayload)
    });
    console.log("Weekly Report Generated Successfully!");
}

runWeeklyReport();
