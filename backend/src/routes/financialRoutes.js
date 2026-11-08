import { Router } from 'express';
import { body, param } from 'express-validator';
import * as finController from '../controllers/financialController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

router.use(authenticateToken);

// Charges
router.get('/charges', finController.listCharges);
router.post(
  '/charges',
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('organization_id').isUUID().withMessage('UUID de organización inválido'),
    body('tournament_id').isUUID().withMessage('UUID de torneo inválido'),
    body('team_entry_id').isUUID().withMessage('UUID de equipo requerido'),
    body('title').trim().notEmpty().withMessage('Concepto o título del cargo requerido'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Monto válido requerido mayor a cero'),
    handleValidationErrors,
  ],
  finController.createCharge
);

// Payments
router.get('/payments', finController.listPayments);
router.post(
  '/payments',
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN'),
  [
    body('organization_id').isUUID().withMessage('UUID de organización inválido'),
    body('tournament_id').isUUID().withMessage('UUID de torneo inválido'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Monto de pago requerido'),
    body('payment_method').isIn(['CASH', 'TRANSFER', 'DEPOSIT', 'OTHER']).withMessage('Medio de pago inválido'),
    handleValidationErrors,
  ],
  finController.registerPayment
);

router.post(
  '/payments/:id/reverse',
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID de pago inválido'),
    body('reversal_reason').trim().notEmpty().withMessage('Motivo de anulación/reverso requerido'),
    handleValidationErrors,
  ],
  finController.reversePayment
);

// Team Account Statement (Private access: Admin or Delegate)
router.get(
  '/statement/:teamEntryId',
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN', 'TOURNAMENT_ADMIN', 'DELEGATE'),
  [param('teamEntryId').isUUID().withMessage('UUID de equipo inválido'), handleValidationErrors],
  finController.getTeamAccountStatement
);

export default router;

