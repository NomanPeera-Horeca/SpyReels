/**
 * Telegram Bot integration for SpyReels.
 * Users connect their Telegram account, then share Instagram Reel links
 * to the bot from mobile. The bot fetches metadata and saves them as
 * "collected reels" in the user's SpyReels dashboard.
 */

import { ENV } from "./_core/env";
import {
  getTelegramConnectionByChatId,
  getTelegramConnectionByLinkCode,
  updateTelegramConnection,
  createCollectedReel,
  getCollectedReelByShortcode,
  updateCollectedReel,
} from "./db";
import { fetchReelByShortcode } from "./instagram";

const TELEGRAM_API = "https://api.telegram.org/bot";

// ── Telegram API helpers ──

async function sendMessage(chatId: string, text: string, parseMode: string = "HTML"): Promise<void> {
  const token = ENV.telegramBotToken;
  if (!token) return;
  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      console.error("[Telegram] sendMessage failed:", await res.text());
    }
  } catch (err) {
    console.error("[Telegram] sendMessage error:", err);
  }
}

// ── Parse Instagram URL from message ──

function extractInstagramShortcode(text: string): string | null {
  // Match various Instagram URL patterns
  const patterns = [
    /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/,
    /instagr\.am\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function extractAllInstagramShortcodes(text: string): string[] {
  const patterns = [
    /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/g,
    /instagr\.am\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/g,
  ];
  const shortcodes = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) shortcodes.add(match[1]);
    }
  }
  return Array.from(shortcodes);
}

// ── Handle incoming Telegram messages ──

export async function handleTelegramUpdate(update: any): Promise<void> {
  const message = update?.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const text = (message.text || "").trim();
  const username = message.from?.username || "";

  // Handle /start command
  if (text === "/start") {
    await sendMessage(chatId,
      `🔍 <b>Welcome to SpyReels Bot!</b>\n\n` +
      `I help you collect Instagram Reels for transcription and AI script generation.\n\n` +
      `<b>How to connect:</b>\n` +
      `1. Go to <a href="https://spyreels.ai/settings">spyreels.ai/settings</a>\n` +
      `2. Click "Connect Telegram"\n` +
      `3. Copy your 6-digit link code\n` +
      `4. Send it here\n\n` +
      `Once connected, just share any Instagram Reel link here and it will appear in your SpyReels dashboard! 🚀`
    );
    return;
  }

  // Handle /help command
  if (text === "/help") {
    await sendMessage(chatId,
      `📖 <b>SpyReels Bot Commands</b>\n\n` +
      `/start - Welcome message\n` +
      `/help - Show this help\n` +
      `/status - Check connection status\n` +
      `/disconnect - Disconnect your account\n\n` +
      `<b>How to use:</b>\n` +
      `Just share any Instagram Reel link and I'll save it to your SpyReels dashboard.\n\n` +
      `<b>From Instagram mobile:</b>\n` +
      `Tap Share → Share to Telegram → Select SpyReels Bot → Send\n\n` +
      `You can also paste multiple URLs in one message!`
    );
    return;
  }

  // Handle /status command
  if (text === "/status") {
    const connection = await getTelegramConnectionByChatId(chatId);
    if (connection) {
      await sendMessage(chatId,
        `✅ <b>Connected!</b>\n\nYour Telegram is linked to your SpyReels account. Share any Instagram Reel link and I'll save it for you.`
      );
    } else {
      await sendMessage(chatId,
        `❌ <b>Not connected</b>\n\nGo to <a href="https://spyreels.ai/settings">spyreels.ai/settings</a> to get your link code, then send it here.`
      );
    }
    return;
  }

  // Handle /disconnect command
  if (text === "/disconnect") {
    const connection = await getTelegramConnectionByChatId(chatId);
    if (connection) {
      await updateTelegramConnection(connection.id, { isConnected: 0, telegramChatId: null });
      await sendMessage(chatId,
        `🔓 <b>Disconnected!</b>\n\nYour Telegram is no longer linked to SpyReels. You can reconnect anytime from Settings.`
      );
    } else {
      await sendMessage(chatId, `You're not currently connected to any SpyReels account.`);
    }
    return;
  }

  // Check if message is a link code (6 alphanumeric characters)
  if (/^[A-Z0-9]{6}$/.test(text.toUpperCase())) {
    const code = text.toUpperCase();
    const connection = await getTelegramConnectionByLinkCode(code);

    if (!connection) {
      await sendMessage(chatId, `❌ Invalid or expired link code. Please generate a new one from <a href="https://spyreels.ai/settings">spyreels.ai/settings</a>.`);
      return;
    }

    if (connection.linkCodeExpiresAt < new Date()) {
      await sendMessage(chatId, `⏰ This link code has expired. Please generate a new one from <a href="https://spyreels.ai/settings">spyreels.ai/settings</a>.`);
      return;
    }

    // Link the account
    await updateTelegramConnection(connection.id, {
      telegramChatId: chatId,
      telegramUsername: username || null,
      isConnected: 1,
    });

    await sendMessage(chatId,
      `✅ <b>Connected successfully!</b>\n\n` +
      `Your Telegram is now linked to SpyReels. 🎉\n\n` +
      `Now just share any Instagram Reel link here and it will appear in your <b>Collected Reels</b> tab on the dashboard.\n\n` +
      `<b>Quick tip:</b> On Instagram mobile, tap Share → Share to Telegram → Select this chat → Send!`
    );
    return;
  }

  // Check if user is connected
  const connection = await getTelegramConnectionByChatId(chatId);
  if (!connection) {
    // Check if it looks like an Instagram URL
    if (text.includes("instagram.com") || text.includes("instagr.am")) {
      await sendMessage(chatId,
        `🔗 I see an Instagram link, but you need to connect your SpyReels account first!\n\n` +
        `1. Go to <a href="https://spyreels.ai/settings">spyreels.ai/settings</a>\n` +
        `2. Click "Connect Telegram"\n` +
        `3. Send me the 6-digit code`
      );
    } else {
      await sendMessage(chatId,
        `Please connect your SpyReels account first. Go to <a href="https://spyreels.ai/settings">spyreels.ai/settings</a> and send me your link code.`
      );
    }
    return;
  }

  // Extract Instagram URLs from message
  const shortcodes = extractAllInstagramShortcodes(text);

  if (shortcodes.length === 0) {
    await sendMessage(chatId,
      `I didn't find any Instagram Reel links in your message. 🤔\n\n` +
      `Share a link like:\nhttps://www.instagram.com/reel/ABC123/\n\n` +
      `Or share directly from the Instagram app!`
    );
    return;
  }

  // Process each shortcode
  const userId = connection.userId;
  let saved = 0;
  let duplicates = 0;
  let errors = 0;

  for (const shortcode of shortcodes) {
    try {
      // Check for duplicates
      const existing = await getCollectedReelByShortcode(userId, shortcode);
      if (existing) {
        duplicates++;
        continue;
      }

      // Create a pending collected reel first
      const reelId = await createCollectedReel({
        userId,
        shortcode,
        reelUrl: `https://www.instagram.com/reel/${shortcode}/`,
        source: "telegram",
        status: "pending",
      });

      // Fetch metadata in background
      fetchAndUpdateCollectedReel(reelId, shortcode).catch((err) => {
        console.error(`[Telegram] Failed to fetch reel ${shortcode}:`, err);
      });

      saved++;
    } catch (err) {
      console.error(`[Telegram] Error saving reel ${shortcode}:`, err);
      errors++;
    }
  }

  // Send confirmation
  const parts: string[] = [];
  if (saved > 0) parts.push(`✅ ${saved} reel${saved > 1 ? "s" : ""} saved to your dashboard!`);
  if (duplicates > 0) parts.push(`⚠️ ${duplicates} already in your collection.`);
  if (errors > 0) parts.push(`❌ ${errors} failed to save.`);

  let reply = parts.join("\n");
  if (saved > 0) {
    reply += `\n\n📊 View in <a href="https://spyreels.ai/collected">Collected Reels</a> to transcribe and generate scripts!`;
  }

  await sendMessage(chatId, reply);
}

// ── Background: fetch reel metadata and update the collected reel ──

async function fetchAndUpdateCollectedReel(reelId: number, shortcode: string): Promise<void> {
  try {
    const data = await fetchReelByShortcode(shortcode);
    if (!data) {
      await updateCollectedReel(reelId, {
        status: "failed",
        errorMessage: "Could not fetch reel data from Instagram",
      });
      return;
    }

    await updateCollectedReel(reelId, {
      caption: data.caption || null,
      viewCount: data.viewCount || 0,
      likeCount: data.likeCount || 0,
      commentCount: data.commentCount || 0,
      thumbnailUrl: data.thumbnailUrl || null,
      videoUrl: data.videoUrl || null,
      duration: data.duration || null,
      postedAt: data.postedAt || null,
      ownerUsername: data.ownerUsername || null,
      ownerFullName: data.ownerFullName || null,
      ownerProfilePicUrl: data.ownerProfilePicUrl || null,
      ownerFollowerCount: data.ownerFollowerCount || 0,
      status: "ready",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateCollectedReel(reelId, {
      status: "failed",
      errorMessage: message,
    });
  }
}

// ── Set up Telegram webhook ──

export async function setupTelegramWebhook(baseUrl: string): Promise<boolean> {
  const token = ENV.telegramBotToken;
  if (!token) {
    console.log("[Telegram] No bot token configured, skipping webhook setup");
    return false;
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`;

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
    });

    const result = await res.json();
    if (result.ok) {
      console.log(`[Telegram] Webhook set to ${webhookUrl}`);
      return true;
    } else {
      console.error("[Telegram] Failed to set webhook:", result);
      return false;
    }
  } catch (err) {
    console.error("[Telegram] Error setting webhook:", err);
    return false;
  }
}

// ── Notify owner via Telegram ──

/**
 * Send a notification message to the owner's Telegram account.
 * Looks up the owner's Telegram chat ID from their connected account.
 * Falls back silently if owner hasn't connected Telegram.
 */
export async function notifyOwnerViaTelegram(message: string): Promise<void> {
  const token = ENV.telegramBotToken;
  if (!token) return;

  try {
    // Find the owner's user record
    const { getUserByOpenId, getTelegramConnectionByUserId } = await import("./db");
    const ownerUser = await getUserByOpenId(ENV.ownerOpenId);
    if (!ownerUser) {
      console.warn("[Telegram] Owner user not found, cannot send notification");
      return;
    }

    // Find the owner's Telegram connection
    const connection = await getTelegramConnectionByUserId(ownerUser.id);
    if (!connection || !connection.telegramChatId) {
      console.warn("[Telegram] Owner has no Telegram connection, skipping notification");
      return;
    }

    await sendMessage(connection.telegramChatId, message);
    console.log("[Telegram] Owner notification sent successfully");
  } catch (err) {
    console.warn("[Telegram] Failed to send owner notification:", err);
  }
}

// ── Get bot info for display ──

export async function getTelegramBotInfo(): Promise<{ username: string; name: string } | null> {
  const token = ENV.telegramBotToken;
  if (!token) return null;

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/getMe`);
    const result = await res.json();
    if (result.ok && result.result) {
      return {
        username: result.result.username || "",
        name: result.result.first_name || "SpyReels Bot",
      };
    }
  } catch (err) {
    console.error("[Telegram] getMe error:", err);
  }
  return null;
}
