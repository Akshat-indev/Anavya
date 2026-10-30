import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json']);
const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

export class WorkspaceService {
  private rootDir: string;

  constructor() {
    this.rootDir = path.resolve(process.cwd(), env.WORKSPACE_ROOT, 'users');
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  public getUserWorkspaceDir(userId: string): string {
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUserId || safeUserId !== userId) {
      throw new AppError('Invalid user ID for workspace access', 400, 'INVALID_USER_ID');
    }
    const userDir = path.resolve(this.rootDir, safeUserId);
    if (!userDir.startsWith(this.rootDir)) {
      throw new AppError('Path traversal detected', 403, 'PATH_TRAVERSAL_BLOCKED');
    }
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }

  public sanitizeFilename(filename: string): string {
    const base = path.basename(filename);
    const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!cleaned || cleaned === '.' || cleaned === '..') {
      throw new AppError('Invalid filename', 400, 'INVALID_FILENAME');
    }
    const ext = path.extname(cleaned).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new AppError(
        `Unsupported file extension '${ext}'. Allowed types: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`,
        400,
        'UNSUPPORTED_FILE_TYPE'
      );
    }
    return cleaned;
  }

  public resolveSafeUserFilePath(userId: string, filename: string): string {
    const userDir = this.getUserWorkspaceDir(userId);
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new AppError('Path traversal attempt blocked', 403, 'PATH_TRAVERSAL_BLOCKED');
    }
    const safeName = this.sanitizeFilename(filename);
    const fullPath = path.resolve(userDir, safeName);
    if (!fullPath.startsWith(userDir + path.sep) && fullPath !== userDir) {
      throw new AppError('Path traversal attempt blocked', 403, 'PATH_TRAVERSAL_BLOCKED');
    }
    return fullPath;
  }

  public async saveUploadedFile(
    userId: string,
    originalName: string,
    mimeType: string,
    buffer: Buffer
  ) {
    const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new AppError(
        `File exceeds maximum size of ${env.MAX_UPLOAD_SIZE_MB}MB`,
        400,
        'FILE_TOO_LARGE'
      );
    }

    const safeName = this.sanitizeFilename(originalName);
    const ext = path.extname(safeName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new AppError('Unsupported file type', 400, 'UNSUPPORTED_FILE_TYPE');
    }

    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType) && !mimeType.startsWith('text/')) {
      throw new AppError(`Unsupported MIME type: ${mimeType}`, 400, 'UNSUPPORTED_MIME_TYPE');
    }

    const fullPath = this.resolveSafeUserFilePath(userId, safeName);
    fs.writeFileSync(fullPath, buffer);

    const resolvedMime =
      ext === '.csv'
        ? 'text/csv'
        : ext === '.md'
        ? 'text/markdown'
        : ext === '.json'
        ? 'application/json'
        : 'text/plain';

    const existing = await prisma.workspaceFile.findFirst({
      where: { userId, filename: safeName },
    });

    if (existing) {
      return prisma.workspaceFile.update({
        where: { id: existing.id },
        data: {
          storagePath: fullPath,
          mimeType: resolvedMime,
          size: buffer.length,
        },
      });
    }

    return prisma.workspaceFile.create({
      data: {
        userId,
        filename: safeName,
        storagePath: fullPath,
        mimeType: resolvedMime,
        size: buffer.length,
      },
    });
  }

  public async writeGeneratedFile(
    userId: string,
    filename: string,
    content: string
  ) {
    const buffer = Buffer.from(content, 'utf-8');
    return this.saveUploadedFile(userId, filename, 'text/plain', buffer);
  }

  public async listUserFiles(userId: string) {
    return prisma.workspaceFile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async getFileById(userId: string, fileId: string) {
    const file = await prisma.workspaceFile.findFirst({
      where: { id: fileId, userId },
    });
    if (!file) {
      throw new AppError('Workspace file not found or access denied', 404, 'FILE_NOT_FOUND');
    }
    return file;
  }

  public async readFileContentById(userId: string, fileId: string): Promise<{ file: any; content: string }> {
    const file = await this.getFileById(userId, fileId);
    if (!fs.existsSync(file.storagePath)) {
      throw new AppError('File missing on disk', 404, 'FILE_MISSING_ON_DISK');
    }
    const content = fs.readFileSync(file.storagePath, 'utf-8');
    return { file, content };
  }

  public async readFileContentByName(userId: string, filename: string): Promise<{ file: any; content: string }> {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new AppError('Path traversal attempt blocked', 403, 'PATH_TRAVERSAL_BLOCKED');
    }

    let file = await prisma.workspaceFile.findFirst({
      where: { userId, filename },
    });

    if (!file) {
      // Fallback: if only 1 CSV exists and tool requested a generic csv name, find matching extension
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.csv') {
        file = await prisma.workspaceFile.findFirst({
          where: { userId, filename: { endsWith: '.csv' } },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    if (!file) {
      throw new AppError(`Workspace file '${filename}' not found for user`, 404, 'FILE_NOT_FOUND');
    }

    const userDir = this.getUserWorkspaceDir(userId);
    const resolvedPath = path.resolve(file.storagePath);
    if (!resolvedPath.startsWith(userDir)) {
      throw new AppError('Path traversal blocked', 403, 'PATH_TRAVERSAL_BLOCKED');
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new AppError('File missing on disk', 404, 'FILE_MISSING_ON_DISK');
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    return { file, content };
  }

  public async deleteFile(userId: string, fileId: string) {
    const file = await this.getFileById(userId, fileId);
    if (fs.existsSync(file.storagePath)) {
      fs.unlinkSync(file.storagePath);
    }
    await prisma.workspaceFile.delete({
      where: { id: file.id },
    });
    return { deletedId: file.id, filename: file.filename };
  }
}

export const workspaceService = new WorkspaceService();

