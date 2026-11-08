import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { config } from '../config/env.js';
import { logAudit } from '../utils/auditLogger.js';

export const register = async (req, res, next) => {
  try {
    const { email, password, full_name, phone, avatar_url, role_code } = req.body;

    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El correo electrónico ya está registrado',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userRes = await query(
      `INSERT INTO users (email, password_hash, full_name, phone, avatar_url, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING id, email, full_name, phone, avatar_url, status, created_at`,
      [email.toLowerCase().trim(), passwordHash, full_name, phone || null, avatar_url || null]
    );

    const newUser = userRes.rows[0];

    // Assign default role if provided (or default to PUBLIC_USER)
    const targetRoleCode = role_code || 'PUBLIC_USER';
    const roleQuery = await query('SELECT id FROM roles WHERE code = $1', [targetRoleCode]);
    if (roleQuery.rows.length > 0) {
      const roleId = roleQuery.rows[0].id;
      await query(
        `INSERT INTO user_roles (user_id, role_id, is_active) VALUES ($1, $2, TRUE)`,
        [newUser.id, roleId]
      );
    }

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, fullName: newUser.full_name },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    await logAudit({
      userId: newUser.id,
      action: 'REGISTER_USER',
      entityName: 'users',
      entityId: newUser.id,
      newValues: { email: newUser.email, full_name: newUser.full_name },
      reason: 'Registro de usuario en la plataforma',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: newUser,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const userRes = await query(
      `SELECT id, email, password_hash, full_name, phone, avatar_url, status FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
    }

    const user = userRes.rows[0];

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: `Cuenta de usuario inactiva o suspendida (${user.status})`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
    }

    // Get roles
    const rolesRes = await query(
      `SELECT r.code, r.name, ur.organization_id, ur.tournament_id, ur.category_id, ur.team_id
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND ur.is_active = TRUE`,
      [user.id]
    );

    // Get organizations
    const orgsRes = await query(
      `SELECT o.id, o.commercial_name, o.legal_name, om.membership_status
       FROM organization_memberships om
       JOIN organizations o ON om.organization_id = o.id
       WHERE om.user_id = $1 AND om.membership_status = 'ACTIVE'`,
      [user.id]
    );

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        roles: rolesRes.rows.map((r) => r.code),
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    delete user.password_hash;

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        user: {
          ...user,
          roles: rolesRes.rows,
          organizations: orgsRes.rows,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const user = req.user;
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { full_name, phone, avatar_url } = req.body;
    const userId = req.user.id;

    const updatedRes = await query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           avatar_url = COALESCE($3, avatar_url)
       WHERE id = $4
       RETURNING id, email, full_name, phone, avatar_url, status, updated_at`,
      [full_name, phone, avatar_url, userId]
    );

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: updatedRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const userRes = await query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
    const isMatch = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña actual no coincide',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, userId]);

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

