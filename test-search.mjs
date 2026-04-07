import { gotScraping } from "got-scraping";

const MOBILE_USER_AGENT = "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)";
const MOBILE_X_IG_APP_ID = "567067343352427";

async function test() {
  // Test 1: Tag info
  console.log("=== Test 1: Tag Info ===");
  const tagInfoUrl = "https://i.instagram.com/api/v1/tags/marketing/info/";
  try {
    const res = await gotScraping({
      url: tagInfoUrl,
      method: "GET",
      headers: {
        "User-Agent": MOBILE_USER_AGENT,
        "X-IG-App-ID": MOBILE_X_IG_APP_ID,
      },
      timeout: { request: 15000 },
      retry: { limit: 0 },
    });
    console.log("Status:", res.statusCode);
    const data = JSON.parse(res.body);
    console.log("Keys:", Object.keys(data));
    if (data.media_count) console.log("Media count:", data.media_count);
    if (data.name) console.log("Tag name:", data.name);
  } catch (e) {
    console.log("Error:", e.message);
    if (e.response) console.log("Response status:", e.response.statusCode, "Body:", e.response.body?.substring(0, 200));
  }

  // Test 2: Tag sections
  console.log("\n=== Test 2: Tag Sections ===");
  const sectionsUrl = "https://i.instagram.com/api/v1/tags/marketing/sections/";
  try {
    const res = await gotScraping({
      url: sectionsUrl,
      method: "POST",
      headers: {
        "User-Agent": MOBILE_USER_AGENT,
        "X-IG-App-ID": MOBILE_X_IG_APP_ID,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "tab=recent&page=0",
      timeout: { request: 15000 },
      retry: { limit: 0 },
    });
    console.log("Status:", res.statusCode);
    const data = JSON.parse(res.body);
    console.log("Keys:", Object.keys(data));
    if (data.sections) {
      console.log("Sections count:", data.sections.length);
      for (const s of data.sections.slice(0, 2)) {
        console.log("  Section type:", s.layout_type, "medias:", s.layout_content?.medias?.length || 0);
        if (s.layout_content?.medias?.[0]) {
          const m = s.layout_content.medias[0].media || s.layout_content.medias[0];
          console.log("  First media type:", m.media_type, "product:", m.product_type, "code:", m.code);
        }
      }
    }
    console.log("more_available:", data.more_available);
  } catch (e) {
    console.log("Error:", e.message);
    if (e.response) console.log("Response status:", e.response.statusCode, "Body:", e.response.body?.substring(0, 300));
  }

  // Test 3: Top search
  console.log("\n=== Test 3: Top Search ===");
  const topSearchUrl = "https://i.instagram.com/api/v1/fbsearch/topsearch_flat/?context=blended&query=marketing&search_surface=top_search_page";
  try {
    const res = await gotScraping({
      url: topSearchUrl,
      method: "GET",
      headers: {
        "User-Agent": MOBILE_USER_AGENT,
        "X-IG-App-ID": MOBILE_X_IG_APP_ID,
      },
      timeout: { request: 15000 },
      retry: { limit: 0 },
    });
    console.log("Status:", res.statusCode);
    const data = JSON.parse(res.body);
    console.log("Keys:", Object.keys(data));
    if (data.list) console.log("List count:", data.list.length);
    if (data.hashtags) console.log("Hashtags count:", data.hashtags.length);
  } catch (e) {
    console.log("Error:", e.message);
    if (e.response) console.log("Response status:", e.response.statusCode, "Body:", e.response.body?.substring(0, 300));
  }
}

test().catch(console.error);
