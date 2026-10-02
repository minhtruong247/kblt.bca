// BCA Auto Check-out Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('BCA Auto Check-out Extension installed successfully.');
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PING') {
        sendResponse({ status: 'PONG' });
    }
    return true;
});
