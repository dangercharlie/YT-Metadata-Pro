/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { CheckCircle2, Github, Download, Archive } from "lucide-react";
import JSZip from "jszip";

const EXTENSION_MANIFEST = `{
  "manifest_version": 3,: 3,
  "name": "YT Metadata Pro",
  "version": "1.0",
  "description": "Highlights licensed music on YouTube",
  "background": {
    "service_worker": "background.js"
  },
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://youtube.googleapis.com/*"
  ],
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["*://*.youtube.com/*"],
      "js": ["content.js"],
      "run_at": "document_start"
    }
  ]
}`;

const EXTENSION_CONTENT = `// Native Content Script Environment
(function() {
    'use strict';

    const scannedVideoIds = new Set();
    const licensedMusicIds = new Set();
    const batchQueue = [];

    console.log('%c[YT-Music-Pro] Official YouTube Data API v3 (Worker Relay) Loaded', 'background: #141414; color: #4ade80; padding: 5px; font-weight:bold;');

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

        // Take up to 50 items from the queue
        const idsToFetch = batchQueue.splice(0, 50);

        chrome.runtime.sendMessage({ videoIds: idsToFetch }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[YT-Music-Pro] Background workers communication error:', chrome.runtime.lastError);
                return;
            }

            if (!response || !response.licensedIds) return;

            response.licensedIds.forEach(id => {
                licensedMusicIds.add(id);
                
                // Mark all loaded thumbs in DOM matching this ID globally
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
                // Once triggered and captured, immediately stop observing it
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
        // Run batch logic explicitly every 500ms
        setInterval(processBatch, 500);

        // Periodically hand newly rendered thumbnails over to the IntersectionObserver 
        // to fully abstract away our reliance on strict MutationObserver node tracking
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

})();`;

const BACKGROUND_CONTENT = `chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.videoIds && message.videoIds.length > 0) {
        
        chrome.storage.local.get(['ytApiKey'], (result) => {
            const API_KEY = result.ytApiKey;
            
            if (!API_KEY) {
                console.error('[YT-Music-Pro] No API Key set. Please click the extension icon to configure.');
                sendResponse({ licensedIds: [] });
                return;
            }

            const url = 'https://youtube.googleapis.com/youtube/v3/videos?part=contentDetails&id=' + message.videoIds.join(',') + '&key=' + API_KEY;
            
            fetch(url)
                .then(res => {
                    if (!res.ok) throw new Error('API Request rejected');
                    return res.json();
                })
                .then(data => {
                    if (!data || !data.items) {
                        sendResponse({ licensedIds: [] });
                        return;
                    }
                    
                    const licensedIds = [];
                    data.items.forEach(item => {
                        if (item?.contentDetails?.licensedContent === true) {
                            licensedIds.push(item.id);
                        }
                    });
                    
                    sendResponse({ licensedIds });
                })
                .catch(error => {
                    console.error('[YT-Music-Pro Background] YouTube API Error: ', error);
                    sendResponse({ licensedIds: [] });
                });
        });
        
        return true;
    }
});`;

const POPUP_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: monospace; padding: 15px; width: 300px; background: #141414; color: #E4E3E0; }
    h3 { margin-top: 0; color: #4ade80; text-transform: uppercase; font-weight: bold; }
    p { font-size: 11px; opacity: 0.8; margin-bottom: 12px; }
    input { width: 100%; box-sizing: border-box; padding: 8px; margin-bottom: 10px; background: #333; border: 1px solid #555; color: white; border-radius: 4px;}
    button { width: 100%; padding: 8px; background: #4ade80; color: #141414; border: none; font-weight: bold; cursor: pointer; text-transform: uppercase; border-radius: 4px;}
    button:hover { background: #E4E3E0; }
    #status { margin-top: 10px; font-size: 12px; color: #4ade80; text-align: center; font-weight: bold; }
    a { color: #4ade80; }
  </style>
</head>
<body>
  <h3>YT Metadata Pro</h3>
  <p>To use this extension, generate a <a href="https://console.cloud.google.com/" target="_blank">YouTube Data API v3 Key</a> and paste it below.</p>
  <input type="password" id="apiKey" placeholder="AIzaSy...">
  <button id="saveBtn">Save Key</button>
  <div id="status"></div>
  <script src="popup.js"></script>
</body>
</html>`;

const POPUP_JS = `document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');

    // Load existing key when popup opens
    chrome.storage.local.get(['ytApiKey'], (result) => {
        if (result.ytApiKey) {
            input.value = result.ytApiKey;
        }
    });

    // Save key when user clicks the button
    saveBtn.addEventListener('click', () => {
        const key = input.value.trim();
        chrome.storage.local.set({ ytApiKey: key }, () => {
            status.textContent = 'API KEY SAVED & ACTIVE!';
            setTimeout(() => status.textContent = '', 2000);
        });
    });
});`;

export default function App() {
  const [downloading, setDownloading] = useState(false);

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      zip.file("manifest.json", EXTENSION_MANIFEST);
      zip.file("background.js", BACKGROUND_CONTENT);
      zip.file("content.js", EXTENSION_CONTENT);
      zip.file("popup.html", POPUP_HTML);
      zip.file("popup.js", POPUP_JS);
      
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "YT_Metadata_Pro_Extension.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setTimeout(() => setDownloading(false), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Navigation Rail */}
      <nav className="fixed top-0 left-0 w-full h-16 border-b border-[#141414] bg-[#E4E3E0] z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#141414] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-[#E4E3E0]" />
          </div>
          <span className="font-mono text-sm tracking-tight font-bold uppercase">YT.Metadata.Pro</span>
        </div>
        <div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 border border-transparent hover:border-[#141414] transition-colors"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-20 max-w-5xl mx-auto px-6">
        <header className="mb-20">
          <h1 className="text-7xl font-sans font-bold tracking-tighter leading-[0.9] mb-8 uppercase">
            Detect Licensed <br /> Music Instantly.
          </h1>
          <p className="text-xl max-w-2xl font-sans leading-relaxed opacity-80">
            YouTube identifies music in uploads through Content ID, but this information is hidden deep inside video descriptions. 
            This script brings it to the surface, adding a visual indicator to thumbnails before you even click.
          </p>
        </header>

        <section className="space-y-12">
          <div className="bg-[#141414] text-[#E4E3E0] p-10 mb-8 flex flex-col items-center justify-center text-center border border-[#141414]">
            <Archive className="w-12 h-12 mb-6 opacity-80" />
            <h3 className="text-3xl font-bold mb-4 uppercase tracking-tighter">Chrome Extension Package</h3>
            <p className="opacity-70 text-sm leading-relaxed max-w-lg mb-8">
              We've bundled the extension into a clean, ready-to-use package. Simply download the ZIP, extract it, and load it into your browser. 
              Users can securely add their own API key via the extension popup!
            </p>
            
            <button
              onClick={handleDownloadZip}
              disabled={downloading}
              className="flex items-center gap-3 px-8 py-4 bg-[#E4E3E0] text-[#141414] font-mono text-sm font-bold uppercase tracking-widest hover:bg-white hover:scale-105 transition-all active:scale-95 shadow-xl disabled:opacity-50 disabled:hover:scale-100"
            >
              {downloading ? <CheckCircle2 className="w-5 h-5" /> : <Download className="w-5 h-5" />}
              {downloading ? "Downloaded!" : "Download ZIP Package"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
            <div className="border border-[#141414] border-opacity-20 p-6">
              <h4 className="font-mono font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-[#141414] rounded-full inline-block"></span> 
                Installation Setup
              </h4>
              <ol className="list-decimal list-inside opacity-70 space-y-2 font-sans leading-relaxed">
                <li>Extract the downloaded <strong className="text-[#141414]">.zip</strong> file to a folder.</li>
                <li>Open Chrome and navigate to <strong className="bg-[#141414] bg-opacity-10 px-1 py-0.5 rounded text-[#141414]">chrome://extensions/</strong></li>
                <li>Toggle <strong className="text-[#141414]">Developer mode</strong> (top right).</li>
                <li>Click <strong className="text-[#141414]">Load unpacked</strong> and select the extracted folder.</li>
              </ol>
            </div>
            
            <div className="border border-[#141414] border-opacity-20 p-6">
              <h4 className="font-mono font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-[#4ade80] rounded-full inline-block"></span> 
                API Configuration
              </h4>
              <ol className="list-decimal list-inside opacity-70 space-y-2 font-sans leading-relaxed">
                <li>Click the new <strong>YT Metadata Pro</strong> puzzle icon in Chrome.</li>
                <li>A popup will ask for your YouTube Data API v3 Key.</li>
                <li>Paste your key and hit <strong>Save Key</strong>.</li>
                <li>Refresh any YouTube tab to activate!</li>
              </ol>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#141414] py-10 px-6 mt-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="font-mono text-[10px] opacity-40 uppercase">
            © 2024 YT.METADATA.PRO // All rights reserved
          </div>
          <div className="flex gap-10">
            <a href="#" className="font-mono text-[10px] opacity-40 hover:opacity-100 uppercase transition-opacity">Privacy</a>
            <a href="#" className="font-mono text-[10px] opacity-40 hover:opacity-100 uppercase transition-opacity">Terms</a>
            <a href="#" className="font-mono text-[10px] opacity-40 hover:opacity-100 uppercase transition-opacity">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

