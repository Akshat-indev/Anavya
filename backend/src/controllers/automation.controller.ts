import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';
import { automationService } from '../services/automations/automation.service';

export class AutomationController {
  public async listAutomations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const automations = await automationService.listAutomations(userId);
      return sendSuccess(res, { automations }, 'Automations retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async createAutomation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { name, description, workflowDefinition } = req.body;

      const automation = await automationService.createAutomation(userId, {
        name,
        description,
        workflowDefinition,
      });

      return sendSuccess(res, { automation }, 'Automation created', 201);
    } catch (err) {
      next(err);
    }
  }

  public async getAutomationById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const automationId = String(req.params.id);

      const automation = await automationService.getAutomationById(userId, automationId);
      return sendSuccess(res, { automation }, 'Automation retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async runAutomation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const automationId = String(req.params.id);
      const { fileId, filename, parameters } = req.body || {};

      const result = await automationService.runAutomation(userId, automationId, {
        fileId,
        filename,
        parameters,
      });

      return sendSuccess(res, result, 'Automation executed successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  public async getAutomationExecutions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const automationId = String(req.params.id);

      const executions = await automationService.getAutomationExecutions(userId, automationId);
      return sendSuccess(res, { executions }, 'Automation execution history retrieved');
    } catch (err) {
      next(err);
    }
  }
}

export const automationController = new AutomationController();
