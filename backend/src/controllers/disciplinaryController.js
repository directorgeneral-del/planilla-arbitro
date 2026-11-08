import { query } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

// --- SANCTION RULES ---

export const listSanctionRules = async (req, res, next) => {
  try {
    const { tournament_id, category_id } = req.query;
    let sql = `SELECT * FROM sanction_rules WHERE 1=1`;
    const params = [];

    if (tournament_id) {
      params.push(tournament_id);
      sql += ` AND tournament_id = $${params.length}`;
    }

    if (category_id) {
      params.push(category_id);
      sql += ` AND (category_id = $${params.length} OR category_id IS NULL)`;
    }

    sql += ` ORDER BY infraction_type ASC`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

export const createSanctionRule = async (req, res, next) => {
  try {
    const {
      tournament_id,
      category_id,
      infraction_type,
      description,
      financial_amount = 0,
      liable_party = 'PLAYER',
      points_deduction = 0,
      matches_suspended = 0,
      disciplinary_points = 1,
      effective_from,
      effective_to,
      is_active = true,
    } = req.body;

    const result = await query(
      `INSERT INTO sanction_rules (
         tournament_id, category_id, infraction_type, description, financial_amount,
         liable_party, points_deduction, matches_suspended, disciplinary_points,
         effective_from, effective_to, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        tournament_id,
        category_id || null,
        infraction_type,
        description || null,
        financial_amount,
        liable_party,
        points_deduction,
        matches_suspended,
        disciplinary_points,
        effective_from || null,
        effective_to || null,
        is_active,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Regla de sanción creada exitosamente',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// --- SANCTIONS ---

export const listSanctions = async (req, res, next) => {
  try {
    const { match_id, team_entry_id, player_registration_id, status } = req.query;
    let sql = `
      SELECT s.*,
             COALESCE(te.custom_name, tm.name) AS team_name,
             p.first_name || ' ' || p.last_name AS player_name,
             sr.infraction_type
      FROM sanctions s
      LEFT JOIN team_entries te ON s.team_entry_id = te.id
      LEFT JOIN teams tm ON te.team_id = tm.id
      LEFT JOIN player_registrations pr ON s.player_registration_id = pr.id
      LEFT JOIN players p ON pr.player_id = p.id
      LEFT JOIN sanction_rules sr ON s.rule_id = sr.id
      WHERE 1=1
    `;
    const params = [];

    if (match_id) {
      params.push(match_id);
      sql += ` AND s.match_id = $${params.length}`;
    }

    if (team_entry_id) {
      params.push(team_entry_id);
      sql += ` AND s.team_entry_id = $${params.length}`;
    }

    if (player_registration_id) {
      params.push(player_registration_id);
      sql += ` AND s.player_registration_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND s.status = $${params.length}`;
    }

    sql += ` ORDER BY s.created_at DESC`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

export const createManualSanction = async (req, res, next) => {
  try {
    const {
      rule_id,
      match_id,
      team_entry_id,
      player_registration_id,
      description,
      matches_suspended = 1,
    } = req.body;

    const result = await query(
      `INSERT INTO sanctions (
         rule_id, match_id, team_entry_id, player_registration_id,
         sanction_origin, description, matches_suspended, matches_served, status
       ) VALUES ($1, $2, $3, $4, 'MANUAL', $5, $6, 0, 'ACTIVE')
       RETURNING *`,
      [rule_id || null, match_id || null, team_entry_id || null, player_registration_id || null, description, matches_suspended]
    );

    const newSanction = result.rows[0];

    await logAudit({
      userId: req.user.id,
      action: 'CREATE_MANUAL_SANCTION',
      entityName: 'sanctions',
      entityId: newSanction.id,
      newValues: newSanction,
      reason: 'Sanción disciplinaria manual aplicada',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Sanción manual creada exitosamente',
      data: newSanction,
    });
  } catch (error) {
    next(error);
  }
};

// --- DISCIPLINARY DEDUCTIONS (RF-18 B, HU-013) ---

export const listDeductions = async (req, res, next) => {
  try {
    const { category_id, team_entry_id, status } = req.query;
    let sql = `
      SELECT dd.*,
             COALESCE(te.custom_name, tm.name) AS team_name,
             u.full_name AS approved_by_name
      FROM disciplinary_deductions dd
      JOIN team_entries te ON dd.team_entry_id = te.id
      JOIN teams tm ON te.team_id = tm.id
      LEFT JOIN users u ON dd.approved_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      params.push(category_id);
      sql += ` AND dd.category_id = $${params.length}`;
    }

    if (team_entry_id) {
      params.push(team_entry_id);
      sql += ` AND dd.team_entry_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND dd.status = $${params.length}`;
    }

    sql += ` ORDER BY dd.created_at DESC`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

export const createManualDeduction = async (req, res, next) => {
  try {
    const { category_id, team_entry_id, match_id, points, reason } = req.body;

    const result = await query(
      `INSERT INTO disciplinary_deductions (
         category_id, team_entry_id, match_id, deduction_type, points, reason, status, approved_by, approved_at
       ) VALUES ($1, $2, $3, 'MANUAL', $4, $5, 'APPROVED', $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [category_id, team_entry_id, match_id || null, points, reason, req.user.id]
    );

    const deduction = result.rows[0];

    await logAudit({
      categoryId: category_id,
      userId: req.user.id,
      action: 'MANUAL_POINT_DEDUCTION',
      entityName: 'disciplinary_deductions',
      entityId: deduction.id,
      newValues: deduction,
      reason: `Deducción manual de ${points} punto(s). Razón: ${reason}`,
      req,
    });

    res.status(201).json({
      success: true,
      message: `Deducción de ${points} punto(s) aplicada al equipo`,
      data: deduction,
    });
  } catch (error) {
    next(error);
  }
};

