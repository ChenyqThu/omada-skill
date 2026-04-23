export type ErrorCategory =
  | "auth"
  | "permission"
  | "notFound"
  | "validation"
  | "rateLimit"
  | "transient"
  | "fatal";

export class OmadaError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class OmadaAuthError extends OmadaError {}
export class OmadaPermissionError extends OmadaError {}
export class OmadaNotFoundError extends OmadaError {}
export class OmadaValidationError extends OmadaError {}
export class OmadaTransientError extends OmadaError {}
export class OmadaFatalError extends OmadaError {}

export class OmadaRateLimitError extends OmadaError {
  public readonly retryAfterMs: number | undefined;

  constructor(message: string, retryAfterMs?: number, options?: ErrorOptions) {
    super(message, options);
    this.retryAfterMs = retryAfterMs;
  }
}

export function classifyHttpStatus(status: number): ErrorCategory {
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 404) return "notFound";
  if (status === 400 || status === 409 || status === 422) return "validation";
  if (status === 429) return "rateLimit";
  if (status >= 500 && status < 600) return "transient";
  return "fatal";
}

export function errorFromCategory(
  category: ErrorCategory,
  message: string,
  options?: ErrorOptions & { retryAfterMs?: number },
): OmadaError {
  switch (category) {
    case "auth":
      return new OmadaAuthError(message, options);
    case "permission":
      return new OmadaPermissionError(message, options);
    case "notFound":
      return new OmadaNotFoundError(message, options);
    case "validation":
      return new OmadaValidationError(message, options);
    case "rateLimit":
      return new OmadaRateLimitError(message, options?.retryAfterMs, options);
    case "transient":
      return new OmadaTransientError(message, options);
    case "fatal":
      return new OmadaFatalError(message, options);
  }
}
