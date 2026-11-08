import { query, withTransaction } from '../config/db.js';
import { logAudit } from '../utils/auditLogger.js';

// --- FINANCIAL CHARGES (RF-19) ---

export const listCharges = async (req, res, next) => {
  try {
    const { organization_id, tournament_id, team_entry_id, status } = req.query;

    // Privacy check: If user is DELEGATE, only allow filtering by their team
    let sql = `
      SELECT fc.*,
             COALESCE(te.custom_name, tm.name) AS team_name,
             p.first_name || ' ' || p.last_name AS player_name
      FROM financial_charges fc
      JOIN team_entries te ON fc.team_entry_id = te.id
      JOIN teams tm ON te.team_id = tm.id
      LEFT JOIN player_registrations pr ON fc.player_registration_id = pr.id
      LEFT JOIN players p ON pr.player_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (organization_id) {
      params.push(organization_id);
      sql += ` AND fc.organization_id = $${params.length}`;
    }

    if (tournament_id) {
      params.push(tournament_id);
      sql += ` AND fc.tournament_id = $${params.length}`;
    }

    if (team_entry_id) {
      params.push(team_entry_id);
      sql += ` AND fc.team_entry_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND fc.status = $${params.length}`;
    }

    sql += ` ORDER BY fc.created_at DESC`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

export const createCharge = async (req, res, next) => {
  try {
    const {
      organization_id,
      tournament_id,
      category_id,
      team_entry_id,
      player_registration_id,
      charge_target = 'TEAM',
      title,
      amount,
      due_date,
    } = req.body;

    const result = await query(
      `INSERT INTO financial_charges (
         organization_id, tournament_id, category_id, team_entry_id, player_registration_id,
         charge_target, title, amount, balance, status, due_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'PENDING', $9)
       RETURNING *`,
      [
        organization_id,
        tournament_id,
        category_id || null,
        team_entry_id,
        player_registration_id || null,
        charge_target,
        title,
        amount,
        due_date || null,
      ]
    );

    const newCharge = result.rows[0];

    await logAudit({
      organizationId: organization_id,
      tournamentId: tournament_id,
      userId: req.user.id,
      action: 'CREATE_FINANCIAL_CHARGE',
      entityName: 'financial_charges',
      entityId: newCharge.id,
      newValues: newCharge,
      reason: `Cargo financiero creado: ${title} por valor de ${amount}`,
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Cargo financiero registrado exitosamente',
      data: newCharge,
    });
  } catch (error) {
    next(error);
  }
};

// --- PAYMENTS & ALLOCATIONS (RF-20) ---

export const listPayments = async (req, res, next) => {
  try {
    const { organization_id, tournament_id, team_entry_id, status } = req.query;
    let sql = `
      SELECT p.*,
             COALESCE(te.custom_name, tm.name) AS team_name,
             u.full_name AS recorded_by_name,
             COALESCE(
               json_agg(DISTINCT jsonb_build_object(
                 'allocation_id', pa.id,
                 'charge_id', pa.financial_charge_id,
                 'allocated_amount', pa.allocated_amount
               )) FILTER (WHERE pa.id IS NOT NULL), '[]'
             ) AS allocations
      FROM payments p
      LEFT JOIN team_entries te ON p.team_entry_id = te.id
      LEFT JOIN teams tm ON te.team_id = tm.id
      LEFT JOIN users u ON p.recorded_by = u.id
      LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (organization_id) {
      params.push(organization_id);
      sql += ` AND p.organization_id = $${params.length}`;
    }

    if (tournament_id) {
      params.push(tournament_id);
      sql += ` AND p.tournament_id = $${params.length}`;
    }

    if (team_entry_id) {
      params.push(team_entry_id);
      sql += ` AND p.team_entry_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND p.status = $${params.length}`;
    }

    sql += ` GROUP BY p.id, te.custom_name, tm.name, u.full_name ORDER BY p.payment_date DESC`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

/**
 * Registers a payment and allocates it to one or more financial charges.
 * Handled in an atomic PostgreSQL transaction.
 */
export const registerPayment = async (req, res, next) => {
  try {
    const {
      organization_id,
      tournament_id,
      category_id,
      team_entry_id,
      player_registration_id,
      amount,
      payment_method = 'CASH',
      reference_number,
      receipt_url,
      notes,
      allocations, // Array of { financial_charge_id, allocated_amount }
    } = req.body;

    const result = await withTransaction(async (client) => {
      // 1. Insert payment header
      const payRes = await client.query(
        `INSERT INTO payments (
           organization_id, tournament_id, category_id, team_entry_id, player_registration_id,
           amount, payment_method, reference_number, receipt_url, recorded_by, notes, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'CONFIRMED')
         RETURNING *`,
        [
          organization_id,
          tournament_id,
          category_id || null,
          team_entry_id || null,
          player_registration_id || null,
          amount,
          payment_method,
          reference_number || null,
          receipt_url || null,
          req.user.id,
          notes || null,
        ]
      );

      const payment = payRes.rows[0];

      // 2. Insert allocations if specified
      const createdAllocations = [];
      if (Array.isArray(allocations) && allocations.length > 0) {
        for (const alloc of allocations) {
          const allocRes = await client.query(
            `INSERT INTO payment_allocations (payment_id, financial_charge_id, allocated_amount)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [payment.id, alloc.financial_charge_id, alloc.allocated_amount]
          );
          createdAllocations.push(allocRes.rows[0]);
        }
      }

      await logAudit({
        client,
        organizationId: organization_id,
        tournamentId: tournament_id,
        userId: req.user.id,
        action: 'RECEIVE_PAYMENT',
        entityName: 'payments',
        entityId: payment.id,
        newValues: payment,
        reason: `Registro de pago recibido: ${payment_method} por ${amount}`,
        req,
      });

      return {
        ...payment,
        allocations: createdAllocations,
      };
    });

    res.status(201).json({
      success: true,
      message: 'Pago recibido y conciliado exitosamente',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reverses a payment and restores balances with audit log (RF-20)
 */
export const reversePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reversal_reason } = req.body;

    const result = await withTransaction(async (client) => {
      const payRes = await client.query('SELECT * FROM payments WHERE id = $1', [id]);
      if (payRes.rows.length === 0) {
        throw new Error('Pago no encontrado');
      }

      const payment = payRes.rows[0];
      if (payment.status === 'REVERSED') {
        throw new Error('El pago ya se encuentra anulado/reversado');
      }

      // Delete allocations (trigger update_charge_balance_on_allocation restores charge balances!)
      await client.query('DELETE FROM payment_allocations WHERE payment_id = $1', [id]);

      // Update payment status
      const updatedRes = await client.query(
        `UPDATE payments
         SET status = 'REVERSED',
             reversal_reason = $1,
             reversed_by = $2,
             reversed_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [reversal_reason, req.user.id, id]
      );

      await logAudit({
        client,
        organizationId: payment.organization_id,
        tournamentId: payment.tournament_id,
        userId: req.user.id,
        action: 'REVERSE_PAYMENT',
        entityName: 'payments',
        entityId: id,
        newValues: updatedRes.rows[0],
        reason: reversal_reason,
        req,
      });

      return updatedRes.rows[0];
    });

    res.json({
      success: true,
      message: 'Pago reversado exitosamente. Saldos de cargos restaurados.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// --- TEAM ACCOUNT STATEMENT (RF-14, RF-19, RF-20) ---

export const getTeamAccountStatement = async (req, res, next) => {
  try {
    const { teamEntryId } = req.params;

    const result = await query(
      `SELECT * FROM vw_team_account_statement WHERE team_entry_id = $1 ORDER BY charge_date DESC`,
      [teamEntryId]
    );

    // Summary calculation
    const totalCharges = result.rows.reduce((sum, item) => sum + parseFloat(item.total_amount || 0), 0);
    const totalPaid = result.rows.reduce((sum, item) => sum + parseFloat(item.total_paid || 0), 0);
    const pendingBalance = result.rows.reduce((sum, item) => sum + parseFloat(item.pending_balance || 0), 0);

    res.json({
      success: true,
      data: {
        summary: {
          totalCharges,
          totalPaid,
          pendingBalance,
        },
        items: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

