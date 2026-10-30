import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, MemoryCategory } from '../types';
import { sendSuccess } from '../utils/response';
import { memoryService } from '../services/memory/memory.service';

export class MemoryController {
  public async listMemories(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const category = req.query.category as MemoryCategory | undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;

      const result = await memoryService.listMemories(userId, {
        category,
        search,
        page,
        limit,
      });

      return sendSuccess(res, result, 'Memories retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  public async createMemory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { category, content, metadata } = req.body;

      const memory = await memoryService.createMemory(userId, category, content, metadata);
      return sendSuccess(res, { memory }, 'Memory created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  public async updateMemory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const memoryId = String(req.params.id);
      const { category, content, metadata } = req.body;

      const memory = await memoryService.updateMemory(userId, memoryId, {
        category,
        content,
        metadata,
      });

      return sendSuccess(res, { memory }, 'Memory updated successfully');
    } catch (err) {
      next(err);
    }
  }

  public async deleteMemory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const memoryId = String(req.params.id);

      const result = await memoryService.deleteMemory(userId, memoryId);
      return sendSuccess(res, result, 'Memory deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

export const memoryController = new MemoryController();
