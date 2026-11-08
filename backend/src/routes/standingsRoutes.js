import { Router } from 'express';
import { param } from 'express-validator';
import * as standingsController from '../controllers/standingsController.js';
import { optionalAuth } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validate.js';

const router = Router();

// Publicly readable statistics & standings
router.get('/groups/:groupId/standings', optionalAuth, [param('groupId').isUUID(), handleValidationErrors], standingsController.getGroupStandings);
router.get('/categories/:categoryId/standings', optionalAuth, [param('categoryId').isUUID(), handleValidationErrors], standingsController.getCategoryStandings);
router.get('/tournaments/:tournamentId/top-scorers', optionalAuth, [param('tournamentId').isUUID(), handleValidationErrors], standingsController.getTopScorers);
router.get('/categories/:categoryId/fair-play', optionalAuth, [param('categoryId').isUUID(), handleValidationErrors], standingsController.getFairPlay);
router.get('/tournaments/:tournamentId/overview', optionalAuth, [param('tournamentId').isUUID(), handleValidationErrors], standingsController.getTournamentOverview);

export default router;

