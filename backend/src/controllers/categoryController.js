import { query } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

export const listCategories = async (req, res, next) => {
  try {
    const { tournament_id } = req.query;
    let sql = `
      SELECT c.*, t.name AS tournament_name, t.organization_id,
             (SELECT COUNT(*) FROM team_entries te WHERE te.category_id = c.id) AS teams_count,
             (SELECT COUNT(*) FROM competition_phases cp WHERE cp.category_id = c.id) AS phases_count
      FROM categories c
      JOIN tournaments t ON c.tournament_id = t.id
    `;
    const params = [];

    if (tournament_id) {
      sql += ` WHERE c.tournament_id = $1`;
      params.push(tournament_id);
    }

    sql += ` ORDER BY c.name ASC`;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT c.*, t.name AS tournament_name, t.organization_id,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                  'id', cp.id,
                  'name', cp.name,
                  'phase_type', cp.phase_type,
                  'phase_order', cp.phase_order,
                  'status', cp.status
                )) FILTER (WHERE cp.id IS NOT NULL), '[]'
              ) AS phases
       FROM categories c
       JOIN tournaments t ON c.tournament_id = t.id
       LEFT JOIN competition_phases cp ON cp.category_id = c.id
       WHERE c.id = $1
       GROUP BY c.id, t.name, t.organization_id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const { tournament_id, name, description, format = 'FUTBOL_11', status = 'ACTIVE' } = req.body;

    const tourRes = await query('SELECT organization_id FROM tournaments WHERE id = $1', [tournament_id]);
    if (tourRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Torneo no encontrado' });
    }

    const orgId = tourRes.rows[0].organization_id;

    const result = await query(
      `INSERT INTO categories (tournament_id, name, description, format, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tournament_id, name, description || null, format, status]
    );

    const newCategory = result.rows[0];

    await logAudit({
      organizationId: orgId,
      tournamentId: tournament_id,
      categoryId: newCategory.id,
      userId: req.user.id,
      action: 'CREATE_CATEGORY',
      entityName: 'categories',
      entityId: newCategory.id,
      newValues: newCategory,
      reason: 'Creación de categoría en torneo',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Categoría creada exitosamente',
      data: newCategory,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, format, status } = req.body;

    const oldRes = await query(
      `SELECT c.*, t.organization_id 
       FROM categories c 
       JOIN tournaments t ON c.tournament_id = t.id 
       WHERE c.id = $1`,
      [id]
    );

    if (oldRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    }

    const updated = await query(
      `UPDATE categories
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           format = COALESCE($3, format),
           status = COALESCE($4, status)
       WHERE id = $5
       RETURNING *`,
      [name, description, format, status, id]
    );

    await logAudit({
      organizationId: oldRes.rows[0].organization_id,
      tournamentId: oldRes.rows[0].tournament_id,
      categoryId: id,
      userId: req.user.id,
      action: 'UPDATE_CATEGORY',
      entityName: 'categories',
      entityId: id,
      oldValues: oldRes.rows[0],
      newValues: updated.rows[0],
      reason: 'Actualización de categoría',
      req,
    });

    res.json({
      success: true,
      message: 'Categoría actualizada exitosamente',
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

