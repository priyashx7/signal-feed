class CardComponent {
    static create(article, onSwipeLeft, onSwipeRight, onClickReadMore, onClickSentiment, isSavedView = false) {
        const card = document.createElement('div');
        card.className = 'swipe-card';
        card.dataset.id = article.id;

        const isSaved = typeof Store !== 'undefined' ? Store.isSaved(article.id || article.title) : false;

        const formattedDate = new Date(article.date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        card.innerHTML = `
            <div class="card-topic">
                ${article.source} &bull; ${formattedDate}
            </div>got these error
            <h2 class="card-title">${article.title}</h2>
            <div class="card-summary">${article.summary}</div>
            <div class="card-actions">
                <button class="action-btn read-more-btn"><i class='bx bx-news'></i> Read More</button>
                <button class="action-btn sentiment-btn"><i class='bx bx-message-rounded-dots'></i> Sentiment</button>
            </div>
            
            <button class="save-toggle-btn action-btn" style="position:absolute; top:16px; right:16px; width:48px; height:48px; border-radius:50%; padding:0; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-color); background:var(--bg-surface); z-index:100;">
                <i class="bx ${isSavedView ? 'bx-trash' : (isSaved ? 'bxs-bookmark' : 'bx-bookmark')}" style="font-size:1.6rem; color:${isSavedView ? 'var(--text-secondary)' : (isSaved ? 'var(--accent-primary)' : 'var(--text-secondary)')}; transition:all 0.2s;"></i>
            </button>
        `;

        card.querySelector('.read-more-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onClickReadMore(article);
        });

        card.querySelector('.sentiment-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onClickSentiment(article);
        });

        // Toggle Save without Swiping
        const saveToggleBtn = card.querySelector('.save-toggle-btn');
        const saveIcon = saveToggleBtn.querySelector('i');

        saveToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            if (isSavedView) {
                // If we are in the Saved section, this button acts as a Delete trigger
                if (window.promptDeleteNotionArticle) {
                    window.promptDeleteNotionArticle(article);
                }
                return;
            }

            const currentlySaved = saveIcon.classList.contains('bxs-bookmark');

            if (!currentlySaved) {
                // Not saved -> Trigger save action
                saveIcon.className = 'bx bxs-bookmark';
                saveIcon.style.color = 'var(--accent-primary)';

                // We call onSwipeRight to actually perform the save to Notion and LocalStorage
                // But we don't pass the domCard so it doesn't get removed from the screen
                if (onSwipeRight) {
                    onSwipeRight(article, null);
                }
            } else {
                // Is saved -> Untoggle (Optional: might need logic in app.js if we want to support un-saving from the card)
                saveIcon.className = 'bx bx-bookmark';
                saveIcon.style.color = 'var(--text-secondary)';

                // Remove from local storage
                if (typeof Store !== 'undefined') {
                    Store.removeArticle(article.id || article.title);
                }

                // Remove from Notion
                if (window.unSaveArticleFromNotion) {
                    window.unSaveArticleFromNotion(article);
                }
            }
        });

        // Swipe Gesture Logic
        let startX = 0;
        let currentX = 0;
        let isDragging = false;

        const removeGlobalListeners = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            currentX = e.pageX - startX;
            updateTransform();
        };

        const onTouchMove = (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX - startX;
            updateTransform();
        };

        const updateTransform = () => {
            // Calculate a parabolic arc: as you pull left/right, it gravity-drops down
            const pullDown = Math.pow(Math.abs(currentX) / 15, 1.5);

            // Calculate rotation based on X distance
            const rotate = currentX * 0.15; // Increased rotation for more tilt

            // Set the transform origin to the bottom center so it swings like a pendulum
            card.style.transformOrigin = '50% 150%';

            // Apply the actual 3D translation
            card.style.transform = `translate3d(${currentX}px, ${pullDown}px, 0) rotate(${rotate}deg)`;

            // Fade out as it gets to the edges
            card.style.opacity = Math.max(1 - Math.abs(currentX) / 600, 0.5);
        };

        const onMouseUp = () => handleSwipeEnd();
        const onTouchEnd = () => handleSwipeEnd();

        const handleSwipeEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            removeGlobalListeners();

            if (currentX > 120) {
                // Swiped Right -> Save
                // Lock the transition to linear so it doesn't bounce/delay
                card.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
                card.classList.add('swipe-out-right');
                setTimeout(() => onSwipeRight(article, card), 350);
            } else if (currentX < -120) {
                // Swiped Left -> Skip
                card.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
                card.classList.add('swipe-out-left');
                setTimeout(() => onSwipeLeft(article, card), 350);
            } else {
                // Did not drag far enough, smoothly "snap" back to center
                card.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
                card.style.transform = 'translate(0px, 0px) rotate(0deg)';
                card.style.opacity = 1;
            }
            currentX = 0;
        };

        const handleStart = (e) => {
            // Prevent drag if click is on buttons
            if (e.target.closest('.action-btn')) return;

            isDragging = true;
            card.classList.remove('fly-in'); // Safari CSS lock fix!

            startX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
            card.style.transition = 'none'; // remove springy feeling during direct drag

            if (e.type.includes('mouse')) {
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            } else {
                document.addEventListener('touchmove', onTouchMove, { passive: true });
                document.addEventListener('touchend', onTouchEnd);
            }
        };

        card.addEventListener('mousedown', handleStart);
        card.addEventListener('touchstart', handleStart, { passive: true });

        // Ensure CSS animations don't stick and block JS transforms indefinitely
        card.addEventListener('animationend', (e) => {
            if (e.animationName === 'flyIn') {
                card.classList.remove('fly-in');
            }
        });

        return card;
    }
}
