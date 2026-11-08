import { Router } from 'express';
import { body, param } from 'express-validator';
import * as refController from '../controllers/refereeController.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

router.get('/', optionalAuth, refController.listReferees);
router.get('/:id', optionalAuth, [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors], refController.getRefereeById);

router.post(
  '/',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('organization_id').isUUID().withMessage('UUID de organización válido requerido'),
    body('full_name').trim().notEmpty().withMessage('Nombre completo del árbitro requerido'),
    body('email').optional().isEmail().withMessage('Correo electrónico válido'),
    handleValidationErrors,
  ],
  refController.createReferee
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors],
  refController.updateReferee
);

export default router;

