import { getDb } from './connection';

// essa função serve pra conferir no banco se o e-mail e a senha da Vitória estão certos e liberar o acesso
export async function authenticateAdmin(email, password) {
  const db = await getDb();
  return await db.getFirstAsync(
    `SELECT id, email, nome FROM admins WHERE email = ? AND password = ? AND enabled = 1`,
    [email.trim().toLowerCase(), password]
  );
}