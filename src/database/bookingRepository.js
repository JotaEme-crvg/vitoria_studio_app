import { getDb } from './connection';

export async function getOccupiedTimesByDate(dateStr) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT hora FROM bookings WHERE data = ? AND status = 'confirmed'`,
    [dateStr]
  );
  return rows.map(r => r.hora);
}

export async function createBookingWithReminders({
  nome,
  whatsapp,
  data,
  hora,
  estilo,
  regiao,
  tamanho,
  ideia,
  audioUri = null,
  audioDuration = 0,
  startMs
}) {
  const db = await getDb();
  const protocolo = 'VP-' + Date.now().toString(36).toUpperCase();
  const nowIso = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    const conflict = await db.getFirstAsync(
      `SELECT id FROM bookings WHERE data = ? AND hora = ? AND status = 'confirmed'`,
      [data, hora]
    );

    if (conflict) {
      throw new Error('Horário ocupado. Selecione outro.');
    }

    const result = await db.runAsync(
      `INSERT INTO bookings (protocolo, nome, whatsapp, data, hora, estilo, regiao, tamanho, ideia, audio_uri, audio_duration, status, start_at, consent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
      [protocolo, nome, whatsapp, data, hora, estilo, regiao, tamanho, ideia, audioUri, audioDuration, startMs, nowIso, nowIso]
    );

    const bookingId = result.lastInsertRowId;
    for (const [kind, hours] of [['24h', 24], ['2h', 2]]) {
      await db.runAsync(
        `INSERT INTO reminder_tasks (booking_id, kind, due_at, status, created_at)
         VALUES (?, ?, ?, 'scheduled', ?)`,
        [bookingId, kind, startMs - hours * 3600000, nowIso]
      );
    }
  });

  return { protocolo };
}

export async function syncAndGetAdminDashboard() {
  const db = await getDb();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  await db.runAsync(
    `UPDATE reminder_tasks
     SET status = 'pending', released_at = ?
     WHERE status = 'scheduled' AND due_at <= ?
       AND booking_id IN (SELECT id FROM bookings WHERE status = 'confirmed')`,
    [nowIso, nowMs]
  );

  const bookings = await db.getAllAsync(`SELECT * FROM bookings ORDER BY start_at ASC`);
  const reminders = await db.getAllAsync(`SELECT * FROM reminder_tasks ORDER BY due_at ASC`);

  return { bookings, reminders };
}

export async function cancelBookingById(id) {
  const db = await getDb();
  const nowIso = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?`,
      [nowIso, id]
    );
    await db.runAsync(
      `UPDATE reminder_tasks SET status = 'cancelled' WHERE booking_id = ? AND status IN ('scheduled', 'pending')`,
      [id]
    );
  });
}

export async function markReminderAsSent(id) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reminder_tasks SET status = 'sent_manually', sent_at = ? WHERE id = ? AND status = 'pending'`,
    [new Date().toISOString(), id]
  );
}