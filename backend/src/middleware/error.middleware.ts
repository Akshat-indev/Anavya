import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';
import { env } from '../config/env';

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response {
  if (err instanceof AppError) {
    return sendError(res, err.code, err.message, err.statusCode);
  }

  if (err.name === 'MulterError') {
    return sendError(res, 'FILE_UPLOAD_ERROR', err.message, 400);
  }

  if (env.NODE_ENV !== 'test') {
    console.error('Unhandled Error:', err.message);
  }

  const message =
    env.NODE_ENV === 'production'
      ? 'An unexpected internal server error occurred'
      : err.message || 'Internal server error';

  return sendError(res, 'INTERNAL_SERVER_ERROR', message, 500);
}

