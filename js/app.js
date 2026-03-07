document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const elements = {
        purposeInput: document.getElementById('purposeInput'),
        editPurposeBtn: document.getElementById('editPurposeBtn'),
        purposeCount: document.getElementById('purposeCount'),
        fetchBtn: document.getElementById('fetchNewsBtn'),
        navItems: document.querySelectorAll('.nav-item'),
        views: document.querySelectorAll('.view-section'),

        // Feed
        cardStack: document.getElementById('cardStack'),
        statsInfo: document.getElementById('statsInfo'),
        btnSkip: document.getElementById('btnSkip'),
        btnSave: document.getElementById('btnSave'),

        // Saved & Reports
        savedGrid: document.getElementById('savedGrid'),
        savedCount: document.getElementById('savedCount'),
        reportsGrid: document.getElementById('reportsGrid'),
        reportsCount: document.getElementById('reportsCount'),

        // Mobile Menu
        mobileMenuBtn: document.getElementById('mobileMenuBtn'),
        sidebarMenu: document.getElementById('sidebarMenu'),
        menuBackdrop: document.getElementById('menuBackdrop'),

        // Panels & Modals
        detailPanel: document.getElementById('detailPanel'),
        detailContent: document.getElementById('detailContent'),
        closeDetailBtn: document.getElementById('closeDetailBtn'),
        panelBackdrop: document.getElementById('panelBackdrop'),

        toast: document.getElementById('toast'),

        // Inputs
        // Delete Confirm Modal
        deleteConfirmOverlay: document.getElementById('deleteConfirmOverlay'),
        cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
        confirmDeleteBtn: document.getElementById('confirmDeleteBtn')
    };

    let currentFeedList = [];
    let currentCardIndex = 0;

    let currentSavedIndex = 0;

    let articlePendingDelete = null; // Store state for modal

    // Initialize App
    function init() {
        // Load Settings
        const settings = Store.getSettings();

        // Load Purpose
        let purpose = Store.getPurpose();
        if (!purpose || purpose.trim() === '') {
            purpose = "Stay updated on AI, tech, business, new AI tools, and startup news. Know what's new and emerging in the market.";
            Store.savePurpose(purpose);
        }
        elements.purposeInput.value = purpose;
        updateCharCount();

        setupEventListeners();

        // We no longer auto-fetch on load as requested. 
        // Simply try to load from the local Storage cache, but strictly ensure they are TODAY's records.
        const cached = Store.getCachedFeed();

        let validCache = false;
        if (cached && cached.length > 0) {
            const apiDateString = new Date().toLocaleDateString('en-CA');
            const savedList = Store.getSavedArticles();

            const todaysCached = cached.filter(record => {
                if (!record.date) return false;

                // Exclude articles already saved
                const isAlreadySaved = savedList.some(s =>
                    (s.id && s.id === record.id) ||
                    (s.title && s.title === record.title) ||
                    (s.url && s.url !== '#' && s.url === record.url)
                );
                if (isAlreadySaved) return false;

                return record.date.startsWith(apiDateString);
            });

            if (todaysCached.length > 0) {
                validCache = true;
                currentFeedList = todaysCached;
                Store.saveCurrentFeed(currentFeedList); // Update cache to drop old ones
                renderNextCard();
            }
        }

        if (!validCache) {
            Store.saveCurrentFeed([]); // Hard purge the old cache from local storage
            //if (!settings.notionToken || !settings.notionDbIdAll) {
            if (!settings.notionDbIdAll) {
                elements.statsInfo.textContent = "Please configure 'Notion DB ID (All Records)' to load cards.";
            } else {
                elements.statsInfo.textContent = "Ready to discover. Click 'Get News' to begin.";
            }
            currentFeedList = [];
            renderNextCard();
        }

        renderSavedView();

        // Background sync with Notion to pull in any cron-job generated articles or other devices
        syncNotionFeed(settings);
    }

    async function syncNotionFeed(settings) {
        //if (!settings.notionToken || !settings.notionDbIdAll) return;
        if (!settings.notionDbIdAll) return;

        try {
            if (currentFeedList.length === 0) elements.statsInfo.textContent = "Checking Notion database for today's intel...";

            const notionRecords = await API.fetchFromNotionAllRecords(settings.notionToken, settings.notionDbIdAll);
            const apiDateString = new Date().toLocaleDateString('en-CA');
            const savedList = Store.getSavedArticles();

            const todaysNotion = notionRecords.filter(record => {
                if (!record.date) return false;
                const isAlreadySaved = savedList.some(s =>
                    (s.id && s.id === record.id) ||
                    (s.title && s.title === record.title) ||
                    (s.url && s.url !== '#' && s.url === record.url)
                );
                if (isAlreadySaved) return false;
                return record.date.startsWith(apiDateString);
            });

            // Merge with currentFeedList
            const currentIds = new Set(currentFeedList.map(a => a.id));
            const currentTitles = new Set(currentFeedList.map(a => a.title));
            const newRecords = todaysNotion.filter(a => !currentIds.has(a.id) && !currentTitles.has(a.title));

            if (newRecords.length > 0) {
                currentFeedList = [...currentFeedList, ...newRecords];
                Store.saveCurrentFeed(currentFeedList); // Update cache

                // If the feed was empty or we reached the end
                if (currentCardIndex >= currentFeedList.length - newRecords.length) {
                    renderNextCard();
                }
                elements.statsInfo.textContent = `Synced ${newRecords.length} new records from Notion database.`;
            } else if (currentFeedList.length === 0) {
                elements.statsInfo.textContent = "Ready to discover. Click 'Get News' to search.";
            }
        } catch (e) {
            console.error("Background sync failed", e);
            if (currentFeedList.length === 0) {
                elements.statsInfo.textContent = "Ready to discover. Click 'Get News' to search.";
            }
        }
    }

    function setupEventListeners() {
        // Character count
        elements.purposeInput.addEventListener('input', () => {
            updateCharCount();
            const val = elements.purposeInput.value;
            Store.savePurpose(val);
            // Enable the fetch button when the user edits their purpose, unless it's empty
            elements.fetchBtn.disabled = val.trim() === '';
        });

        // Toggle Edit Purpose
        if (elements.editPurposeBtn) {
            elements.editPurposeBtn.addEventListener('click', () => {
                elements.purposeInput.removeAttribute('readonly');
                elements.purposeInput.focus();
            });
        }

        elements.purposeInput.addEventListener('blur', () => {
            elements.purposeInput.setAttribute('readonly', true);
        });

        // Navigation Logging
        elements.navItems.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetViewId = e.currentTarget.dataset.view;
                elements.navItems.forEach(i => i.classList.remove('active'));
                e.currentTarget.classList.add('active');

                elements.views.forEach(v => v.style.display = 'none');
                document.getElementById(`view-${targetViewId}`).style.display = 'flex';

                if (targetViewId === 'saved') renderSavedView();
                if (targetViewId === 'reports') renderReportsView();

                // close on mobile
                if (window.innerWidth <= 768) {
                    closeMobileMenu();
                }
            });
        });

        // Fetch Logic
        elements.fetchBtn.addEventListener('click', handleFetchNews);



        // Mobile Menu Config
        if (elements.mobileMenuBtn) {
            elements.mobileMenuBtn.addEventListener('click', toggleMobileMenu);
        }
        if (elements.menuBackdrop) {
            elements.menuBackdrop.addEventListener('click', closeMobileMenu);
        }

        // Backdrops
        // elements.closeDetailBtn.addEventListener('click', closeDetailPanel); // Button removed in UI
        elements.panelBackdrop.addEventListener('click', closeDetailPanel);

        // Swipe to Close Detail Panel
        let panelStartX = 0;
        let panelCurrentX = 0;
        let isPanelDragging = false;

        elements.detailPanel.addEventListener('touchstart', (e) => {
            // Don't interfere if they are scrolling vertically on content
            if (elements.detailPanel.scrollTop > 0 && e.touches[0].clientX > 50) return;
            isPanelDragging = true;
            panelStartX = e.touches[0].clientX;
            elements.detailPanel.style.transition = 'none';
        }, { passive: true });

        elements.detailPanel.addEventListener('touchmove', (e) => {
            if (!isPanelDragging) return;
            panelCurrentX = e.touches[0].clientX - panelStartX;
            // Only allow swiping to the Right (positive X)
            if (panelCurrentX > 0) {
                elements.detailPanel.style.transform = `translateX(${panelCurrentX}px)`;
            }
        }, { passive: true });

        elements.detailPanel.addEventListener('touchend', () => {
            if (!isPanelDragging) return;
            isPanelDragging = false;
            elements.detailPanel.style.transition = 'right 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s ease-out';

            if (panelCurrentX > 100) {
                // Swiped far enough right -> Close
                closeDetailPanel();
            } else {
                // Snap back
                elements.detailPanel.style.transform = `translateX(0px)`;
            }
            panelCurrentX = 0;
        });

        // Mouse versions for Desktop
        elements.detailPanel.addEventListener('mousedown', (e) => {
            if (e.target.closest('button') || e.target.closest('a')) return; // Ignore buttons/links
            if (elements.detailPanel.scrollTop > 0 && e.clientX > 50) return;
            isPanelDragging = true;
            panelStartX = e.clientX;
            elements.detailPanel.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isPanelDragging) return;
            panelCurrentX = e.clientX - panelStartX;
            if (panelCurrentX > 0) {
                elements.detailPanel.style.transform = `translateX(${panelCurrentX}px)`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (!isPanelDragging) return;
            isPanelDragging = false;
            elements.detailPanel.style.transition = 'right 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s ease-out';

            if (panelCurrentX > 100) {
                closeDetailPanel();
            } else {
                elements.detailPanel.style.transform = `translateX(0px)`;
            }
            panelCurrentX = 0;
        });

        // Delete Modal Listeners
        if (elements.cancelDeleteBtn) {
            elements.cancelDeleteBtn.addEventListener('click', () => {
                elements.deleteConfirmOverlay.classList.remove('open');
                articlePendingDelete = null;
            });
        }

        if (elements.confirmDeleteBtn) {
            elements.confirmDeleteBtn.addEventListener('click', () => {
                elements.deleteConfirmOverlay.classList.remove('open');
                if (articlePendingDelete) {

                    // Remove from Local Storage
                    Store.removeArticle(articlePendingDelete.id || articlePendingDelete.title);

                    // Remove from Notion
                    if (window.unSaveArticleFromNotion) {
                        window.unSaveArticleFromNotion(articlePendingDelete);
                    }

                    // Force refresh the deck so the card physically disappears
                    renderSavedView();

                    // Sync the unsave state back to any pre-rendered cards lingering in the Feed section
                    document.querySelectorAll('#cardStack .swipe-card').forEach(card => {
                        const isCardSaved = Store.isSaved(card.dataset.id) || Store.isSaved(card.querySelector('.card-title')?.textContent);
                        const saveIcon = card.querySelector('.save-toggle-btn i');
                        if (saveIcon && !isCardSaved) {
                            saveIcon.className = 'bx bx-bookmark';
                            saveIcon.style.color = 'var(--text-secondary)';
                        }
                    });

                    articlePendingDelete = null;
                }
            });
        }
    }

    function updateCharCount() {
        const len = elements.purposeInput.value.length;
        elements.purposeCount.textContent = len;
        elements.purposeCount.style.color = len >= 140 ? 'var(--accent-secondary)' : 'var(--text-secondary)';
    }

    function showToast(msg) {
        elements.toast.textContent = msg;
        elements.toast.classList.add('show');
        setTimeout(() => elements.toast.classList.remove('show'), 3000);
    }



    async function handleFetchNews() {
        const settings = Store.getSettings();

        //if (!settings.notionToken || !settings.notionDbIdAll) {
        if (!settings.notionDbIdAll) {
            return showToast("Please configure 'Notion DB ID (All Records)' in Settings.");
        }
        if (!settings.geminiKey) {
            return showToast("Please configure your Gemini API Key in Settings to generate news.");
        }

        const purpose = elements.purposeInput.value.trim();
        if (!purpose) {
            return showToast("Please enter a purpose to fetch relevant news.");
        }

        const btnOriginalHtml = elements.fetchBtn.innerHTML;
        elements.fetchBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Scanning intel...";
        elements.fetchBtn.disabled = true;

        try {
            // Step 1: Parse Purpose
            elements.statsInfo.textContent = "Analyzing your purpose...";
            const topics = await API.parsePurposeToTopics(purpose, settings.geminiKey, settings.geminiModel);
            console.log("Extracted Topics:", topics);

            if (!topics || topics.length === 0) {
                throw new Error("Could not extract topics from your purpose.");
            }

            // Step 2: Fetch Raw News
            elements.statsInfo.textContent = `Gathering raw intel for: ${topics.join(', ')}...`;
            let rawArticles = [];
            for (const topic of topics) {
                let hn = [];
                let gn = [];
                try {
                    hn = await API.fetchHackerNews(topic);
                } catch (hnErr) {
                    console.error(`HackerNews fetch failed for ${topic}:`, hnErr);
                }

                try {
                    gn = await API.fetchGoogleNews(topic);
                } catch (gnErr) {
                    console.error(`Google News fetch failed for ${topic}:`, gnErr);
                }

                let ph = [];
                // Only fetch Product Hunt once per batch since it's a generic feed
                if (topic === topics[0]) {
                    try {
                        ph = await API.fetchProductHunt();
                    } catch (phErr) {
                        console.error(`Product Hunt fetch failed:`, phErr);
                    }
                }

                rawArticles = [...rawArticles, ...hn, ...gn, ...ph];
            }

            // Deduplicate by URL
            const uniqueArticles = Array.from(new Map(rawArticles.map(item => [item.url, item])).values());

            if (uniqueArticles.length === 0) {
                elements.statsInfo.textContent = "No recent intel found for these topics across active scrapers.";
                currentFeedList = [];
                renderNextCard();
                return;
            }

            // Process up to 12 articles to allow 2 from each of the 3 sources across 2 topics
            const articlesToProcess = uniqueArticles.slice(0, 12);

            // Step 3: Summarize & Analyze with Gemini
            elements.statsInfo.textContent = "Processing intel through Gemini...";
            const summarizedArticles = await API.summarizeArticlesBatch(articlesToProcess, settings.geminiKey, purpose, settings.geminiModel);

            // Step 4: Add Sentiment and Save to Notion
            elements.statsInfo.textContent = "Fetching sentiment and saving to database...";
            let savedCount = 0;

            for (let article of summarizedArticles) {
                // Fetch sentiment specifically for the article's topic right before saving
                let sentiment = "Sentiment analysis currently unavailable.";
                try {
                    sentiment = await API.fetchSentimentForTopic(article.topic, settings.geminiKey, settings.geminiModel);
                } catch (sentErr) {
                    console.error("Reddit sentiment fetch failed:", sentErr);
                }
                article.redditSentiment = sentiment;

                try {
                    await API.saveToNotionAllRecords(article, settings.notionToken, settings.notionDbIdAll);
                    savedCount++;
                } catch (saveErr) {
                    console.error("Failed to save article to Notion:", saveErr);
                }
            }

            // Step 5: Render Feed
            if (savedCount === 0) {
                throw new Error("Failed to save generated records to the database.");
            }

            elements.statsInfo.textContent = `Successfully processed and securely stored ${savedCount} new intelligence records.`;

            // Re-fetch the newly added records from Notion so the feed acts on the exact DB structure
            const notionRecords = await API.fetchFromNotionAllRecords(settings.notionToken, settings.notionDbIdAll);
            const todayDate = new Date();
            const todayYear = todayDate.getFullYear();
            const todayMonth = todayDate.getMonth();
            const todayDay = todayDate.getDate();

            const savedList = Store.getSavedArticles();

            const todaysRecords = notionRecords.filter(record => {
                if (!record.date) return false;

                // Exclude articles that are already in the "Saved" pile to prevent them from bleeding 
                // into the feed if the user mapped both settings to the exact same Notion Database.
                const isAlreadySaved = savedList.some(s =>
                    (s.id && s.id === record.id) ||
                    (s.title && s.title === record.title) ||
                    (s.url && s.url !== '#' && s.url === record.url)
                );
                if (isAlreadySaved) return false;

                const recDate = new Date(record.date);
                return recDate.getFullYear() === todayYear &&
                    recDate.getMonth() === todayMonth &&
                    recDate.getDate() === todayDay;
            });

            currentFeedList = todaysRecords;
            Store.saveCurrentFeed(currentFeedList);
            currentCardIndex = 0;

            renderNextCard();

        } catch (e) {
            console.error("Fetch News Error:", e);
            if (e.message !== "No news found") showToast(e.message);
            elements.statsInfo.textContent = "Error: " + e.message;
        } finally {
            elements.fetchBtn.innerHTML = btnOriginalHtml;
            // Keep the button disabled after fetching, forcing the user to edit purpose to fetch again
        }
    }

    function renderNextCard() {
        elements.cardStack.innerHTML = '';
        if (currentFeedList.length === 0) {
            elements.cardStack.innerHTML = `
                <div class="empty-state">
                    <div class="glass-icon"><i class='bx bx-check-double'></i></div>
                    <h2>No intel found.</h2>
                    <p>Check your tracking settings.</p>
                </div>`;

            // Activate the get news button if feed is empty, provided purpose is not blank
            if (elements.purposeInput.value.trim() !== '') {
                elements.fetchBtn.disabled = false;
            }
            return;
        }

        // If we somehow exceed the array (though we continuously push), wrap around safely
        if (currentCardIndex >= currentFeedList.length) {
            currentCardIndex = 0;
        }

        // Render the NEXT card to rest underneath (if there is more than 1 in the list)
        if (currentFeedList.length > 1) {
            let backendIndex = currentCardIndex + 1;
            if (backendIndex >= currentFeedList.length) backendIndex = 0;
            const backArticle = currentFeedList[backendIndex];

            const backCardDOM = CardComponent.create(
                backArticle,
                null, null, null, null // The back card shouldn't trigger actions until it's the front card
            );
            // Style it to look like it's resting behind
            backCardDOM.style.transform = 'scale(0.95)';
            backCardDOM.style.zIndex = '0';
            backCardDOM.style.pointerEvents = 'none'; // Prevent interaction
            backCardDOM.style.filter = 'brightness(0.9)';
            elements.cardStack.appendChild(backCardDOM);
        }

        // Render FRONT card
        const frontArticle = currentFeedList[currentCardIndex];
        const frontCardDOM = CardComponent.create(
            frontArticle,
            handleSwipeLeft,
            handleSwipeRight,
            handleReadMore,
            handleSentiment
        );
        frontCardDOM.style.zIndex = '10';
        frontCardDOM.classList.add('fly-in');
        elements.cardStack.appendChild(frontCardDOM);
    }

    function triggerCardSwipe(direction) {
        const card = elements.cardStack.querySelector('.swipe-card');
        if (!card) return;

        card.style.transition = 'transform 0.4s ease-out';
        if (direction === 'left') {
            card.classList.add('swipe-out-left');
            setTimeout(() => handleSwipeLeft(currentFeedList[currentCardIndex], card), 400);
        } else {
            card.classList.add('swipe-out-right');
            setTimeout(() => handleSwipeRight(currentFeedList[currentCardIndex], card), 400);
        }
    }

    function handleSwipeLeft(article, domCard) {
        domCard.remove();

        // Push the article to the back of the queue
        currentFeedList.push(article);
        currentCardIndex++;

        // We no longer strictly slice off the beginning, just update the feed
        Store.saveCurrentFeed(currentFeedList.slice(currentCardIndex));
        renderNextCard();
    }

    async function handleSwipeRight(article, domCard) {
        if (domCard) domCard.remove();

        // Save Locally first to check for duplicates
        const didSaveLocally = Store.saveArticle(article);

        if (didSaveLocally) {
            showToast("Saved Locally.");

            // Attempt Notion Save to "Saved Intel" DB only if it's a new save
            const settings = Store.getSettings();
            if (settings.notionToken && settings.notionDbIdSaved) {
                try {
                    showToast("Syncing to Notion Saved Intel...");
                    await API.saveToNotion(article, settings.notionToken, settings.notionDbIdSaved);
                    showToast("Saved to Notion Successfully!");
                } catch (e) {
                    console.error("Notion Error", e);
                    showToast(`Notion Error: ${e.message}`);
                }
            }
        } else if (!domCard) {
            // If they clicked the save button (no domCard removed) but it was ALREADY saved,
            // the card.js toggle handles the visual "unsave", but we just notify them here.
            showToast("Article already saved.");
        }

        // Only push to back of queue and render next if it was actually Swiped (domCard exists)
        if (domCard) {
            currentFeedList.push(article);
            currentCardIndex++;
            Store.saveCurrentFeed(currentFeedList.slice(currentCardIndex));
            renderNextCard();
        }
    }

    // Expose a way for card.js to trigger a Notion deletion when untoggling
    window.unSaveArticleFromNotion = async function (article) {
        const settings = Store.getSettings();
        if (settings.notionToken && settings.notionDbIdSaved) {
            try {
                showToast("Removing from Notion Saved Intel...");
                await API.archiveFromNotion(article, settings.notionToken, settings.notionDbIdSaved);
                showToast("Removed from Notion Successfully!");
            } catch (e) {
                console.error("Notion Error", e);
                showToast(`Notion Delete Error: ${e.message}`);
            }
        }
    };

    // Expose a way for card.js to prompt confirmation instead of deleting immediately
    window.promptDeleteNotionArticle = function (article) {
        articlePendingDelete = article;
        elements.deleteConfirmOverlay.classList.add('open');
    }

    // Detail Panel Logic
    function handleReadMore(article) {
        const formattedDate = new Date(article.date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        elements.detailContent.innerHTML = `
            <h2>${article.title}</h2>
            <div class="detail-meta">${article.source} &bull; ${formattedDate}</div>
            <hr style="border-color:var(--border-color);margin:24px 0;">
            
            <h3>Detail</h3>
            <p style="font-size: 1.1rem; line-height: 1.6;">${article.detailAbout || 'No details provided.'}</p>
            
            <h3 style="margin-top:24px;">Impact</h3>
            <p style="font-size: 1.1rem; line-height: 1.6;">${article.detailImpact || 'No impact analysis provided.'}</p>
            
            ${article.detailOpportunity ? `<h3 style="margin-top:24px; color:var(--accent-primary)">Opportunity Detected</h3><p>${article.detailOpportunity}</p>` : ''}
            
            <div style="margin-top:40px;">
                <a href="${article.url}" target="_blank" class="primary-btn" style="text-decoration:none; display:inline-flex;">
                    <i class='bx bx-link-external'></i> Source Article Link
                </a>
            </div>
        `;
        openDetailPanel();
    }

    async function handleSentiment(article) {
        if (article.redditSentiment) {
            // Already fetched from Notion dummy data
            elements.detailContent.innerHTML = `
                <h2>${article.title}</h2>
                <div class="detail-meta"><i class='bx bxl-reddit'></i> Reddit Communities Sentiment Pulse</div>
                <hr style="border-color:var(--border-color);margin:24px 0;">
                
                <p style="font-size: 1.1rem; line-height: 1.6; color: var(--text-primary);">
                    ${article.redditSentiment}
                </p>
            `;
            openDetailPanel();
            return;
        }

        const settings = Store.getSettings();
        elements.detailContent.innerHTML = `
            <h2>${article.title}</h2>
            <div class="detail-meta">Loading Reddit Sentiment... <i class='bx bx-loader-alt bx-spin'></i></div>
        `;
        openDetailPanel();

        if (!settings.geminiKey) {
            elements.detailContent.innerHTML += `<p style="color:red; margin-top:24px;">Gemini API key missing. Cannot analyze sentiment.</p>`;
            return;
        }

        const sentiment = await API.fetchSentimentForTopic(article.topic, settings.geminiKey, settings.geminiModel);

        elements.detailContent.innerHTML = `
            <h2>${article.title}</h2>
            <div class="detail-meta"><i class='bx bxl-reddit'></i> Reddit Communities Sentiment Pulse</div>
            <hr style="border-color:var(--border-color);margin:24px 0;">
            
            <p style="font-size: 1.1rem; line-height: 1.6; color: var(--text-primary);">
                ${sentiment}
            </p>
        `;
    }

    function toggleMobileMenu() {
        if (elements.sidebarMenu) elements.sidebarMenu.classList.toggle('active');
        if (elements.menuBackdrop) elements.menuBackdrop.classList.toggle('visible');
    }

    function closeMobileMenu() {
        if (elements.sidebarMenu) elements.sidebarMenu.classList.remove('active');
        if (elements.menuBackdrop) elements.menuBackdrop.classList.remove('visible');
    }

    function openDetailPanel() {
        elements.detailPanel.classList.add('open');
        elements.panelBackdrop.classList.add('visible');
    }

    function closeDetailPanel() {
        elements.detailPanel.classList.remove('open');
        elements.panelBackdrop.classList.remove('visible');

        // Reset translation after animation finishes so it's ready for the next open
        setTimeout(() => {
            elements.detailPanel.style.transform = 'translateX(0px)';
        }, 400);
    }

    // Saved Views Component
    function renderSavedView() {
        elements.savedGrid.innerHTML = '';
        elements.savedGrid.className = 'card-stack-container'; // Force correct class in case of cached HTML
        elements.savedGrid.style.display = 'flex'; // Ensure flex layout
        const savedCards = Store.getSavedArticles();
        elements.savedCount.textContent = `${savedCards.length} items`;

        if (savedCards.length === 0) {
            elements.savedGrid.innerHTML = `
                <div class="empty-state">
                    <div class="glass-icon"><i class='bx bx-bookmark' style="font-size:3rem;"></i></div>
                    <h2>No Saved Intel</h2>
                    <p>Articles you save will appear here.</p>
                </div>
            `;
            return;
        }

        // Loop array
        if (currentSavedIndex >= savedCards.length) {
            currentSavedIndex = 0;
        }

        // Render BACK card
        if (savedCards.length > 1) {
            let backendIndex = currentSavedIndex + 1;
            if (backendIndex >= savedCards.length) backendIndex = 0;
            const backArticle = savedCards[backendIndex];

            const backCardDOM = CardComponent.create(
                backArticle,
                null, null, null, null, true
            );
            backCardDOM.style.position = 'absolute'; // Force overlapping
            backCardDOM.style.transform = 'scale(0.95)';
            backCardDOM.style.zIndex = '0';
            backCardDOM.style.pointerEvents = 'none';
            backCardDOM.style.filter = 'brightness(0.9)';
            elements.savedGrid.appendChild(backCardDOM);
        }

        // Render FRONT card
        const frontArticle = savedCards[currentSavedIndex];
        const frontCardDOM = CardComponent.create(
            frontArticle,
            handleSavedSwipe, // Swipe Left (just next card)
            handleSavedSwipe, // Swipe Right (just next card)
            handleReadMore,
            handleSentiment,
            true // isSavedView
        );
        frontCardDOM.style.position = 'absolute'; // Force overlapping
        frontCardDOM.style.zIndex = '10';
        elements.savedGrid.appendChild(frontCardDOM);
    }

    async function renderReportsView() {
        if (!elements.reportsGrid) return;

        elements.reportsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; margin-top: 40px;">
                <div class="glass-icon"><i='bx bx-loader-alt bx-spin' style="font-size:3rem;"></i></div>
                <h2>Fetching Reports...</h2>
            </div>
        `;

        const settings = Store.getSettings();
        //if (!settings.notionToken || !settings.notionDbIdReports) {
        if (!settings.notionDbIdReports) {
            elements.reportsGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; margin-top: 40px;">
                    <div class="glass-icon"><i class='bx bx-cog' style="font-size:3rem;"></i></div>
                    <h2>Setup Required</h2>
                    <p>Configure your Notion API Token and Weekly Reports DB ID in Settings.</p>
                </div>
            `;
            return;
        }

        try {
            const reports = await API.fetchReportsFromNotion(settings.notionToken, settings.notionDbIdReports);

            if (elements.reportsCount) {
                elements.reportsCount.textContent = `${reports.length} reports`;
            }

            if (reports.length === 0) {
                elements.reportsGrid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1; margin-top: 40px;">
                        <i class='bx bx-calendar'></i>
                        <h2>No Reports Yet</h2>
                        <p>Generate your first report using the button above.</p>
                    </div>
                `;
                return;
            }

            // Calculate next upcoming Sunday
            const today = new Date();
            let daysUntilSunday = 7 - today.getDay();
            if (today.getDay() === 0) {
                daysUntilSunday = 7; // If today is Sunday, next report is next Sunday (+7 days)
            }

            const nextSunday = new Date(today);
            nextSunday.setDate(today.getDate() + daysUntilSunday);

            const nextSundayFormatted = nextSunday.toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric'
            });

            elements.reportsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; margin-bottom: 8px;">
                    <p style="color: var(--accent-secondary); font-size: 1.05rem; font-weight: 500;">
                        <i class='bx bx-time'></i> Next report available on ${nextSundayFormatted}
                    </p>
                </div>
            `;

            reports.forEach(report => {
                const reportCard = document.createElement('div');
                reportCard.className = 'mini-card';
                reportCard.style.gap = '12px';

                const formattedDate = new Date(report.date).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric'
                });

                reportCard.innerHTML = `
                    <div class="card-topic" style="margin-bottom:0;">Insight Report &bull; ${formattedDate}</div>
                    <h2 style="font-size: 1.4rem; line-height: 1.2;">${report.title}</h2>
                    <p style="color: var(--text-secondary); font-size: 1.05rem; margin-bottom: 8px;"><b>Summary:</b> ${report.summary || 'No summary available.'}</p>
                    <hr style="border-color: var(--border-color); margin: 8px 0;">
                    <p style="font-size: 0.95rem; line-height: 1.5;">${report.description ? report.description.substring(0, 150) + '...' : 'No description available.'}</p>
                    <button class="action-btn read-report-btn" style="margin-top:auto; width: 100%;">
                        <i class='bx bx-news'></i> View Full Report
                    </button>
                `;

                reportCard.querySelector('.read-report-btn').addEventListener('click', () => {
                    elements.detailContent.innerHTML = `
                        <h2>${report.title}</h2>
                        <div class="detail-meta">Insight Report &bull; ${formattedDate}</div>
                        <hr style="border-color:var(--border-color);margin:24px 0;">
                        
                        <h3>Summary</h3>
                        <p style="font-size:1.1rem; line-height:1.6; color:var(--accent-primary);">${report.summary || 'N/A'}</p>
                        
                        <h3 style="margin-top:24px;">Synthesis</h3>
                        <p style="font-size:1.05rem; line-height:1.6;">${report.description || 'N/A'}</p>
                        
                        ${report.redditSentiment ? `<h3 style="margin-top:24px; color:var(--accent-secondary)">Internet Sentiment</h3><p style="font-size:1.05rem; line-height:1.6;">${report.redditSentiment}</p>` : ''}
                    `;
                    openDetailPanel();
                });

                elements.reportsGrid.appendChild(reportCard);
            });

        } catch (e) {
            console.error("Failed to fetch reports", e);
            elements.reportsGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; margin-top: 40px;">
                    <i class='bx bx-error-alt' style="font-size:3rem; color:var(--accent-secondary);"></i>
                    <h2>Failed to Load Reports</h2>
                    <p>${e.message}</p>
                </div>
            `;
        }
    }

    function handleSavedSwipe(article, domCard) {
        if (domCard) domCard.remove();
        currentSavedIndex++;
        renderSavedView();
    }

    init();
});
