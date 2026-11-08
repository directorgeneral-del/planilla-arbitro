import { Router } from 'express';
import { body, param } from 'express-validator';
import * as categoryController from '../controllers/categoryController.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

router.get('/', optionalAuth, categoryController.listCategories);
router.get('/:id', optionalAuth, [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors], categoryController.getCategoryById);

router.post(
  '/',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('tournament_id').isUUID().withMessage('UUID de torneo inválido'),
    body('name').trim().notEmpty().withMessage('El nombre de la categoría es requerido'),
    handleValidationErrors,
  ],
  categoryController.createCategory
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    handleValidationErrors,
  ],
  categoryController.updateCategory
);

export default router;

