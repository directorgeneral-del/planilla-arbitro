import { query } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

export const listTournaments = async (req, res, next) => {
  try {
    const { organization_id, season_id, status } = req.query;
    let sql = `
      SELECT t.*, o.commercial_name AS organization_name, s.name AS season_name,
             (SELECT COUNT(*) FROM categories c WHERE c.tournament_id = t.id) AS categories_count
      FROM tournaments t
      JOIN organizations o ON t.organization_id = o.id
      LEFT JOIN seasons s ON t.season_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (organization_id) {
      params.push(organization_id);
      sql += ` AND t.organization_id = $${params.length}`;
    }

    if (season_id) {
      params.push(season_id);
      sql += ` AND t.season_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }

    sql += ` ORDER BY t.created_at DESC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const getTournamentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT t.*, o.commercial_name AS organization_name, s.name AS season_name,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                  'id', c.id, 
                  'name', c.name, 
                  'format', c.format, 
                  'status', c.status
                )) FILTER (WHERE c.id IS NOT NULL), '[]'
              ) AS categories
       FROM tournaments t
       JOIN organizations o ON t.organization_id = o.id
       LEFT JOIN seasons s ON t.season_id = s.id
       LEFT JOIN categories c ON c.tournament_id = t.id
       WHERE t.id = $1
       GROUP BY t.id, o.commercial_name, s.name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Torneo no encontrado' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const createTournament = async (req, res, next) => {
  try {
    const {
      organization_id,
      season_id,
      name,
      description,
      competition_format = 'GROUPS_AND_KNOCKOUT',
      status = 'DRAFT',
      start_date,
      end_date,
      timezone = 'America/Bogota',
    } = req.body;

    const result = await query(
      `INSERT INTO tournaments (
         organization_id, season_id, name, description, competition_format, status, start_date, end_date, timezone
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [organization_id, season_id || null, name, description || null, competition_format, status, start_date || null, end_date || null, timezone]
    );

    const newTournament = result.rows[0];

    await logAudit({
      organizationId: organization_id,
      tournamentId: newTournament.id,
      userId: req.user.id,
      action: 'CREATE_TOURNAMENT',
      entityName: 'tournaments',
      entityId: newTournament.id,
      newValues: newTournament,
      reason: 'Creación de campeonato / torneo',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Torneo creado exitosamente',
      data: newTournament,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTournament = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, competition_format, status, start_date, end_date, timezone } = req.body;

    const oldRes = await query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Torneo no encontrado' });
    }

    const updated = await query(
      `UPDATE tournaments
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           competition_format = COALESCE($3, competition_format),
           status = COALESCE($4, status),
           start_date = COALESCE($5, start_date),
           end_date = COALESCE($6, end_date),
           timezone = COALESCE($7, timezone)
       WHERE id = $8
       RETURNING *`,
      [name, description, competition_format, status, start_date, end_date, timezone, id]
    );

    await logAudit({
      organizationId: oldRes.rows[0].organization_id,
      tournamentId: id,
      userId: req.user.id,
      action: 'UPDATE_TOURNAMENT',
      entityName: 'tournaments',
      entityId: id,
      oldValues: oldRes.rows[0],
      newValues: updated.rows[0],
      reason: 'Actualización de configuración del torneo',
      req,
    });

    res.json({
      success: true,
      message: 'Torneo actualizado exitosamente',
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const updateTournamentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const oldRes = await query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Torneo no encontrado' });
    }

    const updated = await query(
      `UPDATE tournaments SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    await logAudit({
      organizationId: oldRes.rows[0].organization_id,
      tournamentId: id,
      userId: req.user.id,
      action: 'CHANGE_TOURNAMENT_STATUS',
      entityName: 'tournaments',
      entityId: id,
      oldValues: { status: oldRes.rows[0].status },
      newValues: { status },
      reason: reason || `Cambio de estado de torneo a ${status}`,
      req,
    });

    res.json({
      success: true,
      message: `Estado del torneo cambiado a ${status}`,
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

