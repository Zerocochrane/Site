// Small wrapper around Node's built-in SQLite (node:sqlite, Node 22.13+/24) that keeps the
// better-sqlite3 style API this project uses: prepare().run/get/all, exec, pragma, transaction.
// No native module to download or compile — `npm install` never needs GitHub or Visual Studio.
import { DatabaseSync } from 'node:sqlite';

const NAMED = /[@:$]([A-Za-z_][A-Za-z0-9_]*)/g;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !ArrayBuffer.isView(v) && !Array.isArray(v);
const fix = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

class Statement {
  constructor(stmt, sql) {
    this.stmt = stmt;
    // names of the @named parameters (ignore text inside quotes)
    const bare = sql.replace(/'(?:[^']|'')*'/g, "''");
    this.names = [...new Set([...bare.matchAll(NAMED)].map((m) => m[1]))];
  }
  args(params) {
    if (params.length === 1 && isPlainObject(params[0]) && this.names.length) {
      const src = params[0], out = {};
      for (const n of this.names) out[n] = fix(src[n]); // only the names the SQL uses; missing → NULL
      return [out];
    }
    return params.map(fix);
  }
  run(...p) { return this.stmt.run(...this.args(p)); }
  get(...p) { return this.stmt.get(...this.args(p)); }
  all(...p) { return this.stmt.all(...this.args(p)); }
}

export default class Database {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.cache = new Map();
    this.depth = 0;
  }
  prepare(sql) {
    let s = this.cache.get(sql);
    if (!s) { s = new Statement(this.db.prepare(sql), sql); this.cache.set(sql, s); }
    return s;
  }
  exec(sql) { this.db.exec(sql); return this; }
  pragma(text) { return this.db.prepare(`PRAGMA ${text}`).all(); }
  /** Like better-sqlite3: returns a function that runs `fn` inside BEGIN/COMMIT (ROLLBACK on error). */
  transaction(fn) {
    return (...a) => {
      if (this.depth > 0) return fn(...a); // nested: join the outer transaction
      this.db.exec('BEGIN');
      this.depth++;
      try {
        const r = fn(...a);
        this.db.exec('COMMIT');
        return r;
      } catch (e) {
        try { this.db.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      } finally {
        this.depth--;
      }
    };
  }
  close() { this.db.close(); }
}
