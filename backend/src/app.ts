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

// Google Search Console HTML file verification handler (only matches configured GOOGLE_SITE_VERIFICATION filename)
app.get(/^\/(google[a-zA-Z0-9_-]+\.html)$/, (req, res, next) => {
  const fileName = req.params[0];
  const configuredFile = (process.env.GOOGLE_SITE_VERIFICATION_FILE || process.env.GOOGLE_SITE_VERIFICATION || '').trim();
  if (configuredFile && (fileName === configuredFile || `${configuredFile}.html` === fileName)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`google-site-verification: ${fileName}`);
  }
  return next();
});

// Root status endpoint (always serves HTML with verification meta tag for Googlebot & browsers)
app.get('/', (req, res) => {
  const rawVerify = (process.env.GOOGLE_SITE_VERIFICATION || '').trim();
  let verifyContent = rawVerify;
  const contentMatch = rawVerify.match(/content=["']([^"']+)["']/i);
  if (contentMatch && contentMatch[1]) {
    verifyContent = contentMatch[1];
  }
  const verifyMeta = verifyContent
    ? `<meta name="google-site-verification" content="${verifyContent}" />`
    : '';

  if (req.query.format === 'json') {
    return res.json({
      success: true,
      name: 'Anavya Autonomous AI Workspace API',
      tagline: 'Your AI workspace. Your agents. Your work, done.',
      status: 'online',
      docs: '/api-docs',
      health: '/api/v1/health',
      privacy: '/privacy',
      terms: '/terms',
    });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${verifyMeta}
  <title>Anavya Autonomous AI Workspace</title>
</head>
<body style="background:#121212;color:#ECECEC;font-family:sans-serif;padding:40px;text-align:center;">
  <h1>Anavya Autonomous AI Workspace</h1>
  <p>Your AI workspace. Your agents. Your work, done.</p>
  <p><a href="/privacy" style="color:#E9A23B;">Privacy Policy</a> • <a href="/terms" style="color:#E9A23B;">Terms of Service</a> • <a href="/api-docs" style="color:#E9A23B;">API Docs</a></p>
</body>
</html>`);
});

// Public Privacy Policy & Terms of Service pages (for Google OAuth Consent Screen)
app.get('/privacy', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — Anavya</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #121212; color: #ECECEC; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.65; }
    h1, h2 { color: #FFFFFF; }
    a { color: #E9A23B; }
    .card { background: #181818; border: 1px solid #262626; border-radius: 16px; padding: 28px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Privacy Policy — Anavya</h1>
    <p><strong>Effective Date:</strong> October 30, 2026</p>
    <p>Anavya ("we", "our", or "us") provides an autonomous AI workspace. This Privacy Policy describes how we handle your data when you connect your Google account or Telegram account.</p>
    <h2>1. Information We Access</h2>
    <ul>
      <li><strong>Google Account Profile:</strong> Your email address and display name via Google OAuth 2.0 for authentication.</li>
      <li><strong>Google Workspace Data (Only when authorized by you):</strong> Google Drive files, Google Docs documents, Google Sheets spreadsheets, and Gmail messages/drafts requested during your agent tasks.</li>
      <li><strong>Telegram Data:</strong> Your linked Telegram Chat ID to deliver notifications you request.</li>
    </ul>
    <h2>2. How We Use & Protect Your Data</h2>
    <ul>
      <li>OAuth tokens are encrypted at rest using AES-256-GCM before storage.</li>
      <li>We never sell, rent, or share your Google Workspace or Telegram data with third parties.</li>
      <li>Sensitive actions (such as sending emails or modifying spreadsheets) require your explicit approval.</li>
    </ul>
    <h2>3. Revoking Access</h2>
    <p>You can disconnect your Google or Telegram account at any time from the <strong>Plugins</strong> page in Anavya, or revoke access directly in your Google Account Security Settings.</p>
  </div>
</body>
</html>`);
});

app.get('/terms', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms of Service — Anavya</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #121212; color: #ECECEC; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.65; }
    h1, h2 { color: #FFFFFF; }
    a { color: #E9A23B; }
    .card { background: #181818; border: 1px solid #262626; border-radius: 16px; padding: 28px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Terms of Service — Anavya</h1>
    <p><strong>Effective Date:</strong> October 30, 2026</p>
    <p>By using Anavya ("the Service"), you agree to these Terms of Service.</p>
    <h2>1. Use of the Service</h2>
    <p>Anavya allows you to configure AI agents and connect external integrations (such as Google Drive, Google Docs, Google Sheets, Gmail, and Telegram) to automate workflows under your direction.</p>
    <h2>2. User Responsibilities & Approvals</h2>
    <p>You are responsible for reviewing and approving external actions (such as sending emails or modifying shared documents) initiated by your agents.</p>
    <h2>3. Account Termination & Disconnection</h2>
    <p>You may disconnect any connected integration or stop using the Service at any time.</p>
  </div>
</body>
</html>`);
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
