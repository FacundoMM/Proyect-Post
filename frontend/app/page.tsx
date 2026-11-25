import Link from "next/link";

const sections = [
  {
    href: "/inventario",
    eyebrow: "Inventario",
    title: "Cargar productos",
    description:
      "Da de alta productos con imagen, nombre, codigo de barras y precio en una vista enfocada solo en catalogo.",
    accentClass: "bg-[linear-gradient(135deg,#d96d3a_0%,#f4b070_100%)]",
  },
  {
    href: "/ventas",
    eyebrow: "Ventas",
    title: "Registrar ventas",
    description:
      "Trabaja aparte las ventas, revisa el historial y usa tu catalogo como referencia rapida al momento de cobrar.",
    accentClass: "bg-[linear-gradient(135deg,#285b46_0%,#7ab07f_100%)]",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group panel-shadow overflow-hidden rounded-[30px] border border-border bg-surface-strong"
          >
            <div className={`h-3 w-full ${section.accentClass}`} />
            <div className="space-y-5 p-6 sm:p-7">
              <p className="text-sm uppercase tracking-[0.28em] text-muted">
                {section.eyebrow}
              </p>
              <div className="space-y-3">
                <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                  {section.title}
                </h2>
                <p className="max-w-xl text-base leading-7 text-muted">
                  {section.description}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(29,23,17,0.1)] px-4 py-2 text-sm font-semibold text-foreground group-hover:bg-[rgba(255,255,255,0.65)]">
                Abrir seccion
                <span aria-hidden="true">{"->"}</span>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
