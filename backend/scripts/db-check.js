require("dotenv").config();

const net = require("net");
const { URL } = require("url");
const { Client } = require("pg");

const { prisma } = require("../src/lib/prisma");

const TARGETS = [
  {
    envName: "DATABASE_URL",
    label: "Runtime",
  },
  {
    envName: "DIRECT_URL",
    label: "CLI",
  },
];

function parseConnectionString(envName) {
  const value = process.env[envName];

  if (!value) {
    return {
      ok: false,
      message: `${envName}: missing`,
    };
  }

  try {
    return {
      ok: true,
      value,
      url: new URL(value),
    };
  } catch (error) {
    return {
      ok: false,
      message: `${envName}: invalid connection string`,
    };
  }
}

function isSupabase(url) {
  return url.hostname.endsWith("supabase.com");
}

function formatParams(url) {
  const params = [...url.searchParams.keys()].sort();
  return params.length > 0 ? params.join(",") : "(none)";
}

function addParam(connectionString, key, value) {
  const url = new URL(connectionString);
  url.searchParams.set(key, value);
  return url.toString();
}

function getWarnings(envName, url) {
  const warnings = [];

  if (isSupabase(url) && !url.searchParams.has("sslmode")) {
    warnings.push("missing sslmode=require");
  }

  if (
    envName === "DATABASE_URL" &&
    url.hostname.includes(".pooler.supabase.com") &&
    url.port === "6543" &&
    !url.searchParams.has("pgbouncer")
  ) {
    warnings.push("missing pgbouncer=true for the transaction pooler");
  }

  return warnings;
}

function probeTcp(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port || 5432) });
    let settled = false;

    const finish = (status) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(status);
    };

    socket.setTimeout(8000);
    socket.once("connect", () => finish("ok"));
    socket.once("timeout", () => finish("timeout"));
    socket.once("error", (error) => finish(`error (${error.code || "UNKNOWN"})`));
  });
}

async function runPgQuery(connectionString) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    query_timeout: 10000,
  });

  try {
    await client.connect();
    const result = await client.query("SELECT 1 AS ok");
    return {
      ok: true,
      rows: result.rowCount,
    };
  } catch (error) {
    return {
      ok: false,
      code: error.code || "UNKNOWN",
      message: String(error.message || error).replace(/\s+/g, " ").trim(),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkTarget(target) {
  const parsed = parseConnectionString(target.envName);

  if (!parsed.ok) {
    console.log(parsed.message);
    return false;
  }

  const { envName, label } = target;
  const { value, url } = parsed;
  const warnings = getWarnings(envName, url);

  console.log(`${envName} (${label})`);
  console.log(`  host=${url.hostname}`);
  console.log(`  port=${url.port || "5432"}`);
  console.log(`  database=${url.pathname.replace(/^\//, "") || "(empty)"}`);
  console.log(`  params=${formatParams(url)}`);

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.log(`  warning=${warning}`);
    }
  }

  const tcpStatus = await probeTcp(url.hostname, url.port || "5432");
  console.log(`  tcp=${tcpStatus}`);

  const configuredAttempt = await runPgQuery(value);
  if (configuredAttempt.ok) {
    console.log("  query=ok (as configured)");
    return true;
  }

  console.log(
    `  query=fail (as configured) code=${configuredAttempt.code} message=${configuredAttempt.message}`
  );

  if (isSupabase(url) && !url.searchParams.has("sslmode")) {
    const sslAttempt = await runPgQuery(addParam(value, "sslmode", "require"));

    if (sslAttempt.ok) {
      console.log("  hint=works when sslmode=require is added");
    } else {
      console.log(
        `  retry_with_ssl=fail code=${sslAttempt.code} message=${sslAttempt.message}`
      );
    }
  }

  return false;
}

async function checkPrismaRuntime() {
  try {
    const result = await Promise.race([
      prisma.$queryRawUnsafe("SELECT 1 AS ok"),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("timeout_after_15000ms")), 15000);
      }),
    ]);

    console.log(`PRISMA_RUNTIME=ok rows=${Array.isArray(result) ? result.length : 0}`);
    return true;
  } catch (error) {
    const message = String(error.message || error).replace(/\s+/g, " ").trim();
    const code = error.code || "UNKNOWN";
    console.log(`PRISMA_RUNTIME=fail code=${code} message=${message}`);
    return false;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function main() {
  let ok = true;

  for (const target of TARGETS) {
    const targetOk = await checkTarget(target);
    ok = ok && targetOk;
    console.log("");
  }

  const prismaOk = await checkPrismaRuntime();
  ok = ok && prismaOk;

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(String(error.message || error));
  process.exit(1);
});
