require("dotenv").config();

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

function getDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL no esta configurada. Copia la cadena de conexion del pooler de Supabase en backend/.env."
    );
  }

  let parsed;

  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL no es una cadena de conexion PostgreSQL valida.");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL debe usar el protocolo postgresql://.");
  }

  // Conservamos exactamente los parametros entregados por Supabase. Forzar
  // sslmode=require aqui puede provocar errores de certificado en algunos
  // entornos locales; las cadenas de Supabase ya incluyen su configuracion TLS.
  return parsed.toString();
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
  return new PrismaClient({ adapter });
}

const prisma = globalForPrisma.__prisma__ ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma__ = prisma;
}

module.exports = {
  prisma,
  createPrismaClient,
  getDatabaseUrl,
};
