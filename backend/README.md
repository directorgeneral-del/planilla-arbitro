# Backend API REST - Torneo de Fútbol (SaaS Multi-Tenant)

Backend integral desarrollado en **Node.js con Express** y **PostgreSQL (`pg`)**, diseñado bajo una arquitectura modular y escalable para la administración completa de campeonatos de fútbol, cumpliendo con los requerimientos funcionales (RF-01 al RF-22) del Documento de Requerimientos de Producto (PRD v2.0).

---

## 🛠️ Tecnologías y Dependencias

- **Node.js** (v20+) con soporte nativo de ECMAScript Modules (`"type": "module"`).
- **Express.js** (`^4.21.2`): Framework HTTP para API REST.
- **PostgreSQL (`pg` - node-postgres)** (`^8.13.1`): Conexión directa y eficiente mediante `pg.Pool`, transacciones atómicas y soporte para Row Level Security (RLS).
- **JWT (`jsonwebtoken`) & `bcryptjs`**: Autenticación segura y hashing de contraseñas.
- **Express Validator**: Validación estricta y sanitización de datos entrantes.
- **Helmet & CORS**: Seguridad HTTP y control de acceso cruzado.
- **Morgan**: Registro y trazabilidad de peticiones HTTP.

---

## 📂 Estructura de Directorios

```
backend/
├── .env.example
├── .env
├── package.json
└── src/
    ├── config/
    │   ├── db.js             # Pool PostgreSQL, helper de consultas, transacciones y RLS
    │   └── env.js            # Carga y validación de variables de entorno
    ├── middlewares/
    │   ├── auth.js           # Validación de token JWT y contexto de usuario
    │   ├── roles.js          # Control de acceso basado en roles (RBAC) y aislamiento tenant
    │   ├── validate.js       # Middleware de manejo de errores de validación
    │   └── errorHandler.js   # Manejo centralizado de excepciones y errores PostgreSQL
    ├── utils/
    │   └── auditLogger.js    # Trazabilidad y auditoría de eventos críticos (RF-22)
    ├── controllers/
    │   ├── authController.js           # Autenticación, registro, perfil
    │   ├── organizationController.js   # SaaS multi-tenant, organizaciones (RF-01)
    │   ├── seasonController.js         # Temporadas (RF-02)
    │   ├── tournamentController.js     # Torneos y campeonatos (RF-03)
    │   ├── categoryController.js       # Categorías deportivas (RF-04)
    │   ├── teamController.js           # Equipos e inscripciones (RF-05)
    │   ├── playerController.js         # Jugadores y plantillas/roster (RF-06)
    │   ├── competitionController.js   # Fases, grupos, llaves/brackets (RF-07, RF-08, RF-16)
    │   ├── venueController.js          # Canchas, franjas y validación de conflictos (RF-09)
    │   ├── refereeController.js        # Árbitros y asignaciones (RF-11)
    │   ├── matchController.js          # Partidos, planilla, eventos y oficialización (RF-10, 12, 13)
    │   ├── standingsController.js      # Tablas de posiciones, goleadores, fair play (RF-14, 15, 17)
    │   ├── disciplinaryController.js   # Sanciones deportivas y deducciones (RF-18)
    │   ├── financialController.js      # Cargos financieros, pagos y estado de cuenta (RF-19, 20)
    │   └── auditController.js          # Consulta de bitácora de auditoría (RF-22)
    ├── routes/
    │   ├── authRoutes.js
    │   ├── organizationRoutes.js
    │   ├── seasonRoutes.js
    │   ├── tournamentRoutes.js
    │   ├── categoryRoutes.js
    │   ├── teamRoutes.js
    │   ├── playerRoutes.js
    │   ├── competitionRoutes.js
    │   ├── venueRoutes.js
    │   ├── refereeRoutes.js
    │   ├── matchRoutes.js
    │   ├── standingsRoutes.js
    │   ├── disciplinaryRoutes.js
    │   ├── financialRoutes.js
    │   ├── auditRoutes.js
    │   └── index.js                    # Enrutador maestro API (/api)
    ├── app.js                          # Configuración de Express
    └── server.js                       # Punto de entrada y arranque del servidor
```

---

## 🚀 Puesta en Marcha

### 1. Configurar Variables de Entorno

Copia el archivo `.env.example` a `.env` y ajusta las credenciales de PostgreSQL si es necesario:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=torneo_futbol
DB_USER=postgres
DB_PASSWORD=postgres

JWT_SECRET=super_secret_jwt_key_torneo_futbol_2026_change_in_prod
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
```

### 2. Iniciar el Servidor

```bash
# Modo producción / estándar
npm start

# Modo desarrollo con auto-recarga (Node.js 20+ watch mode)
npm run dev
```

El servidor estará escuchando en `http://localhost:5000`.

---

## 📌 Mapa Completo de Endpoints

### 🔐 1. Identidad y Autenticación (`/api/auth`)
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/register` | Público | Registro de usuarios en la plataforma |
| `POST` | `/api/auth/login` | Público | Autenticación y obtención de JWT |
| `GET` | `/api/auth/me` | Autenticado | Perfil del usuario, membresías y roles |
| `PUT` | `/api/auth/profile` | Autenticado | Actualización de datos de perfil |
| `PUT` | `/api/auth/change-password` | Autenticado | Cambio seguro de contraseña |

### 🏢 2. Organizaciones Multi-Tenant (`/api/organizations`) — RF-01
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/organizations` | Autenticado | Lista de organizaciones accesibles por el usuario |
| `POST` | `/api/organizations` | SUPERADMIN, ORG_ADMIN | Crear nueva organización deportiva |
| `GET` | `/api/organizations/:id` | Miembros / Admin | Obtener detalles de una organización |
| `PUT` | `/api/organizations/:id` | SUPERADMIN, ORG_ADMIN | Actualizar información de organización |
| `PATCH` | `/api/organizations/:id/status` | SUPERADMIN | Activar/suspender organización |
| `GET` | `/api/organizations/:id/members` | Miembros / Admin | Listar miembros de la organización |
| `POST` | `/api/organizations/:id/members` | SUPERADMIN, ORG_ADMIN | Asignar miembro o administrador |

### 📅 3. Temporadas Deportivas (`/api/seasons`) — RF-02
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/seasons` | Autenticado | Listar temporadas (filtro por `organization_id`) |
| `GET` | `/api/seasons/:id` | Autenticado | Detalle de temporada y torneos contenidos |
| `POST` | `/api/seasons` | SUPERADMIN, ORG_ADMIN | Crear temporada |
| `PUT` | `/api/seasons/:id` | SUPERADMIN, ORG_ADMIN | Modificar temporada |

### 🏆 4. Torneos / Campeonatos (`/api/tournaments`) — RF-03
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/tournaments` | Público / Autenticado | Listar torneos (filtros por temporada, org, estado) |
| `GET` | `/api/tournaments/:id` | Público / Autenticado | Obtener torneo y sus categorías |
| `POST` | `/api/tournaments` | SUPERADMIN, ORG_ADMIN, TOURNAMENT_ADMIN | Crear torneo |
| `PUT` | `/api/tournaments/:id` | SUPERADMIN, ORG_ADMIN, TOURNAMENT_ADMIN | Actualizar torneo |
| `PATCH` | `/api/tournaments/:id/status` | SUPERADMIN, ORG_ADMIN, TOURNAMENT_ADMIN | Cambiar estado (`DRAFT`, `REGISTRATION_OPEN`, `IN_PROGRESS`, etc.) |

### 🏷️ 5. Categorías (`/api/categories`) — RF-04
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/categories` | Público / Autenticado | Listar categorías por torneo |
| `GET` | `/api/categories/:id` | Público / Autenticado | Detalle de categoría y sus fases |
| `POST` | `/api/categories` | SUPERADMIN, ORG_ADMIN, TOURNAMENT_ADMIN | Crear categoría |
| `PUT` | `/api/categories/:id` | SUPERADMIN, ORG_ADMIN, TOURNAMENT_ADMIN | Actualizar categoría |

### ⚽ 6. Equipos e Inscripciones (`/api/teams`) — RF-05
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/teams` | Público / Autenticado | Listar equipos de la organización |
| `GET` | `/api/teams/:id` | Público / Autenticado | Detalle de equipo e historial de torneos |
| `POST` | `/api/teams` | SUPERADMIN, ORG_ADMIN, TOURNAMENT_ADMIN | Crear equipo |
| `PUT` | `/api/teams/:id` | Admin / Delegado | Actualizar equipo |
| `GET` | `/api/teams/entries/all` | Público / Autenticado | Listar participaciones de equipos en categorías |
| `POST` | `/api/teams/entries` | Admin | Inscribir equipo en una categoría (`team_entries`) |
| `PATCH` | `/api/teams/entries/:id/status` | Admin | Confirmar o cambiar estado de inscripción |

### 🏃 7. Jugadores y Plantillas (`/api/players`) — RF-06
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/players` | Público / Autenticado | Catálogo de jugadores |
| `GET` | `/api/players/:id` | Público / Autenticado | Ficha del jugador |
| `POST` | `/api/players` | Admin / Delegado | Crear ficha de jugador |
| `PUT` | `/api/players/:id` | Admin / Delegado | Actualizar datos de jugador |
| `GET` | `/api/players/roster/:teamEntryId` | Público / Autenticado | Plantilla/nómina de un equipo en una categoría |
| `POST` | `/api/players/roster` | Admin / Delegado | Inscribir jugador en planilla con dorsal y posición |
| `DELETE` | `/api/players/roster/:id` | Admin / Delegado | Desactivar jugador de la plantilla |

### 🧩 8. Fases, Grupos y Llaves (`/api/competitions`) — RF-07, RF-08, RF-16
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/competitions/phases` | Público / Autenticado | Fases de competición de una categoría |
| `POST` | `/api/competitions/phases` | Admin | Crear fase (Grupos, Octavos, Cuartos, Final, etc.) |
| `GET` | `/api/competitions/groups` | Público / Autenticado | Listar grupos y sus equipos asignados |
| `POST` | `/api/competitions/groups` | Admin | Crear grupo dentro de una fase |
| `POST` | `/api/competitions/groups/:groupId/teams` | Admin | Asignar equipo a un grupo |
| `DELETE` | `/api/competitions/groups/:groupId/teams/:teamEntryId` | Admin | Retirar equipo de un grupo |
| `GET` | `/api/competitions/brackets` | Público / Autenticado | Cuadros de llaves eliminatorias |
| `POST` | `/api/competitions/brackets` | Admin | Crear cuadro eliminatorio |
| `GET` | `/api/competitions/ties` | Público / Autenticado | Series de ida y vuelta / enfrentamientos directos |
| `POST` | `/api/competitions/ties` | Admin | Crear serie o llave eliminatoria |

### 🏟️ 9. Canchas y Disponibilidad (`/api/venues`) — RF-09
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/venues` | Público / Autenticado | Listar canchas disponibles |
| `GET` | `/api/venues/:id` | Público / Autenticado | Detalle de cancha y franjas bloqueadas |
| `POST` | `/api/venues` | SUPERADMIN, ORG_ADMIN | Registrar cancha |
| `PUT` | `/api/venues/:id` | SUPERADMIN, ORG_ADMIN | Modificar cancha |
| `POST` | `/api/venues/:id/blocked-slots` | Admin | Bloquear franja por mantenimiento/evento |
| `POST` | `/api/venues/:id/check-conflict` | Cualquiera | Valida disponibilidad usando `fn_check_venue_conflict()` |

### 🟨 10. Árbitros (`/api/referees`) — RF-11
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/referees` | Público / Autenticado | Listar árbitros |
| `GET` | `/api/referees/:id` | Público / Autenticado | Perfil de árbitro e historial de partidos dirigidos |
| `POST` | `/api/referees` | Admin | Crear árbitro y vincular usuario si aplica |
| `PUT` | `/api/referees/:id` | Admin | Actualizar datos del árbitro |

### ⚽ 11. Partidos y Planilla Digital (`/api/matches`) — RF-10, RF-12, RF-13
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/matches` | Público / Autenticado | Calendario y lista de partidos con filtros |
| `GET` | `/api/matches/:id` | Público / Autenticado | Planilla completa: alineaciones, eventos, goles, árbitros |
| `POST` | `/api/matches` | Admin | Programar partido (valida disponibilidad de cancha) |
| `PUT` | `/api/matches/:id` | Admin | Reprogramar partido |
| `PATCH` | `/api/matches/:id/status` | Admin / Árbitro | Cambiar estado (`SCHEDULED`, `IN_PROGRESS`, etc.) |
| `POST` | `/api/matches/:id/referees` | Admin | Asignar árbitro (Principal, Asistente 1, 2, Cuarto) |
| `DELETE` | `/api/matches/:id/referees/:refereeId` | Admin | Desasignar árbitro |
| `POST` | `/api/matches/:id/lineups` | Admin / Árbitro | Cargar alineación inicial y suplentes |
| `POST` | `/api/matches/:id/events` | Admin / Árbitro | Registrar gol, tarjeta, cambio o incidencia (actualiza marcador) |
| `DELETE` | `/api/matches/:id/events/:eventId` | Admin / Árbitro | Eliminar evento y recalcular marcador |
| `POST` | `/api/matches/:id/penalties` | Admin / Árbitro | Registrar tanda de penales |
| `PATCH` | `/api/matches/:id/sheet-status` | Admin / Árbitro | Estado de planilla (`DRAFT`, `SUBMITTED`, `IN_REVIEW`, etc.) |
| `POST` | `/api/matches/:id/officialize` | Admin | **Oficializar resultado ejecutando `sp_officialize_match()`** |

> **Nota sobre oficialización:** Ejecuta en PostgreSQL el procedimiento almacenado `sp_officialize_match()`, el cual valida el partido, cambia el estado a `OFFICIALIZED`, aprueba la planilla, genera automáticamente las sanciones en `sanctions`, aplica deducciones en `disciplinary_deductions`, liquida cargos en `financial_charges`, actualiza el marcador global si es serie eliminatoria y genera el registro en `audit_logs`.

### 📊 12. Posiciones y Estadísticas (`/api/standings`) — RF-14, RF-15, RF-17
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/standings/groups/:groupId/standings` | Público | Tabla de posiciones del grupo (`vw_group_standings`) |
| `GET` | `/api/standings/categories/:categoryId/standings` | Público | Tablas de posiciones de todos los grupos de la categoría |
| `GET` | `/api/standings/tournaments/:tournamentId/top-scorers` | Público | Tabla de máximos goleadores (`vw_top_scorers`) |
| `GET` | `/api/standings/categories/:categoryId/fair-play` | Público | Tabla de juego limpio / tarjetas (`vw_fair_play`) |
| `GET` | `/api/standings/tournaments/:tournamentId/overview` | Público | Resumen público del torneo para app móvil/web |

### 🟥 13. Régimen Disciplinario (`/api/disciplinary`) — RF-18
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/disciplinary/rules` | Público / Autenticado | Tarifario y reglas disciplinarias del torneo |
| `POST` | `/api/disciplinary/rules` | Admin | Crear regla de sanción (multas, partidos, puntos) |
| `GET` | `/api/disciplinary` | Público / Autenticado | Listar sanciones aplicadas |
| `POST` | `/api/disciplinary` | Admin | Aplicar sanción manual a jugador o equipo |
| `GET` | `/api/disciplinary/deductions` | Público / Autenticado | Deducciones de puntos disciplinarias |
| `POST` | `/api/disciplinary/deductions` | Admin | Aplicar deducción manual de puntos (HU-013) |

### 💰 14. Gestión Financiera (`/api/financial`) — RF-19, RF-20
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/financial/charges` | Admin / Delegado | Listar cargos financieros por multas o inscripciones |
| `POST` | `/api/financial/charges` | Admin | Crear cargo financiero manual a equipo o jugador |
| `GET` | `/api/financial/payments` | Admin | Listar pagos recibidos y sus imputaciones |
| `POST` | `/api/financial/payments` | Admin | Registrar pago recibido y asociarlo a cargos |
| `POST` | `/api/financial/payments/:id/reverse` | Admin | Reversar pago recibido y restaurar saldos |
| `GET` | `/api/financial/statement/:teamEntryId` | Admin / Delegado | **Estado de cuenta privado del equipo (`vw_team_account_statement`)** |

### 📜 15. Auditoría y Trazabilidad (`/api/audit`) — RF-22
| Método | Endpoint | Roles / Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/audit` | SUPERADMIN, ORG_ADMIN | Consulta paginada y filtrada de logs de auditoría (inmutable) |

---

## 🔒 Seguridad y Multi-Tenancy

- **Row Level Security (RLS)**: Integrado en el pool y clientes PostgreSQL mediante `SET LOCAL app.current_organization_id = ...`.
- **Aislamiento por Organización**: Las consultas y mutaciones validan la pertenencia del usuario a la organización mediante cabecera `x-organization-id` o parámetros correspondientes.
- **Auditoría Centralizada**: El helper `logAudit` registra eventos sensibles con IP, usuario, acción, estado anterior y posterior en formato JSON inmutable.

