"use client";

import {
  FormEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";

import ProductImageCard from "./product-image-card";
import {
  API_BASE_URL,
  HealthResponse,
  Product,
  Sale,
  apiRequest,
  fetchHealth,
  fetchProducts,
  fetchSales,
  formatNumber,
  formatTime,
} from "../_lib/dashboard-api";

type CartItem = Product & {
  quantity: number;
};

function getCurrentTimeValue() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function isExactMatch(product: Product, normalizedSearch: string) {
  return (
    product.name.toLowerCase() === normalizedSearch ||
    String(product.id) === normalizedSearch ||
    product.barcode.toLowerCase() === normalizedSearch
  );
}

export default function SalesWorkspace() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [saleTime, setSaleTime] = useState(getCurrentTimeValue());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const searchResults = normalizedSearch
    ? [...products]
        .filter((product) => {
          return (
            product.name.toLowerCase().includes(normalizedSearch) ||
            String(product.id).includes(normalizedSearch) ||
            product.barcode.toLowerCase().includes(normalizedSearch)
          );
        })
        .sort((left, right) => {
          const leftExact = isExactMatch(left, normalizedSearch) ? 1 : 0;
          const rightExact = isExactMatch(right, normalizedSearch) ? 1 : 0;

          if (leftExact !== rightExact) {
            return rightExact - leftExact;
          }

          return left.name.localeCompare(right.name, "es");
        })
        .slice(0, 8)
    : [];

  const cartTotal = cartItems.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);

  const totalUnits = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  async function syncSales(mode: "initial" | "manual" | "silent" = "manual") {
    if (mode === "initial") {
      setIsLoading(true);
    }

    if (mode === "manual") {
      setIsRefreshing(true);
    }

    setLoadError(null);

    try {
      const [nextHealth, nextSales, nextProducts] = await Promise.all([
        fetchHealth(),
        fetchSales(),
        fetchProducts(),
      ]);

      startTransition(() => {
        setHealth(nextHealth);
        setSales(nextSales);
        setProducts(nextProducts);
      });
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "No se pudo cargar ventas."
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
        const [nextHealth, nextSales, nextProducts] = await Promise.all([
          fetchHealth(),
          fetchSales(),
          fetchProducts(),
        ]);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setHealth(nextHealth);
          setSales(nextSales);
          setProducts(nextProducts);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(
          error instanceof Error ? error.message : "No se pudo cargar ventas."
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

  function addProductToCart(product: Product) {
    setCartItems((current) => {
      const existingItem = current.find((item) => item.id === product.id);

      if (existingItem) {
        return current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        {
          ...product,
          quantity: 1,
        },
        ...current,
      ];
    });

    setSearch("");
    setFeedback(`${product.name} agregado a la venta.`);
  }

  function updateCartQuantity(productId: number, nextQuantity: number) {
    if (nextQuantity <= 0) {
      setCartItems((current) => current.filter((item) => item.id !== productId));
      return;
    }

    setCartItems((current) =>
      current.map((item) =>
        item.id === productId
          ? {
              ...item,
              quantity: nextQuantity,
            }
          : item
      )
    );
  }

  function cancelSale() {
    setCartItems([]);
    setSearch("");
    setSaleTime(getCurrentTimeValue());
    setFeedback("Venta cancelada.");
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!normalizedSearch) {
      setFeedback("Escribe un nombre, id o codigo de barras.");
      return;
    }

    const exactProduct =
      searchResults.find((product) => isExactMatch(product, normalizedSearch)) ??
      (searchResults.length === 1 ? searchResults[0] : null);

    if (!exactProduct) {
      setFeedback(
        searchResults.length === 0
          ? "No se encontro ningun producto."
          : "Hay varios resultados. Elige uno de la lista."
      );
      return;
    }

    addProductToCart(exactProduct);
  }

  async function handleFinishSale() {
    if (cartItems.length === 0) {
      setFeedback("Agrega al menos un producto antes de terminar la venta.");
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await apiRequest<Sale>("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          time: saleTime,
          items: cartItems.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      setCartItems([]);
      setSearch("");
      setSaleTime(getCurrentTimeValue());
      setFeedback("Venta registrada correctamente.");
      await syncSales("silent");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "No se pudo registrar la venta."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteSale(id: number) {
    setPendingDeleteId(id);
    setFeedback(null);

    try {
      await apiRequest<void>(`/api/sales/${id}`, {
        method: "DELETE",
      });

      setFeedback("Venta eliminada.");
      await syncSales("silent");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "No se pudo eliminar la venta."
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <article className="panel-shadow rounded-[30px] border border-border bg-surface p-5 sm:p-6">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.25em] text-muted">
                Buscar producto
              </p>
              <h2 className="text-2xl font-semibold text-foreground">
                Nombre, id o codigo de barras
              </h2>
            </div>

            <form className="mt-6 grid gap-4 md:grid-cols-[1fr_180px]" onSubmit={handleSearchSubmit}>
              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Busqueda o escaneo
                </span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ej: coca, 12 o 7840012345678"
                  className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-foreground outline-none placeholder:text-muted/80 focus:border-success focus:ring-4 focus:ring-[rgba(40,91,70,0.14)]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Hora</span>
                <input
                  type="time"
                  value={saleTime}
                  onChange={(event) => setSaleTime(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-foreground outline-none focus:border-success focus:ring-4 focus:ring-[rgba(40,91,70,0.14)]"
                />
              </label>

              <button
                type="submit"
                className="md:col-span-2 rounded-2xl bg-success px-5 py-3 font-semibold text-white hover:-translate-y-0.5 hover:bg-[#1d4534]"
              >
                Agregar por busqueda
              </button>
            </form>

            <div className="mt-6 space-y-3">
              {normalizedSearch.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-border bg-white/45 px-5 py-8 text-center text-muted">
                  Escribe o escanea un codigo para ver resultados.
                </div>
              ) : searchResults.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-border bg-white/45 px-5 py-8 text-center text-muted">
                  No se encontraron productos con esa busqueda.
                </div>
              ) : (
                searchResults.map((product) => (
                  <div
                    key={product.id}
                    className="grid gap-4 rounded-[24px] border border-[rgba(29,23,17,0.08)] bg-white/78 p-4 sm:grid-cols-[132px_1fr_auto]"
                  >
                    <ProductImageCard
                      alt={product.name}
                      imageUrl={product.imageUrl}
                      barcode={product.barcode}
                    />

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {product.name}
                        </h3>
                        <span className="rounded-full bg-[rgba(40,91,70,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-success">
                          id {product.id}
                        </span>
                      </div>
                      <div className="grid gap-1 text-sm text-muted">
                        <p>Codigo de barras: {product.barcode}</p>
                        <p>Precio: {formatNumber(product.price)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => addProductToCart(product)}
                        className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-[#2d241a]"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>

        <article className="panel-shadow rounded-[30px] border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-muted">
                  Lista actual
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">
                  Productos seleccionados
                </h2>
              </div>
              <div className="rounded-full bg-[rgba(40,91,70,0.1)] px-4 py-2 text-sm font-semibold text-success">
                {formatNumber(cartTotal)} total
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {cartItems.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-border bg-white/45 px-5 py-10 text-center text-muted">
                  Todavia no agregaste productos a la venta.
                </div>
              ) : (
                cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-4 rounded-[24px] border border-[rgba(29,23,17,0.08)] bg-white/78 p-4 sm:grid-cols-[96px_1fr_auto]"
                  >
                    <ProductImageCard
                      alt={item.name}
                      imageUrl={item.imageUrl}
                      barcode={item.barcode}
                    />

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {item.name}
                        </h3>
                        <span className="rounded-full bg-[rgba(29,23,17,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                          {item.barcode}
                        </span>
                      </div>
                      <div className="grid gap-1 text-sm text-muted">
                        <p>Precio unitario: {formatNumber(item.price)}</p>
                        <p>Subtotal: {formatNumber(item.price * item.quantity)}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(29,23,17,0.12)] text-lg font-semibold text-foreground hover:bg-[rgba(29,23,17,0.06)]"
                        >
                          -
                        </button>
                        <span className="min-w-8 text-center text-sm font-semibold text-foreground">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(29,23,17,0.12)] text-lg font-semibold text-foreground hover:bg-[rgba(29,23,17,0.06)]"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.id, 0)}
                        className="rounded-full border border-[rgba(163,63,63,0.18)] px-4 py-2 text-sm font-semibold text-danger hover:bg-[rgba(163,63,63,0.08)]"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  void handleFinishSale();
                }}
                className="rounded-2xl bg-success px-5 py-3 font-semibold text-white hover:-translate-y-0.5 hover:bg-[#1d4534] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting || cartItems.length === 0}
              >
                {isSubmitting ? "Terminando..." : "Terminar venta"}
              </button>
              <button
                type="button"
                onClick={cancelSale}
                className="rounded-2xl border border-[rgba(29,23,17,0.12)] bg-white/70 px-5 py-3 font-semibold text-foreground hover:bg-white"
                disabled={cartItems.length === 0}
              >
                Cancelar venta
              </button>
            </div>

            {feedback ? <p className="mt-4 text-sm text-muted">{feedback}</p> : null}
        </article>
      </section>
    </main>
  );
}
