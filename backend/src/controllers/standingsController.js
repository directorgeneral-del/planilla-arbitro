import { query } from '../config/db.js';

/**
 * Returns standings for a specific group from PostgreSQL view vw_group_standings
 */
export const getGroupStandings = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const result = await query(
      `SELECT * FROM vw_group_standings WHERE group_id = $1 ORDER BY posicion ASC`,
      [groupId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns standings for all groups in a category
 */
export const getCategoryStandings = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const result = await query(
      `SELECT v.* 
       FROM vw_group_standings v
       JOIN competition_phases cp ON v.phase_id = cp.id
       WHERE cp.category_id = $1
       ORDER BY v.group_name ASC, v.posicion ASC`,
      [categoryId]
    );

    // Group rows by group_name
    const grouped = result.rows.reduce((acc, row) => {
      acc[row.group_name] = acc[row.group_name] || [];
      acc[row.group_name].push(row);
      return acc;
    }, {});

    res.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns top scorers for a tournament or category from vw_top_scorers (RF-17)
 */
export const getTopScorers = async (req, res, next) => {
  try {
    const { tournamentId } = req.params;
    const { category_id, limit = 20 } = req.query;

    let sql = `SELECT * FROM vw_top_scorers WHERE tournament_id = $1`;
    const params = [tournamentId];

    if (category_id) {
      params.push(category_id);
      sql += ` AND category_id = $${params.length}`;
    }

    sql += ` ORDER BY total_goals DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns Fair Play table from vw_fair_play (RF-17)
 */
export const getFairPlay = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const result = await query(
      `SELECT * FROM vw_fair_play WHERE category_id = $1 ORDER BY total_disciplinary_points ASC`,
      [categoryId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public tournament summary / landing page
 */
export const getTournamentOverview = async (req, res, next) => {
  try {
    const { tournamentId } = req.params;

    const tourRes = await query('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
    if (tourRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Torneo no encontrado' });
    }

    const categoriesRes = await query('SELECT * FROM categories WHERE tournament_id = $1', [tournamentId]);
    const topScorersRes = await query('SELECT * FROM vw_top_scorers WHERE tournament_id = $1 LIMIT 5', [tournamentId]);
    const recentMatchesRes = await query(
      `SELECT m.*, 
              COALESCE(te1.custom_name, t1.name) AS home_team,
              COALESCE(te2.custom_name, t2.name) AS away_team
       FROM matches m
       JOIN categories c ON m.category_id = c.id
       JOIN team_entries te1 ON m.home_team_entry_id = te1.id
       JOIN teams t1 ON te1.team_id = t1.id
       JOIN team_entries te2 ON m.away_team_entry_id = te2.id
       JOIN teams t2 ON te2.team_id = t2.id
       WHERE c.tournament_id = $1
       ORDER BY m.match_date DESC LIMIT 5`,
      [tournamentId]
    );

    res.json({
      success: true,
      data: {
        tournament: tourRes.rows[0],
        categories: categoriesRes.rows,
        top_scorers: topScorersRes.rows,
        recent_matches: recentMatchesRes.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

