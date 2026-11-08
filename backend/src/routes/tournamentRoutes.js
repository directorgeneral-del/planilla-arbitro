import { Router } from 'express';
import { body, param } from 'express-validator';
import * as tournamentController from '../controllers/tournamentController.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

// Public can view tournaments
router.get('/', optionalAuth, tournamentController.listTournaments);
router.get('/:id', optionalAuth, [param('id').isUUID().withMessage('UUID de torneo inválido'), handleValidationErrors], tournamentController.getTournamentById);

// Protected administration endpoints
router.post(
  '/',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('organization_id').isUUID().withMessage('UUID de organización válido requerido'),
    body('name').trim().notEmpty().withMessage('El nombre del torneo es requerido'),
    handleValidationErrors,
  ],
  tournamentController.createTournament
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    handleValidationErrors,
  ],
  tournamentController.updateTournament
);

router.patch(
  '/:id/status',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    body('status')
      .isIn(['DRAFT', 'REGISTRATION_OPEN', 'IN_PREPARATION', 'IN_PROGRESS', 'SUSPENDED', 'FINISHED', 'ARCHIVED'])
      .withMessage('Estado de torneo inválido'),
    handleValidationErrors,
  ],
  tournamentController.updateTournamentStatus
);

export default router;

