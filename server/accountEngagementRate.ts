/**
 * Account-level engagement rate for one Reel, as used across the app, CSV,
 * and Google Sheets exports:
 *   (likes + comments) / account follower count × 100
 * Rounded to two decimal places (same as DB decimal(5,2) for featured reels).
 *
 * This is not "engagement per view". If a spreadsheet compares to
 * (likes+comments)/views, numbers will not match.
 */
export function accountEngagementRatePercent(
  likeCount: number,
  commentCount: number,
  followerCount: number
): number {
  if (!followerCount || followerCount <= 0) return 0;
  const raw = ((likeCount + commentCount) / followerCount) * 100;
  return Math.round(raw * 100) / 100;
}
