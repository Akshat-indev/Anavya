import { prisma } from '../../config/db';
import { MemoryCategory } from '../../types';
import { AppError } from '../../utils/errors';

const SECRET_PATTERNS = [
  /password\s*[:=]\s*\S+/i,
  /api[_-]?key\s*[:=]\s*\S+/i,
  /secret\s*[:=]\s*\S+/i,
  /jwt[_-]?secret\s*[:=]\s*\S+/i,
  /ai_studio_api_key/i,
  /AIza[0-9A-Za-z-_]{35}/,
];

export class MemoryService {
  private ensureNoSecrets(content: string): void {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        throw new AppError(
          'Security violation: Memory content cannot contain passwords, API keys, or secrets.',
          400,
          'SECRET_STORAGE_FORBIDDEN'
        );
      }
    }
  }

  public async createMemory(
    userId: string,
    category: MemoryCategory,
    content: string,
    metadata?: Record<string, any>
  ) {
    this.ensureNoSecrets(content);
    return prisma.memory.create({
      data: {
        userId,
        category,
        content,
        metadata: metadata ?? {},
      },
    });
  }

  public async listMemories(
    userId: string,
    options?: { category?: MemoryCategory; search?: string; page?: number; limit?: number }
  ) {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (options?.category) {
      where.category = options.category;
    }
    if (options?.search && options.search.trim() !== '') {
      where.content = {
        contains: options.search.trim(),
        mode: 'insensitive',
      };
    }

    const [items, total] = await Promise.all([
      prisma.memory.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.memory.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async retrieveRelevantMemories(userId: string, objective: string) {
    const allUserMemories = await prisma.memory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    const keywords = objective
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);

    const scored = allUserMemories.map((mem: any) => {
      let score = 0;
      if (mem.category === 'user_preference' || mem.category === 'workflow_instruction') {
        score += 3; // Always prioritize user preferences and instructions
      }
      const lowerContent = mem.content.toLowerCase();
      for (const kw of keywords) {
        if (lowerContent.includes(kw)) {
          score += 2;
        }
      }
      if (mem.category === 'task_summary') {
        score += 1;
      }
      return { mem, score };
    });

    return scored
      .filter((s: any) => s.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 6)
      .map((s: any) => ({
        id: s.mem.id,
        category: s.mem.category,
        content: s.mem.content,
      }));
  }

  public async updateMemory(
    userId: string,
    memoryId: string,
    updates: { category?: MemoryCategory; content?: string; metadata?: Record<string, any> }
  ) {
    const existing = await prisma.memory.findFirst({
      where: { id: memoryId, userId },
    });
    if (!existing) {
      throw new AppError('Memory record not found or access denied', 404, 'MEMORY_NOT_FOUND');
    }

    if (updates.content) {
      this.ensureNoSecrets(updates.content);
    }

    return prisma.memory.update({
      where: { id: existing.id },
      data: {
        ...(updates.category ? { category: updates.category } : {}),
        ...(updates.content ? { content: updates.content } : {}),
        ...(updates.metadata !== undefined ? { metadata: updates.metadata } : {}),
      },
    });
  }

  public async deleteMemory(userId: string, memoryId: string) {
    const existing = await prisma.memory.findFirst({
      where: { id: memoryId, userId },
    });
    if (!existing) {
      throw new AppError('Memory record not found or access denied', 404, 'MEMORY_NOT_FOUND');
    }

    await prisma.memory.delete({
      where: { id: existing.id },
    });

    return { deletedId: existing.id };
  }
}

export const memoryService = new MemoryService();
