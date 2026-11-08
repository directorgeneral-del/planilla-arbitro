import { query, withTransaction } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

export const listMatches = async (req, res, next) => {
  try {
    const {
      category_id,
      phase_id,
      group_id,
      venue_id,
      status,
      sheet_status,
      date,
      start_date,
      end_date,
      referee_id,
    } = req.query;

    let sql = `
      SELECT m.*,
             c.name AS category_name,
             cp.name AS phase_name,
             g.name AS group_name,
             v.name AS venue_name,
             v.location AS venue_location,
             COALESCE(te1.custom_name, t1.name) AS home_team_name,
             COALESCE(te1.custom_logo_url, t1.logo_url) AS home_team_logo,
             COALESCE(te2.custom_name, t2.name) AS away_team_name,
             COALESCE(te2.custom_logo_url, t2.logo_url) AS away_team_logo,
             (
               SELECT json_agg(json_build_object('referee_id', mr.referee_id, 'name', ref.full_name, 'role', mr.referee_role))
               FROM match_referees mr
               JOIN referees ref ON mr.referee_id = ref.id
               WHERE mr.match_id = m.id
             ) AS assigned_referees
      FROM matches m
      JOIN categories c ON m.category_id = c.id
      LEFT JOIN competition_phases cp ON m.phase_id = cp.id
      LEFT JOIN groups g ON m.group_id = g.id
      LEFT JOIN venues v ON m.venue_id = v.id
      JOIN team_entries te1 ON m.home_team_entry_id = te1.id
      JOIN teams t1 ON te1.team_id = t1.id
      JOIN team_entries te2 ON m.away_team_entry_id = te2.id
      JOIN teams t2 ON te2.team_id = t2.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      params.push(category_id);
      sql += ` AND m.category_id = $${params.length}`;
    }

    if (phase_id) {
      params.push(phase_id);
      sql += ` AND m.phase_id = $${params.length}`;
    }

    if (group_id) {
      params.push(group_id);
      sql += ` AND m.group_id = $${params.length}`;
    }

    if (venue_id) {
      params.push(venue_id);
      sql += ` AND m.venue_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND m.status = $${params.length}`;
    }

    if (sheet_status) {
      params.push(sheet_status);
      sql += ` AND m.sheet_status = $${params.length}`;
    }

    if (date) {
      params.push(date);
      sql += ` AND DATE(m.match_date) = $${params.length}::date`;
    }

    if (start_date && end_date) {
      params.push(start_date, end_date);
      sql += ` AND m.match_date BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    if (referee_id) {
      params.push(referee_id);
      sql += ` AND EXISTS (SELECT 1 FROM match_referees mr WHERE mr.match_id = m.id AND mr.referee_id = $${params.length})`;
    }

    sql += ` ORDER BY m.match_date ASC, m.match_day ASC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const getMatchById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Match header and details
    const matchRes = await query(
      `SELECT m.*,
              c.name AS category_name, c.tournament_id,
              trn.name AS tournament_name, trn.organization_id,
              cp.name AS phase_name, cp.phase_type,
              g.name AS group_name,
              v.name AS venue_name, v.location AS venue_location,
              COALESCE(te1.custom_name, t1.name) AS home_team_name,
              COALESCE(te1.custom_logo_url, t1.logo_url) AS home_team_logo,
              t1.primary_color AS home_primary_color,
              COALESCE(te2.custom_name, t2.name) AS away_team_name,
              COALESCE(te2.custom_logo_url, t2.logo_url) AS away_team_logo,
              t2.primary_color AS away_primary_color
       FROM matches m
       JOIN categories c ON m.category_id = c.id
       JOIN tournaments trn ON c.tournament_id = trn.id
       LEFT JOIN competition_phases cp ON m.phase_id = cp.id
       LEFT JOIN groups g ON m.group_id = g.id
       LEFT JOIN venues v ON m.venue_id = v.id
       JOIN team_entries te1 ON m.home_team_entry_id = te1.id
       JOIN teams t1 ON te1.team_id = t1.id
       JOIN team_entries te2 ON m.away_team_entry_id = te2.id
       JOIN teams t2 ON te2.team_id = t2.id
       WHERE m.id = $1`,
      [id]
    );

    if (matchRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Partido no encontrado' });
    }

    const match = matchRes.rows[0];

    // 2. Referees
    const refereesRes = await query(
      `SELECT mr.id AS assignment_id, mr.referee_role, mr.status,
              r.id AS referee_id, r.full_name, r.phone, r.email
       FROM match_referees mr
       JOIN referees r ON mr.referee_id = r.id
       WHERE mr.match_id = $1`,
      [id]
    );

    // 3. Lineups
    const lineupsRes = await query(
      `SELECT ml.*,
              p.id AS player_id, p.first_name, p.last_name, p.document_number,
              pr.position AS registered_position
       FROM match_lineups ml
       JOIN player_registrations pr ON ml.player_registration_id = pr.id
       JOIN players p ON pr.player_id = p.id
       WHERE ml.match_id = $1
       ORDER BY ml.is_starter DESC, ml.jersey_number ASC`,
      [id]
    );

    // 4. Events
    const eventsRes = await query(
      `SELECT me.*,
              p.first_name || ' ' || p.last_name AS player_name,
              pr.jersey_number AS player_jersey,
              u.full_name AS recorded_by_name
       FROM match_events me
       LEFT JOIN player_registrations pr ON me.player_registration_id = pr.id
       LEFT JOIN players p ON pr.player_id = p.id
       LEFT JOIN users u ON me.recorded_by = u.id
       WHERE me.match_id = $1
       ORDER BY me.minute ASC, me.created_at ASC`,
      [id]
    );

    // 5. Penalty shootouts
    const penaltiesRes = await query(
      `SELECT ps.*, p.first_name || ' ' || p.last_name AS player_name
       FROM match_penalty_shootouts ps
       LEFT JOIN player_registrations pr ON ps.player_registration_id = pr.id
       LEFT JOIN players p ON pr.player_id = p.id
       WHERE ps.match_id = $1
       ORDER BY ps.sequence_number ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...match,
        referees: refereesRes.rows,
        lineups: lineupsRes.rows,
        events: eventsRes.rows,
        penalty_shootouts: penaltiesRes.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createMatch = async (req, res, next) => {
  try {
    const {
      category_id,
      phase_id,
      group_id,
      tie_id,
      match_day = 1,
      match_date,
      venue_id,
      home_team_entry_id,
      away_team_entry_id,
      notes,
    } = req.body;

    if (home_team_entry_id === away_team_entry_id) {
      return res.status(400).json({
        success: false,
        message: 'El equipo local y el visitante no pueden ser el mismo',
      });
    }

    // Check venue conflict if venue_id and match_date provided
    if (venue_id && match_date) {
      const startTime = new Date(match_date);
      const endTime = new Date(startTime.getTime() + 105 * 60000); // Standard match block: 105 mins

      const conflictRes = await query(
        `SELECT * FROM fn_check_venue_conflict($1, $2, $3, NULL)`,
        [venue_id, startTime.toISOString(), endTime.toISOString()]
      );

      if (conflictRes.rows.length > 0 && conflictRes.rows[0].has_conflict) {
        return res.status(409).json({
          success: false,
          message: `Conflicto de programación en la cancha: ${conflictRes.rows[0].description}`,
          conflict_type: conflictRes.rows[0].conflict_type,
        });
      }
    }

    const result = await query(
      `INSERT INTO matches (
         category_id, phase_id, group_id, tie_id, match_day, match_date, venue_id,
         home_team_entry_id, away_team_entry_id, home_score, away_score, status, sheet_status, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 'SCHEDULED', 'DRAFT', $10)
       RETURNING *`,
      [
        category_id,
        phase_id || null,
        group_id || null,
        tie_id || null,
        match_day,
        match_date || null,
        venue_id || null,
        home_team_entry_id,
        away_team_entry_id,
        notes || null,
      ]
    );

    const newMatch = result.rows[0];

    await logAudit({
      categoryId: category_id,
      matchId: newMatch.id,
      userId: req.user.id,
      action: 'SCHEDULE_MATCH',
      entityName: 'matches',
      entityId: newMatch.id,
      newValues: newMatch,
      reason: 'Programación de nuevo partido',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Partido programado con éxito',
      data: newMatch,
    });
  } catch (error) {
    next(error);
  }
};

export const updateMatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { match_day, match_date, venue_id, notes, home_score, away_score } = req.body;

    const oldRes = await query('SELECT * FROM matches WHERE id = $1', [id]);
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Partido no encontrado' });
    }

    // Check conflict if venue or match_date changed
    const targetVenue = venue_id || oldRes.rows[0].venue_id;
    const targetDate = match_date || oldRes.rows[0].match_date;

    if (targetVenue && targetDate && (venue_id || match_date)) {
      const startTime = new Date(targetDate);
      const endTime = new Date(startTime.getTime() + 105 * 60000);

      const conflictRes = await query(
        `SELECT * FROM fn_check_venue_conflict($1, $2, $3, $4)`,
        [targetVenue, startTime.toISOString(), endTime.toISOString(), id]
      );

      if (conflictRes.rows.length > 0 && conflictRes.rows[0].has_conflict) {
        return res.status(409).json({
          success: false,
          message: `Conflicto de disponibilidad: ${conflictRes.rows[0].description}`,
          conflict_type: conflictRes.rows[0].conflict_type,
        });
      }
    }

    const updated = await query(
      `UPDATE matches
       SET match_day = COALESCE($1, match_day),
           match_date = COALESCE($2, match_date),
           venue_id = COALESCE($3, venue_id),
           notes = COALESCE($4, notes),
           home_score = COALESCE($5, home_score),
           away_score = COALESCE($6, away_score)
       WHERE id = $7
       RETURNING *`,
      [match_day, match_date, venue_id, notes, home_score, away_score, id]
    );

    await logAudit({
      categoryId: oldRes.rows[0].category_id,
      matchId: id,
      userId: req.user.id,
      action: 'UPDATE_MATCH',
      entityName: 'matches',
      entityId: id,
      oldValues: oldRes.rows[0],
      newValues: updated.rows[0],
      reason: 'Reprogramación o modificación de partido',
      req,
    });

    res.json({
      success: true,
      message: 'Partido actualizado exitosamente',
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const updateMatchStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const updated = await query(
      `UPDATE matches SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Partido no encontrado' });
    }

    await logAudit({
      matchId: id,
      userId: req.user.id,
      action: 'CHANGE_MATCH_STATUS',
      entityName: 'matches',
      entityId: id,
      newValues: { status },
      reason: reason || `Cambio de estado a ${status}`,
      req,
    });

    res.json({
      success: true,
      message: `Estado del partido cambiado a ${status}`,
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// --- REFEREE ASSIGNMENTS (RF-11) ---

export const assignRefereeToMatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { referee_id, referee_role = 'MAIN' } = req.body;

    const result = await query(
      `INSERT INTO match_referees (match_id, referee_id, referee_role, status)
       VALUES ($1, $2, $3, 'CONFIRMED')
       ON CONFLICT (match_id, referee_id) DO UPDATE SET referee_role = $3, status = 'CONFIRMED'
       RETURNING *`,
      [id, referee_id, referee_role]
    );

    res.status(201).json({
      success: true,
      message: 'Árbitro asignado al partido exitosamente',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const removeRefereeFromMatch = async (req, res, next) => {
  try {
    const { id, refereeId } = req.params;

    const result = await query(
      `DELETE FROM match_referees WHERE match_id = $1 AND referee_id = $2 RETURNING *`,
      [id, refereeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
    }

    res.json({
      success: true,
      message: 'Árbitro removido del partido',
    });
  } catch (error) {
    next(error);
  }
};

// --- LINEUPS (RF-12) ---

export const saveMatchLineup = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { team_entry_id, players } = req.body; // Array of { player_registration_id, jersey_number, is_starter, is_captain }

    if (!Array.isArray(players)) {
      return res.status(400).json({ success: false, message: 'La lista de jugadores es requerida' });
    }

    await withTransaction(async (client) => {
      // Clear existing lineup for this team in this match
      await client.query(
        `DELETE FROM match_lineups WHERE match_id = $1 AND team_entry_id = $2`,
        [id, team_entry_id]
      );

      // Insert new lineup
      for (const p of players) {
        await client.query(
          `INSERT INTO match_lineups (match_id, team_entry_id, player_registration_id, jersey_number, is_starter, is_captain)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, team_entry_id, p.player_registration_id, p.jersey_number, p.is_starter ?? true, p.is_captain ?? false]
        );
      }
    });

    res.json({
      success: true,
      message: 'Alineación de equipo guardada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// --- MATCH EVENTS (RF-12) ---

export const addMatchEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      team_entry_id,
      player_registration_id,
      event_type,
      minute,
      period = 'FIRST_HALF',
      description,
    } = req.body;

    const result = await withTransaction(async (client) => {
      // 1. Insert match event
      const eventRes = await client.query(
        `INSERT INTO match_events (
           match_id, team_entry_id, player_registration_id, event_type, minute, period, description, recorded_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [id, team_entry_id, player_registration_id || null, event_type, minute, period, description || null, req.user.id]
      );

      const newEvent = eventRes.rows[0];

      // 2. If GOAL or OWN_GOAL, update match score automatically
      if (event_type === 'GOAL' || event_type === 'OWN_GOAL') {
        const matchInfo = await client.query(
          `SELECT home_team_entry_id, away_team_entry_id FROM matches WHERE id = $1`,
          [id]
        );
        const { home_team_entry_id, away_team_entry_id } = matchInfo.rows[0];

        let homeIncrement = 0;
        let awayIncrement = 0;

        if (event_type === 'GOAL') {
          if (team_entry_id === home_team_entry_id) homeIncrement = 1;
          if (team_entry_id === away_team_entry_id) awayIncrement = 1;
        } else if (event_type === 'OWN_GOAL') {
          // Own goal counts in favor of the rival team
          if (team_entry_id === home_team_entry_id) awayIncrement = 1;
          if (team_entry_id === away_team_entry_id) homeIncrement = 1;
        }

        await client.query(
          `UPDATE matches
           SET home_score = home_score + $1,
               away_score = away_score + $2
           WHERE id = $3`,
          [homeIncrement, awayIncrement, id]
        );
      }

      await logAudit({
        client,
        matchId: id,
        userId: req.user.id,
        action: 'ADD_MATCH_EVENT',
        entityName: 'match_events',
        entityId: newEvent.id,
        newValues: newEvent,
        reason: `Registro de evento: ${event_type} en minuto ${minute}`,
        req,
      });

      return newEvent;
    });

    res.status(201).json({
      success: true,
      message: 'Evento registrado con éxito',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteMatchEvent = async (req, res, next) => {
  try {
    const { id, eventId } = req.params;

    await withTransaction(async (client) => {
      const eventRes = await client.query('SELECT * FROM match_events WHERE id = $1 AND match_id = $2', [eventId, id]);
      if (eventRes.rows.length === 0) {
        throw new Error('Evento no encontrado');
      }

      const event = eventRes.rows[0];

      // If it was a goal, adjust match score backwards
      if (event.event_type === 'GOAL' || event.event_type === 'OWN_GOAL') {
        const matchInfo = await client.query(`SELECT home_team_entry_id, away_team_entry_id FROM matches WHERE id = $1`, [id]);
        const { home_team_entry_id, away_team_entry_id } = matchInfo.rows[0];

        let homeDecrement = 0;
        let awayDecrement = 0;

        if (event.event_type === 'GOAL') {
          if (event.team_entry_id === home_team_entry_id) homeDecrement = 1;
          if (event.team_entry_id === away_team_entry_id) awayDecrement = 1;
        } else if (event.event_type === 'OWN_GOAL') {
          if (event.team_entry_id === home_team_entry_id) awayDecrement = 1;
          if (event.team_entry_id === away_team_entry_id) homeDecrement = 1;
        }

        await client.query(
          `UPDATE matches
           SET home_score = GREATEST(0, home_score - $1),
               away_score = GREATEST(0, away_score - $2)
           WHERE id = $3`,
          [homeDecrement, awayDecrement, id]
        );
      }

      await client.query('DELETE FROM match_events WHERE id = $1', [eventId]);
    });

    res.json({
      success: true,
      message: 'Evento eliminado y marcador recalculado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// --- PENALTIES (RF-16) ---

export const recordPenaltyShootout = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { team_entry_id, sequence_number, player_registration_id, result } = req.body;

    const saved = await query(
      `INSERT INTO match_penalty_shootouts (match_id, team_entry_id, sequence_number, player_registration_id, result)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, team_entry_id, sequence_number, player_registration_id || null, result]
    );

    res.status(201).json({
      success: true,
      message: 'Penal registrado',
      data: saved.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// --- DIGITAL MATCH SHEET STATUS (RF-12) ---

export const updateSheetStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sheet_status, notes } = req.body;

    const result = await query(
      `UPDATE matches
       SET sheet_status = $1,
           notes = COALESCE($2, notes)
       WHERE id = $3
       RETURNING id, sheet_status, status, notes`,
      [sheet_status, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Partido no encontrado' });
    }

    res.json({
      success: true,
      message: `Planilla de partido actualizada a ${sheet_status}`,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// --- OFFICIALIZATION OF MATCH (RF-13) ---
/**
 * Calls stored procedure sp_officialize_match(p_match_id, p_admin_user_id, p_admin_notes)
 * Generates automated sanctions, automated point deductions, financial charges, and updates standings/ties!
 */
export const officializeMatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    const adminUserId = req.user.id;

    // Check if match exists and state
    const matchRes = await query('SELECT id, status, sheet_status FROM matches WHERE id = $1', [id]);
    if (matchRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Partido no encontrado' });
    }

    if (matchRes.rows[0].status === 'OFFICIALIZED') {
      return res.status(400).json({
        success: false,
        message: 'El partido ya ha sido oficializado previamente.',
      });
    }

    // Call stored procedure in PostgreSQL
    await query(`CALL sp_officialize_match($1, $2, $3)`, [id, adminUserId, admin_notes || null]);

    // Query refreshed match with sanctions and financial charges created
    const refreshed = await query(
      `SELECT m.*, 
              (SELECT json_agg(s.*) FROM sanctions s WHERE s.match_id = m.id) AS generated_sanctions,
              (SELECT json_agg(fc.*) FROM financial_charges fc WHERE fc.match_event_id IN (SELECT id FROM match_events WHERE match_id = m.id)) AS generated_charges
       FROM matches m WHERE m.id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Partido oficializado con éxito. Tablas de posiciones, sanciones y cargos generados automáticamente.',
      data: refreshed.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

