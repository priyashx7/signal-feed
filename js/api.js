class ApiService {
    constructor() {
        this.corsProxy = 'https://api.rss2json.com/v1/api.json?rss_url=';
    }

    async callGemini(prompt, apiKey, systemInstruction = "", model = "gemma-3-12b-it") {
        if (!apiKey) throw new Error("Gemini API Key missing.");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const finalPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;

        const payload = {
            contents: [{ parts: [{ text: finalPrompt }] }],
            generationConfig: {
                temperature: 0.3,
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Gemini API Error: ${err.error?.message || res.statusText}`);
        }

        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
    }

    async parsePurposeToTopics(purpose, apiKey, model = "gemma-3-12b-it") {
        const prompt = `Extract 1 to 3 very specific search terms or topics from the user's purpose statement. 
User Purpose: "${purpose}"
Return ONLY a valid JSON array of strings. Example: ["AI tools", "startups"]`;

        try {
            const resultText = await this.callGemini(prompt, apiKey, "", model);
            const cleaned = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleaned);
        } catch (e) {
            console.error("Failed to parse topics with Gemini, falling back to basic split", e);
            // Fallback: simple split by comma
            return purpose.split(',').map(s => s.trim()).filter(s => s.length > 0).slice(0, 3);
        }
    }

    async fetchHackerNews(topic) {
        try {
            const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story`;
            const res = await fetch(url);
            const data = await res.json();
            return data.hits.map(item => ({
                title: item.title,
                url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
                source: 'HackerNews',
                date: item.created_at,
                topic: topic
            })).slice(0, 2);
        } catch (e) {
            console.error('HN fetch error:', e);
            return [];
        }
    }

    async fetchGoogleNews(topic) {
        try {
            const queryUrl = 'https://news.google.com/rss/search?q=' + encodeURIComponent(topic + ' when:1d');
            const rssUrl = encodeURIComponent(queryUrl);
            const res = await fetch(`${this.corsProxy}${rssUrl}`);
            const data = await res.json();
            if (!data.items) return [];
            return data.items.map(item => ({
                title: item.title,
                url: item.link,
                source: 'Google News',
                date: item.pubDate,
                topic: topic
            })).slice(0, 2);
        } catch (e) {
            console.error('Google News fetch error:', e);
            return [];
        }
    }

    async fetchProductHunt() {
        try {
            // Product Hunt doesn't have an open topic search in their RSS, so we pull the main daily feed
            const rssUrl = encodeURIComponent('https://www.producthunt.com/feed');
            const res = await fetch(`${this.corsProxy}${rssUrl}`);
            const data = await res.json();
            if (!data.items) return [];
            return data.items.map(item => ({
                title: item.title,
                url: item.link,
                source: 'Product Hunt',
                date: item.pubDate,
                topic: 'Trending Products'
            })).slice(0, 2);
        } catch (e) {
            console.error('Product Hunt fetch error:', e);
            return [];
        }
    }

    async fetchSentimentForTopic(topic, apiKey, model = "gemma-3-12b-it") {
        try {
            const targetUrl = encodeURIComponent(`https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=new&limit=10`);
            //const url = `https://corsproxy.io/?${targetUrl}`;
            const url = `https://notion-proxy.priyashnamdeo.workers.dev/?url=${targetUrl}`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SignalApp/1.0' }
            });
            const data = await res.json();

            if (!data.data || !data.data.children || data.data.children.length === 0) return "No significant sentiment found on Reddit today.";

            const combinedTitles = data.data.children.slice(0, 10).map(i => i.data.title).join(". ");
            const prompt = `Based on these recent Reddit discussions about "${topic}", summarize the public sentiment in about 100 words. Focus on whether people are excited, skeptical, angry, etc.\n\nDiscussions:\n${combinedTitles}`;

            const sentimentText = await this.callGemini(prompt, apiKey, "", model);
            return sentimentText;
        } catch (e) {
            console.error('Sentiment fetch error:', e);
            return "Unable to fetch sentiment due to an error.";
        }
    }

    async summarizeArticlesBatch(articles, apiKey, purpose, model = "gemma-3-12b-it") {
        // We will pass the articles as JSON to Gemini and ask it to return a summarized structure.
        const articlesJson = JSON.stringify(articles.map((a, i) => ({ id: i, title: a.title, source: a.source })));

        const systemInstruction = `You are an elite daily intelligence AI. 
The user's core interest/purpose is: "${purpose}"
You receive a list of scraped news articles.
For each article, rigorously evaluate if it aligns with the user's purpose. If it does, generate:
1. A crisp 30-50 word summary.
2. A detailed analysis covering TWO explicitly separated sections:
   - "detail_about": Write about the news itself in detail. NEVER include the word 'Impact' here.
   - "detail_impact": Write ONLY about how it could impact or bring change to the respective field or the world.
Return ONLY a valid JSON array of objects representing these details. 
Format expected: [{"id": 0, "summary": "...", "detail_about": "...", "detail_impact": "..."}]`;

        const prompt = `Process these articles and tailor the insights strictly to the user's purpose:\n${articlesJson}`;

        try {
            const resultText = await this.callGemini(prompt, apiKey, systemInstruction, model);
            const cleaned = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
            const summarizedData = JSON.parse(cleaned);

            // Merge mapped data back to original articles
            return articles.map((a, i) => {
                const aiData = summarizedData.find(d => d.id === i) || {};
                return {
                    ...a,
                    summary: aiData.summary || "Summary generation failed.",
                    detailAbout: aiData.detail_about || "",
                    detailImpact: aiData.detail_impact || "",
                    id: Math.random().toString(36).substring(2, 15) // Generate a unique ID for the UI
                };
            });

        } catch (e) {
            console.error("Batch summarization failed", e);
            // Fallback, just return error text as summary
            return articles.map(a => ({
                ...a,
                summary: "AI summarization unavailable due to API quota limits.",
                detailAbout: "Processing limit reached or error occurred.",
                id: Math.random().toString(36).substring(2, 15)
            }));
        }
    }

    async generateWeeklyReport(articles, apiKey, model = 'gemini-2.5-flash') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const articleData = articles.map(a => `Title: ${a.title}\nSummary: ${a.summary}\nSource: ${a.source}\n---\n`).join('\n');

        const prompt = `
            You an elite intelligence analyst.
            I will provide you with a list of "saved intel" articles I collected this week.
            Analyze them, find the common threads, and generate a cohesive Weekly Intelligence Report.
            
            Saved Intel:
            ${articleData}
            
            You must respond ONLY with a valid JSON object matching this exact schema:
            {
                "title": "A short, catchy title for the entire report",
                "summary": "A 1-2 sentence high level executive summary.",
                "description": "A detailed 2-3 paragraph synthesis combining insights from across the collected intel.",
                "redditSentiment": "A 1-paragraph synthesis of how the internet/Reddit might be reacting to these combined topics broadly."
            }
            Do not include markdown blocks, just the raw JSON.
        `;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7 }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("API request failed");

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) throw new Error("Empty response from Gemini API");

        try {
            const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const report = JSON.parse(cleanText);
            return {
                title: report.title || `Weekly Intel Report`,
                summary: report.summary || '',
                description: report.description || '',
                redditSentiment: report.redditSentiment || ''
            };
        } catch (e) {
            console.error("Failed to parse Gemini Report JSON", text);
            throw new Error("Gemini returned malformed JSON");
        }
    }

    async saveToNotion(article, notionToken, dbId) {
        // To interact with Notion directly from browser without CORS issues might be tricky, 
        // typically Notion API blocks browser CORS. 
        // A common workaround is using a proxy, but here we will try directly first.

        // Use standard notion version through a CORS proxy to prevent browser blocks
        const targetUrl = encodeURIComponent('https://api.notion.com/v1/pages');
        //const url = `https://corsproxy.io/?${targetUrl}`;
        const url = `https://notion-proxy.priyashnamdeo.workers.dev/?url=${targetUrl}`;
        const payload = {
            parent: { database_id: dbId },
            properties: {
                Title: { title: [{ text: { content: article.title } }] },
                Source: { select: { name: article.source || 'Unknown' } },
                URL: { url: article.url || 'https://example.com' },
                Summary: { rich_text: [{ text: { content: article.summary || '' } }] },
                Date: { date: { start: new Date().toISOString().split('T')[0] } }
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Notion save failed: ${err.message || res.statusText}`);
        }

        return await res.json();
    }

    async saveReportToNotion(reportData, notionToken, dbId) {
        const targetUrl = encodeURIComponent('https://api.notion.com/v1/pages');
        //const url = `https://corsproxy.io/?${targetUrl}`;
        const url = `https://notion-proxy.priyashnamdeo.workers.dev/?url=${targetUrl}`;

        const payload = {
            parent: { database_id: dbId },
            properties: {
                "Title": {
                    title: [{
                        text: { content: reportData.title || `Weekly Report` }
                    }]
                },
                "Date": { date: { start: new Date().toISOString().split('T')[0] } },
                "Summary": { rich_text: [{ text: { content: reportData.summary || '' } }] },
                "Description": { rich_text: [{ text: { content: reportData.description || '' } }] },
                "Reddit Sentiment": { rich_text: [{ text: { content: reportData.redditSentiment || '' } }] }
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Notion save report failed: ${err.message || res.statusText}`);
        }

        return await res.json();
    }

    async archiveFromNotion(article, notionToken, dbId) {
        // Step 1: Query the Saved database to find the specific page ID for this article
        //const queryUrl = `https://corsproxy.io/?${encodeURIComponent(`https://api.notion.com/v1/databases/${dbId}/query`)}`;
        const queryUrl = `https://notion-proxy.priyashnamdeo.workers.dev/?url=${encodeURIComponent(`https://api.notion.com/v1/databases/${dbId}/query`)}`;

        const queryRes = await fetch(queryUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                filter: {
                    property: 'Title',
                    title: {
                        equals: article.title
                    }
                }
            })
        });

        if (!queryRes.ok) throw new Error("Failed to find article in Notion to delete.");

        const data = await queryRes.json();
        if (!data.results || data.results.length === 0) return; // Not found, nothing to delete

        // Step 2: Archive (Delete) the found page
        const pageId = data.results[0].id;
        //const archiveUrl = `https://corsproxy.io/?${encodeURIComponent(`https://api.notion.com/v1/pages/${pageId}`)}`;
        const archiveUrl = `https://notion-proxy.priyashnamdeo.workers.dev/?url=${encodeURIComponent(`https://api.notion.com/v1/pages/${pageId}`)}`;

        const archiveRes = await fetch(archiveUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                archived: true
            })
        });

        if (!archiveRes.ok) throw new Error("Failed to delete article from Notion.");
    }

    async fetchReportsFromNotion(notionToken, dbId) {
        const targetUrl = encodeURIComponent(`https://api.notion.com/v1/databases/${dbId}/query`);
        //const url = `https://corsproxy.io/?${targetUrl}`;
        const url = `https://notion-proxy.priyashnamdeo.workers.dev/?url=${targetUrl}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({}) // Intentionally empty to fetch all existing pages irrespective of their date
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Notion fetch reports failed: ${err.message || res.statusText}`);
        }

        const data = await res.json();

        return data.results.map(page => {
            const props = page.properties;

            // Helpful to find keys case-insensitively and ignore whitespace
            const getProp = (name) => {
                const key = Object.keys(props).find(k => k.trim().toLowerCase() === name.toLowerCase());
                return key ? props[key] : null;
            };

            const getRichText = (prop) => {
                if (!prop || !prop.rich_text || prop.rich_text.length === 0) return "";
                return prop.rich_text.map(t => t.plain_text).join("");
            };

            const titleProp = getProp('Title');
            const dateProp = getProp('Date');

            return {
                id: page.id,
                title: titleProp?.title?.[0]?.plain_text || 'Untitled Report',
                date: dateProp?.date?.start || new Date(page.created_time).toISOString().split('T')[0],
                summary: getRichText(getProp('Summary')),
                detailAbout: getRichText(getProp('Description')),
                detailImpact: getRichText(getProp('Impact')),
                redditSentiment: getRichText(getProp('Reddit Sentiment'))
            };
        });
    }

    async saveToNotionAllRecords(article, notionToken, dbId) {
        if (!notionToken || !dbId) throw new Error("Missing Notion credentials to save.");

        const targetUrl = encodeURIComponent(`https://api.notion.com/v1/pages`);
        //const url = `https://corsproxy.io/?${targetUrl}`;
        const url = `https://notion-proxy.priyashnamdeo.workers.dev/?url=${targetUrl}`;

        // Use local timezone to generate exactly YYYY-MM-DD to avoid UTC rollover causing "Yesterday" bugs
        const apiDateString = new Date().toLocaleDateString('en-CA');

        const payload = {
            parent: { database_id: dbId },
            properties: {
                "Title": { title: [{ text: { content: (article.title || "Untitled").substring(0, 2000) } }] },
                "Summary": { rich_text: [{ text: { content: (article.summary || "").substring(0, 2000) } }] },
                "Description": { rich_text: [{ text: { content: (article.detailAbout || "No details provided.").substring(0, 2000) } }] },
                "Impact": { rich_text: [{ text: { content: (article.detailImpact || "No impact analysis provided.").substring(0, 2000) } }] },
                "Reddit sentiment": { rich_text: [{ text: { content: (article.redditSentiment || "No sentiment analysis fetched.").substring(0, 2000) } }] },
                "Date": { date: { start: apiDateString } },
                "URL": { url: article.url || null },
                "Source": { select: { name: (article.source || "Unknown").substring(0, 100) } }
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Notion save failed: ${err.message || res.statusText}`);
        }

        return await res.json();
    }

    async fetchFromNotionAllRecords(notionToken, dbId) {
        // Use a CORS proxy to prevent the browser from blocking the Notion API request
        const targetUrl = encodeURIComponent(`https://api.notion.com/v1/databases/${dbId}/query`);
        //const url = `https://corsproxy.io/?${targetUrl}`;
        const url = `https://notion-proxy.priyashnamdeo.workers.dev/?url=${targetUrl}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                page_size: 20 // Adjust as needed
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Notion fetch failed: ${err.message || res.statusText}`);
        }

        const data = await res.json();

        return data.results.map(page => {
            const props = page.properties;

            // Helpful to find keys case-insensitively and ignore whitespace
            const getProp = (name) => {
                const key = Object.keys(props).find(k => k.trim().toLowerCase() === name.toLowerCase());
                return key ? props[key] : null;
            };

            // Generic value extractor that handles all common Notion column types
            const getValue = (p) => {
                if (!p) return '';
                switch (p.type) {
                    case 'title': return p.title.map(t => t.plain_text).join('');
                    case 'rich_text': return p.rich_text.map(t => t.plain_text).join('');
                    case 'select': return p.select ? p.select.name : '';
                    case 'multi_select': return p.multi_select.map(s => s.name).join(', ');
                    case 'url': return p.url || '';
                    case 'date': return p.date ? p.date.start : '';
                    case 'number': return p.number !== null ? String(p.number) : '';
                    case 'checkbox': return p.checkbox ? 'Yes' : 'No';
                    case 'email': return p.email || '';
                    case 'phone_number': return p.phone_number || '';
                    default: return '';
                }
            };

            const dateVal = getValue(getProp('Date'));

            return {
                id: page.id,
                title: getValue(getProp('Title')) || 'Untitled',
                url: getValue(getProp('URL')) || '#',
                source: getValue(getProp('Source')),
                date: dateVal ? dateVal : page.created_time,
                summary: getValue(getProp('Summary')),
                detailAbout: getValue(getProp('Description')),
                detailImpact: getValue(getProp('Impact')),
                redditSentiment: getValue(getProp('Reddit sentiment')),
                topic: 'Imported from Notion' // Default fallback
            };
        });
    }
}

const API = new ApiService();
