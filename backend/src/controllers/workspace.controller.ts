import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { workspaceService } from '../services/workspace/workspace.service';

export class WorkspaceController {
  public async listFiles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const files = await workspaceService.listUserFiles(userId);
      const formatted = files.map((f: any) => ({
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        size: f.size,
        createdAt: f.createdAt,
        downloadUrl: `/api/v1/workspace/files/${f.id}/download`,
      }));
      return sendSuccess(res, { files: formatted }, 'Workspace files retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async uploadFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      if (!req.file) {
        throw new AppError('No file provided in upload request', 400, 'NO_FILE_UPLOADED');
      }

      const saved = await workspaceService.saveUploadedFile(
        userId,
        req.file.originalname,
        req.file.mimetype,
        req.file.buffer
      );

      return sendSuccess(
        res,
        {
          file: {
            id: saved.id,
            filename: saved.filename,
            mimeType: saved.mimeType,
            size: saved.size,
            createdAt: saved.createdAt,
            downloadUrl: `/api/v1/workspace/files/${saved.id}/download`,
          },
        },
        'File uploaded to workspace successfully',
        201
      );
    } catch (err) {
      next(err);
    }
  }

  public async getFileDetails(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const fileId = String(req.params.id);

      const { file, content } = await workspaceService.readFileContentById(userId, fileId);
      return sendSuccess(
        res,
        {
          file: {
            id: file.id,
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
            createdAt: file.createdAt,
            content,
            downloadUrl: `/api/v1/workspace/files/${file.id}/download`,
          },
        },
        'File details and content retrieved'
      );
    } catch (err) {
      next(err);
    }
  }

  public async downloadFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const fileId = String(req.params.id);

      const { file, content } = await workspaceService.readFileContentById(userId, fileId);
      res.setHeader('Content-Type', file.mimeType || 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      return res.status(200).send(content);
    } catch (err) {
      next(err);
    }
  }

  public async deleteFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const fileId = String(req.params.id);

      const result = await workspaceService.deleteFile(userId, fileId);
      return sendSuccess(res, result, 'Workspace file deleted');
    } catch (err) {
      next(err);
    }
  }
}

export const workspaceController = new WorkspaceController();
