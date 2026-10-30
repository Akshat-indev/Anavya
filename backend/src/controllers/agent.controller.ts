import { Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { specialistAgentService } from '../services/agents/specialist-agents.service';

export class AgentController {
  public async listAgents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const agents = await specialistAgentService.ensureUserDefaultAgents(userId);
      return sendSuccess(res, { agents }, 'Agents retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  public async createAgent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const {
        name,
        role,
        description,
        category,
        avatar,
        accentColor,
        intro,
        personality,
        systemInstructions,
        enabledTools,
        actionPermissions,
        executionBehavior,
        outputPreferences,
        memorySettings,
        isDraft,
        isActive,
      } = req.body;

      const agent = await prisma.agent.create({
        data: {
          userId,
          name,
          role,
          description: description || '',
          category: category || 'Custom',
          avatar: avatar || 'custom',
          accentColor: accentColor || '#F59E0B',
          intro: intro || '',
          personality: personality || 'Professional',
          systemInstructions,
          enabledTools: (enabledTools || []) as any,
          actionPermissions: (actionPermissions || {}) as any,
          executionBehavior: (executionBehavior || {}) as any,
          outputPreferences: (outputPreferences || {}) as any,
          memorySettings: (memorySettings || {}) as any,
          isSystem: false,
          isDraft: isDraft ?? false,
          isActive: isActive ?? true,
        },
      });

      return sendSuccess(res, { agent }, 'Agent created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  public async getAgentById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const agentId = String(req.params.id);

      const agent = await prisma.agent.findFirst({
        where: { id: agentId, userId },
      });

      if (!agent) {
        throw new AppError('Agent not found or access denied', 404, 'AGENT_NOT_FOUND');
      }

      return sendSuccess(res, { agent }, 'Agent retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  public async updateAgent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const agentId = String(req.params.id);
      const {
        name,
        role,
        description,
        category,
        avatar,
        accentColor,
        intro,
        personality,
        systemInstructions,
        enabledTools,
        actionPermissions,
        executionBehavior,
        outputPreferences,
        memorySettings,
        isDraft,
        isActive,
      } = req.body;

      const existing = await prisma.agent.findFirst({
        where: { id: agentId, userId },
      });

      if (!existing) {
        throw new AppError('Agent not found or access denied', 404, 'AGENT_NOT_FOUND');
      }

      const updated = await prisma.agent.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(role !== undefined ? { role } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(category !== undefined ? { category } : {}),
          ...(avatar !== undefined ? { avatar } : {}),
          ...(accentColor !== undefined ? { accentColor } : {}),
          ...(intro !== undefined ? { intro } : {}),
          ...(personality !== undefined ? { personality } : {}),
          ...(systemInstructions !== undefined ? { systemInstructions } : {}),
          ...(enabledTools !== undefined ? { enabledTools: enabledTools as any } : {}),
          ...(actionPermissions !== undefined
            ? { actionPermissions: actionPermissions as any }
            : {}),
          ...(executionBehavior !== undefined
            ? { executionBehavior: executionBehavior as any }
            : {}),
          ...(outputPreferences !== undefined
            ? { outputPreferences: outputPreferences as any }
            : {}),
          ...(memorySettings !== undefined ? { memorySettings: memorySettings as any } : {}),
          ...(isDraft !== undefined ? { isDraft } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      return sendSuccess(res, { agent: updated }, 'Agent updated successfully');
    } catch (err) {
      next(err);
    }
  }

  public async duplicateAgent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const agentId = String(req.params.id);

      const existing: any = await prisma.agent.findFirst({
        where: { id: agentId, userId },
      });

      if (!existing) {
        throw new AppError('Agent not found or access denied', 404, 'AGENT_NOT_FOUND');
      }

      const duplicated = await prisma.agent.create({
        data: {
          userId,
          name: `${existing.name} (Copy)`,
          role: existing.role,
          description: existing.description || '',
          category: existing.category || 'Custom',
          avatar: existing.avatar || 'custom',
          accentColor: existing.accentColor || '#F59E0B',
          intro: existing.intro || '',
          personality: existing.personality || 'Professional',
          systemInstructions: existing.systemInstructions,
          enabledTools: existing.enabledTools || [],
          actionPermissions: existing.actionPermissions || {},
          executionBehavior: existing.executionBehavior || {},
          outputPreferences: existing.outputPreferences || {},
          memorySettings: existing.memorySettings || {},
          isSystem: false,
          isDraft: false,
          isActive: true,
        },
      });

      return sendSuccess(res, { agent: duplicated }, 'Agent duplicated successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  public async deleteAgent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const agentId = String(req.params.id);

      const existing: any = await prisma.agent.findFirst({
        where: { id: agentId, userId },
      });

      if (!existing) {
        throw new AppError('Agent not found or access denied', 404, 'AGENT_NOT_FOUND');
      }

      if (existing.isSystem) {
        throw new AppError(
          `System agent "${existing.name}" is a protected core Anavya specialist and cannot be deleted. You can customize its instructions or disable it instead.`,
          403,
          'SYSTEM_AGENT_PROTECTED'
        );
      }

      await prisma.agent.delete({
        where: { id: existing.id },
      });

      return sendSuccess(res, { deletedId: existing.id }, 'Custom agent deleted successfully');
    } catch (err) {
      next(err);
    }
  }

  public async testAgent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await specialistAgentService.testAgent(userId, req.body);
      return sendSuccess(res, { testResult: result }, 'Agent test completed successfully');
    } catch (err) {
      next(err);
    }
  }
}

export const agentController = new AgentController();
