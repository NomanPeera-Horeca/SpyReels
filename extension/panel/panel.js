// ── SpyReels Side Panel ──

const FREE_LIMIT = 3;
let dashboardUrl = "";
let currentReelData = null;
let transcriptData = null;
let recreatedScript = null;

// ── Initialization ──
async function init() {
  const result = await chrome.storage.sync.get(["dashboardUrl", "freeTranscribeCount"]);
  dashboardUrl = result.dashboardUrl || "https://spyreels.ai";
  updateFreeCounter(result.freeTranscribeCount || 0);
  setupTabs();
  setupSortControls();
  setupEventListeners();
  listenForReelData();
}

function updateFreeCounter(count) {
  const el = document.getElementById("transcribeCount");
  const progress = document.getElementById("tierProgress");
  if (el) el.textContent = count;
  if (progress) progress.style.width = `${Math.min((count / FREE_LIMIT) * 100, 100)}%`;
}

// ── Tab Navigation ──
function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });
}

// ── Sort Controls ──
function setupSortControls() {
  document.querySelectorAll(".radio-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".radio-option").forEach((o) => o.classList.remove("active"));
      opt.classList.add("active");
      opt.querySelector("input").checked = true;
    });
  });

  document.getElementById("sortBtn").addEventListener("click", () => {
    const sortBy = document.querySelector('input[name="sortBy"]:checked').value;
    const filterCount = document.getElementById("filterCount").value;
    const filterType = document.getElementById("filterType").value;

    // Send sort request to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        showLoading("Sorting feed...");
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "SORT_FEED",
          sortBy,
          filterCount: parseInt(filterCount),
          filterType,
        }, (response) => {
          hideLoading();
          if (response?.success) {
            renderSortResults(response.reels);
          } else {
            renderSortError(response?.error || "Could not sort feed. Make sure you're on a creator's profile page.");
          }
        });
      }
    });
  });
}

function renderSortResults(reels) {
  const container = document.getElementById("sortResults");
  if (!reels || reels.length === 0) {
    container.innerHTML = '<div class="empty-state-sm"><p>No reels found. Make sure you\'re on a creator\'s profile page.</p></div>';
    return;
  }

  container.innerHTML = reels.map((reel, i) => `
    <div class="result-item" data-url="${reel.url}" data-shortcode="${reel.shortcode}">
      <img class="result-thumb" src="${reel.thumbnail || ''}" alt="" onerror="this.style.display='none'">
      <div class="result-details">
        <div class="result-caption">${reel.caption || 'No caption'}</div>
        <div class="result-stats">
          <span class="stat ${reel._sortedBy === 'views' ? 'stat-highlight' : ''}">👁 ${formatNum(reel.views)}</span>
          <span class="stat ${reel._sortedBy === 'likes' ? 'stat-highlight' : ''}">❤ ${formatNum(reel.likes)}</span>
          <span class="stat ${reel._sortedBy === 'comments' ? 'stat-highlight' : ''}">💬 ${formatNum(reel.comments)}</span>
          <span class="stat ${reel._sortedBy === 'engagement' ? 'stat-highlight' : ''}">📈 ${reel.engagementRate || '—'}</span>
        </div>
      </div>
      <div class="result-actions">
        <button class="action-btn-sm save-btn" data-shortcode="${reel.shortcode}" title="Save to Dashboard">💾</button>
        <button class="action-btn-sm open-btn" data-url="${reel.url}" title="Open Reel">↗</button>
      </div>
    </div>
  `).join("");

  // Add click handlers
  container.querySelectorAll(".save-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const shortcode = btn.dataset.shortcode;
      saveReelByShortcode(shortcode, btn);
    });
  });

  container.querySelectorAll(".open-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.update(tabs[0].id, { url: btn.dataset.url });
      });
    });
  });

  container.querySelectorAll(".result-item").forEach((item) => {
    item.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.update(tabs[0].id, { url: item.dataset.url });
      });
    });
  });
}

function renderSortError(message) {
  document.getElementById("sortResults").innerHTML = `
    <div class="empty-state-sm"><p style="color: #ef4444;">${message}</p></div>
  `;
}

// ── Event Listeners ──
function setupEventListeners() {
  // Settings button
  document.getElementById("settingsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage?.() || chrome.action.openPopup();
  });

  // Refresh button
  document.getElementById("refreshBtn").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "GET_CURRENT_REEL" }, (response) => {
          if (response?.reel) {
            updateCurrentReel(response.reel);
          }
        });
      }
    });
  });

  // Connect from panel
  document.getElementById("connectFromPanel")?.addEventListener("click", () => {
    chrome.action.openPopup();
  });

  // Transcribe button
  document.getElementById("transcribeBtn").addEventListener("click", handleTranscribe);

  // Save reel button
  document.getElementById("saveReelBtn").addEventListener("click", handleSaveReel);

  // Re-create button
  document.getElementById("recreateBtn").addEventListener("click", handleRecreate);

  // Copy buttons
  document.getElementById("copyTranscript").addEventListener("click", () => {
    if (transcriptData) {
      navigator.clipboard.writeText(transcriptData);
      showToast("Transcript copied!");
    }
  });

  document.getElementById("copyRecreated").addEventListener("click", () => {
    if (recreatedScript) {
      navigator.clipboard.writeText(recreatedScript);
      showToast("Script copied!");
    }
  });

  // Calendar button
  document.getElementById("addToCalendarBtn").addEventListener("click", handleAddToCalendar);

  // Upgrade modal
  document.getElementById("upgradeBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${dashboardUrl}/settings` });
    document.getElementById("upgradeModal").classList.add("hidden");
  });
  document.getElementById("closeModal")?.addEventListener("click", () => {
    document.getElementById("upgradeModal").classList.add("hidden");
  });
}

// ── Listen for reel data from content script ──
function listenForReelData() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "REEL_DATA") {
      updateCurrentReel(message.reel);
    }
    if (message.type === "SAVED_REELS_UPDATE") {
      renderSavedReels(message.reels);
    }
  });

  // Request current reel data on load
  setTimeout(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "GET_CURRENT_REEL" }, (response) => {
          if (response?.reel) {
            updateCurrentReel(response.reel);
          }
        });
      }
    });
  }, 500);
}

function updateCurrentReel(reel) {
  currentReelData = reel;
  document.getElementById("noReel").classList.add("hidden");
  document.getElementById("currentReel").classList.remove("hidden");

  const thumb = document.getElementById("reelThumb");
  if (reel.thumbnail) {
    thumb.src = reel.thumbnail;
    thumb.style.display = "block";
  } else {
    thumb.style.display = "none";
  }

  document.getElementById("reelCaption").textContent = reel.caption || "No caption";
  const meta = [];
  if (reel.views) meta.push(`👁 ${formatNum(reel.views)}`);
  if (reel.likes) meta.push(`❤ ${formatNum(reel.likes)}`);
  if (reel.owner) meta.push(`@${reel.owner}`);
  document.getElementById("reelMeta").textContent = meta.join(" · ") || "—";
}

// ── Transcribe Handler ──
async function handleTranscribe() {
  if (!currentReelData) return;

  // Check free limit
  const result = await chrome.storage.sync.get(["freeTranscribeCount"]);
  const count = result.freeTranscribeCount || 0;
  if (count >= FREE_LIMIT) {
    document.getElementById("upgradeModal").classList.remove("hidden");
    return;
  }

  showLoading("Transcribing reel...");

  try {
    // Call dashboard API to transcribe
    const response = await apiCall("/api/ext/transcribe", "POST", {
      shortcode: currentReelData.shortcode,
      videoUrl: currentReelData.videoUrl,
      caption: currentReelData.caption,
      ownerUsername: currentReelData.owner,
    });

    if (response.success && response.data?.transcript) {
      transcriptData = response.data.transcript;
      document.getElementById("transcriptText").textContent = transcriptData;
      document.getElementById("transcriptResult").classList.remove("hidden");

      // Increment free count
      const newCount = count + 1;
      await chrome.storage.sync.set({ freeTranscribeCount: newCount });
      updateFreeCounter(newCount);

      showToast("Transcription complete!");
    } else if (response.data?.status === "processing") {
      // Poll for completion
      pollTranscription(response.data.reelId);
    } else {
      showToast("Transcription failed. Try again.", "error");
    }
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }

  hideLoading();
}

async function pollTranscription(reelId) {
  let attempts = 0;
  const maxAttempts = 30;

  const poll = async () => {
    attempts++;
    if (attempts > maxAttempts) {
      hideLoading();
      showToast("Transcription timed out. Check your dashboard.", "error");
      return;
    }

    const response = await apiCall(`/api/ext/transcribe/status?reelId=${reelId}`, "GET");
    if (response.success && response.data?.status === "completed") {
      transcriptData = response.data.transcript;
      document.getElementById("transcriptText").textContent = transcriptData;
      document.getElementById("transcriptResult").classList.remove("hidden");

      const result = await chrome.storage.sync.get(["freeTranscribeCount"]);
      const newCount = (result.freeTranscribeCount || 0) + 1;
      await chrome.storage.sync.set({ freeTranscribeCount: newCount });
      updateFreeCounter(newCount);

      hideLoading();
      showToast("Transcription complete!");
    } else if (response.data?.status === "failed") {
      hideLoading();
      showToast("Transcription failed.", "error");
    } else {
      setTimeout(poll, 2000);
    }
  };

  poll();
}

// ── Save Reel Handler ──
async function handleSaveReel() {
  if (!currentReelData) return;

  showLoading("Saving reel...");

  try {
    const response = await apiCall("/api/ext/save-reel", "POST", {
      shortcode: currentReelData.shortcode,
      caption: currentReelData.caption,
      videoUrl: currentReelData.videoUrl,
      thumbnail: currentReelData.thumbnail,
      views: currentReelData.views || 0,
      likes: currentReelData.likes || 0,
      comments: currentReelData.comments || 0,
      ownerUsername: currentReelData.owner,
      duration: currentReelData.duration || 0,
    });

    if (response.success) {
      showToast("Reel saved to dashboard!");
      document.getElementById("saveReelBtn").textContent = "✓ Saved";
      document.getElementById("saveReelBtn").disabled = true;
    } else {
      showToast(response.data?.error || "Failed to save reel", "error");
    }
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }

  hideLoading();
}

async function saveReelByShortcode(shortcode, btn) {
  try {
    btn.textContent = "⏳";
    const response = await apiCall("/api/ext/save-reel", "POST", { shortcode });
    if (response.success) {
      btn.textContent = "✓";
      btn.classList.add("saved");
      showToast("Reel saved!");
    } else {
      btn.textContent = "💾";
      showToast("Failed to save", "error");
    }
  } catch {
    btn.textContent = "💾";
    showToast("Error saving reel", "error");
  }
}

// ── Re-Create Handler ──
async function handleRecreate() {
  if (!transcriptData) return;

  // Check free limit
  const result = await chrome.storage.sync.get(["freeTranscribeCount"]);
  const count = result.freeTranscribeCount || 0;
  if (count >= FREE_LIMIT) {
    document.getElementById("upgradeModal").classList.remove("hidden");
    return;
  }

  const gradeLevel = document.getElementById("gradeLevel").value;
  const targetDuration = document.getElementById("targetDuration").value;
  const addCues = document.getElementById("addCues").checked;

  showLoading("Re-creating script...");

  try {
    const response = await apiCall("/api/ext/recreate", "POST", {
      shortcode: currentReelData?.shortcode,
      transcript: transcriptData,
      caption: currentReelData?.caption,
      gradeLevel,
      targetDuration,
      addCues,
    });

    if (response.success && response.data?.script) {
      recreatedScript = response.data.script;
      document.getElementById("recreatedText").textContent = recreatedScript;
      document.getElementById("recreatedResult").classList.remove("hidden");

      // Set default date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      document.getElementById("postDate").value = tomorrow.toISOString().split("T")[0];

      showToast("Script re-created!");
    } else if (response.data?.status === "processing") {
      pollRecreation(response.data.scriptId);
      return; // Don't hide loading yet
    } else {
      showToast("Re-creation failed", "error");
    }
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }

  hideLoading();
}

async function pollRecreation(scriptId) {
  let attempts = 0;
  const maxAttempts = 60;

  const poll = async () => {
    attempts++;
    if (attempts > maxAttempts) {
      hideLoading();
      showToast("Re-creation timed out. Check your dashboard.", "error");
      return;
    }

    const response = await apiCall(`/api/ext/recreate/status?scriptId=${scriptId}`, "GET");
    if (response.success && response.data?.status === "completed") {
      recreatedScript = response.data.script;
      document.getElementById("recreatedText").textContent = recreatedScript;
      document.getElementById("recreatedResult").classList.remove("hidden");

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      document.getElementById("postDate").value = tomorrow.toISOString().split("T")[0];

      hideLoading();
      showToast("Script re-created!");
    } else if (response.data?.status === "failed") {
      hideLoading();
      showToast("Re-creation failed.", "error");
    } else {
      setTimeout(poll, 2000);
    }
  };

  poll();
}

// ── Calendar Handler ──
async function handleAddToCalendar() {
  if (!recreatedScript) return;

  const postDate = document.getElementById("postDate").value;
  const postTime = document.getElementById("postTime").value;
  const status = document.getElementById("scriptStatus").value;

  if (!postDate) {
    showToast("Please select a date", "error");
    return;
  }

  showLoading("Adding to calendar...");

  try {
    const title = currentReelData?.caption
      ? currentReelData.caption.substring(0, 60) + "..."
      : "Re-created Script";

    const response = await apiCall("/api/ext/save-script", "POST", {
      title,
      content: recreatedScript,
      sourceHandle: currentReelData?.owner || "",
      postDate,
      postTime,
      status,
      gradeLevel: document.getElementById("gradeLevel").value,
    });

    if (response.success) {
      showToast("Script saved & scheduled!");
    } else {
      showToast(response.data?.error || "Failed to save script", "error");
    }
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }

  hideLoading();
}

// ── Saved Reels ──
function renderSavedReels(reels) {
  const container = document.getElementById("savedList");
  if (!reels || reels.length === 0) {
    container.innerHTML = '<div class="empty-state-sm"><p>No saved reels yet. Click the 💾 button on any reel to save it.</p></div>';
    return;
  }

  container.innerHTML = reels.map((reel) => `
    <div class="result-item" data-url="https://www.instagram.com/reel/${reel.shortcode}/">
      <img class="result-thumb" src="${reel.thumbnail || ''}" alt="" onerror="this.style.display='none'">
      <div class="result-details">
        <div class="result-caption">${reel.caption || 'No caption'}</div>
        <div class="result-stats">
          <span class="stat">👁 ${formatNum(reel.views || 0)}</span>
          <span class="stat">❤ ${formatNum(reel.likes || 0)}</span>
          <span class="stat">@${reel.owner || '—'}</span>
        </div>
      </div>
    </div>
  `).join("");
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

// ── Utilities ──
function formatNum(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function showLoading(text) {
  document.getElementById("loadingText").textContent = text || "Processing...";
  document.getElementById("loadingOverlay").classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.add("hidden");
}

function showToast(message, type = "success") {
  // Simple toast using a temporary element
  const existing = document.querySelector(".panel-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `panel-toast`;
  toast.style.cssText = `
    position: fixed; bottom: 16px; left: 16px; right: 16px;
    padding: 10px 14px; border-radius: 8px; font-size: 12px;
    font-weight: 500; text-align: center; z-index: 300;
    animation: slideUp 0.3s ease;
    background: ${type === "error" ? "#7f1d1d" : "#166534"};
    color: ${type === "error" ? "#fecaca" : "#bbf7d0"};
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// Init
init();
