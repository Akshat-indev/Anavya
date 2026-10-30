import app from './app';
import { env } from './config/env';
import { geminiService } from './services/ai/gemini.service';

const port = env.PORT || 5000;

try {
  geminiService.validateConfiguration();
} catch (err: any) {
  console.warn(`⚠️ AI Configuration Notice: ${err.message}`);
}

const server = app.listen(port, () => {
  console.log(`=========================================================`);
  console.log(`🚀 TaskForce AI Backend running on http://localhost:${port}`);
  console.log(`📚 Swagger API Docs: http://localhost:${port}/api-docs`);
  console.log(`🤖 Gemini Model: ${geminiService.getConfiguredModel()}`);
  console.log(`🔧 AI Mode: ${geminiService.isMockMode() ? 'MOCK DEVELOPMENT MODE' : 'LIVE GEMINI FREE TIER'}`);
  console.log(`=========================================================`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

export default server;

