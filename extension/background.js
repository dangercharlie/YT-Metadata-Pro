chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.videoIds && message.videoIds.length > 0) {
        chrome.storage.local.get(['ytApiKey'], (result) => {
            const API_KEY = result.ytApiKey;

            if (!API_KEY) {
                console.error('[YT-Metadata-Pro] No API Key set. Please click the extension icon to configure.');
                sendResponse({ licensedIds: [] });
                return;
            }

            const url = 'https://youtube.googleapis.com/youtube/v3/videos?part=contentDetails&id=' + message.videoIds.join(',') + '&key=' + encodeURIComponent(API_KEY);

            fetch(url)
                .then(async res => {
                    if (!res.ok) {
                        let apiMessage = res.statusText || 'API request rejected';
                        try {
                            const data = await res.json();
                            apiMessage = data?.error?.message || apiMessage;
                        } catch (error) {}

                        throw new Error('YouTube API rejected request (' + res.status + '): ' + apiMessage);
                    }

                    return res.json();
                })
                .then(data => {
                    if (!data || !data.items) {
                        sendResponse({ licensedIds: [], checkedCount: message.videoIds.length, returnedCount: 0 });
                        return;
                    }

                    const licensedIds = [];
                    data.items.forEach(item => {
                        if (item?.contentDetails?.licensedContent === true) {
                            licensedIds.push(item.id);
                        }
                    });

                    sendResponse({
                        licensedIds,
                        checkedCount: message.videoIds.length,
                        returnedCount: data.items.length
                    });
                })
                .catch(error => {
                    const message = String(error?.message || error || 'Unknown API error').replace(API_KEY, '[redacted]');
                    console.error('[YT-Metadata-Pro Background] YouTube API Error: ', message);
                    sendResponse({ licensedIds: [], error: message });
                });
        });

        return true;
    }
});
