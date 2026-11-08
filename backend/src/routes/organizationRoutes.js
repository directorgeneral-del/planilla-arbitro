import { Router } from 'express';
import { body, param } from 'express-validator';
import * as orgController from '../controllers/organizationController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { authorizeRoles, requireOrganizationAccess } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

router.use(authenticateToken);

router.get('/', orgController.listOrganizations);

router.post(
  '/',
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  [
    body('legal_name').trim().notEmpty().withMessage('Razón social requerida'),
    body('commercial_name').trim().notEmpty().withMessage('Nombre comercial requerido'),
    body('email').optional().isEmail().withMessage('Correo de contacto válido requerido'),
    handleValidationErrors,
  ],
  orgController.createOrganization
);

router.get('/:id', requireOrganizationAccess, orgController.getOrganizationById);

router.put(
  '/:id',
  requireOrganizationAccess,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID de organización inválido'),
    handleValidationErrors,
  ],
  orgController.updateOrganization
);

router.patch(
  '/:id/status',
  authorizeRoles('SUPERADMIN'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    body('status').isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED']).withMessage('Estado inválido'),
    handleValidationErrors,
  ],
  orgController.updateOrganizationStatus
);

router.get('/:id/members', requireOrganizationAccess, orgController.listOrganizationMembers);

router.post(
  '/:id/members',
  requireOrganizationAccess,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  [
    body('email').isEmail().withMessage('Correo electrónico válido requerido'),
    body('role_code').optional().isString(),
    handleValidationErrors,
  ],
  orgController.addOrganizationMember
);

export default router;

