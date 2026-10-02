document.getElementById('btnToggleWidget').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'OPEN_WIDGET' }, (res) => {
            if (chrome.runtime.lastError || !res) {
                // Fallback direct script execution if content script message failed
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const el = document.getElementById('bca-checkout-widget');
                        const launcher = document.getElementById('bca-launcher-btn');
                        if (el) {
                            el.style.display = 'flex';
                            el.classList.remove('minimized');
                            if (launcher) launcher.classList.remove('visible');
                        } else {
                            location.reload();
                        }
                    }
                });
            }
        });
        window.close();
    }
});
