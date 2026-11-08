import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

const poolConfig = config.db.connectionString
  ? {
      connectionString: config.db.connectionString,
      max: config.db.max,
      idleTimeoutMillis: config.db.idleTimeoutMillis,
      connectionTimeoutMillis: config.db.connectionTimeoutMillis,
    }
  : {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      max: config.db.max,
      idleTimeoutMillis: config.db.idleTimeoutMillis,
      connectionTimeoutMillis: config.db.connectionTimeoutMillis,
    };

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

/**
 * Execute a parameterized query against PostgreSQL.
 * If organizationId is provided, runs inside a transaction setting app.current_organization_id for RLS.
 */
export const query = async (text, params = [], organizationId = null) => {
  if (organizationId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_organization_id = $1`, [organizationId]);
      const res = await client.query(text, params);
      await client.query('COMMIT');
      return res;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.nodeEnv === 'development' && duration > 1000) {
    console.warn(`Slow query (${duration}ms):`, text);
  }
  return res;
};

/**
 * Execute multiple database operations within a managed transaction.
 * Automatically handles BEGIN, SET LOCAL (if org provided), COMMIT, and ROLLBACK.
 */
export const withTransaction = async (callback, organizationId = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (organizationId) {
      await client.query(`SET LOCAL app.current_organization_id = $1`, [organizationId]);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Test connectivity to PostgreSQL.
 */
export const testConnection = async () => {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT NOW() AS now, current_database() AS db');
    return res.rows[0];
  } finally {
    client.release();
  }
};

