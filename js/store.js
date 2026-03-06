const Store = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(`signal_${key}`);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.warn('Error reading from localStorage', e);
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(`signal_${key}`, JSON.stringify(value));
        } catch (e) {
            console.error('Error writing to localStorage', e);
        }
    },

    // Config Settings
    getSettings() {
        return this.get('settings', {
            geminiKey: '',
            geminiModel: 'gemma-3-12b-it',
            notionToken: '',
            notionDbIdAll: '',
            notionDbIdSaved: ''
        });
    },

    saveSettings(settings) {
        this.set('settings', settings);
    },

    // Session State
    getPurpose() {
        return this.get('purpose', '');
    },

    savePurpose(purpose) {
        this.set('purpose', purpose);
    },

    // Saved Articles
    getSavedArticles() {
        const saved = this.get('saved_articles', []);
        // Sort by newest first
        return saved.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    },

    saveArticle(article) {
        const saved = this.getSavedArticles();
        // Use ID or Title as unique identifier since dummy Notion URLs might all be '#'
        const uniqueId = article.id || article.title;

        if (!saved.some(a => (a.id || a.title) === uniqueId)) {
            saved.push({
                ...article,
                savedAt: new Date().toISOString()
            });
            this.set('saved_articles', saved);
            return true;
        }
        return false;
    },

    removeArticle(articleIdentifier) { // Can be ID or Title or URL for backwards compat
        const saved = this.getSavedArticles();
        const filtered = saved.filter(a =>
            a.id !== articleIdentifier &&
            a.title !== articleIdentifier &&
            a.url !== articleIdentifier
        );
        this.set('saved_articles', filtered);
    },

    isSaved(articleIdentifier) { // Can be ID or Title or URL
        return this.getSavedArticles().some(a =>
            a.id === articleIdentifier ||
            a.title === articleIdentifier ||
            a.url === articleIdentifier
        );
    },

    // Cache current feed to resume session
    getCachedFeed() {
        return this.get('current_feed', []);
    },

    saveCurrentFeed(feed) {
        this.set('current_feed', feed);
    }
};
