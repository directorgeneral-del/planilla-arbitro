import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Correo electrónico válido requerido'),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
    body('full_name').trim().notEmpty().withMessage('El nombre completo es requerido'),
    handleValidationErrors,
  ],
  authController.register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Correo electrónico válido requerido'),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
    handleValidationErrors,
  ],
  authController.login
);

router.get('/me', authenticateToken, authController.getProfile);
router.put('/profile', authenticateToken, authController.updateProfile);
router.put(
  '/change-password',
  authenticateToken,
  [
    body('currentPassword').notEmpty().withMessage('Contraseña actual requerida'),
    body('newPassword').isLength({ min: 6 }).withMessage('Nueva contraseña de al menos 6 caracteres requerida'),
    handleValidationErrors,
  ],
  authController.changePassword
);

export default router;

