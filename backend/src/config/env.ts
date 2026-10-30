import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z
    .string()
    .optional()
    .default('postgresql://postgres:postgres@localhost:5432/anavya'),
  JWT_SECRET: z
    .string()
    .min(8)
    .optional()
    .default('anavya_production_jwt_secret_key_2026_default'),
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
  console.warn('⚠️ Environment variable validation warning, using safe defaults:', parsed.error.format());
}

export const env = parsed.success
  ? parsed.data
  : {
      PORT: Number(process.env.PORT) || 5000,
      NODE_ENV: (process.env.NODE_ENV as any) || ('development' as const),
      FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
      DATABASE_URL:
        process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/anavya',
      JWT_SECRET: process.env.JWT_SECRET || 'anavya_production_jwt_secret_key_2026_default',
      JWT_EXPIRES_IN: '7d',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
      GOOGLE_REDIRECT_URI:
        process.env.GOOGLE_REDIRECT_URI ||
        'http://localhost:5000/api/v1/integrations/google/callback',
      GOOGLE_TOKEN_ENCRYPTION_KEY:
        process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
        'taskforce_ai_default_32_byte_encryption_key_2026',
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
      TELEGRAM_WEBHOOK_SECRET:
        process.env.TELEGRAM_WEBHOOK_SECRET || 'taskforce_telegram_webhook_secret',
      WORKSPACE_ROOT: './workspace',
      MAX_UPLOAD_SIZE_MB: 10,
      AI_MOCK_MODE: process.env.AI_MOCK_MODE === 'true',
    };
