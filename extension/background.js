chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.videoIds && message.videoIds.length > 0) {
        chrome.storage.local.get(['ytApiKey'], (result) => {
            const API_KEY = result.ytApiKey;

            if (!API_KEY) {
                console.error('[YT-Metadata-Pro] No API Key set. Please click the extension icon to configure.');
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
                    console.error('[YT-Metadata-Pro Background] YouTube API Error: ', error);
                    sendResponse({ licensedIds: [] });
                });
        });

        return true;
    }
});
