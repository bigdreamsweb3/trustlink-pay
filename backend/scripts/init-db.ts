import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { config } from "dotenv";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
config({ path: ".env.local" });

function splitSqlStatements(sqlText: string) {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarTag: string | null = null;

  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    const next = sqlText[i + 1];

    // Line comment
    if (
      !inSingleQuote &&
      !inDoubleQuote &&
      !dollarTag &&
      ch === "-" &&
      next === "-"
    ) {
      current += ch;
      i++;
      current += next;
      while (i + 1 < sqlText.length && sqlText[i + 1] !== "\n") {
        i++;
        current += sqlText[i];
      }
      continue;
    }

    // Block comment
    if (
      !inSingleQuote &&
      !inDoubleQuote &&
      !dollarTag &&
      ch === "/" &&
      next === "*"
    ) {
      current += ch;
      i++;
      current += next;
      while (i + 1 < sqlText.length) {
        i++;
        current += sqlText[i];
        if (sqlText[i - 1] === "*" && sqlText[i] === "/") break;
      }
      continue;
    }

    // Dollar-quoted blocks: $tag$ ... $tag$
    if (!inSingleQuote && !inDoubleQuote && ch === "$") {
      const rest = sqlText.slice(i);
      const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        if (dollarTag === tag) {
          dollarTag = null;
        } else if (!dollarTag) {
          dollarTag = tag;
        }

        current += tag;
        i += tag.length - 1;
        continue;
      }
    }

    if (!inDoubleQuote && !dollarTag && ch === "'" && sqlText[i - 1] !== "\\") {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (!inSingleQuote && !dollarTag && ch === '"' && sqlText[i - 1] !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !dollarTag && ch === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

// async function main() {
//   const databaseUrl = process.env.DATABASE_URL;

//   if (!databaseUrl) {
//     throw new Error("DATABASE_URL is required");
//   }

//   const schemaPath = resolve(process.cwd(), "app/db/schema.sql");
//   const schemaSql = readFileSync(schemaPath, "utf8");
//   const statements = splitSqlStatements(schemaSql);
//   const pool = new Pool({ connectionString: databaseUrl });
//   const client = await pool.connect();

//   try {
//     for (const statement of statements) {
//       await client.query(statement);
//     }
//     console.log("Database schema initialized successfully.");
//   } finally {
//     client.release();
//     await pool.end();
//   }
// }

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const schemaPath = resolve(process.cwd(), "app/db/schema.sql");
  const schemaSql = readFileSync(schemaPath, "utf8");
  const statements = splitSqlStatements(schemaSql);

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    console.log("Resetting database schema...");

    await client.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
    `);

    console.log("Applying schema.sql...");

    for (const statement of statements) {
      await client.query(statement);
    }

    console.log("Database schema initialized successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Database initialization failed.");
  console.error(error);
  process.exit(1);
});
