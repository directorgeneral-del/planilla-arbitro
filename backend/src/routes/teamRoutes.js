import { Router } from 'express';
import { body, param } from 'express-validator';
import * as teamController from '../controllers/teamController.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

// Teams
router.get('/', optionalAuth, teamController.listTeams);
router.get('/:id', optionalAuth, [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors], teamController.getTeamById);

router.post(
  '/',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('organization_id').isUUID().withMessage('UUID de organización válido requerido'),
    body('name').trim().notEmpty().withMessage('Nombre de equipo requerido'),
    handleValidationErrors,
  ],
  teamController.createTeam
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'DELEGATE'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    handleValidationErrors,
  ],
  teamController.updateTeam
);

// Team entries
router.get('/entries/all', optionalAuth, teamController.listTeamEntries);

router.post(
  '/entries',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('category_id').isUUID().withMessage('UUID de categoría requerido'),
    body('team_id').isUUID().withMessage('UUID de equipo requerido'),
    handleValidationErrors,
  ],
  teamController.registerTeamToCategory
);

router.patch(
  '/entries/:id/status',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    body('registration_status').isIn(['PENDING', 'CONFIRMED', 'REJECTED', 'WITHDRAWN']).withMessage('Estado inválido'),
    handleValidationErrors,
  ],
  teamController.updateTeamEntryStatus
);

export default router;

