import { Router } from 'express';
import * as auditController from '../controllers/auditController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';

const router = Router();

// Only Superadmins and Organization Admins can query audit logs
router.get(
  '/',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  auditController.listAuditLogs
);

export default router;

