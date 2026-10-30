import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticatedRequest, AuthUser } from '../types';
import { AppError } from '../utils/errors';

export function authenticateJWT(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token is required', 401, 'UNAUTHORIZED'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    if (!decoded || !decoded.id) {
      return next(new AppError('Invalid authentication token', 401, 'INVALID_TOKEN'));
    }
    req.user = {
      id: decoded.id,
      email: decoded.email,
    };
    next();
  } catch (_err) {
    return next(new AppError('Invalid or expired authentication token', 401, 'INVALID_TOKEN'));
  }
}

