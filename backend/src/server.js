import app from './app.js';
import { config } from './config/env.js';
import { testConnection, pool } from './config/db.js';

const startServer = async () => {
  try {
    // 1. Verify PostgreSQL connection
    console.log('⏳ Conectando con la base de datos PostgreSQL...');
    try {
      const dbInfo = await testConnection();
      console.log(`✅ Base de datos conectada con éxito [${dbInfo.db}] a las ${dbInfo.now}`);
    } catch (dbErr) {
      console.warn(
        `⚠️ Advertencia: No se pudo verificar la conexión inmediata con PostgreSQL (${dbErr.message}). El servidor continuará arrancando para permitir reintentos.`
      );
    }

    // 2. Start HTTP server
    const server = app.listen(config.port, () => {
      console.log('====================================================');
      console.log(`🚀 Servidor backend iniciado exitosamente`);
      console.log(`🌐 Escuchando en: http://localhost:${config.port}`);
      console.log(`⚙️  Entorno: ${config.nodeEnv}`);
      console.log(`📋 API Docs & Endpoints: http://localhost:${config.port}/`);
      console.log('====================================================');
    });

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      console.log(`\n🛑 Señal ${signal} recibida. Cerrando conexiones limpiamente...`);
      server.close(async () => {
        try {
          await pool.end();
          console.log('🔒 Conexiones del pool de PostgreSQL cerradas.');
          process.exit(0);
        } catch (err) {
          console.error('Error cerrando el pool:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Error fatal al iniciar el servidor backend:', error);
    process.exit(1);
  }
};

startServer();

