import { describe, expect, it } from "vitest";
import {
  extractTelegramCollectedVideos,
  messageTextForUrlParsing,
} from "./telegramBot";

describe("Telegram video link extraction", () => {
  it("includes hidden text_link URLs shared by Telegram", async () => {
    const message = {
      text: "Watch this",
      entities: [
        {
          type: "text_link",
          offset: 0,
          length: 10,
          url: "https://youtu.be/AbCdEf12345",
        },
      ],
    };

    expect(messageTextForUrlParsing(message)).toContain(
      "https://youtu.be/AbCdEf12345"
    );

    const parsed = await extractTelegramCollectedVideos(message);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.platform).toBe("youtube");
    expect(parsed[0]?.externalId).toBe("AbCdEf12345");
  });

  it("dedupes a URL repeated in text and Telegram URL entities", async () => {
    const url = "https://www.youtube.com/shorts/AbCdEf12345";
    const message = {
      text: url,
      entities: [{ type: "url", offset: 0, length: url.length }],
    };

    const parsed = await extractTelegramCollectedVideos(message);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.platform).toBe("youtube");
  });
});
