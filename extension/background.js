// ── SpyReels Extension - Background Service Worker ──

// Default dashboard URL - user configures this in popup
const DEFAULT_DASHBOARD_URL = "https://spyreels.ai";

// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_PANEL") {
    chrome.sidePanel.open({ tabId: sender.tab?.id });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "GET_DASHBOARD_URL") {
    chrome.storage.sync.get(["dashboardUrl"], (result) => {
      sendResponse({ url: result.dashboardUrl || DEFAULT_DASHBOARD_URL });
    });
    return true;
  }

  if (message.type === "SET_DASHBOARD_URL") {
    chrome.storage.sync.set({ dashboardUrl: message.url }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_AUTH_TOKEN") {
    chrome.storage.sync.get(["authToken", "dashboardUrl"], (result) => {
      sendResponse({
        token: result.authToken || null,
        dashboardUrl: result.dashboardUrl || DEFAULT_DASHBOARD_URL,
      });
    });
    return true;
  }

  if (message.type === "SET_AUTH_TOKEN") {
    chrome.storage.sync.set({ authToken: message.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_FREE_COUNT") {
    chrome.storage.sync.get(["freeTranscribeCount"], (result) => {
      sendResponse({ count: result.freeTranscribeCount || 0 });
    });
    return true;
  }

  if (message.type === "INCREMENT_FREE_COUNT") {
    chrome.storage.sync.get(["freeTranscribeCount"], (result) => {
      const newCount = (result.freeTranscribeCount || 0) + 1;
      chrome.storage.sync.set({ freeTranscribeCount: newCount }, () => {
        sendResponse({ count: newCount });
      });
    });
    return true;
  }

  // Proxy API calls to dashboard backend
  if (message.type === "API_CALL") {
    chrome.storage.sync.get(["dashboardUrl", "authToken"], async (result) => {
      const baseUrl = result.dashboardUrl || DEFAULT_DASHBOARD_URL;
      const token = result.authToken;

      try {
        const headers = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        // Forward cookies for session auth
        const fetchOptions = {
          method: message.method || "POST",
          headers,
          credentials: "include",
        };
        if (message.body) {
          fetchOptions.body = JSON.stringify(message.body);
        }

        const response = await fetch(`${baseUrl}${message.endpoint}`, fetchOptions);
        const data = await response.json();
        sendResponse({ success: response.ok, data, status: response.status });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }
});

// Context menu for right-click on reels
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.create({
    id: "save-reel",
    title: "Save Reel to Dashboard",
    contexts: ["link"],
    targetUrlPatterns: [
      "https://www.instagram.com/reel/*",
      "https://www.instagram.com/reels/*",
      "https://www.instagram.com/p/*",
    ],
  });
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-reel" && info.linkUrl) {
    // Send to content script to handle save
    chrome.tabs.sendMessage(tab.id, {
      type: "SAVE_REEL_URL",
      url: info.linkUrl,
    });
  }
});
