require("dotenv").config();

const cors = require("cors");
const express = require("express");
const multer = require("multer");
const { randomUUID } = require("node:crypto");
const { Prisma } = require("@prisma/client");

const { prisma } = require("./lib/prisma");
const { getStorageBucket, getStorageClient } = require("./lib/supabase-storage");

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const productInclude = {
  barcodes: {
    orderBy: [{ id: "asc" }],
  },
  images: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
};
const saleInclude = {
  items: {
    orderBy: [{ id: "asc" }],
  },
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

let server;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

app.disable("x-powered-by");

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startedAt;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });

  next();
});

function parseId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, "El id debe ser un entero positivo.");
  }

  return id;
}

function parseNonNegativeNumber(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, `${fieldName} debe ser un numero mayor o igual a 0.`);
  }

  return parsed;
}

function parseNonNegativeInteger(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, `${fieldName} debe ser un entero mayor o igual a 0.`);
  }

  return parsed;
}

function parsePositiveInteger(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${fieldName} debe ser un entero mayor a 0.`);
  }

  return parsed;
}

function parseOptionalDate(value, fieldName) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `${fieldName} debe ser una fecha valida.`);
  }

  return parsed;
}

function parseOptionalImageUrl(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, "imageUrl debe ser una URL valida.");
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("invalid_protocol");
    }

    return trimmed;
  } catch {
    throw new HttpError(400, "imageUrl debe ser una URL valida.");
  }
}

function getSafeImageExtension(file) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[file.mimetype];
}

function parseOptionalText(value, fieldName, maxLength = 255) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} debe ser texto.`);
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${fieldName} es demasiado largo.`);
  }

  return trimmed || null;
}

function parseProductImages(body, { partial = false } = {}) {
  if (body.images === undefined) {
    if (body.imageUrl === undefined) {
      return partial ? undefined : [];
    }

    const url = parseOptionalImageUrl(body.imageUrl);
    return url ? [{ url, path: null, kind: "FRONT", sortOrder: 0 }] : [];
  }

  if (!Array.isArray(body.images)) {
    throw new HttpError(400, "images debe ser una lista.");
  }

  if (body.images.length > 6) {
    throw new HttpError(400, "Puedes guardar hasta 6 imagenes por producto.");
  }

  const allowedKinds = new Set(["FRONT", "BACK", "DETAIL", "OTHER"]);

  return body.images.map((image, index) => {
    if (!image || typeof image !== "object") {
      throw new HttpError(400, "Cada imagen debe ser valida.");
    }

    const url = parseOptionalImageUrl(image.url);
    if (!url) {
      throw new HttpError(400, "Cada imagen debe tener una URL valida.");
    }

    const kind = typeof image.kind === "string" ? image.kind.toUpperCase() : "OTHER";
    if (!allowedKinds.has(kind)) {
      throw new HttpError(400, "El tipo de imagen no es valido.");
    }

    return {
      url,
      path: parseOptionalText(image.path, "path", 500),
      kind,
      sortOrder: index,
    };
  });
}

function parseBarcodeList(body, { partial = false } = {}) {
  const rawCodes =
    body.barcodes !== undefined
      ? body.barcodes
      : body.barcode !== undefined
        ? body.barcode
        : undefined;

  if (rawCodes === undefined) {
    if (partial) {
      return undefined;
    }

    throw new HttpError(400, "barcode es obligatorio.");
  }

  const values = Array.isArray(rawCodes) ? rawCodes : [rawCodes];
  const codes = values
    .flatMap((value) => {
      if (typeof value !== "string") {
        throw new HttpError(400, "barcode debe ser texto.");
      }

      return value.split(/[\s,;]+/);
    })
    .map((value) => value.trim())
    .filter(Boolean);
  const uniqueCodes = Array.from(new Set(codes));

  if (uniqueCodes.length === 0) {
    throw new HttpError(400, "barcode es obligatorio.");
  }

  return uniqueCodes;
}

function parseProductPayload(body, { partial = false } = {}) {
  const data = {};
  const barcodeCodes = parseBarcodeList(body, { partial });
  const imageEntries = parseProductImages(body, { partial });

  if (barcodeCodes) {
    data.barcode = barcodeCodes[0];
  }

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      throw new HttpError(400, "name es obligatorio.");
    }

    data.name = body.name.trim();
  }

  if (!partial || body.price !== undefined) {
    data.price = parseNonNegativeNumber(body.price, "price");
  }

  if (imageEntries !== undefined) {
    data.imageUrl = imageEntries[0]?.url ?? null;
  }

  for (const fieldName of ["description", "category", "audience", "color", "size"]) {
    if (body[fieldName] !== undefined) {
      data[fieldName] = parseOptionalText(body[fieldName], fieldName);
    }
  }

  if (!partial || body.stock !== undefined) {
    if (body.stock === undefined || body.stock === null || body.stock === "") {
      data.stock = 0;
    } else {
      data.stock = parseNonNegativeInteger(body.stock, "stock");
    }
  }

  if (partial && Object.keys(data).length === 0) {
    throw new HttpError(400, "Debes enviar al menos un campo para actualizar.");
  }

  return {
    data,
    barcodeCodes,
    imageEntries,
  };
}

function parseSaleTime(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, "time es obligatorio.");
  }

  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);

  if (!match) {
    throw new HttpError(400, "time debe tener formato HH:mm.");
  }

  const [, hours, minutes, seconds = "0"] = match;
  const createdAt = new Date();

  createdAt.setHours(Number(hours), Number(minutes), Number(seconds), 0);

  return createdAt;
}

function parseSaleItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "Debes agregar al menos un producto a la venta.");
  }

  const groupedItems = new Map();

  for (const item of items) {
    if (!item || typeof item !== "object") {
      throw new HttpError(400, "Cada item de la venta debe ser valido.");
    }

    const productId = parseId(item.productId);
    const quantity =
      item.quantity === undefined || item.quantity === null || item.quantity === ""
        ? 1
        : parsePositiveInteger(item.quantity, "quantity");

    groupedItems.set(productId, (groupedItems.get(productId) ?? 0) + quantity);
  }

  return Array.from(groupedItems.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

function parseSalePayload(body, { partial = false } = {}) {
  const data = {};

  if (!partial || body.total !== undefined) {
    data.total = parseNonNegativeNumber(body.total, "total");
  }

  if (body.createdAt !== undefined) {
    data.createdAt = parseOptionalDate(body.createdAt, "createdAt");
  }

  if (body.time !== undefined) {
    data.createdAt = parseSaleTime(body.time);
  }

  if (partial && Object.keys(data).length === 0) {
    throw new HttpError(400, "Debes enviar al menos un campo para actualizar.");
  }

  return data;
}

function parseSaleCreatePayload(body) {
  const items = parseSaleItems(body.items);
  let createdAt;

  if (body.createdAt !== undefined && body.createdAt !== null && body.createdAt !== "") {
    createdAt = parseOptionalDate(body.createdAt, "createdAt");
  } else if (body.time !== undefined && body.time !== null && body.time !== "") {
    createdAt = parseSaleTime(body.time);
  }

  return {
    items,
    createdAt,
  };
}

async function ensureRecordExists(model, id, entityName) {
  const record = await model.findUnique({
    where: { id },
  });

  if (!record) {
    throw new HttpError(404, `${entityName} no encontrado.`);
  }

  return record;
}

async function ensureBarcodesAreAvailable(barcodeCodes, currentProductId = null) {
  const [legacyMatches, barcodeMatches] = await Promise.all([
    prisma.product.findMany({
      where: {
        barcode: {
          in: barcodeCodes,
        },
        ...(currentProductId ? { id: { not: currentProductId } } : {}),
      },
      select: { id: true },
      take: 1,
    }),
    prisma.productBarcode.findMany({
      where: {
        code: {
          in: barcodeCodes,
        },
        ...(currentProductId ? { productId: { not: currentProductId } } : {}),
      },
      select: { id: true },
      take: 1,
    }),
  ]);

  if (legacyMatches.length > 0 || barcodeMatches.length > 0) {
    throw new HttpError(409, "Ya existe un producto con ese codigo de barras.");
  }
}

function serializeProduct(product) {
  const barcodeCodes =
    product.barcodes?.map((barcode) => barcode.code).filter(Boolean) ?? [];
  const barcodes = barcodeCodes.length > 0 ? barcodeCodes : [product.barcode];
  const { barcodes: _barcodes, ...rest } = product;
  const images = product.images ?? [];

  return {
    ...rest,
    imageUrl: product.imageUrl ?? images[0]?.url ?? null,
    images,
    barcode: barcodes[0],
    barcodes,
  };
}

app.get("/", (req, res) => {
  res.json({
    message: "Backend funcionando correctamente.",
    endpoints: [
      "GET /health",
      "GET /api/products",
      "GET /api/products/search",
      "GET /api/products/barcode/:barcode",
      "GET /api/products/:id",
      "POST /api/products",
      "PATCH /api/products/:id",
      "DELETE /api/products/:id",
      "GET /api/sales",
      "GET /api/sales/:id",
      "POST /api/sales",
      "PATCH /api/sales/:id",
      "DELETE /api/sales/:id",
      "POST /api/uploads/product-image",
      "GET /webhooks/whatsapp",
      "POST /webhooks/whatsapp",
    ],
  });
});

app.post("/api/uploads/product-image", upload.single("image"), async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, "Debes seleccionar una imagen.");
  }

  if (!allowedImageTypes.has(req.file.mimetype)) {
    throw new HttpError(400, "La imagen debe ser JPG, PNG o WebP.");
  }

  const path = `products/${randomUUID()}.${getSafeImageExtension(req.file)}`;
  const bucket = getStorageBucket();
  const { error } = await getStorageClient().storage.from(bucket).upload(path, req.file.buffer, {
    contentType: req.file.mimetype,
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) {
    throw new Error(`No se pudo subir la imagen: ${error.message}`);
  }

  const { data } = getStorageClient().storage.from(bucket).getPublicUrl(path);

  res.status(201).json({ path, url: data.publicUrl });
});

app.get("/health", async (req, res) => {
  await prisma.$queryRawUnsafe("SELECT 1 AS ok");

  res.json({
    ok: true,
    database: "connected",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/products", async (req, res) => {
  const products = await prisma.product.findMany({
    include: productInclude,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  res.json(products.map(serializeProduct));
});

app.get("/api/products/search", async (req, res) => {
  const text = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const audience = typeof req.query.audience === "string" ? req.query.audience.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const color = typeof req.query.color === "string" ? req.query.color.trim() : "";
  const size = typeof req.query.size === "string" ? req.query.size.trim() : "";
  const searchableFields = ["name", "description", "category", "color", "size"];

  const products = await prisma.product.findMany({
    where: {
      stock: { gt: 0 },
      ...(audience ? { audience: { equals: audience, mode: "insensitive" } } : {}),
      ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
      ...(color ? { color: { contains: color, mode: "insensitive" } } : {}),
      ...(size ? { size: { contains: size, mode: "insensitive" } } : {}),
      ...(text
        ? {
            OR: searchableFields.map((field) => ({
              [field]: { contains: text, mode: "insensitive" },
            })),
          }
        : {}),
    },
    include: productInclude,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 20,
  });

  res.json(products.map(serializeProduct));
});

app.get("/api/products/barcode/:barcode", async (req, res) => {
  const barcode = req.params.barcode?.trim();

  if (!barcode) {
    throw new HttpError(400, "El codigo de barras es obligatorio.");
  }

  const productBarcode = await prisma.productBarcode.findUnique({
    where: { code: barcode },
    include: {
      product: {
        include: productInclude,
      },
    },
  });

  if (productBarcode) {
    res.json(serializeProduct(productBarcode.product));
    return;
  }

  const legacyProduct = await prisma.product.findUnique({
    where: { barcode },
    include: productInclude,
  });

  if (!legacyProduct) {
    throw new HttpError(404, "Producto no encontrado.");
  }

  res.json(serializeProduct(legacyProduct));
});

app.get("/api/products/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const product = await prisma.product.findUnique({
    where: { id },
    include: productInclude,
  });

  if (!product) {
    throw new HttpError(404, "Producto no encontrado.");
  }

  res.json(serializeProduct(product));
});

app.post("/api/products", async (req, res) => {
  const { data, barcodeCodes, imageEntries } = parseProductPayload(req.body);
  await ensureBarcodesAreAvailable(barcodeCodes);

  const product = await prisma.product.create({
    data: {
      ...data,
      barcodes: {
        create: barcodeCodes.map((code) => ({ code })),
      },
      images: {
        create: imageEntries,
      },
    },
    include: productInclude,
  });

  res.status(201).json(serializeProduct(product));
});

app.patch("/api/products/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const { data, barcodeCodes, imageEntries } = parseProductPayload(req.body, { partial: true });

  await ensureRecordExists(prisma.product, id, "Producto");

  if (barcodeCodes) {
    await ensureBarcodesAreAvailable(barcodeCodes, id);
  }

  const product = await prisma.$transaction(async (tx) => {
    if (barcodeCodes) {
      await tx.productBarcode.deleteMany({
        where: { productId: id },
      });
    }

    if (imageEntries !== undefined) {
      await tx.productImage.deleteMany({
        where: { productId: id },
      });
    }

    return tx.product.update({
      where: { id },
      data: {
        ...data,
        ...(barcodeCodes
          ? {
              barcodes: {
                create: barcodeCodes.map((code) => ({ code })),
              },
            }
          : {}),
        ...(imageEntries !== undefined
          ? {
              images: {
                create: imageEntries,
              },
            }
          : {}),
      },
      include: productInclude,
    });
  });

  res.json(serializeProduct(product));
});

app.delete("/api/products/:id", async (req, res) => {
  const id = parseId(req.params.id);

  await ensureRecordExists(prisma.product, id, "Producto");
  await prisma.product.delete({
    where: { id },
  });

  res.status(204).send();
});

app.get("/api/sales", async (req, res) => {
  const sales = await prisma.sale.findMany({
    include: saleInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  res.json(sales);
});

app.get("/api/sales/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: saleInclude,
  });

  if (!sale) {
    throw new HttpError(404, "Venta no encontrada.");
  }

  res.json(sale);
});

app.post("/api/sales", async (req, res) => {
  const { items, createdAt } = parseSaleCreatePayload(req.body);
  const productIds = items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: {
      id: {
        in: productIds,
      },
    },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  const saleItems = items.map((item) => {
    const product = productsById.get(item.productId);

    if (!product) {
      throw new HttpError(404, `Producto ${item.productId} no encontrado.`);
    }

    const subtotal = Number((product.price * item.quantity).toFixed(2));

    return {
      productId: product.id,
      productName: product.name,
      productBarcode: product.barcode,
      productImageUrl: product.imageUrl,
      unitPrice: product.price,
      quantity: item.quantity,
      subtotal,
    };
  });
  const total = Number(
    saleItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)
  );
  const sale = await prisma.sale.create({
    data: {
      total,
      ...(createdAt ? { createdAt } : {}),
      items: {
        create: saleItems,
      },
    },
    include: saleInclude,
  });

  res.status(201).json(sale);
});

app.patch("/api/sales/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const data = parseSalePayload(req.body, { partial: true });

  await ensureRecordExists(prisma.sale, id, "Venta");

  const sale = await prisma.sale.update({
    where: { id },
    data,
  });

  res.json(sale);
});

app.delete("/api/sales/:id", async (req, res) => {
  const id = parseId(req.params.id);

  await ensureRecordExists(prisma.sale, id, "Venta");
  await prisma.sale.delete({
    where: { id },
  });

  res.status(204).send();
});

app.get("/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

app.post("/webhooks/whatsapp", (req, res) => {
  if (req.body?.object !== "whatsapp_business_account") {
    res.sendStatus(404);
    return;
  }

  const messages = [];

  for (const entry of req.body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        messages.push({
          from: message.from,
          id: message.id,
          type: message.type,
          text: message.text?.body ?? null,
          timestamp: message.timestamp,
        });
      }
    }
  }

  if (messages.length > 0) {
    console.log("WhatsApp webhook recibido:", JSON.stringify(messages));
  }

  // Meta espera una respuesta rapida; el procesamiento de reservas se agregara
  // despues de confirmar que la suscripcion del webhook funciona.
  res.sendStatus(200);
});

app.use((req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada.",
  });
});

app.use((error, req, res, next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: error.message,
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return res.status(404).json({
        error: "Registro no encontrado.",
      });
    }

    if (error.code === "P2002") {
      return res.status(409).json({
        error: "Ya existe un producto con ese codigo de barras.",
      });
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      error: "Los datos enviados no son validos.",
    });
  }

  console.error(error);

  return res.status(500).json({
    error: "Error interno del servidor.",
  });
});

async function shutdown(signal) {
  console.log(`Cerrando servidor por ${signal}...`);

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await prisma.$disconnect();
}

async function startServer() {
  await prisma.$connect();

  server = app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
  });

  return server;
}

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error("No se pudo iniciar el backend:", error);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });

  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.once(signal, async () => {
      try {
        await shutdown(signal);
        process.exit(0);
      } catch (error) {
        console.error("Error al cerrar el backend:", error);
        process.exit(1);
      }
    });
  });
}

module.exports = {
  app,
  startServer,
};
