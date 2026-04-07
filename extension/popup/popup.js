// ── Popup Script ──

const DEFAULT_URL = "https://spyreels.ai";

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2500);
}

async function checkConnection(url) {
  try {
    const resp = await fetch(`${url}/api/ext/ping`, {
      method: "GET",
      credentials: "include",
    });
    if (resp.ok) {
      const data = await resp.json();
      return { connected: true, user: data.user || null };
    }
    return { connected: false };
  } catch {
    return { connected: false };
  }
}

async function init() {
  const result = await chrome.storage.sync.get([
    "dashboardUrl",
    "freeTranscribeCount",
  ]);
  const url = result.dashboardUrl || DEFAULT_URL;
  document.getElementById("dashboardUrl").value = url;

  // Update free counter
  const count = result.freeTranscribeCount || 0;
  document.getElementById("freeCount").textContent = count;
  document.getElementById("freeProgress").style.width = `${Math.min((count / 3) * 100, 100)}%`;

  // Check connection
  const status = document.getElementById("connectionStatus");
  const conn = await checkConnection(url);
  if (conn.connected) {
    status.textContent = conn.user ? `✓ ${conn.user}` : "✓ Connected";
    status.className = "status-value status-connected";
    document.getElementById("disconnectSection").classList.remove("hidden");
  } else {
    status.textContent = "✗ Not connected";
    status.className = "status-value status-disconnected";
  }
}

document.getElementById("connectBtn").addEventListener("click", async () => {
  const url = document.getElementById("dashboardUrl").value.trim().replace(/\/$/, "");
  if (!url) {
    showToast("Please enter a dashboard URL", "error");
    return;
  }

  const status = document.getElementById("connectionStatus");
  status.textContent = "Connecting...";
  status.className = "status-value";

  await chrome.storage.sync.set({ dashboardUrl: url });

  const conn = await checkConnection(url);
  if (conn.connected) {
    status.textContent = conn.user ? `✓ ${conn.user}` : "✓ Connected";
    status.className = "status-value status-connected";
    document.getElementById("disconnectSection").classList.remove("hidden");
    showToast("Connected to dashboard!");
  } else {
    status.textContent = "✗ Not connected";
    status.className = "status-value status-disconnected";
    showToast("Could not connect. Make sure you're logged into the dashboard.", "error");
    // Open dashboard in new tab for login
    chrome.tabs.create({ url: url });
  }
});

document.getElementById("openDashboardBtn").addEventListener("click", async () => {
  const result = await chrome.storage.sync.get(["dashboardUrl"]);
  const url = result.dashboardUrl || DEFAULT_URL;
  chrome.tabs.create({ url });
});

document.getElementById("disconnectBtn").addEventListener("click", async () => {
  await chrome.storage.sync.remove(["authToken"]);
  document.getElementById("connectionStatus").textContent = "✗ Disconnected";
  document.getElementById("connectionStatus").className = "status-value status-disconnected";
  document.getElementById("disconnectSection").classList.add("hidden");
  showToast("Disconnected from dashboard");
});

document.getElementById("helpLink").addEventListener("click", (e) => {
  e.preventDefault();
  const url = document.getElementById("dashboardUrl").value || DEFAULT_URL;
  chrome.tabs.create({ url: url + "/settings" });
});

init();
