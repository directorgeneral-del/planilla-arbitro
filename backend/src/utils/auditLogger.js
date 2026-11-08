import { query } from '../config/db.js';

/**
 * Utility to register an audit log record into audit_logs table (RF-22)
 */
export const logAudit = async ({
  client = null, // optional client if inside a transaction
  organizationId = null,
  tournamentId = null,
  categoryId = null,
  matchId = null,
  userId = null,
  action,
  entityName,
  entityId = null,
  oldValues = null,
  newValues = null,
  reason = null,
  req = null,
}) => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null;
    const userAgent = req ? req.headers['user-agent'] : null;

    const sql = `
      INSERT INTO audit_logs (
        organization_id, tournament_id, category_id, match_id, user_id,
        action, entity_name, entity_id, old_values, new_values, reason,
        ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, created_at
    `;
    const params = [
      organizationId,
      tournamentId,
      categoryId,
      matchId,
      userId,
      action,
      entityName,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      reason,
      ipAddress,
      userAgent,
    ];

    if (client) {
      return await client.query(sql, params);
    } else {
      return await query(sql, params);
    }
  } catch (error) {
    // Non-fatal, but logged
    console.error('Failed to write audit log:', error.message);
  }
};

