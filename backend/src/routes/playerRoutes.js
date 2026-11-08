import { Router } from 'express';
import { body, param } from 'express-validator';
import * as playerController from '../controllers/playerController.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

// Players catalog
router.get('/', optionalAuth, playerController.listPlayers);
router.get('/:id', optionalAuth, [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors], playerController.getPlayerById);

router.post(
  '/',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'DELEGATE'),
  [
    body('first_name').trim().notEmpty().withMessage('Nombres requeridos'),
    body('last_name').trim().notEmpty().withMessage('Apellidos requeridos'),
    body('document_number').trim().notEmpty().withMessage('Número de documento requerido'),
    handleValidationErrors,
  ],
  playerController.createPlayer
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'DELEGATE'),
  [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors],
  playerController.updatePlayer
);

// Player Registrations (Roster)
router.get('/roster/:teamEntryId', optionalAuth, [param('teamEntryId').isUUID().withMessage('UUID de entrada inválido'), handleValidationErrors], playerController.getTeamRoster);

router.post(
  '/roster',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'DELEGATE'),
  [
    body('team_entry_id').isUUID().withMessage('UUID de inscripción de equipo requerido'),
    body('player_id').isUUID().withMessage('UUID de jugador requerido'),
    handleValidationErrors,
  ],
  playerController.registerPlayerToTeamEntry
);

router.delete(
  '/roster/:id',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'DELEGATE'),
  [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors],
  playerController.removePlayerFromTeamEntry
);

export default router;

