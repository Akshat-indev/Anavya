import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z
    .string()
    .optional()
    .default('http://localhost:5000/api/v1/integrations/google/callback'),
  GOOGLE_TOKEN_ENCRYPTION_KEY: z
    .string()
    .optional()
    .default('taskforce_ai_default_32_byte_encryption_key_2026'),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default('taskforce_telegram_webhook_secret'),
  WORKSPACE_ROOT: z.string().default('./workspace'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(10),
  AI_MOCK_MODE: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val.toLowerCase() === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

export const env = parsed.success
  ? parsed.data
  : {
      PORT: 5000,
      NODE_ENV: 'test' as const,
      FRONTEND_URL: 'http://localhost:5173',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/taskforce_ai',
      JWT_SECRET: 'test_jwt_secret_key_for_taskforce_ai_123456',
      JWT_EXPIRES_IN: '7d',
      GEMINI_API_KEY: '',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REDIRECT_URI: 'http://localhost:5000/api/v1/integrations/google/callback',
      GOOGLE_TOKEN_ENCRYPTION_KEY: 'taskforce_ai_default_32_byte_encryption_key_2026',
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_WEBHOOK_SECRET: 'taskforce_telegram_webhook_secret',
      WORKSPACE_ROOT: './workspace',
      MAX_UPLOAD_SIZE_MB: 10,
      AI_MOCK_MODE: true,
    };
