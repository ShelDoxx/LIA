import { Link } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { Badge, Button, Card } from "@/components/ui";
import { buildAgenda } from "@/lib/agenda";
import { greeting, money, daysUntil } from "@/lib/format";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

const urgencyLabel = { now: "Ahora", today: "Hoy", soon: "Esta semana" } as const;

const highlightKinds = new Set(["retention", "mora", "stuck_claim", "renewal", "payment_reminder"]);

function badgeLabel(item: ReturnType<typeof buildAgenda>[number]) {
  if (item.kind === "retention") return "Retención";
  if (item.kind === "mora") return "Mora";
  if (item.kind === "stuck_claim") return "Urgente";
  if (item.kind === "renewal") return "Renovar";
  if (item.kind === "payment_reminder") return "Cuota";
  return urgencyLabel[item.urgency];
}

export function Dashboard() {
  const { state, toggleDone } = useLia();
  const agenda = buildAgenda(state).filter((i) => !state.doneAgenda.includes(i.id));
  const pending = (state.commissions ?? []).reduce((a, r) => a + r.pending, 0);
  const mora = state.policies.filter(
    (p) => p.status !== "cancelada" && Number.isFinite(daysUntil(p.nextDueDate)) && daysUntil(p.nextDueDate) < 0,
  );
  const chart = (state.commissions ?? []).map((r) => ({
    name: r.company.split(" ")[0],
    cobrado: r.received,
    falta: r.pending,
  }));

  return (
    <div className="space-y-6">
      <OnboardingBanner />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">
            {greeting()}
            {state.producer.name && state.producer.name !== "Vos" && state.producer.name !== "Productor demo"
              ? `, ${state.producer.name.split(" ")[0]}`
              : ""}
          </p>
          <h2 className="font-serif text-3xl md:text-4xl">Hoy se produce o se pierde</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {agenda.length} movimientos · {mora.length} en mora · {money(pending)} de comisión por cobrar
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/cobranzas" className="rounded-md bg-gold px-4 py-2 text-sm text-paper">
            Ir a cobranzas
          </Link>
          <Link to="/vencimientos" className="rounded-md border border-line px-4 py-2 text-sm">
            Renovaciones 90-60-30
          </Link>
        </div>
      </div>

      {(state.lastDailySent ?? 0) > 0 && (
        <Card className="border-wa/30 bg-wa/5 p-4">
          <p className="text-sm">
            Lía envió <strong>{state.lastDailySent}</strong> mensaje
            {state.lastDailySent === 1 ? "" : "s"} automático{state.lastDailySent === 1 ? "" : "s"} hoy
            (mora, aviso de cuota o renovación).
            {(state.lastWaSent ?? 0) > 0 && (
              <>
                {" "}
                <strong>{state.lastWaSent}</strong> por WhatsApp real al cliente.
              </>
            )}
          </p>
          <Link to="/whatsapp" className="mt-2 inline-block text-sm text-gold">
            Ver conversaciones →
          </Link>
        </Card>
      )}

      {agenda.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-serif text-2xl">Nada urgente por ahora</p>
          <p className="mt-2 text-sm text-ink-soft">
            Revisá el Radar comercial o importá cartera en Marca para seguir produciendo.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/radar" className="rounded-md bg-forest px-4 py-2 text-sm text-paper">
              Ver radar
            </Link>
            <Link to="/clientes" className="rounded-md border border-line px-4 py-2 text-sm">
              Clientes
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {agenda.slice(0, 10).map((item) => (
            <Card
              key={item.id}
              className={`flex h-full items-start gap-3 p-4 ${
                item.kind && highlightKinds.has(item.kind) ? "border-gold/40 bg-gold/5" : ""
              }`}
            >
              <input
                type="checkbox"
                className="mt-1"
                onChange={() => toggleDone(item.id)}
                aria-label="Hecho"
              />
              <div className="min-w-0 flex-1">
                <Link to={item.to} className="block">
                  <Badge
                    tone={
                      item.kind && highlightKinds.has(item.kind)
                        ? "gold"
                        : item.urgency === "now"
                          ? "gold"
                          : item.urgency === "today"
                            ? "warn"
                            : "ink"
                    }
                  >
                    {badgeLabel(item)}
                  </Badge>
                  <p className="mt-2 font-medium">{item.title}</p>
                  <p className="text-sm text-ink-soft">{item.detail}</p>
                </Link>
                {item.kind === "mora" ? (
                  <Link to={item.to} className="mt-3 inline-block">
                    <Button variant="gold" className="h-8 px-3 text-xs">
                      Reclamar Mora
                    </Button>
                  </Link>
                ) : null}
                {item.kind === "stuck_claim" || item.kind === "renewal" || item.kind === "payment_reminder" ? (
                  <Link to={item.to} className="mt-3 inline-block">
                    <Button variant="gold" className="h-8 px-3 text-xs">
                      Mandar WhatsApp
                    </Button>
                  </Link>
                ) : null}
              </div>
              {item.money ? <p className="font-serif text-lg">{money(item.money)}</p> : null}
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-serif text-xl">Comisiones del mes</h3>
            <Link to="/comisiones" className="text-sm text-gold">
              Liquidar
            </Link>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="cobrado" fill="#1a2744" radius={3} />
                <Bar dataKey="falta" fill="#c4452d" radius={3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="flex flex-1 flex-col justify-between border-gold/40 p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-gold">El trámite que más odian</p>
              <p className="mt-3 font-serif text-2xl leading-tight">WhatsApp te manda 6 fotos. Lía arma el PDF.</p>
              <p className="mt-3 text-sm text-ink-soft">
                SMG LIFE pide DNI y tarjeta frente/dorso. El cliente las manda por WhatsApp: Lía arma
                el PDF y lo deja en esa ficha.
              </p>
            </div>
            <Link to="/whatsapp" className="mt-6 text-sm text-gold">
              Probar por WhatsApp →
            </Link>
          </Card>
          <Card className="flex flex-1 flex-col justify-between bg-forest-deep p-5 text-paper">
            <div>
              <p className="text-xs uppercase tracking-wide text-gold">Por qué un colega paga</p>
              <p className="mt-3 font-serif text-2xl leading-tight">Una renovación caída paga varios meses de Lía.</p>
              <p className="mt-3 text-sm text-paper/70">
                El bot no es para dormir. Es para que el cliente renueve, pague y te elija otra vez.
              </p>
            </div>
            <Link to="/radar" className="mt-6 text-sm text-gold">
              Ver radar comercial →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
