import { query, withTransaction } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

export const listOrganizations = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.isSuperAdmin;
    let sql;
    let params = [];

    if (isSuperAdmin) {
      sql = `
        SELECT o.*, u.full_name AS main_admin_name, u.email AS main_admin_email,
               (SELECT COUNT(*) FROM tournaments t WHERE t.organization_id = o.id) AS tournaments_count
        FROM organizations o
        LEFT JOIN users u ON o.main_admin_user_id = u.id
        ORDER BY o.created_at DESC
      `;
    } else {
      sql = `
        SELECT o.*, u.full_name AS main_admin_name, u.email AS main_admin_email,
               (SELECT COUNT(*) FROM tournaments t WHERE t.organization_id = o.id) AS tournaments_count
        FROM organizations o
        JOIN organization_memberships om ON o.id = om.organization_id
        LEFT JOIN users u ON o.main_admin_user_id = u.id
        WHERE om.user_id = $1 AND om.membership_status = 'ACTIVE'
        ORDER BY o.created_at DESC
      `;
      params = [req.user.id];
    }

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const getOrganizationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT o.*, u.full_name AS main_admin_name, u.email AS main_admin_email
       FROM organizations o
       LEFT JOIN users u ON o.main_admin_user_id = u.id
       WHERE o.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Organización no encontrada' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const createOrganization = async (req, res, next) => {
  try {
    const { legal_name, commercial_name, tax_id, address, city, country, phone, email, logo_url } = req.body;
    const adminUserId = req.body.main_admin_user_id || req.user.id;

    const result = await withTransaction(async (client) => {
      // 1. Create organization
      const orgRes = await client.query(
        `INSERT INTO organizations (
           legal_name, commercial_name, tax_id, address, city, country, phone, email, logo_url, status, main_admin_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', $10)
         RETURNING *`,
        [legal_name, commercial_name, tax_id, address, city, country, phone, email, logo_url, adminUserId]
      );
      const newOrg = orgRes.rows[0];

      // 2. Add creator to organization_memberships
      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, membership_status)
         VALUES ($1, $2, 'ACTIVE')
         ON CONFLICT (organization_id, user_id) DO UPDATE SET membership_status = 'ACTIVE'`,
        [newOrg.id, adminUserId]
      );

      // 3. Assign ORG_ADMIN role if not present
      const roleRes = await client.query(`SELECT id FROM roles WHERE code = 'ORG_ADMIN'`);
      if (roleRes.rows.length > 0) {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id, organization_id, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT DO NOTHING`,
          [adminUserId, roleRes.rows[0].id, newOrg.id]
        );
      }

      await logAudit({
        client,
        organizationId: newOrg.id,
        userId: req.user.id,
        action: 'CREATE_ORGANIZATION',
        entityName: 'organizations',
        entityId: newOrg.id,
        newValues: newOrg,
        reason: 'Creación de nueva organización SaaS',
        req,
      });

      return newOrg;
    });

    res.status(201).json({
      success: true,
      message: 'Organización creada exitosamente',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrganization = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { legal_name, commercial_name, tax_id, address, city, country, phone, email, logo_url, main_admin_user_id } = req.body;

    const oldRes = await query('SELECT * FROM organizations WHERE id = $1', [id]);
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Organización no encontrada' });
    }

    const updated = await query(
      `UPDATE organizations
       SET legal_name = COALESCE($1, legal_name),
           commercial_name = COALESCE($2, commercial_name),
           tax_id = COALESCE($3, tax_id),
           address = COALESCE($4, address),
           city = COALESCE($5, city),
           country = COALESCE($6, country),
           phone = COALESCE($7, phone),
           email = COALESCE($8, email),
           logo_url = COALESCE($9, logo_url),
           main_admin_user_id = COALESCE($10, main_admin_user_id)
       WHERE id = $11
       RETURNING *`,
      [legal_name, commercial_name, tax_id, address, city, country, phone, email, logo_url, main_admin_user_id, id]
    );

    await logAudit({
      organizationId: id,
      userId: req.user.id,
      action: 'UPDATE_ORGANIZATION',
      entityName: 'organizations',
      entityId: id,
      oldValues: oldRes.rows[0],
      newValues: updated.rows[0],
      reason: 'Actualización de datos de la organización',
      req,
    });

    res.json({
      success: true,
      message: 'Organización actualizada exitosamente',
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrganizationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // ACTIVE, INACTIVE, SUSPENDED

    const updated = await query(
      `UPDATE organizations SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Organización no encontrada' });
    }

    await logAudit({
      organizationId: id,
      userId: req.user.id,
      action: 'CHANGE_STATUS_ORGANIZATION',
      entityName: 'organizations',
      entityId: id,
      newValues: { status },
      reason: `Cambio de estado a ${status}`,
      req,
    });

    res.json({
      success: true,
      message: `Estado de la organización actualizado a ${status}`,
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const listOrganizationMembers = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT om.id AS membership_id, om.membership_status, om.joined_at,
              u.id AS user_id, u.email, u.full_name, u.phone, u.avatar_url,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('role_code', r.code, 'role_name', r.name)) 
                FILTER (WHERE r.id IS NOT NULL), '[]'
              ) AS roles
       FROM organization_memberships om
       JOIN users u ON om.user_id = u.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND (ur.organization_id = om.organization_id OR ur.organization_id IS NULL)
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE om.organization_id = $1
       GROUP BY om.id, om.membership_status, om.joined_at, u.id, u.email, u.full_name, u.phone, u.avatar_url
       ORDER BY om.joined_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const addOrganizationMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, role_code } = req.body;

    const userRes = await query('SELECT id, email, full_name FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'El usuario con ese correo electrónico no existe' });
    }

    const memberUser = userRes.rows[0];

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, membership_status)
         VALUES ($1, $2, 'ACTIVE')
         ON CONFLICT (organization_id, user_id) DO UPDATE SET membership_status = 'ACTIVE'`,
        [id, memberUser.id]
      );

      if (role_code) {
        const roleRes = await client.query('SELECT id FROM roles WHERE code = $1', [role_code]);
        if (roleRes.rows.length > 0) {
          await client.query(
            `INSERT INTO user_roles (user_id, role_id, organization_id, is_active)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT DO NOTHING`,
            [memberUser.id, roleRes.rows[0].id, id]
          );
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Miembro asignado a la organización con éxito',
      data: memberUser,
    });
  } catch (error) {
    next(error);
  }
};

