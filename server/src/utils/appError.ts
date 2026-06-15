/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Thrown by services/middleware and converted to a clean JSON response by the
 * global error handler. Never put sensitive data in `message`.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(statusCode: number, code: string, message: string, expose = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
  }

  static unauthorized(message = 'נדרשת התחברות'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static notFound(message = 'לא נמצא'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static badRequest(code: string, message: string): AppError {
    return new AppError(400, code, message);
  }
}
