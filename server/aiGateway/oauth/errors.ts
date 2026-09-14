export type AiOAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "invalid_scope"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "unsupported_response_type"
  | "server_error";

export class AiOAuthError extends Error {
  readonly oauthCode: AiOAuthErrorCode;
  readonly status: number;

  constructor(
    oauthCode: AiOAuthErrorCode,
    message: string,
    status: number = 400
  ) {
    super(message);
    this.name = "AiOAuthError";
    this.oauthCode = oauthCode;
    this.status = status;
  }
}
