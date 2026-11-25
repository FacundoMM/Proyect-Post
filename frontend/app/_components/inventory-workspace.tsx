"use client";

import { FormEvent, startTransition, useDeferredValue, useEffect, useState } from "react";

import ProductImageCard from "./product-image-card";
import {
  API_BASE_URL,
  HealthResponse,
  Product,
  apiRequest,
  fetchHealth,
  fetchProducts,
  formatNumber,
} from "../_lib/dashboard-api";

const initialProductForm = {
  barcode: "",
  name: "",
  imageUrl: "",
  price: "",
  stock: "",
};

export default function InventoryWorkspace() {
  const [products, setProducts] = useState<Product[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(initialProductForm);

  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const filteredProducts = products.filter((product) => {
    return (
      product.name.toLowerCase().includes(normalizedSearch) ||
      product.barcode.toLowerCase().includes(normalizedSearch)
    );
  });

  const inventoryValue = products.reduce((sum, product) => {
    return sum + product.price * product.stock;
  }, 0);

  async function syncInventory(mode: "initial" | "manual" | "silent" = "manual") {
    if (mode === "initial") {
      setIsLoading(true);
    }

    if (mode === "manual") {
      setIsRefreshing(true);
    }

    setLoadError(null);

    try {
      const [nextHealth, nextProducts] = await Promise.all([
        fetchHealth(),
        fetchProducts(),
      ]);

      startTransition(() => {
        setHealth(nextHealth);
        setProducts(nextProducts);
      });
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el inventario."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const [nextHealth, nextProducts] = await Promise.all([
          fetchHealth(),
          fetchProducts(),
        ]);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setHealth(nextHealth);
          setProducts(nextProducts);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "No se pudo cargar el inventario."
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await apiRequest<Product>("/api/products", {
        method: "POST",
        body: JSON.stringify({
          barcode: form.barcode,
          name: form.name,
          imageUrl: form.imageUrl || undefined,
          price: Number(form.price),
          ...(form.stock ? { stock: Number(form.stock) } : {}),
        }),
      });

      setForm(initialProductForm);
      setFeedback("Producto cargado correctamente.");
      await syncInventory("silent");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el producto."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteProduct(id: number) {
    setPendingDeleteId(id);
    setFeedback(null);

    try {
      await apiRequest<void>(`/api/products/${id}`, {
        method: "DELETE",
      });

      setFeedback("Producto eliminado.");
      await syncInventory("silent");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el producto."
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="panel-shadow rounded-[30px] border border-border bg-surface p-5 sm:p-6">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.25em] text-muted">
              Nuevo producto
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              Alta de catalogo
            </h2>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleCreateProduct}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Codigo de barras
              </span>
              <input
                value={form.barcode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    barcode: event.target.value,
                  }))
                }
                placeholder="Ej: 7840012345678"
                className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 font-mono text-foreground outline-none placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-[rgba(217,109,58,0.14)]"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">Nombre</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ej: Yerba organica"
                className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-foreground outline-none placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-[rgba(217,109,58,0.14)]"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Imagen URL
              </span>
              <input
                value={form.imageUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    imageUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
                className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-foreground outline-none placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-[rgba(217,109,58,0.14)]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Precio</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                  placeholder="0"
                  className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-foreground outline-none placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-[rgba(217,109,58,0.14)]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Cantidad opcional
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      stock: event.target.value,
                    }))
                  }
                  placeholder="Puedes dejarlo vacio"
                  className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-foreground outline-none placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-[rgba(217,109,58,0.14)]"
                />
              </label>
            </div>

            <button
              type="submit"
              className="rounded-2xl bg-foreground px-5 py-3 font-semibold text-[var(--background)] hover:-translate-y-0.5 hover:bg-[#2d241a] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Guardando..." : "Guardar producto"}
            </button>
          </form>

          {feedback ? <p className="mt-4 text-sm text-muted">{feedback}</p> : null}
        </article>

        <article className="panel-shadow rounded-[30px] border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-muted">
                Catalogo
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                Productos cargados
              </h2>
            </div>

            <label className="w-full max-w-sm space-y-2">
              <span className="text-sm font-medium text-foreground">
                Buscar por nombre o codigo
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ej: 7840 o yerba"
                className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-foreground outline-none placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-[rgba(217,109,58,0.14)]"
              />
            </label>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {isLoading ? (
              <div className="sm:col-span-2 rounded-[24px] border border-dashed border-border bg-white/45 px-5 py-10 text-center text-muted">
                Cargando productos...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="sm:col-span-2 rounded-[24px] border border-dashed border-border bg-white/45 px-5 py-10 text-center text-muted">
                {normalizedSearch
                  ? "No hay productos que coincidan con la busqueda."
                  : "Todavia no hay productos cargados."}
              </div>
            ) : (
              filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex h-full flex-col gap-4 rounded-[26px] border border-[rgba(29,23,17,0.08)] bg-white/78 p-4"
                >
                  <ProductImageCard
                    alt={product.name}
                    imageUrl={product.imageUrl}
                    barcode={product.barcode}
                  />

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-foreground">
                        {product.name}
                      </h3>
                      <span className="rounded-full bg-[rgba(217,109,58,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-strong">
                        {product.barcode}
                      </span>
                    </div>
                    <div className="grid gap-2 text-sm text-muted">
                      <p>Precio: {formatNumber(product.price)}</p>
                      <p>Cantidad: {product.stock > 0 ? formatNumber(product.stock) : "Sin cargar"}</p>
                    </div>
                  </div>

                  <div className="mt-auto flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteProduct(product.id);
                      }}
                      className="rounded-full border border-[rgba(163,63,63,0.18)] px-4 py-2 text-sm font-semibold text-danger hover:bg-[rgba(163,63,63,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={pendingDeleteId === product.id}
                    >
                      {pendingDeleteId === product.id ? "Eliminando..." : "Eliminar"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
