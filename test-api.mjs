import { gotScraping } from "got-scraping";

const UA = "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)";
const APP_ID = "567067343352427";

async function igGet(url) {
  try {
    const res = await gotScraping({
      url,
      method: "GET",
      headers: { "User-Agent": UA, "X-IG-App-ID": APP_ID },
      timeout: { request: 15000 },
      retry: { limit: 0 },
    });
    let data = null;
    try { data = JSON.parse(res.body); } catch {}
    return { status: res.statusCode, data };
  } catch (e) {
    return { status: e.response?.statusCode || 0, data: null };
  }
}

async function test() {
  // 1. Profile lookup
  console.log("=== Profile ===");
  const profile = await igGet("https://i.instagram.com/api/v1/users/web_profile_info/?username=garyvee");
  console.log("Status:", profile.status, "Has user:", !!profile.data?.data?.user);

  // 2. User search by keyword  
  console.log("\n=== User Search ===");
  const userSearch = await igGet("https://i.instagram.com/api/v1/users/search/?q=marketing&count=10");
  console.log("Status:", userSearch.status);

  // 3. Tag info
  console.log("\n=== Tag Info ===");
  const tagInfo = await igGet("https://i.instagram.com/api/v1/tags/marketing/info/");
  console.log("Status:", tagInfo.status);

  // 4. fbsearch
  console.log("\n=== FB Search ===");
  const fbSearch = await igGet("https://i.instagram.com/api/v1/fbsearch/topsearch_flat/?context=blended&query=marketing&search_surface=top_search_page");
  console.log("Status:", fbSearch.status);

  // 5. Web profile with web app ID
  console.log("\n=== Web Profile (web app ID) ===");
  try {
    const res = await gotScraping({
      url: "https://www.instagram.com/api/v1/users/web_profile_info/?username=garyvee",
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "X-IG-App-ID": "936619743392459",
      },
      timeout: { request: 15000 },
      retry: { limit: 0 },
    });
    console.log("Status:", res.statusCode);
    try {
      const data = JSON.parse(res.body);
      console.log("Has user:", !!data?.data?.user);
      if (data?.data?.user) console.log("Username:", data.data.user.username, "ID:", data.data.user.id);
    } catch {
      console.log("Not JSON");
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

test().catch(console.error);
