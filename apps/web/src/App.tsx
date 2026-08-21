import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useLia } from "./context/LiaContext";
import { Layout } from "./components/Layout";
import { AdminLayout } from "./components/AdminLayout";
import { Login } from "./pages/Login";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";

const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Clients = lazy(() => import("./pages/Clients").then((m) => ({ default: m.Clients })));
const ClientProfile = lazy(() => import("./pages/ClientProfile").then((m) => ({ default: m.ClientProfile })));
const Policies = lazy(() => import("./pages/Policies").then((m) => ({ default: m.Policies })));
const Renewals = lazy(() => import("./pages/Renewals").then((m) => ({ default: m.Renewals })));
const Commissions = lazy(() => import("./pages/Commissions").then((m) => ({ default: m.Commissions })));
const WhatsApp = lazy(() => import("./pages/WhatsApp").then((m) => ({ default: m.WhatsApp })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const RadarPage = lazy(() => import("./pages/Radar").then((m) => ({ default: m.RadarPage })));
const Emergencias = lazy(() => import("./pages/Emergencias").then((m) => ({ default: m.Emergencias })));
const Quotes = lazy(() => import("./pages/Quotes").then((m) => ({ default: m.Quotes })));
const Cobranzas = lazy(() => import("./pages/Cobranzas").then((m) => ({ default: m.Cobranzas })));
const PdfPack = lazy(() => import("./pages/PdfPack").then((m) => ({ default: m.PdfPack })));
const Siniestros = lazy(() => import("./pages/Siniestros").then((m) => ({ default: m.Siniestros })));
const PublicDoc = lazy(() => import("./pages/PublicDoc").then((m) => ({ default: m.PublicDoc })));
const Activar = lazy(() => import("./pages/Activar").then((m) => ({ default: m.Activar })));
const Subscription = lazy(() =>
  import("./pages/Subscription").then((m) => ({ default: m.Subscription })),
);
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));

function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <p className="font-serif text-xl text-ink-soft">Cargando…</p>
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  const { signedIn } = useLia();
  if (!signedIn) return <Navigate to="/entrar" replace />;
  return children;
}

/** Estudio sin entitlement activo solo /activar. Demo libre. Admin libre salvo membresía vencida. */
function PaidGuard({ children }: { children: React.ReactNode }) {
  const { state, entitlementStatus, isAdmin } = useLia();
  const location = useLocation();
  const path = location.pathname;
  if (state?.producer.plan === "demo") return children;
  // Admin puede usar ops (/admin fuera de este guard). En escritorio, vencido = bloqueo igual.
  if (isAdmin && entitlementStatus !== "expired") return children;
  if (entitlementStatus === "active" || entitlementStatus === "trial") return children;
  if (path === "/activar" || path.startsWith("/activar")) return children;
  return <Navigate to="/activar" replace />;
}

function AdminHome() {
  return <Admin mode="home" />;
}

function AdminUsers() {
  return <Admin mode="users" />;
}

export default function App() {
  const { signedIn, isAdmin } = useLia();
  return (
    <Routes>
      <Route
        path="/entrar"
        element={signedIn ? <Navigate to={isAdmin ? "/admin" : "/"} replace /> : <Login />}
      />
      <Route path="/c/:policyId/:kind" element={<Lazy><PublicDoc /></Lazy>} />

      <Route
        path="/admin"
        element={
          <Guard>
            <AdminLayout />
          </Guard>
        }
      >
        <Route index element={<Lazy><AdminHome /></Lazy>} />
        <Route path="usuarios" element={<Lazy><AdminUsers /></Lazy>} />
      </Route>

      <Route
        path="/"
        element={
          <Guard>
            <PaidGuard>
              <Layout />
            </PaidGuard>
          </Guard>
        }
      >
        <Route
          index
          element={
            isAdmin ? <Navigate to="/admin" replace /> : <Lazy><Dashboard /></Lazy>
          }
        />
        <Route path="escritorio" element={<Lazy><Dashboard /></Lazy>} />
        <Route path="clientes" element={<Lazy><Clients /></Lazy>} />
        <Route path="clientes/:id" element={<Lazy><ClientProfile /></Lazy>} />
        <Route path="polizas" element={<Lazy><Policies /></Lazy>} />
        <Route path="vencimientos" element={<Lazy><Renewals /></Lazy>} />
        <Route path="comisiones" element={<Lazy><Commissions /></Lazy>} />
        <Route path="whatsapp" element={<Lazy><WhatsApp /></Lazy>} />
        <Route path="radar" element={<Lazy><RadarPage /></Lazy>} />
        <Route path="cotizar" element={<Lazy><Quotes /></Lazy>} />
        <Route path="siniestros" element={<Lazy><Siniestros /></Lazy>} />
        <Route path="cobranzas" element={<Lazy><Cobranzas /></Lazy>} />
        <Route path="emergencias" element={<Lazy><Emergencias /></Lazy>} />
        <Route path="ajustes" element={<Lazy><Settings /></Lazy>} />
        <Route path="suscripcion" element={<Lazy><Subscription /></Lazy>} />
        <Route path="activar" element={<Lazy><Activar /></Lazy>} />
        <Route path="expediente" element={<Lazy><PdfPack /></Lazy>} />
      </Route>
      <Route
        path="*"
        element={<Navigate to={signedIn ? (isAdmin ? "/admin" : "/") : "/entrar"} replace />}
      />
    </Routes>
  );
}
