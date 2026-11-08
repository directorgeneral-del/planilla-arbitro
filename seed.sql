-- ============================================================================
-- SCRIPT DE DATOS DE PRUEBA (SEED DATA)
-- Plataforma SaaS Multi-Tenant para Torneos de Fútbol
-- Base de Datos: PostgreSQL 14+
-- ============================================================================

-- Variables de Identificadores UUID fijos para pruebas reproducibles
DO $$
DECLARE
    -- Organizaciones
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_org2_id UUID := '22222222-2222-2222-2222-222222222222';
    
    -- Usuarios
    v_admin_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_referee_user_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_delegate_user_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    
    -- Temporada y Torneo
    v_season_id UUID := '33333333-3333-3333-3333-333333333333';
    v_tournament_id UUID := '44444444-4444-4444-4444-444444444444';
    v_category_id UUID := '55555555-5555-5555-5555-555555555555';
    
    -- Fase y Grupo
    v_phase_id UUID := '66666666-6666-6666-6666-666666666666';
    v_group_id UUID := '77777777-7777-7777-7777-777777777777';
    
    -- Cancha y Árbitro
    v_venue_id UUID := '88888888-8888-8888-8888-888888888888';
    v_referee_id UUID := '99999999-9999-9999-9999-999999999999';
    
    -- Equipos (Clubes)
    v_team1_id UUID := 'a1111111-1111-1111-1111-111111111111';
    v_team2_id UUID := 'a2222222-2222-2222-2222-222222222222';
    v_team3_id UUID := 'a3333333-3333-3333-3333-333333333333';
    v_team4_id UUID := 'a4444444-4444-4444-4444-444444444444';
    
    -- Inscripciones de Equipos (Team Entries)
    v_entry1_id UUID := 'e1111111-1111-1111-1111-111111111111';
    v_entry2_id UUID := 'e2222222-2222-2222-2222-222222222222';
    v_entry3_id UUID := 'e3333333-3333-3333-3333-333333333333';
    v_entry4_id UUID := 'e4444444-4444-4444-4444-444444444444';
    
    -- Jugadores
    v_player1_id UUID := 'b1111111-1111-1111-1111-111111111111';
    v_player2_id UUID := 'b2222222-2222-2222-2222-222222222222';
    v_player3_id UUID := 'b3333333-3333-3333-3333-333333333333';
    
    -- Registros de Jugadores
    v_preg1_id UUID := 'c1111111-1111-1111-1111-111111111111';
    v_preg2_id UUID := 'c2222222-2222-2222-2222-222222222222';
    v_preg3_id UUID := 'c3333333-3333-3333-3333-333333333333';
    
    -- Partidos
    v_match1_id UUID := 'd1111111-1111-1111-1111-111111111111';
    v_match2_id UUID := 'd2222222-2222-2222-2222-222222222222';
    
    -- Regla de Sanción
    v_rule_yellow_id UUID := 'f1111111-1111-1111-1111-111111111111';
    v_rule_red_id UUID := 'f2222222-2222-2222-2222-222222222222';
BEGIN
    -- 1. Usuarios
    INSERT INTO users (id, email, password_hash, full_name, phone, status) VALUES
        (v_admin_id, 'admin@ligamunicipal.com', '$2b$12$eX4mPl3h4sh...', 'Carlos Administrador', '3001234567', 'ACTIVE'),
        (v_referee_user_id, 'arbitro.central@arbitros.com', '$2b$12$eX4mPl3h4sh...', 'Wilmar Roldán Árbitro', '3109876543', 'ACTIVE'),
        (v_delegate_user_id, 'delegado@halconesfc.com', '$2b$12$eX4mPl3h4sh...', 'Jorge Delegado Halcones', '3205556677', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;

    -- 2. Organizaciones (Multi-tenant)
    INSERT INTO organizations (id, legal_name, commercial_name, tax_id, city, country, email, status, main_admin_user_id) VALUES
        (v_org_id, 'Liga Deportiva Municipal de Fútbol', 'Liga Municipal', '900123456-1', 'Cali', 'Colombia', 'contacto@ligamunicipal.com', 'ACTIVE', v_admin_id),
        (v_org2_id, 'Copa Empresarial Urkusoft S.A.S.', 'Torneo Empresarial', '901987654-2', 'Bogotá', 'Colombia', 'info@urkusoft.com', 'ACTIVE', v_admin_id)
    ON CONFLICT (id) DO NOTHING;

    -- Membresía
    INSERT INTO organization_memberships (organization_id, user_id, membership_status) VALUES
        (v_org_id, v_admin_id, 'ACTIVE'),
        (v_org_id, v_referee_user_id, 'ACTIVE'),
        (v_org_id, v_delegate_user_id, 'ACTIVE')
    ON CONFLICT DO NOTHING;

    -- 3. Temporadas y Torneos
    INSERT INTO seasons (id, organization_id, name, year, start_date, end_date, status) VALUES
        (v_season_id, v_org_id, 'Temporada Anual 2026', 2026, '2026-01-15', '2026-12-15', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO tournaments (id, organization_id, season_id, name, description, competition_format, status, start_date, end_date) VALUES
        (v_tournament_id, v_org_id, v_season_id, 'Copa de Verano 2026', 'Torneo oficial de mitad de año', 'GROUPS_AND_KNOCKOUT', 'IN_PROGRESS', '2026-06-01', '2026-08-30')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO categories (id, tournament_id, name, description, format, status) VALUES
        (v_category_id, v_tournament_id, 'Primera A (Libre)', 'Categoría de máxima competitividad', 'FUTBOL_11', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;

    -- 4. Fases y Grupos
    INSERT INTO competition_phases (id, category_id, name, phase_type, phase_order, status) VALUES
        (v_phase_id, v_category_id, 'Fase de Grupos Regular', 'GROUP_STAGE', 1, 'IN_PROGRESS')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO groups (id, phase_id, name) VALUES
        (v_group_id, v_phase_id, 'Grupo A')
    ON CONFLICT (id) DO NOTHING;

    -- 5. Canchas e Instalaciones
    INSERT INTO venues (id, organization_id, name, location, capacity, status) VALUES
        (v_venue_id, v_org_id, 'Cancha Principal Estadio Olaya', 'Carrera 21 # 27-50 Sur', 2500, 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;

    -- 6. Árbitros
    INSERT INTO referees (id, organization_id, user_id, full_name, phone, email, status) VALUES
        (v_referee_id, v_org_id, v_referee_user_id, 'Wilmar Roldán Árbitro', '3109876543', 'arbitro.central@arbitros.com', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;

    -- 7. Equipos y sus Inscripciones a la Categoría
    INSERT INTO teams (id, organization_id, name, short_name, primary_color, secondary_color, delegate_user_id, status) VALUES
        (v_team1_id, v_org_id, 'Club Deportivo Los Halcones', 'Halcones', '#003366', '#FFFFFF', v_delegate_user_id, 'ACTIVE'),
        (v_team2_id, v_org_id, 'Atlético San Martín F.C.', 'San Martín', '#FF0000', '#000000', NULL, 'ACTIVE'),
        (v_team3_id, v_org_id, 'Real Dinamo del Norte', 'Dinamo', '#008000', '#FFFF00', NULL, 'ACTIVE'),
        (v_team4_id, v_org_id, 'Inter Deportivo Los Andes', 'Inter Andes', '#0000FF', '#000000', NULL, 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO team_entries (id, category_id, team_id, registration_status) VALUES
        (v_entry1_id, v_category_id, v_team1_id, 'CONFIRMED'),
        (v_entry2_id, v_category_id, v_team2_id, 'CONFIRMED'),
        (v_entry3_id, v_category_id, v_team3_id, 'CONFIRMED'),
        (v_entry4_id, v_category_id, v_team4_id, 'CONFIRMED')
    ON CONFLICT (id) DO NOTHING;

    -- Asignación a Grupo A
    INSERT INTO group_memberships (group_id, team_entry_id, seeded_position) VALUES
        (v_group_id, v_entry1_id, 1),
        (v_group_id, v_entry2_id, 2),
        (v_group_id, v_entry3_id, 3),
        (v_group_id, v_entry4_id, 4)
    ON CONFLICT DO NOTHING;

    -- 8. Jugadores y Plantillas
    INSERT INTO players (id, first_name, last_name, document_type, document_number, birth_date, status) VALUES
        (v_player1_id, 'Mateo', 'Gómez Giraldo', 'CC', '1098765432', '1998-05-14', 'ACTIVE'),
        (v_player2_id, 'Sebastián', 'Pérez Morales', 'CC', '1087654321', '2000-11-20', 'ACTIVE'),
        (v_player3_id, 'Camilo', 'Zapata Restrepo', 'CC', '1076543210', '1995-03-08', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO player_registrations (id, team_entry_id, player_id, jersey_number, position, is_captain, registration_status) VALUES
        (v_preg1_id, v_entry1_id, v_player1_id, 10, 'FORWARD', TRUE, 'ACTIVE'),
        (v_preg2_id, v_entry1_id, v_player2_id, 8, 'MIDFIELDER', FALSE, 'ACTIVE'),
        (v_preg3_id, v_entry2_id, v_player3_id, 9, 'FORWARD', TRUE, 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;

    -- 9. Reglas de Sanción
    INSERT INTO sanction_rules (id, tournament_id, category_id, infraction_type, financial_amount, liable_party, points_deduction, matches_suspended, disciplinary_points) VALUES
        (v_rule_yellow_id, v_tournament_id, v_category_id, 'YELLOW_CARD', 15000.00, 'PLAYER', 0, 0, 1),
        (v_rule_red_id, v_tournament_id, v_category_id, 'RED_CARD', 45000.00, 'PLAYER', 0, 1, 5)
    ON CONFLICT (id) DO NOTHING;

    -- 10. Partidos (Jornada 1 y 2)
    -- Partido 1: Halcones (Local: 3) vs San Martín (Visitante: 1) -> Oficializado
    INSERT INTO matches (
        id, category_id, phase_id, group_id, match_day, match_date, venue_id,
        home_team_entry_id, away_team_entry_id, home_score, away_score, status, sheet_status, officialized_at
    ) VALUES (
        v_match1_id, v_category_id, v_phase_id, v_group_id, 1, '2026-06-05 15:00:00-05', v_venue_id,
        v_entry1_id, v_entry2_id, 3, 1, 'OFFICIALIZED', 'APPROVED', CURRENT_TIMESTAMP
    ) ON CONFLICT (id) DO NOTHING;

    -- Partido 2: Dinamo (Local: 2) vs Inter Andes (Visitante: 2) -> Oficializado
    INSERT INTO matches (
        id, category_id, phase_id, group_id, match_day, match_date, venue_id,
        home_team_entry_id, away_team_entry_id, home_score, away_score, status, sheet_status, officialized_at
    ) VALUES (
        v_match2_id, v_category_id, v_phase_id, v_group_id, 1, '2026-06-05 17:00:00-05', v_venue_id,
        v_entry3_id, v_entry4_id, 2, 2, 'OFFICIALIZED', 'APPROVED', CURRENT_TIMESTAMP
    ) ON CONFLICT (id) DO NOTHING;

    -- Árbitro del partido
    INSERT INTO match_referees (match_id, referee_id, referee_role, status) VALUES
        (v_match1_id, v_referee_id, 'MAIN', 'CONFIRMED')
    ON CONFLICT DO NOTHING;

    -- Alineación y Eventos del Partido 1
    INSERT INTO match_lineups (match_id, team_entry_id, player_registration_id, jersey_number, is_starter, is_captain) VALUES
        (v_match1_id, v_entry1_id, v_preg1_id, 10, TRUE, TRUE),
        (v_match1_id, v_entry1_id, v_preg2_id, 8, TRUE, FALSE),
        (v_match1_id, v_entry2_id, v_preg3_id, 9, TRUE, TRUE)
    ON CONFLICT DO NOTHING;

    -- Goles y Tarjetas
    INSERT INTO match_events (match_id, team_entry_id, player_registration_id, event_type, minute, period, description) VALUES
        (v_match1_id, v_entry1_id, v_preg1_id, 'GOAL', 18, 'FIRST_HALF', 'Gol de tiro libre directo'),
        (v_match1_id, v_entry1_id, v_preg1_id, 'GOAL', 54, 'SECOND_HALF', 'Gol de jugada individual'),
        (v_match1_id, v_entry1_id, v_preg2_id, 'GOAL', 78, 'SECOND_HALF', 'Remate de fuera del área'),
        (v_match1_id, v_entry2_id, v_preg3_id, 'GOAL', 83, 'SECOND_HALF', 'Gol de penal reglamentario'),
        (v_match1_id, v_entry2_id, v_preg3_id, 'YELLOW_CARD', 35, 'FIRST_HALF', 'Falta táctica en medio campo')
    ON CONFLICT DO NOTHING;

    -- Deducción Disciplinaria de Prueba: Se le resta 1 punto a Inter Andes por conducta antideportiva aprobada
    INSERT INTO disciplinary_deductions (category_id, team_entry_id, match_id, deduction_type, points, reason, status) VALUES
        (v_category_id, v_entry4_id, v_match2_id, 'MANUAL', 1, 'Sanción disciplinaria por reclamos excesivos al cuerpo arbitral', 'APPROVED')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Datos de prueba insertados exitosamente.';
END;
$$;

