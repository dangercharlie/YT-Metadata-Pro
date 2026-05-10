document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');

    chrome.storage.local.get(['ytApiKey'], (result) => {
        if (result.ytApiKey) {
            input.value = result.ytApiKey;
        }
    });

    saveBtn.addEventListener('click', () => {
        const key = input.value.trim();
        chrome.storage.local.set({ ytApiKey: key }, () => {
            status.textContent = 'API KEY SAVED & ACTIVE!';
            setTimeout(() => status.textContent = '', 2000);
        });
    });
});
