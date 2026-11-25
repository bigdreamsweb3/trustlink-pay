import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
/** Real SQLite executes the production schema, prepared statements and transaction guard; no HTTP server is started. */
export function sqliteBinding(){
  const sqlite=new DatabaseSync(":memory:");sqlite.exec(readFileSync(new URL("../schema.sql",import.meta.url),"utf8"));
  const DB={prepare(sql){const query=sqlite.prepare(sql);return {bind(...values){return {sql,values,async all(){return {results:query.all(...values)};}};}};},
    async batch(statements){sqlite.exec("BEGIN IMMEDIATE");try{const results=statements.map(statement=>sqlite.prepare(statement.sql).run(...statement.values));sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error;}}};
  return {DB,sqlite};
}
