import { query } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

// --- PHASES ---

export const listPhases = async (req, res, next) => {
  try {
    const { category_id } = req.query;
    let sql = `
      SELECT cp.*, c.name AS category_name,
             (SELECT COUNT(*) FROM groups g WHERE g.phase_id = cp.id) AS groups_count,
             (SELECT COUNT(*) FROM matches m WHERE m.phase_id = cp.id) AS matches_count
      FROM competition_phases cp
      JOIN categories c ON cp.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      params.push(category_id);
      sql += ` AND cp.category_id = $${params.length}`;
    }

    sql += ` ORDER BY cp.phase_order ASC, cp.created_at ASC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const createPhase = async (req, res, next) => {
  try {
    const { category_id, name, phase_type, phase_order = 1, qualification_rules, configuration, status = 'ACTIVE' } = req.body;

    const result = await query(
      `INSERT INTO competition_phases (category_id, name, phase_type, phase_order, qualification_rules, configuration, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [category_id, name, phase_type, phase_order, qualification_rules || null, configuration || null, status]
    );

    const newPhase = result.rows[0];

    await logAudit({
      categoryId: category_id,
      userId: req.user.id,
      action: 'CREATE_PHASE',
      entityName: 'competition_phases',
      entityId: newPhase.id,
      newValues: newPhase,
      reason: 'Creación de fase de competición',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Fase de competición creada con éxito',
      data: newPhase,
    });
  } catch (error) {
    next(error);
  }
};

// --- GROUPS ---

export const listGroups = async (req, res, next) => {
  try {
    const { phase_id } = req.query;
    let sql = `
      SELECT g.*, cp.name AS phase_name,
             COALESCE(
               json_agg(DISTINCT jsonb_build_object(
                 'membership_id', gm.id,
                 'team_entry_id', te.id,
                 'team_name', COALESCE(te.custom_name, t.name),
                 'team_logo', t.logo_url,
                 'seeded_position', gm.seeded_position
               )) FILTER (WHERE gm.id IS NOT NULL), '[]'
             ) AS teams
      FROM groups g
      JOIN competition_phases cp ON g.phase_id = cp.id
      LEFT JOIN group_memberships gm ON gm.group_id = g.id
      LEFT JOIN team_entries te ON gm.team_entry_id = te.id
      LEFT JOIN teams t ON te.team_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (phase_id) {
      params.push(phase_id);
      sql += ` AND g.phase_id = $${params.length}`;
    }

    sql += ` GROUP BY g.id, cp.name ORDER BY g.name ASC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const createGroup = async (req, res, next) => {
  try {
    const { phase_id, name } = req.body;

    const result = await query(
      `INSERT INTO groups (phase_id, name) VALUES ($1, $2) RETURNING *`,
      [phase_id, name]
    );

    res.status(201).json({
      success: true,
      message: 'Grupo creado con éxito',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const assignTeamToGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { team_entry_id, seeded_position } = req.body;

    const existing = await query(
      `SELECT id FROM group_memberships WHERE group_id = $1 AND team_entry_id = $2`,
      [groupId, team_entry_id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El equipo ya está asignado a este grupo.',
      });
    }

    const result = await query(
      `INSERT INTO group_memberships (group_id, team_entry_id, seeded_position)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [groupId, team_entry_id, seeded_position || null]
    );

    res.status(201).json({
      success: true,
      message: 'Equipo asignado al grupo con éxito',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const removeTeamFromGroup = async (req, res, next) => {
  try {
    const { groupId, teamEntryId } = req.params;

    const result = await query(
      `DELETE FROM group_memberships WHERE group_id = $1 AND team_entry_id = $2 RETURNING *`,
      [groupId, teamEntryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
    }

    res.json({
      success: true,
      message: 'Equipo removido del grupo exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// --- BRACKETS & TIES (RF-16) ---

export const listBrackets = async (req, res, next) => {
  try {
    const { phase_id } = req.query;
    let sql = `SELECT * FROM competition_brackets WHERE 1=1`;
    const params = [];

    if (phase_id) {
      params.push(phase_id);
      sql += ` AND phase_id = $${params.length}`;
    }

    sql += ` ORDER BY created_at ASC`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

export const createBracket = async (req, res, next) => {
  try {
    const { phase_id, name, bracket_type = 'SINGLE_ELIMINATION', leg_type = 'SINGLE', status = 'ACTIVE' } = req.body;

    const result = await query(
      `INSERT INTO competition_brackets (phase_id, name, bracket_type, leg_type, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [phase_id, name, bracket_type, leg_type, status]
    );

    res.status(201).json({
      success: true,
      message: 'Cuadro eliminatorio (Bracket) creado con éxito',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const listTies = async (req, res, next) => {
  try {
    const { phase_id, bracket_id } = req.query;
    let sql = `
      SELECT ct.*,
             COALESCE(te1.custom_name, t1.name) AS team_1_name, t1.logo_url AS team_1_logo,
             COALESCE(te2.custom_name, t2.name) AS team_2_name, t2.logo_url AS team_2_logo
      FROM competition_ties ct
      LEFT JOIN team_entries te1 ON ct.team_entry_1_id = te1.id
      LEFT JOIN teams t1 ON te1.team_id = t1.id
      LEFT JOIN team_entries te2 ON ct.team_entry_2_id = te2.id
      LEFT JOIN teams t2 ON te2.team_id = t2.id
      WHERE 1=1
    `;
    const params = [];

    if (phase_id) {
      params.push(phase_id);
      sql += ` AND ct.phase_id = $${params.length}`;
    }

    if (bracket_id) {
      params.push(bracket_id);
      sql += ` AND ct.bracket_id = $${params.length}`;
    }

    sql += ` ORDER BY ct.created_at ASC`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

export const createTie = async (req, res, next) => {
  try {
    const { phase_id, bracket_id, round_name, team_entry_1_id, team_entry_2_id } = req.body;

    const result = await query(
      `INSERT INTO competition_ties (phase_id, bracket_id, round_name, team_entry_1_id, team_entry_2_id, status)
       VALUES ($1, $2, $3, $4, $5, 'SCHEDULED')
       RETURNING *`,
      [phase_id, bracket_id || null, round_name, team_entry_1_id || null, team_entry_2_id || null]
    );

    res.status(201).json({
      success: true,
      message: 'Serie/Llave (Tie) creada exitosamente',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

