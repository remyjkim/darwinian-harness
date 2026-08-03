// ABOUTME: Defines shared typed errors for core drwn modules.
// ABOUTME: Gives commands stable error codes without importing CLI framework types.

export class DrwnError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly hints?: string[],
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DrwnError";
  }

  toJSON(): object {
    return {
      code: this.code,
      message: this.message,
      hints: this.hints,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

// Typed so worker-error presenters can distinguish missing/failed auth from
// connectivity without string matching (I65 Fix 3 + GATE 2 review note 1).
export class NotAuthenticatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}
