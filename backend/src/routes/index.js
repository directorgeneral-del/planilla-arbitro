import { Router } from 'express';
import authRoutes from './authRoutes.js';
import organizationRoutes from './organizationRoutes.js';
import seasonRoutes from './seasonRoutes.js';
import tournamentRoutes from './tournamentRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import teamRoutes from './teamRoutes.js';
import playerRoutes from './playerRoutes.js';
import competitionRoutes from './competitionRoutes.js';
import venueRoutes from './venueRoutes.js';
import refereeRoutes from './refereeRoutes.js';
import matchRoutes from './matchRoutes.js';
import standingsRoutes from './standingsRoutes.js';
import disciplinaryRoutes from './disciplinaryRoutes.js';
import financialRoutes from './financialRoutes.js';
import auditRoutes from './auditRoutes.js';

const router = Router();

// API Health Check
router.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Torneo Fútbol SaaS REST API',
  });
});

// Domain route groupings
router.use('/auth', authRoutes);
router.use('/organizations', organizationRoutes);
router.use('/seasons', seasonRoutes);
router.use('/tournaments', tournamentRoutes);
router.use('/categories', categoryRoutes);
router.use('/teams', teamRoutes);
router.use('/players', playerRoutes);
router.use('/competitions', competitionRoutes);
router.use('/venues', venueRoutes);
router.use('/referees', refereeRoutes);
router.use('/matches', matchRoutes);
router.use('/standings', standingsRoutes);
router.use('/disciplinary', disciplinaryRoutes);
router.use('/financial', financialRoutes);
router.use('/audit', auditRoutes);

export default router;

