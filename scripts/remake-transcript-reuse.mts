/** Remake PR 1 sizing (read-only, counts only): for library videos shown on Home / Viral Posts
 * (status viral or rising), how many already have a finished transcript we could reuse? */
import mysql from "mysql2/promise";
const conn = await mysql.createConnection({ uri: process.env.EVAL_DB_READONLY_URL!.trim() });
const q = async (s: string) => ((await conn.query(s)) as unknown as [Array<Record<string, any>>])[0];
const rows = await q(`
  SELECT c.platform AS platform,
    COUNT(*) AS total,
    SUM(CASE
      WHEN c.platform = 'instagram' AND EXISTS (SELECT 1 FROM transcriptions t WHERE t.reelId = c.mirroredReelId AND t.status = 'completed' AND t.transcript IS NOT NULL AND t.transcript <> '') THEN 1
      WHEN c.platform = 'tiktok' AND EXISTS (SELECT 1 FROM tiktok_videos v JOIN transcriptions t ON t.tiktokVideoId = v.id WHERE v.awemeId = c.sourceId AND t.status = 'completed' AND t.transcript IS NOT NULL AND t.transcript <> '') THEN 1
      WHEN c.platform = 'youtube' AND EXISTS (SELECT 1 FROM youtube_videos v JOIN transcriptions t ON t.youtubeVideoId = v.id WHERE v.videoId = c.sourceId AND t.status = 'completed' AND t.transcript IS NOT NULL AND t.transcript <> '') THEN 1
      ELSE 0 END) AS withTranscript,
    SUM(CASE
      WHEN c.platform = 'instagram' AND c.mirroredReelId IS NOT NULL THEN 1
      WHEN c.platform = 'tiktok' AND EXISTS (SELECT 1 FROM tiktok_videos v WHERE v.awemeId = c.sourceId) THEN 1
      WHEN c.platform = 'youtube' AND EXISTS (SELECT 1 FROM youtube_videos v WHERE v.videoId = c.sourceId) THEN 1
      ELSE 0 END) AS withVideoRow
  FROM viral_post_candidates c JOIN viral_library_status s ON s.candidateId = c.id
  WHERE s.status IN ('viral', 'rising')
  GROUP BY c.platform`);
for (const r of rows) console.log(`REUSE ${r.platform} | shown-eligible ${r.total} | have video row ${r.withVideoRow} | have finished transcript ${r.withTranscript}`);
await conn.end();
