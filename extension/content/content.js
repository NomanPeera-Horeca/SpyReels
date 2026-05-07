// ── SpyReels Content Script ──
// Injected on Instagram pages to add Save/Transcribe buttons and Sort Feed functionality

(() => {
  "use strict";

  const DASHBOARD_URL_KEY = "dashboardUrl";
  const DEFAULT_DASHBOARD_URL = "https://spyreels.ai";
  let dashboardUrl = DEFAULT_DASHBOARD_URL;
  let currentReelData = null;
  let savedShortcodes = new Set();

  // ── Init ──
  async function init() {
    const result = await chrome.storage.sync.get([DASHBOARD_URL_KEY]);
    dashboardUrl = result[DASHBOARD_URL_KEY] || DEFAULT_DASHBOARD_URL;

    // Add floating panel button
    addPanelButton();

    // Start observing for reels
    observeDOM();

    // Listen for messages from panel/background
    chrome.runtime.onMessage.addListener(handleMessage);

    // Watch for URL changes (SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onNavigate();
      }
    }).observe(document.body, { childList: true, subtree: true });

    onNavigate();
  }

  // ── Navigation Handler ──
  function onNavigate() {
    const url = location.href;

    // On a reel page
    if (url.includes("/reel/") || url.includes("/reels/")) {
      setTimeout(() => extractReelData(), 1500);
    }

    // On a profile page
    if (isProfilePage()) {
      setTimeout(() => injectProfileButtons(), 1000);
    }

    // Re-inject buttons after navigation
    setTimeout(() => injectSaveButtons(), 1000);
  }

  function isProfilePage() {
    const path = location.pathname;
    // Profile pages are /{username}/ but not /reel/, /reels/, /explore/, /p/, etc.
    const nonProfile = ["/reel/", "/reels/", "/explore/", "/p/", "/stories/", "/direct/", "/accounts/"];
    if (nonProfile.some((p) => path.includes(p))) return false;
    return /^\/[^/]+\/?$/.test(path);
  }

  // ── Extract Reel Data from Current Page ──
  function extractReelData() {
    try {
      const url = location.href;
      const shortcodeMatch = url.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/);
      if (!shortcodeMatch) return;

      const shortcode = shortcodeMatch[2];

      // Try to extract data from the page
      const data = {
        shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        caption: "",
        thumbnail: "",
        videoUrl: "",
        owner: "",
        views: 0,
        likes: 0,
        comments: 0,
        duration: 0,
      };

      // Extract caption
      const captionEl = document.querySelector('h1[dir="auto"]') ||
        document.querySelector('span[dir="auto"]._ap3a');
      if (captionEl) data.caption = captionEl.textContent.trim().substring(0, 200);

      // Extract owner username
      const ownerEl = document.querySelector('a.x1i10hfl[role="link"] span') ||
        document.querySelector('header a[role="link"]');
      if (ownerEl) data.owner = ownerEl.textContent.trim().replace("@", "");

      // Extract video element
      const videoEl = document.querySelector("video");
      if (videoEl) {
        data.videoUrl = videoEl.src || videoEl.querySelector("source")?.src || "";
        data.thumbnail = videoEl.poster || "";
        data.duration = Math.round(videoEl.duration || 0);
      }

      // Extract likes from page
      const likeTexts = document.querySelectorAll("span");
      likeTexts.forEach((el) => {
        const text = el.textContent.trim();
        if (text.match(/^[\d,.]+[KMB]?\s*likes?$/i)) {
          data.likes = parseEngagement(text);
        }
        if (text.match(/^[\d,.]+[KMB]?\s*views?$/i)) {
          data.views = parseEngagement(text);
        }
      });

      // Try to get view count from aria-label
      const viewEl = document.querySelector('[aria-label*="view"]');
      if (viewEl) {
        const match = viewEl.getAttribute("aria-label").match(/([\d,]+)/);
        if (match) data.views = parseInt(match[1].replace(/,/g, ""));
      }

      currentReelData = data;

      // Notify panel
      chrome.runtime.sendMessage({ type: "REEL_DATA", reel: data });
    } catch (err) {
      console.log("[SpyReels] Error extracting reel data:", err);
    }
  }

  // ── Parse Engagement Numbers ──
  function parseEngagement(text) {
    const num = text.replace(/[^0-9.KMBkmb]/g, "");
    const match = num.match(/([\d.]+)([KMBkmb])?/);
    if (!match) return 0;
    let val = parseFloat(match[1]);
    const suffix = (match[2] || "").toUpperCase();
    if (suffix === "K") val *= 1000;
    if (suffix === "M") val *= 1000000;
    if (suffix === "B") val *= 1000000000;
    return Math.round(val);
  }

  // ── Inject Save Buttons on Reel Thumbnails ──
  function injectSaveButtons() {
    // Find reel containers in the grid (profile page)
    const reelLinks = document.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"]');

    reelLinks.forEach((link) => {
      const container = link.closest("div[style]") || link.parentElement;
      if (!container || container.querySelector(".rd-save-btn")) return;

      container.style.position = "relative";
      container.classList.add("rd-reel-container");

      const shortcodeMatch = link.href.match(/\/(reel|reels)\/([A-Za-z0-9_-]+)/);
      if (!shortcodeMatch) return;
      const shortcode = shortcodeMatch[2];

      // Save button
      const saveBtn = document.createElement("button");
      saveBtn.className = `rd-save-btn ${savedShortcodes.has(shortcode) ? "rd-saved" : ""}`;
      saveBtn.textContent = savedShortcodes.has(shortcode) ? "✓" : "💾";
      saveBtn.title = "Save to SpyReels";
      saveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSaveFromGrid(shortcode, saveBtn);
      });

      // Transcribe button
      const transcribeBtn = document.createElement("button");
      transcribeBtn.className = "rd-transcribe-btn";
      transcribeBtn.textContent = "📝";
      transcribeBtn.title = "Transcribe in SpyReels";
      transcribeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleTranscribeFromGrid(shortcode);
      });

      container.appendChild(saveBtn);
      container.appendChild(transcribeBtn);
    });
  }

  // ── Handle Save from Grid ──
  async function handleSaveFromGrid(shortcode, btn) {
    btn.classList.add("rd-saving");
    btn.textContent = "⏳";

    try {
      const response = await apiCall("/api/ext/save-reel", "POST", { shortcode });
      if (response.success) {
        btn.classList.remove("rd-saving");
        btn.classList.add("rd-saved");
        btn.textContent = "✓";
        savedShortcodes.add(shortcode);
        showToast("Reel saved to dashboard!", "success");
      } else {
        btn.classList.remove("rd-saving");
        btn.textContent = "💾";
        showToast(response.data?.error || "Failed to save", "error");
      }
    } catch (err) {
      btn.classList.remove("rd-saving");
      btn.textContent = "💾";
      showToast("Error saving reel", "error");
    }
  }

  // ── Handle Transcribe from Grid ──
  function handleTranscribeFromGrid(shortcode) {
    // Open the reel page and trigger transcription via panel
    window.open(`https://www.instagram.com/reel/${shortcode}/`, "_self");
    showToast("Opening reel... Use the side panel to transcribe.", "info");
  }

  // ── Inject Profile Buttons ──
  function injectProfileButtons() {
    // Already injected
    if (document.querySelector(".rd-profile-sort-btn")) return;

    // Find the profile header area
    const header = document.querySelector("header section");
    if (!header) return;

    // We don't inject a sort button here since the side panel handles sorting
    // But we make sure all reel thumbnails get save buttons
    injectSaveButtons();
  }

  // ── Sort Feed (called from panel) ──
  async function sortFeed(sortBy, filterCount, filterType) {
    if (!isProfilePage()) {
      return { success: false, error: "Navigate to a creator's profile page first." };
    }

    const username = location.pathname.replace(/\//g, "");
    if (!username) {
      return { success: false, error: "Could not detect username." };
    }

    try {
      // Use the dashboard API to fetch and sort reels
      const response = await apiCall("/api/ext/sort-feed", "POST", {
        handle: username,
        sortBy,
        limit: filterCount,
        filterType,
      });

      if (response.success && response.data?.reels) {
        const reels = response.data.reels.map((r) => ({
          ...r,
          _sortedBy: sortBy,
        }));

        // Also inject rank badges on the grid
        injectRankBadges(reels);

        return { success: true, reels };
      }

      return { success: false, error: response.data?.error || "Failed to fetch reels" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Inject Rank Badges on Grid ──
  function injectRankBadges(sortedReels) {
    // Remove existing badges
    document.querySelectorAll(".rd-rank-badge, .rd-stats-overlay").forEach((el) => el.remove());

    const reelLinks = document.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"]');
    const shortcodeMap = new Map();

    sortedReels.forEach((reel, idx) => {
      shortcodeMap.set(reel.shortcode, { rank: idx + 1, ...reel });
    });

    reelLinks.forEach((link) => {
      const match = link.href.match(/\/(reel|reels)\/([A-Za-z0-9_-]+)/);
      if (!match) return;

      const shortcode = match[2];
      const reelInfo = shortcodeMap.get(shortcode);
      if (!reelInfo) return;

      const container = link.closest("div[style]") || link.parentElement;
      if (!container) return;
      container.style.position = "relative";
      container.classList.add("rd-reel-container");

      // Rank badge
      const badge = document.createElement("div");
      badge.className = `rd-rank-badge ${reelInfo.rank <= 3 ? "rd-top3" : ""}`;
      badge.textContent = reelInfo.rank;
      container.appendChild(badge);

      // Stats overlay
      const overlay = document.createElement("div");
      overlay.className = "rd-stats-overlay";
      overlay.innerHTML = `
        <span class="rd-stat-item"><span class="rd-stat-icon">👁</span> ${formatNum(reelInfo.views || 0)}</span>
        <span class="rd-stat-item"><span class="rd-stat-icon">❤</span> ${formatNum(reelInfo.likes || 0)}</span>
        <span class="rd-stat-item"><span class="rd-stat-icon">💬</span> ${formatNum(reelInfo.comments || 0)}</span>
        <span class="rd-stat-item"><span class="rd-stat-icon">📈</span> ${reelInfo.engagementRate || "-"}</span>
      `;
      container.appendChild(overlay);
    });
  }

  // ── Floating Panel Button ──
  function addPanelButton() {
    if (document.querySelector(".rd-open-panel-btn")) return;

    const btn = document.createElement("button");
    btn.className = "rd-open-panel-btn";
    btn.textContent = "📊";
    btn.title = "Open SpyReels";
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_PANEL" });
    });
    document.body.appendChild(btn);
  }

  // ── DOM Observer ──
  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      let shouldInject = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldInject = true;
          break;
        }
      }
      if (shouldInject) {
        // Debounce injection
        clearTimeout(observeDOM._timer);
        observeDOM._timer = setTimeout(() => {
          injectSaveButtons();
        }, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ── Message Handler ──
  function handleMessage(message, sender, sendResponse) {
    if (message.type === "SORT_FEED") {
      sortFeed(message.sortBy, message.filterCount, message.filterType).then(sendResponse);
      return true;
    }

    if (message.type === "GET_CURRENT_REEL") {
      if (currentReelData) {
        sendResponse({ reel: currentReelData });
      } else {
        extractReelData();
        setTimeout(() => {
          sendResponse({ reel: currentReelData });
        }, 500);
      }
      return true;
    }

    if (message.type === "SAVE_REEL_URL") {
      const match = message.url.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/);
      if (match) {
        apiCall("/api/ext/save-reel", "POST", { shortcode: match[2] }).then((resp) => {
          if (resp.success) {
            showToast("Reel saved to dashboard!", "success");
          } else {
            showToast("Failed to save reel", "error");
          }
        });
      }
    }
  }

  // ── API Helper ──
  async function apiCall(endpoint, method = "POST", body = null) {
    const url = dashboardUrl + endpoint;
    const options = {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    };
    if (body && method !== "GET") {
      options.body = JSON.stringify(body);
    }

    try {
      const resp = await fetch(url, options);
      const data = await resp.json();
      return { success: resp.ok, data, status: resp.status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Toast ──
  function showToast(message, type = "success") {
    const existing = document.querySelector(".rd-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `rd-toast rd-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ── Format Numbers ──
  function formatNum(n) {
    if (!n) return "0";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  }

  // ── Start ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
