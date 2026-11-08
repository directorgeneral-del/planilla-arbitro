/**
 * Middleware to authorize specific role codes.
 * Superadmin always bypasses role checks.
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado',
      });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    const userRoleCodes = req.user.roles.map((r) => r.role_code);
    const hasRole = allowedRoles.some((role) => userRoleCodes.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere uno de los siguientes roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Middleware ensuring the user has access to the specified organization (multi-tenant check)
 */
export const requireOrganizationAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }

  if (req.user.isSuperAdmin) {
    return next();
  }

  const targetOrgId = req.organizationId || req.params.orgId || req.params.organizationId;
  if (!targetOrgId) {
    return res.status(400).json({
      success: false,
      message: 'Identificador de organización requerido (Header: x-organization-id o parámetro en ruta)',
    });
  }

  const hasAccess = req.user.organizations.includes(targetOrgId);
  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: 'No tiene permisos para acceder a los datos de esta organización',
    });
  }

  next();
};

