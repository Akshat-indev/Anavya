import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import apiRoutes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { sendError } from './utils/response';

const app = express();

// Trust Render / reverse proxy headers for rate limiting & HTTPS
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

const allowedOrigins = (env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.replace(/\/+$/, '');
      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(normalizedOrigin) ||
        normalizedOrigin.endsWith('.vercel.app') ||
        normalizedOrigin.startsWith('http://localhost:')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 10000 : 350,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
});

app.use('/api', apiLimiter);

// Body parsing with reasonable size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Root status endpoint (useful for Render health checks & browser visits)
app.get('/', (_req, res) => {
  res.json({
    success: true,
    name: 'Anavya Autonomous AI Workspace API',
    tagline: 'Your AI workspace. Your agents. Your work, done.',
    status: 'online',
    docs: '/api-docs',
    health: '/api/v1/health',
  });
});

// Swagger OpenAPI Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (_req, res) => {
  res.json(swaggerSpec);
});

// REST API v1 routes
app.use('/api/v1', apiRoutes);

// 404 handler
app.use((req, res) => {
  sendError(res, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`, 404);
});

// Centralized error handler
app.use(errorHandler);

export default app;
