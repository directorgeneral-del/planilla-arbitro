import { query } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

export const listReferees = async (req, res, next) => {
  try {
    const { organization_id } = req.query;
    let sql = `
      SELECT r.*, o.commercial_name AS organization_name,
             (SELECT COUNT(*) FROM match_referees mr WHERE mr.referee_id = r.id) AS matches_count
      FROM referees r
      JOIN organizations o ON r.organization_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (organization_id) {
      params.push(organization_id);
      sql += ` AND r.organization_id = $${params.length}`;
    }

    sql += ` ORDER BY r.full_name ASC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const getRefereeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const refRes = await query(
      `SELECT r.*, o.commercial_name AS organization_name
       FROM referees r
       JOIN organizations o ON r.organization_id = o.id
       WHERE r.id = $1`,
      [id]
    );

    if (refRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Árbitro no encontrado' });
    }

    // Matches assigned
    const matchesRes = await query(
      `SELECT mr.id AS assignment_id, mr.referee_role, mr.status AS assignment_status,
              m.id AS match_id, m.match_date, m.match_day, m.status AS match_status,
              COALESCE(te1.custom_name, t1.name) AS home_team,
              COALESCE(te2.custom_name, t2.name) AS away_team,
              v.name AS venue_name
       FROM match_referees mr
       JOIN matches m ON mr.match_id = m.id
       JOIN team_entries te1 ON m.home_team_entry_id = te1.id
       JOIN teams t1 ON te1.team_id = t1.id
       JOIN team_entries te2 ON m.away_team_entry_id = te2.id
       JOIN teams t2 ON te2.team_id = t2.id
       LEFT JOIN venues v ON m.venue_id = v.id
       WHERE mr.referee_id = $1
       ORDER BY m.match_date DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...refRes.rows[0],
        matches: matchesRes.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createReferee = async (req, res, next) => {
  try {
    const { organization_id, user_id, full_name, document_number, phone, email, status = 'ACTIVE' } = req.body;

    const result = await query(
      `INSERT INTO referees (organization_id, user_id, full_name, document_number, phone, email, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [organization_id, user_id || null, full_name, document_number || null, phone || null, email || null, status]
    );

    const newRef = result.rows[0];

    // If user_id provided, grant REFEREE role in user_roles
    if (user_id) {
      const roleRes = await query(`SELECT id FROM roles WHERE code = 'REFEREE'`);
      if (roleRes.rows.length > 0) {
        await query(
          `INSERT INTO user_roles (user_id, role_id, organization_id, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT DO NOTHING`,
          [user_id, roleRes.rows[0].id, organization_id]
        );
      }
    }

    await logAudit({
      organizationId: organization_id,
      userId: req.user.id,
      action: 'CREATE_REFEREE',
      entityName: 'referees',
      entityId: newRef.id,
      newValues: newRef,
      reason: 'Registro de árbitro en el sistema',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Árbitro registrado exitosamente',
      data: newRef,
    });
  } catch (error) {
    next(error);
  }
};

export const updateReferee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { full_name, document_number, phone, email, status, user_id } = req.body;

    const updated = await query(
      `UPDATE referees
       SET full_name = COALESCE($1, full_name),
           document_number = COALESCE($2, document_number),
           phone = COALESCE($3, phone),
           email = COALESCE($4, email),
           status = COALESCE($5, status),
           user_id = COALESCE($6, user_id)
       WHERE id = $7
       RETURNING *`,
      [full_name, document_number, phone, email, status, user_id, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Árbitro no encontrado' });
    }

    res.json({
      success: true,
      message: 'Árbitro actualizado exitosamente',
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

