import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';

// Get the typical Electron user data path
// On Windows, it's usually %APPDATA%\clausitron
const userDataPath = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'clausitron')
  : path.join(os.homedir(), 'AppData', 'Roaming', 'clausitron');

const dbPath = path.join(userDataPath, 'clausitron.db');
console.log('Database path:', dbPath);

try {
  const db = new Database(dbPath);

  // Check tool_usage table
  const rows = db.prepare('SELECT * FROM tool_usage LIMIT 20').all();
  console.log('\nTool usage rows:');
  console.log(rows);

  // Get total count
  const count = db.prepare('SELECT COUNT(*) as count FROM tool_usage').get();
  console.log('\nTotal rows:', count);

  // Get distinct tool names
  const tools = db.prepare('SELECT DISTINCT tool_name FROM tool_usage').all();
  console.log('\nDistinct tool names:', tools);

  db.close();
} catch (err) {
  console.error('Error:', err);
}
