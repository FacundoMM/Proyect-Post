export type Product = {
  id: number;
  barcode: string;
  name: string;
  imageUrl: string | null;
  price: number;
  stock: number;
};

export type SaleItem = {
  id: number;
  productId: number | null;
  productName: string;
  productBarcode: string;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

export type Sale = {
  id: number;
  total: number;
  createdAt: string;
  items: SaleItem[];
};

export type HealthResponse = {
  ok: boolean;
  database: string;
  timestamp: string;
};

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000").replace(/\/$/, "");

export const numberFormatter = new Intl.NumberFormat("es-PY", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const dateFormatter = new Intl.DateTimeFormat("es-PY", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const timeFormatter = new Intl.DateTimeFormat("es-PY", {
  timeStyle: "short",
});

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

export function formatTime(value: string) {
  return timeFormatter.format(new Date(value));
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as T | { error?: string }) : null;

  if (!response.ok) {
    const errorMessage =
      data && typeof data === "object" && "error" in data
        ? data.error
        : `La solicitud fallo con estado ${response.status}.`;

    throw new Error(errorMessage || "No se pudo completar la solicitud.");
  }

  return data as T;
}

export async function fetchHealth() {
  return apiRequest<HealthResponse>("/health");
}

export async function fetchProducts() {
  return apiRequest<Product[]>("/api/products");
}

export async function fetchSales() {
  return apiRequest<Sale[]>("/api/sales");
}
