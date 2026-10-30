import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';
import { orchestratorService } from '../services/orchestration/orchestrator.service';

export class TaskController {
  public async createTask(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { title, description } = req.body;

      const task = await orchestratorService.createAndRunTask(userId, {
        title,
        description,
      });

      return sendSuccess(res, { task }, 'Task processed', 201);
    } catch (err) {
      next(err);
    }
  }

  public async listTasks(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const status = req.query.status ? String(req.query.status) : undefined;

      const result = await orchestratorService.listUserTasks(userId, page, limit, status);
      return sendSuccess(res, result, 'Tasks retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  public async getTaskById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const taskId = String(req.params.id);

      const task = await orchestratorService.getTaskDetails(userId, taskId);
      return sendSuccess(res, { task }, 'Task retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  public async cancelTask(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const taskId = String(req.params.id);

      const task = await orchestratorService.cancelTask(userId, taskId);
      return sendSuccess(res, { task }, 'Task cancelled successfully');
    } catch (err) {
      next(err);
    }
  }

  public async getTaskExecutions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const taskId = String(req.params.id);

      const executions = await orchestratorService.getTaskExecutions(userId, taskId);
      return sendSuccess(res, executions, 'Task execution history retrieved');
    } catch (err) {
      next(err);
    }
  }
}

export const taskController = new TaskController();
