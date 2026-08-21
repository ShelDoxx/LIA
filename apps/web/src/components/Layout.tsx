import {
  Banknote,
  Bell,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  PhoneCall,
  Radar,
  Search,
  Settings,
  Files,
  Siren,
  Users,
  Wallet,
  FileText,
  Shield,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { checkSubscription, trialDaysLeft } from "@/lib/billing";
import { useLia } from "@/context/LiaContext";
import { buildAgenda } from "@/lib/agenda";
import { fullName } from "@/lib/format";
import { LiaMark } from "@/components/LiaMark";
import { Badge } from "@/components/ui";
import { useMemo, useState, useEffect } from "react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

const primaryLinks: NavItem[] = [
  { to: "/", label: "Hoy", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/cobranzas", label: "Cobranzas", icon: Banknote },
  { to: "/vencimientos", label: "Renovar", icon: CalendarClock },
];

const moreLinks: NavItem[] = [
  { to: "/polizas", label: "Pólizas", icon: FileText },
  { to: "/radar", label: "Radar", icon: Radar },
  { to: "/cotizar", label: "Cotizar", icon: ClipboardList },
  { to: "/siniestros", label: "Siniestros", icon: Siren },
  { to: "/comisiones", label: "Caja", icon: Wallet },
  { to: "/expediente", label: "Expediente", icon: Files },
  { to: "/emergencias", label: "Asistencias", icon: PhoneCall },
  { to: "/ajustes", label: "Marca", icon: Settings },
];

export function Layout() {
  const { state, signOut, isAdmin, entitlement, entitlementStatus, refreshEntitlement } = useLia();
  const loc = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreNav, setMoreNav] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    if (!entitlement?.renewalRequired || entitlementStatus !== "active") return;
    const tick = () => {
      void refreshEntitlement();
    };
    const id = window.setInterval(tick, 20_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [entitlement?.renewalRequired, entitlementStatus, refreshEntitlement]);
  const navMore = useMemo(
    () =>
      isAdmin
        ? [...moreLinks, { to: "/admin", label: "Admin", icon: Shield } satisfies NavItem]
        : moreLinks,
    [isAdmin],
  );
  const links: NavItem[] = useMemo(() => [...primaryLinks, ...navMore], [navMore]);
  const agenda = useMemo(() => buildAgenda(state), [state]);
  const urgent = useMemo(
    () => agenda.filter((a) => a.urgency === "now" && !state.doneAgenda.includes(a.id)),
    [agenda, state.doneAgenda],
  );
  const alerts = urgent.length;
  const query = q.trim();
  const results = useMemo(() => {
    if (query.length <= 1) return [];
    const s = query.toLowerCase();
    const digits = query.replace(/\D/g, "");
    const plateOrPol = (clientId: string) =>
      state.policies.some((p) => {
        if (p.clientId !== clientId) return false;
        const plate = (p.plate ?? "").toLowerCase();
        const num = p.number.toLowerCase();
        const phone = state.clients.find((c) => c.id === clientId)?.phone.replace(/\D/g, "") ?? "";
        return (
          plate.includes(s) ||
          num.includes(s) ||
          (digits.length > 2 && (p.number.replace(/\D/g, "").includes(digits) || phone.includes(digits)))
        );
      });
    return state.clients
      .filter((c) => {
        const name = fullName(c).toLowerCase();
        const dni = (c.dni ?? "").toLowerCase();
        const dniDigits = (c.dni ?? "").replace(/\D/g, "");
        const phoneDigits = (c.phone ?? "").replace(/\D/g, "");
        return (
          name.includes(s) ||
          dni.includes(s) ||
          (digits.length > 2 && (dniDigits.includes(digits) || phoneDigits.includes(digits))) ||
          plateOrPol(c.id)
        );
      })
      .slice(0, 8);
  }, [query, state.clients, state.policies]);

  const title =
    links.find((l) => (l.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(l.to)))?.label ??
    "Lía";

  const subStatus = checkSubscription(state.producer.subscription);
  const trialLeft = trialDaysLeft(state.producer.subscription);

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="lia-grain relative hidden w-[15.5rem] shrink-0 flex-col bg-forest-deep text-paper md:flex">
        <div className="flex items-center gap-3 px-6 pb-2 pt-7">
          {state.bot.studioLogo ? (
            <img
              src={state.bot.studioLogo}
              alt={state.producer.studioName}
              className="h-11 w-11 rounded-md bg-white object-contain p-0.5"
            />
          ) : null}
          <div>
            <LiaMark className="text-4xl" />
            <p className="mt-1 text-xs text-paper/55">Atiende. Vos producís.</p>
          </div>
        </div>
        <nav className="mt-6 flex-1 space-y-0.5 px-3">
          {primaryLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                  isActive ? "bg-white/10 text-white" : "text-paper/65 hover:bg-white/5 hover:text-paper"
                }`
              }
            >
              <l.icon size={17} />
              {l.label}
              {l.to === "/whatsapp" && state.conversations.some((c) => c.unread) && (
                <span className="ml-auto h-2 w-2 rounded-full bg-wa" />
              )}
              {l.to === "/" && alerts > 0 && (
                <span className="ml-auto rounded-sm bg-gold px-1.5 text-[10px] font-semibold text-paper">
                  {alerts}
                </span>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreNav((v) => !v)}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
              navMore.some((l) => loc.pathname.startsWith(l.to))
                ? "bg-white/10 text-white"
                : "text-paper/65 hover:bg-white/5 hover:text-paper"
            }`}
          >
            <Menu size={17} />
            Más
          </button>
          {(moreNav || navMore.some((l) => loc.pathname.startsWith(l.to))) && (
            <div className="space-y-0.5 border-l border-white/10 pl-2">
              {navMore.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                      isActive ? "bg-white/10 text-white" : "text-paper/55 hover:bg-white/5 hover:text-paper"
                    }`
                  }
                >
                  <l.icon size={15} />
                  {l.label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="text-sm font-medium">{state.producer.studioName}</p>
          <p className="text-xs text-paper/50">{state.producer.matricula}</p>
          <span className="mt-2 inline-block">
            <Badge tone={state.producer.plan === "demo" ? "gold" : "forest"}>
              {state.producer.plan === "demo" ? "Plan demo" : "Plan estudio"}
            </Badge>
          </span>
          <button
            onClick={signOut}
            className="mt-3 flex items-center gap-2 text-xs text-paper/60 hover:text-paper"
          >
            <LogOut size={14} /> Salir
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur md:px-8">
          {state.bot.studioLogo ? (
            <img
              src={state.bot.studioLogo}
              alt={state.producer.studioName}
              className="h-9 w-9 rounded-md border border-line bg-white object-contain"
            />
          ) : (
            <div className="md:hidden">
              <LiaMark className="text-2xl" />
            </div>
          )}
          <h1 className="hidden font-serif text-2xl md:block">{title}</h1>
          <span className="hidden md:inline-flex">
            <Badge tone={state.producer.plan === "demo" ? "gold" : "forest"}>
              {state.producer.plan === "demo" ? "Demo" : "Estudio"}
            </Badge>
          </span>
          <div className="relative ml-auto w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-soft" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQ("");
              }}
              placeholder="Buscar cliente, DNI, patente o póliza"
              className="w-full rounded-md border border-line bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-forest"
            />
            {query.length > 1 && (
              <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-md border border-line bg-white shadow-lg">
                {results.length === 0 ? (
                  <p className="px-4 py-2.5 text-sm text-ink-soft">Nadie con “{query}” en la cartera.</p>
                ) : (
                  results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full px-4 py-2.5 text-left text-sm hover:bg-paper-2"
                      onClick={() => {
                        setQ("");
                        navigate(`/clientes/${c.id}`);
                      }}
                    >
                      {fullName(c)}
                      <span className="ml-2 text-ink-soft">
                        {c.dni}
                        {state.policies.find((p) => p.clientId === c.id && p.plate)
                          ? ` · ${state.policies.find((p) => p.clientId === c.id && p.plate)?.plate}`
                          : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative hidden text-ink-soft md:block">
            <button
              type="button"
              className="rounded-md p-1 hover:bg-paper-2"
              onClick={() => setBellOpen((v) => !v)}
              aria-label="Alertas urgentes"
            >
              <Bell size={18} />
              {alerts > 0 && (
                <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-sm bg-gold px-1 text-center text-[10px] font-semibold text-paper">
                  {alerts}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-md border border-line bg-white shadow-lg">
                <p className="border-b border-line px-4 py-2 text-xs font-medium uppercase tracking-wide text-gold">
                  Urgente ahora
                </p>
                {urgent.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-soft">Sin alertas urgentes.</p>
                ) : (
                  urgent.slice(0, 6).map((a) => (
                    <Link
                      key={a.id}
                      to={a.to}
                      className="block border-b border-line/60 px-4 py-2.5 text-sm hover:bg-paper-2"
                      onClick={() => setBellOpen(false)}
                    >
                      <p className="font-medium">{a.title}</p>
                      <p className="truncate text-xs text-ink-soft">{a.detail}</p>
                    </Link>
                  ))
                )}
                <Link
                  to="/"
                  className="block px-4 py-2 text-center text-xs text-gold hover:bg-paper-2"
                  onClick={() => setBellOpen(false)}
                >
                  Ver todo en Hoy →
                </Link>
              </div>
            )}
          </div>
        </header>

        {isAdmin ? (
          <div className="border-b border-gold/40 bg-forest-deep px-4 py-2 text-center text-sm text-paper md:px-8">
            Vista productor (admin).{" "}
            <Link to="/admin" className="font-medium text-gold underline">
              Ir a consola ops →
            </Link>
          </div>
        ) : null}
        {entitlement?.renewalRequired &&
        entitlementStatus === "active" &&
        entitlement.graceLabel ? (
          <div className="border-b border-danger/40 bg-red-50 px-4 py-2 text-center text-sm text-danger md:px-8">
            Cancelaste la suscripción. Quedan <strong>{entitlement.graceLabel}</strong> de acceso ya
            pago.
            <Link to="/activar" className="ml-2 font-medium underline">
              Ver planes
            </Link>
          </div>
        ) : entitlement?.needsCardForMonthly && entitlementStatus === "active" ? (
          <div className="border-b border-gold/40 bg-gold/10 px-4 py-2 text-center text-sm text-forest md:px-8">
            Mes pago. Si no ves cobro automático el mes que viene, cargá una tarjeta crédito/débito
            en{" "}
            <Link to="/ajustes" className="font-medium underline">
              Membresía
            </Link>
            .
          </div>
        ) : null}
        {state.producer.plan === "demo" ? (
          <div className="border-b border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm text-forest md:px-8">
            Estás en <strong>demo</strong>. Activá Plan Estudio para usar cartera real, importar CSV y producir por WhatsApp.
            <Link to="/activar" className="ml-2 underline">
              Activar Plan Estudio
            </Link>
          </div>
        ) : state.producer.plan === "estudio" && subStatus !== "ok" ? (
          <div
            className={`border-b px-4 py-2 text-center text-sm md:px-8 ${
              subStatus === "expired" || subStatus === "pending_payment"
                ? "border-danger/30 bg-red-50 text-danger"
                : "border-gold/30 bg-gold/10 text-forest"
            }`}
          >
            {subStatus === "expired" || subStatus === "pending_payment" ? (
              <>Activá Estudio: Self USD 49/mes o Setup USD 149 (1er mes).</>
            ) : (
              <>Activá Estudio. {trialLeft} día{trialLeft === 1 ? "" : "s"} de trial restantes</>
            )}
            <Link to="/activar" className="ml-2 underline">
              Ver planes
            </Link>
          </div>
        ) : state.producer.subscription?.setupMeetPending ? (
          <div className="border-b border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm text-forest md:px-8">
            Setup completo activo.{" "}
            <Link to="/activar" className="underline">
              Coordiná el meet por WhatsApp
            </Link>
          </div>
        ) : null}
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-6">
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-paper/95 md:hidden">
          {[
            links.find((l) => l.to === "/")!,
            links.find((l) => l.to === "/clientes")!,
            links.find((l) => l.to === "/whatsapp")!,
            links.find((l) => l.to === "/cobranzas")!,
          ].map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2 text-[10px] ${
                  isActive ? "text-gold" : "text-ink-soft"
                }`
              }
            >
              <l.icon size={18} />
              {l.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] ${
              moreOpen ? "text-gold" : "text-ink-soft"
            }`}
          >
            <Menu size={18} />
            Más
          </button>
        </nav>
        {moreOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-ink/40"
              aria-label="Cerrar menú"
              onClick={() => setMoreOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-line bg-paper p-4 pb-8">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-serif text-xl">Más módulos</p>
                <button type="button" onClick={() => setMoreOpen(false)} aria-label="Cerrar">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {navMore.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === "/"}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md border px-3 py-3 text-sm ${
                        isActive ? "border-gold bg-gold/5 text-gold" : "border-line"
                      }`
                    }
                  >
                    <l.icon size={16} />
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
