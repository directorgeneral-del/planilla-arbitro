import { Router } from 'express';
import { body, param } from 'express-validator';
import * as seasonController from '../controllers/seasonController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/roles.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

router.use(authenticateToken);

router.get('/', seasonController.listSeasons);
router.get('/:id', [param('id').isUUID().withMessage('UUID de temporada inválido'), handleValidationErrors], seasonController.getSeasonById);

router.post(
  '/',
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  [
    body('organization_id').isUUID().withMessage('UUID de organización válido requerido'),
    body('name').trim().notEmpty().withMessage('El nombre de la temporada es requerido'),
    body('year').isInt({ min: 2000, max: 2100 }).withMessage('Año válido requerido (2000-2100)'),
    handleValidationErrors,
  ],
  seasonController.createSeason
);

router.put(
  '/:id',
  authorizeRoles('SUPERADMIN', 'ORG_ADMIN'),
  [
    param('id').isUUID().withMessage('UUID de temporada inválido'),
    handleValidationErrors,
  ],
  seasonController.updateSeason
);

export default router;

