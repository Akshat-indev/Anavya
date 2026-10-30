import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { toolRegistryService } from '../services/tools/tool-registry.service';
import { geminiService } from '../services/ai/gemini.service';
import { getStorageInfo } from '../config/db';

export class SystemController {
  public async listTools(_req: Request, res: Response, next: NextFunction) {
    try {
      const tools = toolRegistryService.listTools();
      return sendSuccess(res, { tools }, 'Registered backend tools retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async health(_req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(
        res,
        {
          status: 'healthy',
          service: 'TaskForce AI Autonomous Workspace Backend',
          timestamp: new Date().toISOString(),
          aiProvider: 'Google Gemini Developer API (@google/genai)',
          configuredModel: geminiService.getConfiguredModel(),
          aiMode: geminiService.isMockMode() ? 'mock_development' : 'live_gemini_free_tier',
          storage: getStorageInfo(),
          serverTime: new Date().toISOString(),
        },
        'System is healthy'
      );
    } catch (err) {
      next(err);
    }
  }
}

export const systemController = new SystemController();

