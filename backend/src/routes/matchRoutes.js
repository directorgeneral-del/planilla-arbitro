import { Router } from 'express';
import { body, param } from 'express-validator';
import * as matchController from '../controllers/matchController.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

// Match listing & details (Public & Protected)
router.get('/', optionalAuth, matchController.listMatches);
router.get('/:id', optionalAuth, [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors], matchController.getMatchById);

// Match Scheduling
router.post(
  '/',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('category_id').isUUID().withMessage('UUID de categoría inválido'),
    body('home_team_entry_id').isUUID().withMessage('UUID del equipo local inválido'),
    body('away_team_entry_id').isUUID().withMessage('UUID del equipo visitante inválido'),
    handleValidationErrors,
  ],
  matchController.createMatch
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [param('id').isUUID().withMessage('UUID inválido'), handleValidationErrors],
  matchController.updateMatch
);

router.patch(
  '/:id/status',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'REFEREE'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    body('status')
      .isIn(['SCHEDULED', 'IN_PROGRESS', 'PLAYED', 'IN_REVIEW', 'POSTPONED', 'CANCELLED'])
      .withMessage('Estado de partido inválido'),
    handleValidationErrors,
  ],
  matchController.updateMatchStatus
);

// Match Referees
router.post(
  '/:id/referees',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID de partido inválido'),
    body('referee_id').isUUID().withMessage('UUID de árbitro inválido'),
    handleValidationErrors,
  ],
  matchController.assignRefereeToMatch
);

router.delete(
  '/:id/referees/:refereeId',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    param('refereeId').isUUID().withMessage('UUID inválido'),
    handleValidationErrors,
  ],
  matchController.removeRefereeFromMatch
);

// Lineups (Planilla)
router.post(
  '/:id/lineups',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'REFEREE'),
  [
    param('id').isUUID().withMessage('UUID de partido inválido'),
    body('team_entry_id').isUUID().withMessage('UUID de equipo requerido'),
    body('players').isArray().withMessage('Arreglo de alineación requerido'),
    handleValidationErrors,
  ],
  matchController.saveMatchLineup
);

// Match Events (Goals, Cards, Substitutions)
router.post(
  '/:id/events',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'REFEREE'),
  [
    param('id').isUUID().withMessage('UUID de partido inválido'),
    body('team_entry_id').isUUID().withMessage('UUID del equipo requerido'),
    body('event_type').isIn([
      'GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SECOND_YELLOW_CARD',
      'SUBSTITUTION', 'FIGHT', 'FIELD_ABANDONMENT', 'DEFAULT_NO_SHOW', 'INCIDENT', 'CUSTOM'
    ]).withMessage('Tipo de evento inválido'),
    body('minute').isInt({ min: 0, max: 150 }).withMessage('Minuto válido requerido (0-150)'),
    handleValidationErrors,
  ],
  matchController.addMatchEvent
);

router.delete(
  '/:id/events/:eventId',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'REFEREE'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    param('eventId').isUUID().withMessage('UUID de evento inválido'),
    handleValidationErrors,
  ],
  matchController.deleteMatchEvent
);

// Penalties
router.post(
  '/:id/penalties',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'REFEREE'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    body('team_entry_id').isUUID().withMessage('UUID de equipo requerido'),
    body('sequence_number').isInt({ min: 1 }).withMessage('Número de secuencia requerido'),
    body('result').isIn(['SCORED', 'MISSED', 'SAVED']).withMessage('Resultado inválido'),
    handleValidationErrors,
  ],
  matchController.recordPenaltyShootout
);

// Sheet Status (Planilla)
router.patch(
  '/:id/sheet-status',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'REFEREE'),
  [
    param('id').isUUID().withMessage('UUID inválido'),
    body('sheet_status').isIn(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED']).withMessage('Estado de planilla inválido'),
    handleValidationErrors,
  ],
  matchController.updateSheetStatus
);

// Match Officialization (RF-13)
router.post(
  '/:id/officialize',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [param('id').isUUID().withMessage('UUID de partido inválido'), handleValidationErrors],
  matchController.officializeMatch
);

export default router;

