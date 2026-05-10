// Native Content Script Environment
(function() {
    'use strict';

    const scannedVideoIds = new Set();
    const licensedMusicIds = new Set();
    const batchQueue = [];

    console.log('%c[YT-Metadata-Pro] Official YouTube Data API v3 (Worker Relay) Loaded', 'background: #141414; color: #4ade80; padding: 5px; font-weight:bold;');

    function createBadge(node) {
        if (node.hasAttribute('data-music-badge-applied')) return;
        node.setAttribute('data-music-badge-applied', 'true');

        const badge = document.createElement('div');
        badge.className = 'yt-music-badge-native';
        badge.style.cssText = 'position:absolute;top:4px;right:4px;background:#4ade80;color:black;padding:2px 6px;border-radius:2px;font-size:10px;font-weight:bold;z-index:99;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:1px solid rgba(0,0,0,0.1);display:flex;align-items:center;gap:3px;';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('fill', 'currentColor');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z');

        svg.appendChild(path);
        badge.appendChild(svg);
        badge.appendChild(document.createTextNode('MUSIC'));

        node.style.position = 'relative';
        node.appendChild(badge);
    }

    async function processBatch() {
        if (batchQueue.length === 0) return;

        const idsToFetch = batchQueue.splice(0, 50);

        chrome.runtime.sendMessage({ videoIds: idsToFetch }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[YT-Metadata-Pro] Background workers communication error:', chrome.runtime.lastError);
                return;
            }

            if (!response || !response.licensedIds) return;

            response.licensedIds.forEach(id => {
                licensedMusicIds.add(id);

                const anchors = document.querySelectorAll('a[href*="/watch?v=' + id + '"], a[href*="&v=' + id + '"]');
                anchors.forEach(anchor => {
                    const thumb = anchor.closest('ytd-thumbnail');
                    if (thumb) {
                        createBadge(thumb);
                    }
                });
            });
        });
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const thumb = entry.target;
                observer.unobserve(thumb);

                const anchor = thumb.querySelector('a#thumbnail') || thumb.querySelector('a[href*="/watch?v="]');
                if (!anchor || !anchor.href) return;

                try {
                    const url = new URL(anchor.href, window.location.origin);
                    const videoId = url.searchParams.get('v');
                    if (!videoId) return;

                    if (licensedMusicIds.has(videoId)) {
                        createBadge(thumb);
                    } else if (!scannedVideoIds.has(videoId)) {
                        scannedVideoIds.add(videoId);
                        batchQueue.push(videoId);
                    }
                } catch(e) {}
            }
        });
    }, { rootMargin: '200px' });

    function init() {
        setInterval(processBatch, 500);

        setInterval(() => {
            const thumbs = document.querySelectorAll('ytd-thumbnail:not([data-io-attached])');
            thumbs.forEach(thumb => {
                thumb.setAttribute('data-io-attached', 'true');
                observer.observe(thumb);
            });
        }, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
