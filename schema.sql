-- ============================================================================
-- BASE DE DATOS: PLATAFORMA SAAS MULTI-TENANT PARA TORNEOS DE FÚTBOL
-- Motor: PostgreSQL 14+ (Compatible con PostgreSQL 14, 15, 16, 17, 18)
-- Descripción: Script DDL completo con claves primarias (UUID), foráneas,
--              restricciones de integridad (CHECK, UNIQUE), índices de rendimiento,
--              disparadores (triggers), vistas analíticas y soporte multi-tenant.
-- Cumplimiento: Documento de Requerimientos de Producto (PRD) v2.0
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. CONFIGURACIÓN INICIAL Y EXTENSIONES
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Función genérica para actualización automática de la columna 'updated_at'
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. IDENTIDAD, USUARIOS, ROLES Y ACCESO (RF-01, RF-21, Sec. 7.2, 7.3)
-- ============================================================================

-- Tabla de Usuarios (Identidad global en la plataforma)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    avatar_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'))
);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tabla del Catálogo de Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Inserción de roles iniciales del sistema
INSERT INTO roles (code, name, description) VALUES
    ('SUPERADMIN', 'Superadministrador de Plataforma', 'Acceso global para gestionar clientes, planes y soporte'),
    ('ORG_ADMIN', 'Administrador de Organización', 'Administra temporadas, torneos, canchas y configuraciones de la organización'),
    ('TOURNAMENT_ADMIN', 'Administrador del Torneo', 'Administra programación, planillas, resultados y sanciones del torneo asignado'),
    ('REFEREE', 'Árbitro', 'Acceso a partidos asignados y registro de planillas e incidencias'),
    ('DELEGATE', 'Delegado de Equipo', 'Consulta información de torneos y administra la información privada de su equipo'),
    ('PUBLIC_USER', 'Usuario Público', 'Consulta calendario, resultados, estadísticas y tablas públicas')
ON CONFLICT (code) DO NOTHING;

-- Organizaciones / Empresas organizadoras (SaaS Multi-tenant - Sec. 7.2 A)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(200) NOT NULL,
    commercial_name VARCHAR(150) NOT NULL,
    tax_id VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    phone VARCHAR(30),
    email VARCHAR(255),
    logo_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    main_admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_org_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Membresía de usuarios en organizaciones (Sec. 7.2 B)
CREATE TABLE organization_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    membership_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_org_mem_status CHECK (membership_status IN ('ACTIVE', 'INACTIVE', 'INVITED')),
    CONSTRAINT uq_org_user UNIQUE (organization_id, user_id)
);

-- ============================================================================
-- 2. TEMPORADAS, TORNEOS Y CATEGORÍAS (RF-02, RF-03, RF-04, Sec. 7.2 C, D, E)
-- ============================================================================

-- Temporadas deportivas (Sec. 7.2 C)
CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    year INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_seasons_status CHECK (status IN ('DRAFT', 'ACTIVE', 'FINISHED', 'ARCHIVED')),
    CONSTRAINT chk_seasons_dates CHECK (end_date >= start_date)
);

CREATE TRIGGER trg_seasons_updated_at
BEFORE UPDATE ON seasons
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Torneos / Campeonatos dentro de una temporada (Sec. 7.2 D)
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    competition_format VARCHAR(40) NOT NULL DEFAULT 'LEAGUE',
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    start_date DATE,
    end_date DATE,
    timezone VARCHAR(60) NOT NULL DEFAULT 'America/Bogota',
    sports_config JSONB NOT NULL DEFAULT '{"points_per_win": 3, "points_per_draw": 1, "points_per_loss": 0}'::jsonb,
    disciplinary_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    financial_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_tournaments_format CHECK (competition_format IN ('LEAGUE', 'KNOCKOUT', 'GROUPS_AND_KNOCKOUT', 'CUSTOM')),
    CONSTRAINT chk_tournaments_status CHECK (status IN (
        'DRAFT', 'REGISTRATION_OPEN', 'IN_PREPARATION', 'IN_PROGRESS', 'SUSPENDED', 'FINISHED', 'ARCHIVED'
    )),
    CONSTRAINT chk_tournament_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TRIGGER trg_tournaments_updated_at
BEFORE UPDATE ON tournaments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Categorías por torneo (Sec. 7.2 E - Primera A, Veteranos, Sub-17, etc.)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    format VARCHAR(40),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    rules_config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_categories_status CHECK (status IN ('DRAFT', 'ACTIVE', 'FINISHED', 'ARCHIVED')),
    CONSTRAINT uq_category_tournament_name UNIQUE (tournament_id, name)
);

CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Asignación de Roles por Ámbito (Sec. 7.3: Organización, Torneo, Categoría)
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices únicos condicionales según el ámbito
CREATE UNIQUE INDEX uq_user_roles_platform ON user_roles(user_id, role_id) 
WHERE organization_id IS NULL AND tournament_id IS NULL AND category_id IS NULL;

CREATE UNIQUE INDEX uq_user_roles_org ON user_roles(user_id, role_id, organization_id) 
WHERE tournament_id IS NULL AND category_id IS NULL;

CREATE UNIQUE INDEX uq_user_roles_tournament ON user_roles(user_id, role_id, organization_id, tournament_id) 
WHERE category_id IS NULL;

CREATE UNIQUE INDEX uq_user_roles_category ON user_roles(user_id, role_id, organization_id, tournament_id, category_id) 
WHERE category_id IS NOT NULL;

-- ============================================================================
-- 3. EQUIPOS, JUGADORES E INSCRIPCIONES (RF-05, RF-06, Sec. 7.3)
-- ============================================================================

-- Equipos (Clubes o entidades independientes en la organización - Sec. 7.3)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    short_name VARCHAR(50),
    logo_url TEXT,
    primary_color VARCHAR(30),
    secondary_color VARCHAR(30),
    delegate_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    contact_phone VARCHAR(30),
    contact_email VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_teams_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    CONSTRAINT uq_team_org_name UNIQUE (organization_id, name)
);

CREATE TRIGGER trg_teams_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inscripción del Equipo en una Categoría específica (Sec. 7.3, RF-05)
CREATE TABLE team_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    delegate_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    custom_name VARCHAR(150),
    registration_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    registration_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    CONSTRAINT chk_team_entries_status CHECK (registration_status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'WITHDRAWN')),
    CONSTRAINT uq_team_category_entry UNIQUE (category_id, team_id)
);

-- Jugadores (Personas físicas independientes - Sec. 7.3, RF-06)
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    document_type VARCHAR(20) NOT NULL DEFAULT 'CC',
    document_number VARCHAR(50) NOT NULL,
    birth_date DATE,
    photo_url TEXT,
    gender VARCHAR(20),
    phone VARCHAR(30),
    email VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_players_doc_type CHECK (document_type IN ('CC', 'TI', 'CE', 'PASSPORT', 'OTHER')),
    CONSTRAINT chk_players_gender CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE', 'OTHER')),
    CONSTRAINT chk_players_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'BANNED')),
    CONSTRAINT uq_player_document UNIQUE (document_type, document_number)
);

CREATE TRIGGER trg_players_updated_at
BEFORE UPDATE ON players
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inscripción de Jugadores por Equipo y Torneo/Categoría (Sec. 7.3, RF-06)
CREATE TABLE player_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_entry_id UUID NOT NULL REFERENCES team_entries(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    jersey_number INTEGER,
    position VARCHAR(30),
    registration_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    is_captain BOOLEAN NOT NULL DEFAULT FALSE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_jersey_number CHECK (jersey_number IS NULL OR (jersey_number >= 1 AND jersey_number <= 99)),
    CONSTRAINT chk_player_position CHECK (position IS NULL OR position IN ('GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD', 'UTILITY')),
    CONSTRAINT chk_player_reg_status CHECK (registration_status IN ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRANSFERRED')),
    CONSTRAINT uq_player_team_entry UNIQUE (team_entry_id, player_id)
);

-- ============================================================================
-- 4. FASES DE COMPETICIÓN, GRUPOS Y LLAVES (RF-07, RF-08, RF-16, Sec. 7.2 F, G, H)
-- ============================================================================

-- Fases deportivas dentro de una categoría (Sec. 7.2 F)
CREATE TABLE competition_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phase_type VARCHAR(30) NOT NULL,
    phase_order INTEGER NOT NULL,
    qualification_rules JSONB DEFAULT '{}'::jsonb,
    configuration JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_phase_type CHECK (phase_type IN (
        'GROUP_STAGE', 'QUALIFICATION', 'ROUND_OF_32', 'ROUND_OF_16', 
        'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL', 'CUSTOM'
    )),
    CONSTRAINT chk_phase_status CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT uq_category_phase_order UNIQUE (category_id, phase_order)
);

CREATE TRIGGER trg_competition_phases_updated_at
BEFORE UPDATE ON competition_phases
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grupos dentro de una fase (Sec. 7.3, RF-07)
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES competition_phases(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    configuration JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_phase_group_name UNIQUE (phase_id, name)
);

-- Asignación de Equipos a Grupos (Sec. 7.3, RF-07)
CREATE TABLE group_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    team_entry_id UUID NOT NULL REFERENCES team_entries(id) ON DELETE CASCADE,
    seeded_position INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_group_team_entry UNIQUE (group_id, team_entry_id)
);

-- Llaves y estructura de eliminatorias (Sec. 7.2 G)
CREATE TABLE competition_brackets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES competition_phases(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    bracket_type VARCHAR(30) NOT NULL,
    leg_type VARCHAR(20) NOT NULL DEFAULT 'SINGLE_LEG',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_bracket_type CHECK (bracket_type IN ('SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'CONSOLATION', 'ROUND_ROBIN')),
    CONSTRAINT chk_bracket_leg_type CHECK (leg_type IN ('SINGLE_LEG', 'HOME_AWAY', 'BEST_OF_3')),
    CONSTRAINT chk_bracket_status CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED'))
);

-- Cruces o Enfrentamientos (Ties) para llaves o ida/vuelta (Sec. 7.4, 7.5)
CREATE TABLE competition_ties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES competition_phases(id) ON DELETE CASCADE,
    bracket_id UUID REFERENCES competition_brackets(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    team_entry_1_id UUID REFERENCES team_entries(id) ON DELETE SET NULL,
    team_entry_2_id UUID REFERENCES team_entries(id) ON DELETE SET NULL,
    winner_team_entry_id UUID REFERENCES team_entries(id) ON DELETE SET NULL,
    aggregate_score_team1 INTEGER DEFAULT 0,
    aggregate_score_team2 INTEGER DEFAULT 0,
    penalty_score_team1 INTEGER,
    penalty_score_team2 INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ties_status CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
);

-- ============================================================================
-- 5. CANCHAS E INSTALACIONES (RF-09, Sec. 7.3)
-- ============================================================================

-- Canchas vinculadas a la organización administradora
CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    location TEXT,
    description TEXT,
    capacity INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    available_hours JSONB DEFAULT '{}'::jsonb,
    restrictions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_venues_capacity CHECK (capacity IS NULL OR capacity >= 0),
    CONSTRAINT chk_venues_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE'))
);

CREATE TRIGGER trg_venues_updated_at
BEFORE UPDATE ON venues
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Bloqueo de franjas horarias en canchas
CREATE TABLE venue_blocked_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_blocked_slot_range CHECK (end_time > start_time)
);

-- ============================================================================
-- 6. CUERPO ARBITRAL (RF-11, Sec. 7.4)
-- ============================================================================

-- Registro de árbitros
CREATE TABLE referees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    full_name VARCHAR(150) NOT NULL,
    document_number VARCHAR(50),
    phone VARCHAR(30),
    email VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    observations TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_referees_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

CREATE TRIGGER trg_referees_updated_at
BEFORE UPDATE ON referees
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. PROGRAMACIÓN, PARTIDOS Y PLANILLA DIGITAL (RF-10, RF-12, RF-13, Sec. 7.3)
-- ============================================================================

-- Partidos del torneo
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    phase_id UUID NOT NULL REFERENCES competition_phases(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    bracket_id UUID REFERENCES competition_brackets(id) ON DELETE SET NULL,
    tie_id UUID REFERENCES competition_ties(id) ON DELETE SET NULL,
    match_day INTEGER,
    match_date TIMESTAMPTZ,
    venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
    home_team_entry_id UUID NOT NULL REFERENCES team_entries(id) ON DELETE RESTRICT,
    away_team_entry_id UUID NOT NULL REFERENCES team_entries(id) ON DELETE RESTRICT,
    home_score INTEGER NOT NULL DEFAULT 0,
    away_score INTEGER NOT NULL DEFAULT 0,
    home_penalties INTEGER,
    away_penalties INTEGER,
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
    sheet_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    officialized_at TIMESTAMPTZ,
    officialized_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_home_score CHECK (home_score >= 0),
    CONSTRAINT chk_away_score CHECK (away_score >= 0),
    CONSTRAINT chk_home_penalties CHECK (home_penalties IS NULL OR home_penalties >= 0),
    CONSTRAINT chk_away_penalties CHECK (away_penalties IS NULL OR away_penalties >= 0),
    CONSTRAINT chk_match_status CHECK (status IN (
        'SCHEDULED', 'IN_PROGRESS', 'POSTPONED', 'CANCELLED', 'PLAYED', 'IN_REVIEW', 'OFFICIALIZED'
    )),
    CONSTRAINT chk_match_sheet_status CHECK (sheet_status IN (
        'DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED'
    )),
    CONSTRAINT chk_match_distinct_teams CHECK (home_team_entry_id <> away_team_entry_id)
);

CREATE TRIGGER trg_matches_updated_at
BEFORE UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Posiciones en Llaves y Procedencia (Sec. 7.2 H)
CREATE TABLE bracket_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bracket_id UUID NOT NULL REFERENCES competition_brackets(id) ON DELETE CASCADE,
    position_number INTEGER NOT NULL,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    source_type VARCHAR(30) NOT NULL,
    source_reference VARCHAR(100),
    team_entry_id UUID REFERENCES team_entries(id) ON DELETE SET NULL,
    advancement_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    CONSTRAINT chk_bracket_source_type CHECK (source_type IN (
        'GROUP_POSITION', 'BRACKET_WINNER', 'BRACKET_LOSER', 'MANUAL', 'SEED'
    )),
    CONSTRAINT chk_bracket_advancement CHECK (advancement_status IN ('PENDING', 'QUALIFIED', 'ELIMINATED')),
    CONSTRAINT uq_bracket_position UNIQUE (bracket_id, position_number)
);

-- Partidos de ida y vuelta vinculados a cruces (Sec. 7.4)
CREATE TABLE match_legs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tie_id UUID NOT NULL REFERENCES competition_ties(id) ON DELETE CASCADE,
    match_id UUID NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
    leg_number SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_leg_number CHECK (leg_number > 0),
    CONSTRAINT uq_tie_leg_number UNIQUE (tie_id, leg_number)
);

-- Asignación de Árbitros a Partidos (Sec. 7.4)
CREATE TABLE match_referees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
    referee_role VARCHAR(30) NOT NULL DEFAULT 'MAIN',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
    CONSTRAINT chk_referee_role CHECK (referee_role IN (
        'MAIN', 'ASSISTANT_1', 'ASSISTANT_2', 'FOURTH_OFFICIAL', 'VAR'
    )),
    CONSTRAINT chk_match_referee_status CHECK (status IN ('ASSIGNED', 'CONFIRMED', 'REPLACED', 'REJECTED')),
    CONSTRAINT uq_match_referee UNIQUE (match_id, referee_id)
);

-- Alineaciones de Partido (Sec. 7.5, RF-12)
CREATE TABLE match_lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_entry_id UUID NOT NULL REFERENCES team_entries(id) ON DELETE CASCADE,
    player_registration_id UUID NOT NULL REFERENCES player_registrations(id) ON DELETE CASCADE,
    jersey_number INTEGER NOT NULL,
    is_starter BOOLEAN NOT NULL DEFAULT TRUE,
    is_captain BOOLEAN NOT NULL DEFAULT FALSE,
    is_ineligible BOOLEAN NOT NULL DEFAULT FALSE,
    ineligibility_reason TEXT,
    minutes_played INTEGER DEFAULT 0,
    CONSTRAINT chk_lineup_jersey CHECK (jersey_number >= 1 AND jersey_number <= 99),
    CONSTRAINT chk_minutes_played CHECK (minutes_played >= 0),
    CONSTRAINT uq_match_player_lineup UNIQUE (match_id, player_registration_id)
);

-- Eventos del Partido / Minuto a minuto (Sec. 7.3, 7.5, RF-12)
CREATE TABLE match_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_entry_id UUID NOT NULL REFERENCES team_entries(id) ON DELETE CASCADE,
    player_registration_id UUID REFERENCES player_registrations(id) ON DELETE SET NULL,
    event_type VARCHAR(40) NOT NULL,
    minute INTEGER NOT NULL,
    extra_minute INTEGER DEFAULT 0,
    period VARCHAR(25) NOT NULL DEFAULT 'FIRST_HALF',
    secondary_player_registration_id UUID REFERENCES player_registrations(id) ON DELETE SET NULL,
    description TEXT,
    registered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_event_type CHECK (event_type IN (
        'GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SECOND_YELLOW_CARD', 
        'SUBSTITUTION', 'FIGHT', 'FIELD_ABANDONMENT', 'DEFAULT_NO_SHOW', 'SUSPENSION', 'CUSTOM'
    )),
    CONSTRAINT chk_event_minute CHECK (minute >= 0),
    CONSTRAINT chk_event_extra_minute CHECK (extra_minute >= 0),
    CONSTRAINT chk_event_period CHECK (period IN (
        'FIRST_HALF', 'SECOND_HALF', 'EXTRA_FIRST_HALF', 'EXTRA_SECOND_HALF', 'PENALTIES'
    ))
);

-- Definiciones por Penales (Sec. 7.4, RF-16)
CREATE TABLE match_penalty_shootouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_entry_id UUID NOT NULL REFERENCES team_entries(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    player_registration_id UUID REFERENCES player_registrations(id) ON DELETE SET NULL,
    result VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_penalty_seq CHECK (sequence_number > 0),
    CONSTRAINT chk_penalty_result CHECK (result IN ('SCORED', 'MISSED', 'SAVED')),
    CONSTRAINT uq_penalty_shootout_turn UNIQUE (match_id, team_entry_id, sequence_number)
);

-- ============================================================================
-- 8. REGLAS DISCIPLINARIAS Y SANCIONES (RF-18, RF-19, Sec. 7.3, Sec. 7.4)
-- ============================================================================

-- Catálogo de Reglas y Tarifas de Sanciones (Sec. 7.3, RF-18)
CREATE TABLE sanction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    infraction_type VARCHAR(40) NOT NULL,
    financial_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    liable_party VARCHAR(20) NOT NULL DEFAULT 'PLAYER',
    points_deduction SMALLINT NOT NULL DEFAULT 0,
    matches_suspended SMALLINT NOT NULL DEFAULT 0,
    disciplinary_points SMALLINT NOT NULL DEFAULT 0,
    effective_from DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    conditions_rule JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_rule_infraction CHECK (infraction_type IN (
        'YELLOW_CARD', 'RED_CARD', 'DOUBLE_YELLOW', 'FIGHT', 
        'FIELD_ABANDONMENT', 'DEFAULT_NO_SHOW', 'UNSPORTSMANLIKE', 'OTHER'
    )),
    CONSTRAINT chk_rule_amount CHECK (financial_amount >= 0),
    CONSTRAINT chk_rule_liable CHECK (liable_party IN ('PLAYER', 'TEAM', 'BOTH')),
    CONSTRAINT chk_rule_deduction CHECK (points_deduction >= 0),
    CONSTRAINT chk_rule_suspension CHECK (matches_suspended >= 0),
    CONSTRAINT chk_rule_disc_points CHECK (disciplinary_points >= 0),
    CONSTRAINT chk_rule_dates CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

-- Sanciones impuestas a Equipos o Jugadores (Sec. 7.3, 7.5, RF-18)
CREATE TABLE sanctions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES sanction_rules(id) ON DELETE SET NULL,
    match_event_id UUID REFERENCES match_events(id) ON DELETE SET NULL,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    team_entry_id UUID NOT NULL REFERENCES team_entries(id) ON DELETE CASCADE,
    player_registration_id UUID REFERENCES player_registrations(id) ON DELETE SET NULL,
    sanction_origin VARCHAR(20) NOT NULL DEFAULT 'AUTOMATIC',
    description TEXT NOT NULL,
    matches_suspended SMALLINT NOT NULL DEFAULT 0,
    matches_served SMALLINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_sanction_origin CHECK (sanction_origin IN ('AUTOMATIC', 'MANUAL')),
    CONSTRAINT chk_sanctions_suspended CHECK (matches_suspended >= 0),
    CONSTRAINT chk_sanctions_served CHECK (matches_served >= 0),
    CONSTRAINT chk_sanction_status CHECK (status IN ('PENDING', 'ACTIVE', 'SERVED', 'PARDONED', 'CANCELLED'))
);

-- Deducción de Puntos Deportivos (Sec. 7.4, RF-18, RF-19)
CREATE TABLE disciplinary_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    team_entry_id UUID NOT NULL REFERENCES team_entries(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    sanction_id UUID REFERENCES sanctions(id) ON DELETE SET NULL,
    deduction_type VARCHAR(20) NOT NULL,
    points SMALLINT NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    resolution_evidence TEXT,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_deduction_type CHECK (deduction_type IN ('AUTOMATIC', 'MANUAL')),
    CONSTRAINT chk_deduction_points CHECK (points > 0),
    CONSTRAINT chk_deduction_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVERSED'))
);

-- ============================================================================
-- 9. GESTIÓN FINANCIERA Y PAGOS (RF-19, RF-20, Sec. 7.3, Sec. 7.5)
-- ============================================================================

-- Cargos Económicos a Equipos o Jugadores (Sec. 7.3, 7.5, RF-19)
CREATE TABLE financial_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    sanction_id UUID REFERENCES sanctions(id) ON DELETE SET NULL,
    match_event_id UUID REFERENCES match_events(id) ON DELETE SET NULL,
    team_entry_id UUID REFERENCES team_entries(id) ON DELETE SET NULL,
    player_registration_id UUID REFERENCES player_registrations(id) ON DELETE SET NULL,
    charge_target VARCHAR(20) NOT NULL,
    title VARCHAR(150) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    balance NUMERIC(12,2) NOT NULL,
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_charge_target CHECK (charge_target IN ('TEAM', 'PLAYER')),
    CONSTRAINT chk_charge_amount CHECK (amount > 0),
    CONSTRAINT chk_charge_balance CHECK (balance >= 0 AND balance <= amount),
    CONSTRAINT chk_charge_status CHECK (status IN ('PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'WAIVED'))
);

CREATE TRIGGER trg_financial_charges_updated_at
BEFORE UPDATE ON financial_charges
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Pagos efectivamente recibidos (Sec. 7.3, 7.5, RF-20)
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    team_entry_id UUID REFERENCES team_entries(id) ON DELETE SET NULL,
    player_registration_id UUID REFERENCES player_registrations(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(40) NOT NULL,
    reference_number VARCHAR(100),
    receipt_url TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    reversal_reason TEXT,
    reversed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reversed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_amount CHECK (amount > 0),
    CONSTRAINT chk_payment_method CHECK (payment_method IN ('CASH', 'TRANSFER', 'DEPOSIT', 'OTHER')),
    CONSTRAINT chk_payment_status CHECK (status IN ('CONFIRMED', 'REVERSED'))
);

-- Distribución de un pago entre uno o varios cargos (Sec. 7.5, RF-20)
CREATE TABLE payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    financial_charge_id UUID NOT NULL REFERENCES financial_charges(id) ON DELETE RESTRICT,
    allocated_amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_allocated_amount CHECK (allocated_amount > 0),
    CONSTRAINT uq_payment_charge_allocation UNIQUE (payment_id, financial_charge_id)
);

-- Trigger para descontar automáticamente el saldo del cargo financiero al aplicar pagos
CREATE OR REPLACE FUNCTION update_charge_balance_on_allocation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE financial_charges
        SET balance = balance - NEW.allocated_amount,
            status = CASE 
                WHEN (balance - NEW.allocated_amount) <= 0 THEN 'PAID'
                ELSE 'PARTIALLY_PAID'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.financial_charge_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE financial_charges
        SET balance = balance + OLD.allocated_amount,
            status = CASE 
                WHEN (balance + OLD.allocated_amount) >= amount THEN 'PENDING'
                ELSE 'PARTIALLY_PAID'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.financial_charge_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_allocation_balance
AFTER INSERT OR DELETE ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION update_charge_balance_on_allocation();

-- ============================================================================
-- 10. AUDITORÍA Y TRAZABILIDAD (RF-22, Sec. 7.3)
-- ============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 11. ÍNDICES DE RENDIMIENTO (RF-8, Sec. 7.6, Sec. 8)
-- ============================================================================

-- Multi-tenant y Jerarquía deportiva
CREATE INDEX idx_seasons_org ON seasons(organization_id);
CREATE INDEX idx_tournaments_org_season ON tournaments(organization_id, season_id);
CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_categories_tournament ON categories(tournament_id);
CREATE INDEX idx_phases_category ON competition_phases(category_id);
CREATE INDEX idx_groups_phase ON groups(phase_id);

-- Equipos, Jugadores e Inscripciones
CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_team_entries_cat_team ON team_entries(category_id, team_id);
CREATE INDEX idx_player_reg_entry_player ON player_registrations(team_entry_id, player_id);
CREATE INDEX idx_players_doc ON players(document_type, document_number);

-- Partidos, Calendario y Planilla
CREATE INDEX idx_matches_cat_phase ON matches(category_id, phase_id);
CREATE INDEX idx_matches_group ON matches(group_id);
CREATE INDEX idx_matches_tie ON matches(tie_id);
CREATE INDEX idx_matches_venue_date ON matches(venue_id, match_date);
CREATE INDEX idx_matches_teams ON matches(home_team_entry_id, away_team_entry_id);
CREATE INDEX idx_matches_status ON matches(status, sheet_status);
CREATE INDEX idx_lineups_match ON match_lineups(match_id);
CREATE INDEX idx_events_match ON match_events(match_id);
CREATE INDEX idx_events_player ON match_events(player_registration_id);

-- Sanciones y Finanzas
CREATE INDEX idx_sanctions_team_player ON sanctions(team_entry_id, player_registration_id);
CREATE INDEX idx_charges_org_tournament ON financial_charges(organization_id, tournament_id);
CREATE INDEX idx_charges_team_player ON financial_charges(team_entry_id, player_registration_id);
CREATE INDEX idx_charges_status ON financial_charges(status);
CREATE INDEX idx_payments_org_date ON payments(organization_id, payment_date);
CREATE INDEX idx_payments_team_player ON payments(team_entry_id, player_registration_id);
CREATE INDEX idx_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX idx_allocations_charge ON payment_allocations(financial_charge_id);

-- Auditoría
CREATE INDEX idx_audit_logs_search ON audit_logs(organization_id, tournament_id, entity_name, created_at);

-- ============================================================================
-- 12. VISTA DE TABLA DE POSICIONES AUTOMÁTICA (RF-15)
-- Fórmula:
-- Puntos deportivos = (PG * 3) + (PE * 1) + (PP * 0)
-- Puntos netos = Puntos deportivos - Deducciones aprobadas
-- Criterios de orden: 1. Puntos netos, 2. DG, 3. GF, 4. Fair Play, 5. Victorias
-- ============================================================================

CREATE OR REPLACE VIEW vw_group_standings AS
WITH match_results AS (
    -- Resultados del equipo local en partidos oficializados
    SELECT 
        m.group_id,
        m.category_id,
        m.home_team_entry_id AS team_entry_id,
        1 AS pj,
        CASE WHEN m.home_score > m.away_score THEN 1 ELSE 0 END AS pg,
        CASE WHEN m.home_score = m.away_score THEN 1 ELSE 0 END AS pe,
        CASE WHEN m.home_score < m.away_score THEN 1 ELSE 0 END AS pp,
        m.home_score AS gf,
        m.away_score AS gc
    FROM matches m
    WHERE m.status = 'OFFICIALIZED' AND m.group_id IS NOT NULL

    UNION ALL

    -- Resultados del equipo visitante en partidos oficializados
    SELECT 
        m.group_id,
        m.category_id,
        m.away_team_entry_id AS team_entry_id,
        1 AS pj,
        CASE WHEN m.away_score > m.home_score THEN 1 ELSE 0 END AS pg,
        CASE WHEN m.away_score = m.home_score THEN 1 ELSE 0 END AS pe,
        CASE WHEN m.away_score < m.home_score THEN 1 ELSE 0 END AS pp,
        m.away_score AS gf,
        m.home_score AS gc
    FROM matches m
    WHERE m.status = 'OFFICIALIZED' AND m.group_id IS NOT NULL
),
team_stats AS (
    SELECT 
        gm.group_id,
        gm.team_entry_id,
        COALESCE(SUM(mr.pj), 0)::BIGINT AS pj,
        COALESCE(SUM(mr.pg), 0)::BIGINT AS pg,
        COALESCE(SUM(mr.pe), 0)::BIGINT AS pe,
        COALESCE(SUM(mr.pp), 0)::BIGINT AS pp,
        COALESCE(SUM(mr.gf), 0)::BIGINT AS gf,
        COALESCE(SUM(mr.gc), 0)::BIGINT AS gc,
        COALESCE(SUM(mr.gf) - SUM(mr.gc), 0)::BIGINT AS dg,
        COALESCE((SUM(mr.pg) * 3) + (SUM(mr.pe) * 1), 0)::BIGINT AS puntos_deportivos
    FROM group_memberships gm
    LEFT JOIN match_results mr 
        ON gm.group_id = mr.group_id AND gm.team_entry_id = mr.team_entry_id
    GROUP BY gm.group_id, gm.team_entry_id
),
team_deductions AS (
    -- Suma de deducciones de puntos aprobadas
    SELECT 
        dd.team_entry_id,
        COALESCE(SUM(dd.points), 0)::BIGINT AS total_deducciones
    FROM disciplinary_deductions dd
    WHERE dd.status = 'APPROVED'
    GROUP BY dd.team_entry_id
),
team_disciplinary_points AS (
    -- Puntuación disciplinaria (Fair Play)
    SELECT 
        me.team_entry_id,
        COALESCE(SUM(
            CASE 
                WHEN me.event_type = 'YELLOW_CARD' THEN 1
                WHEN me.event_type = 'SECOND_YELLOW_CARD' THEN 3
                WHEN me.event_type = 'RED_CARD' THEN 5
                WHEN me.event_type IN ('FIGHT', 'FIELD_ABANDONMENT') THEN 10
                ELSE 0
            END
        ), 0)::BIGINT AS puntos_disciplinarios
    FROM match_events me
    JOIN matches m ON me.match_id = m.id
    WHERE m.status = 'OFFICIALIZED'
    GROUP BY me.team_entry_id
)
SELECT 
    ts.group_id,
    g.name AS group_name,
    g.phase_id,
    ts.team_entry_id,
    COALESCE(te.custom_name, t.name) AS team_name,
    t.logo_url AS team_logo,
    ts.pj,
    ts.pg,
    ts.pe,
    ts.pp,
    ts.gf,
    ts.gc,
    ts.dg,
    ts.puntos_deportivos,
    COALESCE(td.total_deducciones, 0) AS deducciones,
    (ts.puntos_deportivos - COALESCE(td.total_deducciones, 0)) AS puntos_netos,
    COALESCE(tdp.puntos_disciplinarios, 0) AS puntos_disciplinarios,
    DENSE_RANK() OVER (
        PARTITION BY ts.group_id 
        ORDER BY 
            (ts.puntos_deportivos - COALESCE(td.total_deducciones, 0)) DESC,
            ts.dg DESC,
            ts.gf DESC,
            COALESCE(tdp.puntos_disciplinarios, 0) ASC,
            ts.pg DESC
    ) AS posicion
FROM team_stats ts
JOIN groups g ON ts.group_id = g.id
JOIN team_entries te ON ts.team_entry_id = te.id
JOIN teams t ON te.team_id = t.id
LEFT JOIN team_deductions td ON ts.team_entry_id = td.team_entry_id
LEFT JOIN team_disciplinary_points tdp ON ts.team_entry_id = tdp.team_entry_id;

-- ============================================================================
-- 13. POLÍTICAS DE ROW-LEVEL SECURITY (RLS) MULTI-TENANT (Sec. 7.6)
-- Aislamiento a nivel de base de datos usando sesión actual de la organización
-- ============================================================================

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_seasons ON seasons
    FOR ALL
    USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID);

CREATE POLICY tenant_isolation_tournaments ON tournaments
    FOR ALL
    USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID);

CREATE POLICY tenant_isolation_teams ON teams
    FOR ALL
    USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID);

CREATE POLICY tenant_isolation_financial_charges ON financial_charges
    FOR ALL
    USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID);

CREATE POLICY tenant_isolation_payments ON payments
    FOR ALL
    USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID);
