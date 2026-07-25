-- Index for workspace-scoped carousel remake lookups.
-- Railway console: run separately from CREATE TABLE.

CREATE INDEX `idx_carousel_remakes_workspace` ON `carousel_remakes` (`workspaceId`);
