import { createInterface } from 'node:readline/promises';
import { stdin,stdout } from 'node:process';
import { db,passwordHash } from './store.mjs';
if(process.argv[2]!=='reset-password'){console.log('node server/cli.mjs reset-password [--user admin]');process.exit(1);}
const index=process.argv.indexOf('--user');const username=index>=0?process.argv[index+1]:'admin';const user=db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(username);if(!user){console.error('Nie znaleziono użytkownika.');process.exit(1);}
const rl=createInterface({input:stdin,output:stdout});const password=await rl.question('Nowe hasło (minimum 8 znaków): ');const repeat=await rl.question('Powtórz hasło: ');rl.close();if(password.length<8||password!==repeat){console.error('Hasła muszą być takie same i mieć co najmniej 8 znaków.');process.exit(1);}
db.prepare('UPDATE users SET password=?,initial=0 WHERE id=?').run(passwordHash(password),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(user.id);console.log('Hasło zmienione. Sesje i stare kody odzyskiwania zostały unieważnione.');db.close();
