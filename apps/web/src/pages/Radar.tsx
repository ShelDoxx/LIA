import { Link } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Badge, Card } from "@/components/ui";
import { buildRadar } from "@/lib/agenda";

const tone = {
  vida: "gold" as const,
  silencio: "warn" as const,
  combo: "forest" as const,
  cotizacion: "ink" as const,
  plata: "danger" as const,
  infraseguro: "gold" as const,
};

const label = {
  vida: "Cruzar vida",
  silencio: "En silencio",
  combo: "Combo",
  cotizacion: "Cotización",
  plata: "Por cobrar",
  infraseguro: "Infraseguro",
};

export function RadarPage() {
  const { state } = useLia();
  const items = buildRadar(state);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Comercial</p>
        <h2 className="font-serif text-3xl">Dónde hay plata escondida</h2>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">
          Un CRM lista gente. El radar te dice a quién llamar: cónyuge sin vida, suma desactualizada,
          cliente dormido, cotización colgada.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.length === 0 && (
          <Card className="col-span-full p-8 text-center text-sm text-ink-soft">
            Cartera al día en oportunidades detectadas. Importá más clientes o activá más ramos en Marca.
          </Card>
        )}
        {items.map((item) => (
          <Link key={item.id} to={item.to}>
            <Card className="h-full p-4 hover:border-gold/40">
              <Badge tone={tone[item.kind]}>{label[item.kind]}</Badge>
              <p className="mt-2 font-medium">{item.title}</p>
              <p className="text-sm text-ink-soft">{item.detail}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
