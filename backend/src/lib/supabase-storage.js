require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

let storageClient;

function getStorageConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "product-images";

  if (!url || !serviceRoleKey) {
    const error = new Error(
      "Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para subir imagenes."
    );
    error.status = 503;
    throw error;
  }

  return { url, serviceRoleKey, bucket };
}

function getStorageClient() {
  if (!storageClient) {
    const { url, serviceRoleKey } = getStorageConfig();
    storageClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return storageClient;
}

function getStorageBucket() {
  return getStorageConfig().bucket;
}

module.exports = { getStorageBucket, getStorageClient };
