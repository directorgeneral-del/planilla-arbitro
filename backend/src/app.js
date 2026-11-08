import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../frontend');

const app = express();

// Security and HTTP headers (Permit CDN assets for mobile referee frontend)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

// CORS Configuration
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Web App for Referee Digital Match Sheet (Mobile)
app.use('/referee', express.static(frontendDir));
app.use('/app', express.static(frontendDir));

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Plataforma SaaS Multi-Tenant para Administración Integral de Torneos de Fútbol API',
    version: '1.0.0',
    referee_mobile_app: '/referee',
    documentation: '/api/health',
    endpoints: {
      auth: '/api/auth',
      organizations: '/api/organizations',
      seasons: '/api/seasons',
      tournaments: '/api/tournaments',
      categories: '/api/categories',
      teams: '/api/teams',
      players: '/api/players',
      competitions: '/api/competitions',
      venues: '/api/venues',
      referees: '/api/referees',
      matches: '/api/matches',
      standings: '/api/standings',
      disciplinary: '/api/disciplinary',
      financial: '/api/financial',
      audit: '/api/audit',
    },
  });
});

// Mount Main API Router
app.use('/api', apiRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;

