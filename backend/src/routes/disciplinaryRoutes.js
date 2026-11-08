import { Router } from 'express';
import { body, param } from 'express-validator';
import * as discController from '../controllers/disciplinaryController.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

// Sanction Rules
router.get('/rules', optionalAuth, discController.listSanctionRules);
router.post(
  '/rules',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('tournament_id').isUUID().withMessage('UUID de torneo inválido'),
    body('infraction_type').notEmpty().withMessage('Tipo de infracción requerido'),
    handleValidationErrors,
  ],
  discController.createSanctionRule
);

// Sanctions
router.get('/', optionalAuth, discController.listSanctions);
router.post(
  '/',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('description').trim().notEmpty().withMessage('Descripción de la sanción requerida'),
    handleValidationErrors,
  ],
  discController.createManualSanction
);

// Deductions
router.get('/deductions', optionalAuth, discController.listDeductions);
router.post(
  '/deductions',
  authenticateToken,
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('category_id').isUUID().withMessage('UUID de categoría inválido'),
    body('team_entry_id').isUUID().withMessage('UUID de equipo inválido'),
    body('points').isInt({ min: 1, max: 50 }).withMessage('Puntos a deducir válidos requeridos'),
    body('reason').trim().notEmpty().withMessage('Motivo de la deducción requerido'),
    handleValidationErrors,
  ],
  discController.createManualDeduction
);

export default router;

