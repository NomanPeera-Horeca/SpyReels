import type { AiGatewayErrorCode, AiGatewayErrorShape } from "./types";

/**
 * Stable error contract returned to AI hosts. Internal/vendor errors should
 * be translated to this type before they cross the gateway boundary.
 */
export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly retryable: boolean;
  readonly upgradePlan?: string;

  constructor(input: {
    code: AiGatewayErrorCode;
    message: string;
    retryable?: boolean;
    upgradePlan?: string;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "AiGatewayError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.upgradePlan = input.upgradePlan;
  }

  toShape(): AiGatewayErrorShape {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.upgradePlan ? { upgradePlan: this.upgradePlan } : {}),
    };
  }
}
