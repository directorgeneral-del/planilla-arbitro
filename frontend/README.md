# 📱 Planilla Digital del Árbitro - Interfaz Móvil

Interfaz móvil responsive diseñada específicamente para el uso en cancha por parte del cuerpo arbitral, conforme a las especificaciones de los requerimientos funcionales (**RF-11, RF-12, RF-13**) y la sección **9.3 ("Pantallas y Navegación del Árbitro")** del PRD del proyecto `001_Torneo_Futbol`.

---

## 🌟 Características Principales

### 1. ⏱️ Cronómetro Oficial en Cancha
- Dígitos de alto contraste visibles bajo luz solar.
- Control de períodos oficiales:
  - **1T** (Primer Tiempo: 00:00 a 45:00)
  - **Entretiempo**
  - **2T** (Segundo Tiempo: 45:00 a 90:00)
  - **Tiempos Extra** y **Definición por Penales**
- Botones de **adición de tiempo rápido** (+1m, +2m, +3m, +5m).
- Efecto sonoro de silbato arbitral sintético (Web Audio API) y retroalimentación háptica/vibración (`navigator.vibrate`) en dispositivos móviles.

### 2. 🎛️ Botones Gigantes de Acción Táctica
Optimizado para pantallas táctiles y dedos con guantes o en movimiento:
- ⚽ **GOL**: Botón esmeralda gigante que abre el selector de equipo beneficiado, jugador autor, tipo de anotación (jugada, penal, tiro libre, autogol) y precarga el minuto actual.
- 🟨 **TARJETA AMARILLA**: Botón ámbar de alta visibilidad para amonestar a un jugador. Si el jugador ya tiene una tarjeta previa, el sistema alerta y convierte automáticamente la sanción en **Segunda Amarilla (Expulsión Roja)** según el reglamento.
- 🟥 **TARJETA ROJA**: Botón rojo para expulsión directa con catálogo de causales (juego brusco grave, agresión, lenguaje injurioso, etc.).
- 🔄 **SUSTITUCIÓN**: Selección táctica del jugador titular que sale y del suplente que ingresa con registro del minuto exacto.
- ⚠️ **INCIDENCIA / FALTA EXTRAORDINARIA**: Registro de riñas, abandono de cancha, incidentes con el público o suspensión temporal para el informe disciplinario.

### 3. 📑 Vistas Móviles (Bottom Navigation)
- **En Cancha**: Marcador en vivo, cronómetro, botones gigantes y últimos acontecimientos.
- **Nóminas**: Plantillas de ambos equipos (titulares, suplentes, dorsales, capitanía y tarjetas acumuladas).
- **Eventos**: Cronología completa minuto a minuto con detalles de cada anotación o amonestación.
- **Finalizar**: Confirmación de resultado final, observaciones del árbitro y envío formal de la planilla (`sheet_status = 'SUBMITTED'`) hacia la administración para su oficialización definitiva.

### 4. 🔄 Modo Híbrido (Online / Offline)
- Conexión en tiempo real con la API REST de Express y PostgreSQL (`http://localhost:5000/api`).
- Resiliencia offline: guarda automáticamente el estado, cronómetro y acontecimientos en `localStorage` del teléfono para que el árbitro nunca pierda datos si se corta la señal de datos en el campo de juego.

---

## 🚀 Cómo Abrir la Interfaz

### Opción A (A través del Servidor Backend):
Con el backend ejecutándose en el puerto 5000 (`npm run dev` en `backend/`):
- Abre en tu navegador móvil o de escritorio:
  ```
  http://localhost:5000/referee
  ```

### Opción B (Directamente como archivo estático):
- Puedes hacer doble clic en el archivo `frontend/index.html` o abrirlo con la extensión *Live Server* de VS Code / navegador web.

