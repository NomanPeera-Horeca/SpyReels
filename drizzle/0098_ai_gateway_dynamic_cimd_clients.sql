-- OAuth Client ID Metadata Documents (CIMD) are valid client registrations
-- without a local ai_oauth_clients row. Authorization grants and refresh tokens
-- therefore keep clientId as an indexed logical identifier, not a relational FK.
-- User foreign keys remain intact.

SET @spyreels_db_name := DATABASE();

SET @auth_code_client_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @spyreels_db_name
    AND TABLE_NAME = 'ai_oauth_authorization_codes'
    AND CONSTRAINT_NAME = 'fk_ai_oauth_authorization_codes_client'
);
SET @auth_code_client_fk_sql := IF(
  @auth_code_client_fk_exists > 0,
  'ALTER TABLE `ai_oauth_authorization_codes` DROP FOREIGN KEY `fk_ai_oauth_authorization_codes_client`',
  'SELECT 1'
);
PREPARE spyreels_drop_auth_code_client_fk FROM @auth_code_client_fk_sql;
EXECUTE spyreels_drop_auth_code_client_fk;
DEALLOCATE PREPARE spyreels_drop_auth_code_client_fk;

SET @refresh_client_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @spyreels_db_name
    AND TABLE_NAME = 'ai_oauth_refresh_tokens'
    AND CONSTRAINT_NAME = 'fk_ai_oauth_refresh_tokens_client'
);
SET @refresh_client_fk_sql := IF(
  @refresh_client_fk_exists > 0,
  'ALTER TABLE `ai_oauth_refresh_tokens` DROP FOREIGN KEY `fk_ai_oauth_refresh_tokens_client`',
  'SELECT 1'
);
PREPARE spyreels_drop_refresh_client_fk FROM @refresh_client_fk_sql;
EXECUTE spyreels_drop_refresh_client_fk;
DEALLOCATE PREPARE spyreels_drop_refresh_client_fk;
