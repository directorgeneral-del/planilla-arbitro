import { query } from '../config/db.js';

export const listAuditLogs = async (req, res, next) => {
  try {
    const {
      organization_id,
      tournament_id,
      category_id,
      match_id,
      user_id,
      action,
      entity_name,
      limit = 100,
      offset = 0,
    } = req.query;

    let sql = `
      SELECT al.*, u.full_name AS user_name, u.email AS user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (organization_id) {
      params.push(organization_id);
      sql += ` AND al.organization_id = $${params.length}`;
    }

    if (tournament_id) {
      params.push(tournament_id);
      sql += ` AND al.tournament_id = $${params.length}`;
    }

    if (category_id) {
      params.push(category_id);
      sql += ` AND al.category_id = $${params.length}`;
    }

    if (match_id) {
      params.push(match_id);
      sql += ` AND al.match_id = $${params.length}`;
    }

    if (user_id) {
      params.push(user_id);
      sql += ` AND al.user_id = $${params.length}`;
    }

    if (action) {
      params.push(action);
      sql += ` AND al.action = $${params.length}`;
    }

    if (entity_name) {
      params.push(entity_name);
      sql += ` AND al.entity_name = $${params.length}`;
    }

    sql += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await query(sql, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

