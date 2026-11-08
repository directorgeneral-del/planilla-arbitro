import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { query } from '../config/db.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token de autenticación requerido',
      });
    }

    jwt.verify(token, config.jwt.secret, async (err, decoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: 'Token inválido o expirado',
          error: err.message,
        });
      }

      // Fetch fresh user data with roles and organization memberships
      const userRes = await query(
        `SELECT id, email, full_name, phone, avatar_url, status FROM users WHERE id = $1`,
        [decoded.id]
      );

      if (userRes.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no encontrado o dado de baja',
        });
      }

      const user = userRes.rows[0];
      if (user.status !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          message: `Cuenta no habilitada. Estado actual: ${user.status}`,
        });
      }

      // Fetch user system/organizational roles
      const rolesRes = await query(
        `SELECT r.code AS role_code, ur.organization_id, ur.tournament_id, ur.category_id, ur.team_id
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = $1 AND ur.is_active = TRUE`,
        [user.id]
      );

      // Fetch organization memberships
      const orgsRes = await query(
        `SELECT organization_id, membership_status 
         FROM organization_memberships 
         WHERE user_id = $1 AND membership_status = 'ACTIVE'`,
        [user.id]
      );

      user.roles = rolesRes.rows;
      user.organizations = orgsRes.rows.map((o) => o.organization_id);
      user.isSuperAdmin = rolesRes.rows.some((r) => r.role_code === 'SUPERADMIN');

      req.user = user;

      // Extract multi-tenant organization context from headers or query
      const orgIdHeader = req.headers['x-organization-id'] || req.query.organization_id || req.body?.organization_id;
      if (orgIdHeader) {
        req.organizationId = orgIdHeader;
      }

      next();
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware for public endpoints where user can be guest or logged-in
 */
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, config.jwt.secret, async (err, decoded) => {
    if (!err && decoded?.id) {
      try {
        const userRes = await query(
          `SELECT id, email, full_name, status FROM users WHERE id = $1`,
          [decoded.id]
        );
        if (userRes.rows.length > 0) {
          req.user = userRes.rows[0];
        }
      } catch (e) {
        // Ignore in optional auth
      }
    }
    next();
  });
};

