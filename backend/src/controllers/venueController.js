import { query } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

export const listVenues = async (req, res, next) => {
  try {
    const { organization_id } = req.query;
    let sql = `
      SELECT v.*, o.commercial_name AS organization_name,
             (SELECT COUNT(*) FROM matches m WHERE m.venue_id = v.id) AS matches_hosted
      FROM venues v
      JOIN organizations o ON v.organization_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (organization_id) {
      params.push(organization_id);
      sql += ` AND v.organization_id = $${params.length}`;
    }

    sql += ` ORDER BY v.name ASC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const getVenueById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT v.*, o.commercial_name AS organization_name,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                  'id', vbs.id,
                  'start_time', vbs.start_time,
                  'end_time', vbs.end_time,
                  'reason', vbs.reason
                )) FILTER (WHERE vbs.id IS NOT NULL), '[]'
              ) AS blocked_slots
       FROM venues v
       JOIN organizations o ON v.organization_id = o.id
       LEFT JOIN venue_blocked_slots vbs ON vbs.venue_id = v.id AND vbs.end_time >= CURRENT_TIMESTAMP
       WHERE v.id = $1
       GROUP BY v.id, o.commercial_name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cancha no encontrada' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const createVenue = async (req, res, next) => {
  try {
    const { organization_id, name, location, address, capacity, status = 'ACTIVE' } = req.body;

    const result = await query(
      `INSERT INTO venues (organization_id, name, location, address, capacity, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [organization_id, name, location || null, address || null, capacity || null, status]
    );

    const newVenue = result.rows[0];

    await logAudit({
      organizationId: organization_id,
      userId: req.user.id,
      action: 'CREATE_VENUE',
      entityName: 'venues',
      entityId: newVenue.id,
      newValues: newVenue,
      reason: 'Registro de cancha o instalación deportiva',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Cancha registrada exitosamente',
      data: newVenue,
    });
  } catch (error) {
    next(error);
  }
};

export const updateVenue = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, location, address, capacity, status } = req.body;

    const updated = await query(
      `UPDATE venues
       SET name = COALESCE($1, name),
           location = COALESCE($2, location),
           address = COALESCE($3, address),
           capacity = COALESCE($4, capacity),
           status = COALESCE($5, status)
       WHERE id = $6
       RETURNING *`,
      [name, location, address, capacity, status, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cancha no encontrada' });
    }

    res.json({
      success: true,
      message: 'Cancha actualizada con éxito',
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const addBlockedSlot = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_time, end_time, reason } = req.body;

    const result = await query(
      `INSERT INTO venue_blocked_slots (venue_id, start_time, end_time, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, start_time, end_time, reason || 'Mantenimiento o evento externo']
    );

    res.status(201).json({
      success: true,
      message: 'Franja horaria bloqueada exitosamente',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Checks venue availability calling fn_check_venue_conflict(p_venue_id, p_start_time, p_end_time, p_exclude_match_id)
 */
export const checkVenueConflict = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_time, end_time, exclude_match_id } = req.body;

    const result = await query(
      `SELECT * FROM fn_check_venue_conflict($1, $2, $3, $4)`,
      [id, start_time, end_time, exclude_match_id || null]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

