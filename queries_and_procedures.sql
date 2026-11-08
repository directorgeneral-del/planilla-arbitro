-- ============================================================================
-- PROCEDIMIENTOS ALMACENADOS, FUNCIONES Y CONSULTAS OPERATIVAS
-- Base de Datos: Plataforma SaaS Multi-Tenant para Torneos de Fútbol
-- Motor: PostgreSQL 14+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROCEDIMIENTO ALMACENADO: OFICIALIZACIÓN DE RESULTADOS (RF-13)
-- ----------------------------------------------------------------------------
-- Flujo:
-- 1. Valida que el partido exista y esté en estado 'PLAYED' o 'IN_REVIEW'.
-- 2. Cambia el estado del partido a 'OFFICIALIZED' y aprueba la planilla.
-- 3. Genera sanciones y cargos financieros automáticos según las reglas vigentes.
-- 4. Si el partido pertenece a una serie de ida y vuelta (tie), actualiza el marcador global.
-- 5. Registra el movimiento en el log de auditoría (RF-22).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE sp_officialize_match(
    p_match_id UUID,
    p_admin_user_id UUID,
    p_admin_notes TEXT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_match RECORD;
    v_category RECORD;
    v_event RECORD;
    v_rule RECORD;
    v_sanction_id UUID;
    v_financial_charge_id UUID;
    v_tie RECORD;
    v_home_score INT;
    v_away_score INT;
BEGIN
    -- 1. Obtener datos del partido
    SELECT m.*, t.organization_id, c.tournament_id
    INTO v_match
    FROM matches m
    JOIN categories c ON m.category_id = c.id
    JOIN tournaments t ON c.tournament_id = t.id
    WHERE m.id = p_match_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El partido con ID % no existe.', p_match_id;
    END IF;

    IF v_match.status = 'OFFICIALIZED' THEN
        RAISE NOTICE 'El partido con ID % ya se encuentra oficializado.', p_match_id;
        RETURN;
    END IF;

    -- 2. Actualizar estado del partido y planilla
    UPDATE matches
    SET status = 'OFFICIALIZED',
        sheet_status = 'APPROVED',
        officialized_at = CURRENT_TIMESTAMP,
        officialized_by = p_admin_user_id,
        notes = COALESCE(p_admin_notes, notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_match_id;

    -- 3. Procesar eventos disciplinarios para generar sanciones y cargos automáticos
    FOR v_event IN
        SELECT me.*
        FROM match_events me
        WHERE me.match_id = p_match_id
          AND me.event_type IN ('YELLOW_CARD', 'RED_CARD', 'SECOND_YELLOW_CARD', 'FIGHT', 'FIELD_ABANDONMENT', 'DEFAULT_NO_SHOW')
    LOOP
        -- Buscar regla aplicable para la infracción en el torneo/categoría
        SELECT *
        INTO v_rule
        FROM sanction_rules sr
        WHERE sr.tournament_id = v_match.tournament_id
          AND (sr.category_id IS NULL OR sr.category_id = v_match.category_id)
          AND sr.infraction_type = v_event.event_type
          AND sr.is_active = TRUE
          AND (sr.effective_from IS NULL OR sr.effective_from <= CURRENT_DATE)
          AND (sr.effective_to IS NULL OR sr.effective_to >= CURRENT_DATE)
        LIMIT 1;

        IF FOUND THEN
            -- A. Crear Sanción Deportiva
            INSERT INTO sanctions (
                rule_id,
                match_event_id,
                match_id,
                team_entry_id,
                player_registration_id,
                sanction_origin,
                description,
                matches_suspended,
                status
            ) VALUES (
                v_rule.id,
                v_event.id,
                p_match_id,
                v_event.team_entry_id,
                v_event.player_registration_id,
                'AUTOMATIC',
                'Sanción automática por evento: ' || v_event.event_type || '. ' || COALESCE(v_event.description, ''),
                v_rule.matches_suspended,
                'ACTIVE'
            ) RETURNING id INTO v_sanction_id;

            -- B. Deducción de puntos si la regla lo especifica
            IF v_rule.points_deduction > 0 THEN
                INSERT INTO disciplinary_deductions (
                    category_id,
                    team_entry_id,
                    match_id,
                    sanction_id,
                    deduction_type,
                    points,
                    reason,
                    status,
                    approved_by,
                    approved_at
                ) VALUES (
                    v_match.category_id,
                    v_event.team_entry_id,
                    p_match_id,
                    v_sanction_id,
                    'AUTOMATIC',
                    v_rule.points_deduction,
                    'Deducción automática por ' || v_event.event_type,
                    'APPROVED',
                    p_admin_user_id,
                    CURRENT_TIMESTAMP
                );
            END IF;

            -- C. Crear Cargo Financiero si aplica multa económica
            IF v_rule.financial_amount > 0 THEN
                INSERT INTO financial_charges (
                    organization_id,
                    tournament_id,
                    category_id,
                    sanction_id,
                    match_event_id,
                    team_entry_id,
                    player_registration_id,
                    charge_target,
                    title,
                    amount,
                    balance,
                    status
                ) VALUES (
                    v_match.organization_id,
                    v_match.tournament_id,
                    v_match.category_id,
                    v_sanction_id,
                    v_event.id,
                    v_event.team_entry_id,
                    CASE WHEN v_rule.liable_party = 'TEAM' THEN NULL ELSE v_event.player_registration_id END,
                    CASE WHEN v_rule.liable_party = 'TEAM' THEN 'TEAM' ELSE 'PLAYER' END,
                    'Multa por ' || v_event.event_type,
                    v_rule.financial_amount,
                    v_rule.financial_amount,
                    'PENDING'
                );
            END IF;
        END IF;
    END LOOP;

    -- 4. Si el partido está asociado a una llave o serie (Tie), actualizar global
    IF v_match.tie_id IS NOT NULL THEN
        -- Calcular marcador global sumando todos los partidos de la serie
        SELECT 
            COALESCE(SUM(CASE WHEN m.home_team_entry_id = ct.team_entry_1_id THEN m.home_score ELSE m.away_score END), 0),
            COALESCE(SUM(CASE WHEN m.home_team_entry_id = ct.team_entry_2_id THEN m.home_score ELSE m.away_score END), 0)
        INTO v_home_score, v_away_score
        FROM competition_ties ct
        JOIN match_legs ml ON ct.id = ml.tie_id
        JOIN matches m ON ml.match_id = m.id
        WHERE ct.id = v_match.tie_id AND m.status = 'OFFICIALIZED';

        UPDATE competition_ties
        SET aggregate_score_team1 = v_home_score,
            aggregate_score_team2 = v_away_score,
            status = 'COMPLETED'
        WHERE id = v_match.tie_id;
    END IF;

    -- 5. Registrar en Auditoría (RF-22)
    INSERT INTO audit_logs (
        organization_id,
        tournament_id,
        category_id,
        match_id,
        user_id,
        action,
        entity_name,
        entity_id,
        new_values,
        reason
    ) VALUES (
        v_match.organization_id,
        v_match.tournament_id,
        v_match.category_id,
        p_match_id,
        p_admin_user_id,
        'OFFICIALIZE',
        'matches',
        p_match_id,
        json_build_object('status', 'OFFICIALIZED', 'sheet_status', 'APPROVED', 'home_score', v_match.home_score, 'away_score', v_match.away_score),
        'Oficialización de resultado por administrador'
    );

    RAISE NOTICE 'Partido % oficializado con éxito.', p_match_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. FUNCIÓN: VALIDACIÓN DE DISPONIBILIDAD DE CANCHA (RF-09)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_venue_conflict(
    p_venue_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_exclude_match_id UUID DEFAULT NULL
)
RETURNS TABLE (
    has_conflict BOOLEAN,
    conflict_type VARCHAR(50),
    description TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Verificar si hay solapamiento con franjas bloqueadas de la cancha
    IF EXISTS (
        SELECT 1 
        FROM venue_blocked_slots vbs
        WHERE vbs.venue_id = p_venue_id
          AND (vbs.start_time, vbs.end_time) OVERLAPS (p_start_time, p_end_time)
    ) THEN
        RETURN QUERY SELECT TRUE, 'BLOCKED_SLOT'::VARCHAR(50), 'La cancha se encuentra bloqueada por mantenimiento o evento externo.'::TEXT;
        RETURN;
    END IF;

    -- 2. Verificar si hay otro partido en la misma cancha en ese horario
    IF EXISTS (
        SELECT 1 
        FROM matches m
        WHERE m.venue_id = p_venue_id
          AND (p_exclude_match_id IS NULL OR m.id <> p_exclude_match_id)
          AND m.status NOT IN ('CANCELLED', 'POSTPONED')
          AND (m.match_date, m.match_date + INTERVAL '105 minutes') OVERLAPS (p_start_time, p_end_time)
    ) THEN
        RETURN QUERY SELECT TRUE, 'MATCH_OVERLAP'::VARCHAR(50), 'Ya existe un partido programado en esta cancha dentro del rango horario.'::TEXT;
        RETURN;
    END IF;

    -- No hay conflicto
    RETURN QUERY SELECT FALSE, 'NONE'::VARCHAR(50), 'Cancha disponible.'::TEXT;
END;
$$;

-- ============================================================================
-- 3. CONSULTAS SQL DE CONSULTA PÚBLICA Y REPORTES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. TABLA DE GOLEADORES (RF-17)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_top_scorers AS
SELECT 
    c.id AS category_id,
    c.name AS category_name,
    t.id AS tournament_id,
    t.name AS tournament_name,
    p.id AS player_id,
    p.first_name || ' ' || p.last_name AS player_name,
    tm.name AS team_name,
    tm.logo_url AS team_logo,
    pr.jersey_number,
    COUNT(me.id) AS total_goals,
    COUNT(CASE WHEN me.period IN ('REGULAR_FIRST_HALF', 'REGULAR_SECOND_HALF') THEN 1 END) AS regular_time_goals,
    COUNT(CASE WHEN me.period IN ('EXTRA_FIRST_HALF', 'EXTRA_SECOND_HALF') THEN 1 END) AS extra_time_goals
FROM match_events me
JOIN matches m ON me.match_id = m.id
JOIN player_registrations pr ON me.player_registration_id = pr.id
JOIN players p ON pr.player_id = p.id
JOIN team_entries te ON me.team_entry_id = te.id
JOIN teams tm ON te.team_id = tm.id
JOIN categories c ON m.category_id = c.id
JOIN tournaments t ON c.tournament_id = t.id
WHERE me.event_type = 'GOAL'
  AND m.status = 'OFFICIALIZED'
GROUP BY c.id, c.name, t.id, t.name, p.id, p.first_name, p.last_name, tm.name, tm.logo_url, pr.jersey_number
ORDER BY total_goals DESC;

-- ----------------------------------------------------------------------------
-- B. TABLA DE JUEGO LIMPIO / FAIR PLAY (RF-17)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_fair_play AS
SELECT 
    c.id AS category_id,
    c.name AS category_name,
    te.id AS team_entry_id,
    tm.name AS team_name,
    tm.logo_url AS team_logo,
    COUNT(CASE WHEN me.event_type = 'YELLOW_CARD' THEN 1 END) AS yellow_cards,
    COUNT(CASE WHEN me.event_type = 'SECOND_YELLOW_CARD' THEN 1 END) AS second_yellow_cards,
    COUNT(CASE WHEN me.event_type = 'RED_CARD' THEN 1 END) AS direct_red_cards,
    COUNT(CASE WHEN me.event_type IN ('FIGHT', 'FIELD_ABANDONMENT') THEN 1 END) AS severe_incidents,
    COALESCE(SUM(
        CASE 
            WHEN me.event_type = 'YELLOW_CARD' THEN 1
            WHEN me.event_type = 'SECOND_YELLOW_CARD' THEN 3
            WHEN me.event_type = 'RED_CARD' THEN 5
            WHEN me.event_type IN ('FIGHT', 'FIELD_ABANDONMENT') THEN 10
            ELSE 0
        END
    ), 0) AS total_disciplinary_points
FROM team_entries te
JOIN teams tm ON te.team_id = tm.id
JOIN categories c ON te.category_id = c.id
LEFT JOIN match_events me ON te.id = me.team_entry_id
LEFT JOIN matches m ON me.match_id = m.id AND m.status = 'OFFICIALIZED'
GROUP BY c.id, c.name, te.id, tm.name, tm.logo_url
ORDER BY total_disciplinary_points ASC;

-- ----------------------------------------------------------------------------
-- C. ESTADO DE CUENTA PRIVADO DE UN EQUIPO (RF-19, RF-20)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_team_account_statement AS
SELECT 
    fc.id AS charge_id,
    fc.organization_id,
    fc.tournament_id,
    fc.category_id,
    fc.team_entry_id,
    tm.name AS team_name,
    fc.charge_target,
    CASE 
        WHEN fc.charge_target = 'PLAYER' THEN p.first_name || ' ' || p.last_name 
        ELSE 'Equipo Completo' 
    END AS liable_name,
    fc.title AS description,
    fc.amount AS total_amount,
    COALESCE(SUM(pa.allocated_amount), 0) AS total_paid,
    fc.balance AS pending_balance,
    fc.status AS charge_status,
    fc.due_date,
    fc.created_at AS charge_date
FROM financial_charges fc
JOIN team_entries te ON fc.team_entry_id = te.id
JOIN teams tm ON te.team_id = tm.id
LEFT JOIN player_registrations pr ON fc.player_registration_id = pr.id
LEFT JOIN players p ON pr.player_id = p.id
LEFT JOIN payment_allocations pa ON fc.id = pa.financial_charge_id
GROUP BY fc.id, fc.organization_id, fc.tournament_id, fc.category_id, fc.team_entry_id, tm.name, fc.charge_target, p.first_name, p.last_name, fc.title, fc.amount, fc.balance, fc.status, fc.due_date, fc.created_at;

