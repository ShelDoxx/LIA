import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { LayoutDashboard, LogOut, Shield, Users } from "lucide-react";
import { useLia } from "@/context/LiaContext";
import { LiaMark } from "@/components/LiaMark";
import { Button } from "@/components/ui";

const links = [
  { to: "/admin", label: "Panel", icon: LayoutDashboard, end: true },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users, end: false },
] as const;

export function AdminLayout() {
  const { state, signOut, isAdmin } = useLia();

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <aside className="hidden w-56 shrink-0 border-r border-line bg-forest-deep text-paper md:flex md:flex-col">
        <div className="border-b border-paper/10 px-5 py-5">
          <LiaMark className="text-paper" />
          <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.2em] text-gold">
            Consola ops
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  isActive ? "bg-paper/10 text-gold" : "text-paper/70 hover:bg-paper/5 hover:text-paper"
                }`
              }
            >
              <l.icon size={16} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-paper/10 p-4">
          <p className="truncate text-xs text-paper/50">{state.producer.email}</p>
          <Link to="/" className="block text-xs text-gold underline">
            Abrir escritorio productor
          </Link>
          <button
            type="button"
            className="flex items-center gap-2 text-xs text-paper/60 hover:text-paper"
            onClick={() => void signOut()}
          >
            <LogOut size={14} /> Salir
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-3 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <Shield size={18} className="text-gold" />
            <span className="font-serif text-lg">Admin Lía</span>
          </div>
          <div className="hidden md:block">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Operaciones</p>
            <p className="font-serif text-xl text-forest">Panel de control</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="hidden text-sm text-ink-soft underline sm:inline">
              Productor
            </Link>
            <Button variant="ghost" className="text-xs" onClick={() => void signOut()}>
              Salir
            </Button>
          </div>
        </header>
        <nav className="flex gap-1 border-b border-line px-2 py-2 md:hidden">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex-1 rounded-md px-3 py-2 text-center text-xs ${
                  isActive ? "bg-gold/15 text-forest" : "text-ink-soft"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
