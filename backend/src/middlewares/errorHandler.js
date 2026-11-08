import { config } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  console.error('Unhandled API Error:', err);

  // PostgreSQL Error Handling
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'Conflicto: Ya existe un registro con esos datos únicos.',
      detail: err.detail,
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Error de integridad referencial: El recurso relacionado no existe o está siendo utilizado.',
      detail: err.detail,
    });
  }

  if (err.code === '23514') {
    return res.status(400).json({
      success: false,
      message: 'Violación de regla o restricción de datos (CHECK constraint).',
      detail: err.detail,
    });
  }

  if (err.code === '22P02') {
    return res.status(400).json({
      success: false,
      message: 'Formato de identificador o dato no válido (ej. UUID inválido).',
      detail: err.message,
    });
  }

  // Stored procedure / function RAISE EXCEPTION
  if (err.code === 'P0001') {
    return res.status(400).json({
      success: false,
      message: err.message || 'Error en la ejecución de la regla de negocio de la base de datos.',
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
  });
};

