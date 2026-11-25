# Backend

## Configurar Supabase

1. Copia `.env.example` como `.env`.
2. En Supabase abre **Connect** y copia las cadenas PostgreSQL.
3. Coloca la cadena del pooler en `DATABASE_URL`.
4. Coloca la cadena directa en `DIRECT_URL`.
5. Reemplaza `DB_PASSWORD` y `PROJECT_REF`; no compartas esas cadenas.

La aplicacion usa `DATABASE_URL` en tiempo de ejecucion. Prisma usa `DIRECT_URL` para generar el cliente y ejecutar migraciones.

## Imagenes

Crea en Supabase Storage un bucket publico llamado `product-images`. Agrega
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_STORAGE_BUCKET` al
`.env` del backend. La clave `service_role` nunca debe ir en el frontend.

## Comprobar la conexion

```bash
npm run db:check
```

Si la comprobacion funciona, el backend puede iniciar con:

```bash
npm start
```
