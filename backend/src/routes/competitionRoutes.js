import { Router } from 'express';
import { body, param } from 'express-validator';
import * as compController from '../controllers/competitionController.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

// Phases
router.get('/phases', optionalAuth, compController.listPhases);
router.post(
  '/phases',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('category_id').isUUID().withMessage('UUID de categoría inválido'),
    body('name').trim().notEmpty().withMessage('Nombre de fase requerido'),
    body('phase_type').isIn([
      'GROUP_STAGE', 'QUALIFICATION', 'ROUND_OF_32', 'ROUND_OF_16',
      'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL', 'CUSTOM'
    ]).withMessage('Tipo de fase inválido'),
    handleValidationErrors,
  ],
  compController.createPhase
);

// Groups
router.get('/groups', optionalAuth, compController.listGroups);
router.post(
  '/groups',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('phase_id').isUUID().withMessage('UUID de fase inválido'),
    body('name').trim().notEmpty().withMessage('Nombre de grupo requerido'),
    handleValidationErrors,
  ],
  compController.createGroup
);

router.post(
  '/groups/:groupId/teams',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    param('groupId').isUUID().withMessage('UUID de grupo inválido'),
    body('team_entry_id').isUUID().withMessage('UUID de inscripción de equipo inválido'),
    handleValidationErrors,
  ],
  compController.assignTeamToGroup
);

router.delete(
  '/groups/:groupId/teams/:teamEntryId',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    param('groupId').isUUID().withMessage('UUID de grupo inválido'),
    param('teamEntryId').isUUID().withMessage('UUID de equipo inválido'),
    handleValidationErrors,
  ],
  compController.removeTeamFromGroup
);

// Brackets & Ties
router.get('/brackets', optionalAuth, compController.listBrackets);
router.post(
  '/brackets',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('phase_id').isUUID().withMessage('UUID de fase inválido'),
    body('name').trim().notEmpty().withMessage('Nombre de bracket requerido'),
    handleValidationErrors,
  ],
  compController.createBracket
);

router.get('/ties', optionalAuth, compController.listTies);
router.post(
  '/ties',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('phase_id').isUUID().withMessage('UUID de fase inválido'),
    body('round_name').trim().notEmpty().withMessage('Nombre de la ronda requerido'),
    handleValidationErrors,
  ],
  compController.createTie
);

export default router;

