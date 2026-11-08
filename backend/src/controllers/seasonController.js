import { query } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

export const listSeasons = async (req, res, next) => {
  try {
    const { organization_id } = req.query;
    let sql = `
      SELECT s.*, o.commercial_name AS organization_name,
             (SELECT COUNT(*) FROM tournaments t WHERE t.season_id = s.id) AS tournaments_count
      FROM seasons s
      JOIN organizations o ON s.organization_id = o.id
    `;
    const params = [];

    if (organization_id) {
      sql += ` WHERE s.organization_id = $1`;
      params.push(organization_id);
    } else if (!req.user.isSuperAdmin && req.user.organizations.length > 0) {
      sql += ` WHERE s.organization_id = ANY($1::uuid[])`;
      params.push(req.user.organizations);
    }

    sql += ` ORDER BY s.year DESC, s.created_at DESC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const getSeasonById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT s.*, o.commercial_name AS organization_name,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status))
                FILTER (WHERE t.id IS NOT NULL), '[]'
              ) AS tournaments
       FROM seasons s
       JOIN organizations o ON s.organization_id = o.id
       LEFT JOIN tournaments t ON t.season_id = s.id
       WHERE s.id = $1
       GROUP BY s.id, o.commercial_name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Temporada no encontrada' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const createSeason = async (req, res, next) => {
  try {
    const { organization_id, name, year, start_date, end_date, status = 'ACTIVE' } = req.body;

    const result = await query(
      `INSERT INTO seasons (organization_id, name, year, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [organization_id, name, year, start_date || null, end_date || null, status]
    );

    const newSeason = result.rows[0];

    await logAudit({
      organizationId: organization_id,
      userId: req.user.id,
      action: 'CREATE_SEASON',
      entityName: 'seasons',
      entityId: newSeason.id,
      newValues: newSeason,
      reason: 'Creación de temporada deportiva',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Temporada creada exitosamente',
      data: newSeason,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSeason = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, year, start_date, end_date, status } = req.body;

    const oldRes = await query('SELECT * FROM seasons WHERE id = $1', [id]);
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Temporada no encontrada' });
    }

    const updated = await query(
      `UPDATE seasons
       SET name = COALESCE($1, name),
           year = COALESCE($2, year),
           start_date = COALESCE($3, start_date),
           end_date = COALESCE($4, end_date),
           status = COALESCE($5, status)
       WHERE id = $6
       RETURNING *`,
      [name, year, start_date, end_date, status, id]
    );

    await logAudit({
      organizationId: oldRes.rows[0].organization_id,
      userId: req.user.id,
      action: 'UPDATE_SEASON',
      entityName: 'seasons',
      entityId: id,
      oldValues: oldRes.rows[0],
      newValues: updated.rows[0],
      reason: 'Actualización de datos de la temporada',
      req,
    });

    res.json({
      success: true,
      message: 'Temporada actualizada exitosamente',
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

