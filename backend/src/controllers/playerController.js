import { query } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

export const listPlayers = async (req, res, next) => {
  try {
    const { document_number, search } = req.query;
    let sql = `SELECT * FROM players WHERE 1=1`;
    const params = [];

    if (document_number) {
      params.push(document_number);
      sql += ` AND document_number = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR document_number ILIKE $${params.length})`;
    }

    sql += ` ORDER BY last_name ASC, first_name ASC LIMIT 100`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const getPlayerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT p.*,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                  'registration_id', pr.id,
                  'team_name', COALESCE(te.custom_name, tm.name),
                  'jersey_number', pr.jersey_number,
                  'position', pr.position,
                  'category_name', c.name,
                  'tournament_name', trn.name,
                  'status', pr.registration_status
                )) FILTER (WHERE pr.id IS NOT NULL), '[]'
              ) AS current_teams
       FROM players p
       LEFT JOIN player_registrations pr ON pr.player_id = p.id
       LEFT JOIN team_entries te ON pr.team_entry_id = te.id
       LEFT JOIN teams tm ON te.team_id = tm.id
       LEFT JOIN categories c ON te.category_id = c.id
       LEFT JOIN tournaments trn ON c.tournament_id = trn.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Jugador no encontrado' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const createPlayer = async (req, res, next) => {
  try {
    const { first_name, last_name, document_type = 'CC', document_number, birth_date, photo_url } = req.body;

    const existing = await query(
      `SELECT id FROM players WHERE document_type = $1 AND document_number = $2`,
      [document_type, document_number]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe un jugador registrado con este tipo y número de documento',
        data: existing.rows[0],
      });
    }

    const result = await query(
      `INSERT INTO players (first_name, last_name, document_type, document_number, birth_date, photo_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
       RETURNING *`,
      [first_name, last_name, document_type, document_number, birth_date || null, photo_url || null]
    );

    const newPlayer = result.rows[0];

    await logAudit({
      userId: req.user.id,
      action: 'CREATE_PLAYER',
      entityName: 'players',
      entityId: newPlayer.id,
      newValues: newPlayer,
      reason: 'Creación de ficha deportiva de jugador',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Jugador creado exitosamente',
      data: newPlayer,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, birth_date, photo_url, status } = req.body;

    const updated = await query(
      `UPDATE players
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           birth_date = COALESCE($3, birth_date),
           photo_url = COALESCE($4, photo_url),
           status = COALESCE($5, status)
       WHERE id = $6
       RETURNING *`,
      [first_name, last_name, birth_date, photo_url, status, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Jugador no encontrado' });
    }

    res.json({
      success: true,
      message: 'Jugador actualizado exitosamente',
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// --- PLAYER REGISTRATIONS (Roster) ---

export const getTeamRoster = async (req, res, next) => {
  try {
    const { teamEntryId } = req.params;

    const result = await query(
      `SELECT pr.id AS registration_id, pr.jersey_number, pr.position, pr.is_captain, pr.registration_status,
              p.id AS player_id, p.first_name, p.last_name, p.document_type, p.document_number, p.birth_date, p.photo_url
       FROM player_registrations pr
       JOIN players p ON pr.player_id = p.id
       WHERE pr.team_entry_id = $1
       ORDER BY pr.jersey_number ASC, p.last_name ASC`,
      [teamEntryId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const registerPlayerToTeamEntry = async (req, res, next) => {
  try {
    const { team_entry_id, player_id, jersey_number, position = 'MIDFIELDER', is_captain = false } = req.body;

    // Check if player already registered in this team entry
    const existing = await query(
      `SELECT id FROM player_registrations WHERE team_entry_id = $1 AND player_id = $2`,
      [team_entry_id, player_id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El jugador ya se encuentra inscrito en este equipo para esta categoría',
      });
    }

    // Check jersey number collision within same team
    if (jersey_number) {
      const jerseyCheck = await query(
        `SELECT id FROM player_registrations WHERE team_entry_id = $1 AND jersey_number = $2 AND registration_status = 'ACTIVE'`,
        [team_entry_id, jersey_number]
      );
      if (jerseyCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `El dorsal ${jersey_number} ya está ocupado por otro jugador activo en el equipo`,
        });
      }
    }

    const result = await query(
      `INSERT INTO player_registrations (team_entry_id, player_id, jersey_number, position, is_captain, registration_status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING *`,
      [team_entry_id, player_id, jersey_number || null, position, is_captain]
    );

    const newReg = result.rows[0];

    await logAudit({
      userId: req.user.id,
      action: 'REGISTER_PLAYER_TO_TEAM',
      entityName: 'player_registrations',
      entityId: newReg.id,
      newValues: newReg,
      reason: 'Inscripción de jugador en planilla de equipo',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Jugador inscrito en el equipo exitosamente',
      data: newReg,
    });
  } catch (error) {
    next(error);
  }
};

export const removePlayerFromTeamEntry = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE player_registrations SET registration_status = 'INACTIVE' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registro de inscripción no encontrado' });
    }

    res.json({
      success: true,
      message: 'Inscripción del jugador desactivada en el equipo',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

