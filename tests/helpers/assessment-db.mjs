import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
// D1 interface over real SQLite: actual constraints, queries and transactions.
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/assessments/0001_schema.sql', import.meta.url), 'utf8'));
  const db = {
    sqlite,
    prepare(sql) {
      let values = [];
      const execute = () => {
        const stmt = sqlite.prepare(sql);
        if (stmt.columns().length) return { results: stmt.all(...values), meta: { changes: 0 } };
        return { results: [], meta: { changes: Number(stmt.run(...values).changes) } };
      };
      return { bind(...args) { values = args; return this; }, async first() { return execute().results[0] || null; }, async all() { return execute(); }, async run() { return execute(); }, execute };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map((s) => s.execute()); sqlite.exec('COMMIT'); return results; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  return db;
}
