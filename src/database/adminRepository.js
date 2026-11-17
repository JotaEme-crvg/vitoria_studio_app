import { getDb } from './connection';

export async function authenticateAdmin(email, password) {
  const db = await getDb();
  return await db.getFirstAsync(
    `SELECT id, email, nome FROM admins WHERE email = ? AND password = ? AND enabled = 1`,
    [email.trim().toLowerCase(), password]
  );
}