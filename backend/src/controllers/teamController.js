import { query } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

export const listTeams = async (req, res, next) => {
  try {
    const { organization_id } = req.query;
    let sql = `
      SELECT t.*, o.commercial_name AS organization_name, u.full_name AS delegate_name, u.email AS delegate_email,
             (SELECT COUNT(*) FROM team_entries te WHERE te.team_id = t.id) AS entries_count
      FROM teams t
      JOIN organizations o ON t.organization_id = o.id
      LEFT JOIN users u ON t.delegate_user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (organization_id) {
      params.push(organization_id);
      sql += ` AND t.organization_id = $${params.length}`;
    }

    sql += ` ORDER BY t.name ASC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const getTeamById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT t.*, o.commercial_name AS organization_name, u.full_name AS delegate_name, u.phone AS delegate_phone,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                  'entry_id', te.id,
                  'category_id', c.id,
                  'category_name', c.name,
                  'tournament_name', trn.name,
                  'registration_status', te.registration_status
                )) FILTER (WHERE te.id IS NOT NULL), '[]'
              ) AS participations
       FROM teams t
       JOIN organizations o ON t.organization_id = o.id
       LEFT JOIN users u ON t.delegate_user_id = u.id
       LEFT JOIN team_entries te ON te.team_id = t.id
       LEFT JOIN categories c ON te.category_id = c.id
       LEFT JOIN tournaments trn ON c.tournament_id = trn.id
       WHERE t.id = $1
       GROUP BY t.id, o.commercial_name, u.full_name, u.phone`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Equipo no encontrado' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const createTeam = async (req, res, next) => {
  try {
    const {
      organization_id,
      name,
      short_name,
      logo_url,
      primary_color = '#000000',
      secondary_color = '#FFFFFF',
      delegate_user_id,
    } = req.body;

    const result = await query(
      `INSERT INTO teams (
         organization_id, name, short_name, logo_url, primary_color, secondary_color, delegate_user_id, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
       RETURNING *`,
      [organization_id, name, short_name || null, logo_url || null, primary_color, secondary_color, delegate_user_id || null]
    );

    const newTeam = result.rows[0];

    // If delegate assigned, grant DELEGATE role
    if (delegate_user_id) {
      const roleRes = await query(`SELECT id FROM roles WHERE code = 'DELEGATE'`);
      if (roleRes.rows.length > 0) {
        await query(
          `INSERT INTO user_roles (user_id, role_id, organization_id, team_id, is_active)
           VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT DO NOTHING`,
          [delegate_user_id, roleRes.rows[0].id, organization_id, newTeam.id]
        );
      }
    }

    await logAudit({
      organizationId: organization_id,
      userId: req.user.id,
      action: 'CREATE_TEAM',
      entityName: 'teams',
      entityId: newTeam.id,
      newValues: newTeam,
      reason: 'Creación de equipo',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Equipo registrado exitosamente',
      data: newTeam,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, short_name, logo_url, primary_color, secondary_color, delegate_user_id, status } = req.body;

    const oldRes = await query('SELECT * FROM teams WHERE id = $1', [id]);
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Equipo no encontrado' });
    }

    const updated = await query(
      `UPDATE teams
       SET name = COALESCE($1, name),
           short_name = COALESCE($2, short_name),
           logo_url = COALESCE($3, logo_url),
           primary_color = COALESCE($4, primary_color),
           secondary_color = COALESCE($5, secondary_color),
           delegate_user_id = COALESCE($6, delegate_user_id),
           status = COALESCE($7, status)
       WHERE id = $8
       RETURNING *`,
      [name, short_name, logo_url, primary_color, secondary_color, delegate_user_id, status, id]
    );

    res.json({
      success: true,
      message: 'Equipo actualizado exitosamente',
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// --- TEAM ENTRIES (RF-05) ---

export const listTeamEntries = async (req, res, next) => {
  try {
    const { category_id, team_id } = req.query;
    let sql = `
      SELECT te.*, t.name AS base_team_name, t.logo_url AS base_logo_url,
             c.name AS category_name, trn.name AS tournament_name, trn.id AS tournament_id,
             (SELECT COUNT(*) FROM player_registrations pr WHERE pr.team_entry_id = te.id) AS roster_count
      FROM team_entries te
      JOIN teams t ON te.team_id = t.id
      JOIN categories c ON te.category_id = c.id
      JOIN tournaments trn ON c.tournament_id = trn.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      params.push(category_id);
      sql += ` AND te.category_id = $${params.length}`;
    }

    if (team_id) {
      params.push(team_id);
      sql += ` AND te.team_id = $${params.length}`;
    }

    sql += ` ORDER BY COALESCE(te.custom_name, t.name) ASC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const registerTeamToCategory = async (req, res, next) => {
  try {
    const { category_id, team_id, custom_name, custom_logo_url, registration_status = 'CONFIRMED' } = req.body;

    const existing = await query(
      `SELECT id FROM team_entries WHERE category_id = $1 AND team_id = $2`,
      [category_id, team_id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El equipo ya se encuentra registrado en esta categoría.',
      });
    }

    const result = await query(
      `INSERT INTO team_entries (category_id, team_id, custom_name, custom_logo_url, registration_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [category_id, team_id, custom_name || null, custom_logo_url || null, registration_status]
    );

    const newEntry = result.rows[0];

    await logAudit({
      categoryId: category_id,
      userId: req.user.id,
      action: 'REGISTER_TEAM_ENTRY',
      entityName: 'team_entries',
      entityId: newEntry.id,
      newValues: newEntry,
      reason: 'Inscripción de equipo a categoría de torneo',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Equipo inscrito en categoría exitosamente',
      data: newEntry,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTeamEntryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { registration_status } = req.body;

    const result = await query(
      `UPDATE team_entries SET registration_status = $1 WHERE id = $2 RETURNING *`,
      [registration_status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Inscripción no encontrada' });
    }

    res.json({
      success: true,
      message: `Estado de inscripción cambiado a ${registration_status}`,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

