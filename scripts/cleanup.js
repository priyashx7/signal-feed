import fs from 'fs';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DB_ID;
const NOTION_DB_ID_REPORTS = process.env.NOTION_DB_ID_REPORTS;

if (!NOTION_TOKEN || !NOTION_DB_ID) {
    console.error("Missing Notion credentials for main database.");
    process.exit(1);
}

async function runCleanup(dbId, daysAgo, dbName) {
    if (!dbId) {
        console.warn(`Skipping cleanup for ${dbName} because DB ID is not set.`);
        return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    // Query items in the DB created before cutoffDate
    const url = `https://api.notion.com/v1/databases/${dbId}/query`;
    const payload = {
        filter: {
            property: "Date",
            date: {
                before: cutoffDate.toISOString().split('T')[0] // Format as YYYY-MM-DD for Notion Date property
            }
        }
    };

    console.log(`Starting cleanup for ${dbName} (Older than ${daysAgo} days)`);

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

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        console.log(`Found ${data.results.length} pages to delete in ${dbName}.`);

        for (const page of data.results) {
            // Archive page (soft delete)
            await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${NOTION_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({ archived: true })
            });
            console.log(`Deleted page: ${page.id}`);
        }

    } catch (e) {
        console.error(`Cleanup failed for ${dbName}:`, e);
    }
}

async function start() {
    // Run cleanup for All Records database (10 Days)
    await runCleanup(NOTION_DB_ID, 10, "All Records");

    // Run cleanup for Weekly Reports database (20 Days)
    await runCleanup(NOTION_DB_ID_REPORTS, 20, "Weekly Reports");
}

start();
