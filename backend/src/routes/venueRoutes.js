import { Router } from 'express';
import { body, param } from 'express-validator';
import * as venueController from '../controllers/venueController.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

router.get('/', optionalAuth, venueController.listVenues);
router.get('/:id', optionalAuth, [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors], venueController.getVenueById);

router.post(
  '/',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  [
    body('organization_id').isUUID().withMessage('UUID de organización válido requerido'),
    body('name').trim().notEmpty().withMessage('Nombre de la cancha requerido'),
    handleValidationErrors,
  ],
  venueController.createVenue
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors],
  venueController.updateVenue
);

router.post(
  '/:id/blocked-slots',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID de cancha inválido'),
    body('start_time').isISO8601().withMessage('Fecha/hora de inicio ISO8601 válida requerida'),
    body('end_time').isISO8601().withMessage('Fecha/hora de fin ISO8601 válida requerida'),
    handleValidationErrors,
  ],
  venueController.addBlockedSlot
);

router.post(
  '/:id/check-conflict',
  optionalAuth,
  [
    param('id').isUUID().withMessage('UUID de cancha inválido'),
    body('start_time').isISO8601().withMessage('Fecha/hora inicio válida requerida'),
    body('end_time').isISO8601().withMessage('Fecha/hora fin válida requerida'),
    handleValidationErrors,
  ],
  venueController.checkVenueConflict
);

export default router;

