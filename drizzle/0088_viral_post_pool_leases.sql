-- Phase 3A production acceptance: pool refresh lease for multi-instance safety

ALTER TABLE `viral_post_pools`
  ADD COLUMN `refreshLeaseOwner` varchar(128) NULL AFTER `lastRefreshCandidateCount`,
  ADD COLUMN `refreshLeaseUntil` timestamp NULL AFTER `refreshLeaseOwner`,
  ADD KEY `idx_viral_post_pools_lease_until` (`refreshLeaseUntil`);
