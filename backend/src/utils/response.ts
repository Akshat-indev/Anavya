import { Response } from 'express';

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Operation completed',
  statusCode = 200
): Response {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 400
): Response {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

