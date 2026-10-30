import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';
import { approvalService } from '../services/approvals/approval.service';

export class ApprovalController {
  public async listApprovals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const status = req.query.status ? String(req.query.status) : undefined;
      const approvals = await approvalService.listApprovals(userId, status);
      return sendSuccess(res, { approvals }, 'Approvals retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async listPending(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const approvals = await approvalService.listPendingApprovals(userId);
      return sendSuccess(res, { approvals }, 'Pending approvals retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async getApprovalById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const approvalId = String(req.params.id);
      const approval = await approvalService.getApprovalById(userId, approvalId);
      return sendSuccess(res, { approval }, 'Approval retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async approve(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const approvalId = String(req.params.id);
      const reason = req.body?.reason || 'Approved by authenticated user';
      const editedDraft = req.body?.editedDraft;

      const result = await approvalService.approveAction(userId, approvalId, reason, editedDraft);
      return sendSuccess(res, result, 'Action approved and executed');
    } catch (err) {
      next(err);
    }
  }

  public async reject(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const approvalId = String(req.params.id);
      const reason = req.body?.reason || 'Rejected by authenticated user';

      const result = await approvalService.rejectAction(userId, approvalId, reason);
      return sendSuccess(res, result, 'Action rejected and workflow terminated');
    } catch (err) {
      next(err);
    }
  }
}

export const approvalController = new ApprovalController();
