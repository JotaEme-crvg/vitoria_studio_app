import * as SQLite from 'expo-sqlite';

let dbPromise = null;

// essa função abre o banco SQLite, cria as tabelas se não existirem e já cadastra o login padrão da Vitória
export async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('vp_studio.db');

      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS admins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          nome TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS bookings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          protocolo TEXT UNIQUE NOT NULL,
          nome TEXT NOT NULL,
          whatsapp TEXT NOT NULL,
          data TEXT NOT NULL,
          hora TEXT NOT NULL,
          estilo TEXT,
          regiao TEXT,
          tamanho TEXT,
          ideia TEXT,
          audio_uri TEXT,
          audio_duration INTEGER DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'confirmed',
          start_at INTEGER NOT NULL,
          consent_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          cancelled_at TEXT
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_active_slot
        ON bookings(data, hora) WHERE status = 'confirmed';

        CREATE TABLE IF NOT EXISTS reminder_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          booking_id INTEGER NOT NULL,
          kind TEXT NOT NULL,
          due_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'scheduled',
          created_at TEXT NOT NULL,
          released_at TEXT,
          sent_at TEXT,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
        );
      `);

      // Garante a adição das colunas de áudio caso o banco já exista no aparelho
      const cols = await db.getAllAsync(`PRAGMA table_info(bookings)`);
      const colNames = cols.map(c => c.name);
      if (!colNames.includes('audio_uri')) {
        await db.execAsync(`ALTER TABLE bookings ADD COLUMN audio_uri TEXT;`);
      }
      if (!colNames.includes('audio_duration')) {
        await db.execAsync(`ALTER TABLE bookings ADD COLUMN audio_duration INTEGER DEFAULT 0;`);
      }

      await db.runAsync(
        `INSERT OR IGNORE INTO admins (email, password, nome, enabled) VALUES (?, ?, ?, 1)`,
        ['vitoria@vpstudio.com', '123456', 'Vitoria Pinheiro Vieira']
      );

      return db;
    })();
  }
  return dbPromise;
}

// essa função só chama o getDb pra inicializar o banco logo q o app abre
export async function initDatabase() {
  await getDb();
}