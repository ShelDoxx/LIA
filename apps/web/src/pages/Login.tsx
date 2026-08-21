import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, Camera, FileStack, HandCoins, HeartPulse, ShieldCheck, Clock3 } from "lucide-react";
import { useLia } from "@/context/LiaContext";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { LiaMark } from "@/components/LiaMark";
import { RoiCalculator } from "@/components/RoiCalculator";

const SALES_WA =
  "https://wa.me/5492346501704?text=" +
  encodeURIComponent("Hola, vi Lía. Quiero probarla en mi estudio.");

const STEPS = [
  {
    n: "01",
    title: "Abrís Hoy",
    body: "Mora, renovación a 30 días, siniestro trabado. Sabés a quién escribir antes del café.",
  },
  {
    n: "02",
    title: "El cliente manda fotos",
    body: "DNI y tarjeta por WhatsApp. Lía arma un PDF en la ficha — el que el portal de la compañía sí toma.",
  },
  {
    n: "03",
    title: "Cobrás",
    body: "Reclamo de mora, aviso de cuota, marcar pagado. Vos producís. El celular deja de ser la oficina.",
  },
] as const;

const PAIN = [
  {
    k: "La renovación",
    t: "Se cae en silencio",
    d: "Nadie avisó a los 90 días. El colega de la otra compañía sí.",
  },
  {
    k: "El cupón",
    t: "Te lo piden a las 23 hs",
    d: "Está en un chat, en Descargas, o en el portal que no abre el celular.",
  },
  {
    k: "El alta",
    t: "Son 4 fotos y media hora",
    d: "SMG LIFE pide frente y dorso. Vos recortás, unís, subís. Cada vez.",
  },
] as const;

const FAQ = [
  {
    q: "¿Reemplaza a WhatsApp Business?",
    a: "No. El cliente sigue en WhatsApp. Lía es el escritorio: Hoy, ficha, PDF y cobranzas. El chat sale con la marca de tu estudio.",
  },
  {
    q: "¿Mis datos quedan en la nube?",
    a: "Por defecto viven en este dispositivo (este celular o PC). Podés descargar un respaldo JSON desde Ajustes.",
  },
  {
    q: "¿Sirve sin el número del estudio conectado?",
    a: "Sí. La demo corre mora, renovaciones y el alta en 10 segundos acá. El WhatsApp real se engancha después.",
  },
  {
    q: "¿Cotiza primas sola?",
    a: "No. No reemplaza el portal de la compañía. Ordena la producción: ANF, propuesta, exámenes y el pedido de docs.",
  },
  {
    q: "¿Y si en 14 días no veo nada?",
    a: "Si Hoy no te muestra una mora o una renovación que se te escapaba, no pagás el mes.",
  },
] as const;

export function Login() {
  const { signIn, requestEmailOtp, verifyEmailOtp } = useLia();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState<"demo" | "estudio">("estudio");

  function enterDemo() {
    void signIn("Productor demo", "demo@lia.app", "demo");
  }

  async function sendCode() {
    setErr("");
    if (!email.includes("@")) {
      setErr("Ingresá un email válido");
      return;
    }
    setBusy(true);
    const r = await requestEmailOtp(email, name || undefined);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || "No se pudo enviar el código");
      return;
    }
    setOtpSent(true);
    setDevCode(r.devCode);
  }

  async function confirmCode() {
    setErr("");
    if (!code.trim()) {
      setErr("Ingresá el código de 6 dígitos");
      return;
    }
    setBusy(true);
    const r = await verifyEmailOtp(email, code.trim(), name || undefined);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || "Código inválido");
      return;
    }
    navigate(r.isAdmin ? "/admin" : "/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-paper text-forest">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/95">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3 md:px-8">
          <LiaMark className="text-2xl text-forest" />
          <p className="hidden text-xs text-ink-soft sm:block">Para el PAS que vive del celular</p>
          <div className="ml-auto flex items-center gap-2">
            <a href={SALES_WA} className="hidden text-sm text-forest underline-offset-4 hover:underline sm:inline">
              WhatsApp
            </a>
            <a href="#entrar" className="rounded-md border border-line px-3 py-2 text-sm text-forest hover:bg-paper-2">
              Entrar
            </a>
            <Button variant="gold" className="hidden sm:inline-flex" onClick={enterDemo}>
              Ver si me sirve · 60 s
            </Button>
          </div>
        </div>
      </header>

      <section className="lia-grain relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-gold">
              Argentina · productores de seguros
            </p>
            <h1 className="mt-4 font-serif text-[2.2rem] leading-[1.1] text-forest md:text-5xl lg:text-[3.4rem]">
              A las 11 te piden el cupón. A la mañana se te cayó una renovación.
            </h1>
            <p className="mt-5 max-w-xl text-base text-ink-soft md:text-lg">
              Lía atiende el WhatsApp, arma el PDF y te dice quién no pagó. Vos cotizás y cerrás.
              El Excel y el chat personal dejan de ser la oficina.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="gold" className="px-5 py-3" onClick={enterDemo}>
                Ver si me sirve · 60 segundos
              </Button>
              <a
                href="#plata"
                className="text-sm text-forest underline-offset-4 hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("plata")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                ¿Cuánto me está costando no tenerla?
              </a>
            </div>
            <p className="mt-4 max-w-md text-sm text-ink-soft">
              Entrá a la demo, mandá 4 fotos como el cliente, mirá el PDF en la ficha. Si no duele
              como tu día a día, no es para vos.
            </p>
          </div>
          <WaPhone />
        </div>
      </section>

      <section className="border-t border-line bg-forest-deep text-paper">
        <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Lo que duele</p>
          <h2 className="mt-2 font-serif text-3xl md:text-4xl">No es falta de cartera. Es falta de orden.</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {PAIN.map((p) => (
              <div key={p.k}>
                <p className="text-xs uppercase tracking-wide text-gold">{p.k}</p>
                <h3 className="mt-2 font-serif text-2xl">{p.t}</h3>
                <p className="mt-2 text-sm text-paper/70">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Cómo funciona</p>
          <h2 className="mt-2 font-serif text-3xl text-forest md:text-4xl">Tres gestos. El resto es ruido.</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="border-t border-gold/40 pt-5">
                <div className="flex items-start gap-4">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-line/80 bg-paper-2/50 text-gold">
                    {s.n === "01" ? (
                      <Clock3 size={18} />
                    ) : s.n === "02" ? (
                      <Camera size={18} />
                    ) : (
                      <HandCoins size={18} />
                    )}
                  </div>
                  <div>
                    <p className="font-serif text-sm text-gold">{s.n}</p>
                    <h3 className="mt-2 font-serif text-2xl">{s.title}</h3>
                    <p className="mt-3 text-sm text-ink-soft">{s.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-paper-2/50">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Por qué un colega paga</p>
          <h2 className="mt-2 font-serif text-3xl text-forest md:text-4xl">La plata se pierde en el celular</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Card className="p-6">
              <Banknote className="text-gold" size={28} />
              <h3 className="mt-4 font-serif text-2xl">Mora que se cobra</h3>
              <p className="mt-3 text-sm text-ink-soft">
                Al abrir, Lía arma el reclamo. Vos marcás pagado. El cliente deja de caerse sin que
                te enteres a fin de mes.
              </p>
            </Card>
            <Card className="p-6">
              <FileStack className="text-gold" size={28} />
              <h3 className="mt-4 font-serif text-2xl">El PDF que odian armar</h3>
              <p className="mt-3 text-sm text-ink-soft">
                SMG LIFE y Sancor piden DNI y tarjeta frente y dorso. El cliente las manda: un solo
                archivo queda en esa ficha.
              </p>
            </Card>
            <Card className="p-6">
              <HeartPulse className="text-gold" size={28} />
              <h3 className="mt-4 font-serif text-2xl">Vida que no se enfría</h3>
              <p className="mt-3 text-sm text-ink-soft">
                Kanban ANF → propuesta → exámenes. Radar de cónyuge sin vida. El aniversario de
                póliza no pasa de largo.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Lunes 9:14</p>
            <h2 className="mt-2 font-serif text-3xl text-forest">Excel + tu celular vs Lía</h2>
          </div>
          <div className="space-y-4 text-sm">
            <p className="border-b border-line pb-4">
              <span className="font-medium text-ink-soft">Sin Lía. </span>
              Mora en un Excel. Fotos en el chat personal. Renovaciones que se caen porque nadie
              avisó a los 90 días. El cupón te lo piden cuando estás con la familia.
            </p>
            <p>
              <span className="font-medium text-forest">Con Lía. </span>
              Hoy te dice a quién escribir. El PDF va a la ficha, no a Descargas. El 90-60-30 corre
              solo. El WhatsApp del estudio atiende; el tuyo descansa.
            </p>
          </div>
        </div>
      </section>

      <section id="plata" className="border-t border-line bg-paper-2/30">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
          <RoiCalculator />
        </div>
      </section>

      <section id="precios" className="border-t border-line bg-paper">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 py-16 md:grid-cols-[1fr_1.1fr] md:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
              Una renovación de auto paga el año
            </p>
            <h2 className="mt-2 font-serif text-3xl text-forest md:text-4xl">Plan Estudio</h2>
            <p className="mt-3 text-sm text-ink-soft">
              No es un CRM genérico. Es el escritorio de un PAS: mora, 90-60-30, PDF de alta y
              WhatsApp con tu marca. En pesos, al tipo de cambio del mes.
            </p>
            <a href={SALES_WA} className="mt-6 inline-block text-sm text-gold underline-offset-4 hover:underline">
              ¿Dudas? Escribime por WhatsApp →
            </a>
          </div>
          <Card className="border-gold/40 p-8">
            <p className="text-xs uppercase tracking-wide text-gold">Estudio</p>
            <p className="mt-2 font-serif text-5xl text-forest">USD 49</p>
            <p className="text-sm text-ink-soft">por mes · o el equivalente en ARS</p>
            <p className="mt-1 text-xs text-ink-soft/80">
              Equivalente ARS calculado al{" "}
              <span
                className="cursor-help underline decoration-ink-soft/40"
                title="Usamos el tipo de cambio oficial BNA del mes (referencia para el cobro)."
              >
                tipo de cambio oficial BNA
              </span>
              .
            </p>
            <ul className="mt-6 space-y-2 text-sm text-forest">
              <li>Inbox de Lía con el tono y el logo de tu estudio</li>
              <li>PDF único para SMG LIFE, Sancor y el resto</li>
              <li>Mora, renovaciones 90-60-30 y caja de comisiones</li>
              <li>Importación de cartera por CSV del portal</li>
            </ul>
            <p className="mt-6 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
              <ShieldCheck className="mt-0.5" size={16} />
              <span>
                14 días. Si Hoy no te muestra una mora o una renovación que se te escapaba, no pagás el
                mes.
              </span>
            </p>
            <Button variant="gold" className="mt-6 w-full py-3" onClick={enterDemo}>
              Ver si me sirve · 60 segundos
            </Button>
          </Card>
        </div>
      </section>

      <section className="border-t border-line bg-paper-2/40">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Preguntas de un PAS</p>
          <h2 className="mt-2 font-serif text-3xl text-forest">Sin letra chica de SaaS</h2>
          <div className="mt-8 divide-y divide-line">
            {FAQ.map((item) => (
              <div key={item.q} className="grid gap-2 py-5 md:grid-cols-[minmax(0,16rem)_1fr] md:gap-10">
                <p className="font-medium">{item.q}</p>
                <p className="text-sm text-ink-soft">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="entrar" className="border-t border-line bg-forest-deep text-paper">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Escritorio</p>
            <h2 className="mt-2 font-serif text-3xl md:text-4xl">Entrá y mirá tu lunes</h2>
            <p className="mt-3 max-w-md text-sm text-paper/70">
              Demo: mora, renovaciones y cónyuge sin vida — el minuto que se vende. Estudio: cartera
              vacía, importá tu CSV.
            </p>
          </div>
          <form
            className="space-y-4 rounded-2xl bg-paper p-6 text-ink"
            onSubmit={(e) => {
              e.preventDefault();
              if (plan === "demo") {
                enterDemo();
                return;
              }
              if (!otpSent) void sendCode();
              else void confirmCode();
            }}
          >
            {err ? <p className="text-sm text-danger">{err}</p> : null}
            {plan === "estudio" ? (
              <>
                <Field label="Nombre del estudio">
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                    disabled={otpSent}
                  />
                </Field>
                <Field label="Email">
                  <input
                    className={inputClass}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vos@estudio.com"
                    disabled={otpSent}
                    required
                  />
                </Field>
                {otpSent ? (
                  <Field label="Código de 6 dígitos (revisá tu mail)">
                    <input
                      className={inputClass}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </Field>
                ) : null}
                {devCode ? (
                  <p className="text-xs text-ink-soft">
                    Modo prueba: tu código es <strong>{devCode}</strong>
                  </p>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-forest">
                Demo interactiva: entrás sin nombre ni mail y en 60 segundos armamos el PDF en la ficha.
              </div>
            )}
            <Field label="Cómo querés entrar">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded-md border px-3 py-2.5 text-left text-sm transition ${
                    plan === "estudio"
                      ? "border-forest bg-forest/5 text-forest"
                      : "border-line text-ink-soft hover:bg-paper-2"
                  }`}
                  onClick={() => {
                    setPlan("estudio");
                    setOtpSent(false);
                    setCode("");
                    setDevCode(undefined);
                    setErr("");
                  }}
                >
                  <span className="font-medium">Estudio</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">Email + código</span>
                </button>
                <button
                  type="button"
                  className={`rounded-md border px-3 py-2.5 text-left text-sm transition ${
                    plan === "demo"
                      ? "border-gold bg-gold/10 text-forest"
                      : "border-line text-ink-soft hover:bg-paper-2"
                  }`}
                  onClick={() => setPlan("demo")}
                >
                  <span className="font-medium">Demo</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">Sin datos · PDF en ficha</span>
                </button>
              </div>
            </Field>
            {plan === "demo" ? (
              <Button type="submit" variant="gold" className="w-full py-3">
                Abrir la Demo Interactiva · 60s
              </Button>
            ) : otpSent ? (
              <div className="space-y-2">
                <Button type="submit" className="w-full py-3" disabled={busy}>
                  {busy ? "Verificando…" : "Entrar con el código"}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-ink-soft underline"
                  onClick={() => {
                    setOtpSent(false);
                    setCode("");
                    setDevCode(undefined);
                    setErr("");
                  }}
                >
                  Cambiar email
                </button>
              </div>
            ) : (
              <Button type="submit" className="w-full py-3" disabled={busy}>
                {busy ? "Enviando…" : "Enviar código al email"}
              </Button>
            )}
          </form>
        </div>
        <p className="mx-auto max-w-6xl px-5 pb-10 text-xs text-paper/40 md:px-8">
          Hecha en Argentina para PAS. Se vende a colegas porque recupera cartera — no porque
          “digitaliza el estudio”.
        </p>
      </section>
    </div>
  );
}

function WaPhone() {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="rounded-[2.2rem] border border-forest/15 bg-forest-deep p-3 shadow-lg shadow-forest/10">
        <div className="rounded-[1.7rem] bg-[#efeae2] px-3 py-4">
          <p className="mb-3 text-center text-[10px] text-ink-soft">WhatsApp · Lía de tu estudio</p>
          <div className="lia-wa-msg-in lia-wa-msg-1 max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-xs text-ink">
            Te mando las 4 fotos: DNI frente y dorso, tarjeta frente y dorso.
          </div>
          <div className="mt-2 grid max-w-[70%] grid-cols-2 gap-1">
            {["DNI frente", "DNI dorso", "Tarjeta F", "Tarjeta D"].map((label) => (
              <div key={label} className="rounded-md bg-forest/10 px-2 py-3 text-center text-[9px] text-forest">
                {label}
              </div>
            ))}
          </div>
          <div className="lia-wa-msg-in lia-wa-msg-2 mt-2 ml-auto max-w-[92%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-xs text-ink">
            Recibí 4 fotos. Armo el PDF y lo dejo en tu ficha.
          </div>
          <div className="lia-wa-msg-in lia-wa-msg-3 mt-2 ml-auto max-w-[92%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-xs text-ink">
            Listo. Armé el expediente. Tu productor ya lo ve.
          </div>
          <p className="mt-3 text-center text-[10px] font-medium text-gold">
            Alta en 10 segundos · vos no recortás nada
          </p>
        </div>
      </div>
    </div>
  );
}
