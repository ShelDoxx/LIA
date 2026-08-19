import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { differenceInYears, parseISO } from "date-fns";
import { useLia } from "@/context/LiaContext";
import { Badge, Button, Card, inputClass } from "@/components/ui";
import { generateDunningMessage, generatePaymentReminderMessage, generateRenewalMessage, generateRetentionMessage, generateStuckClaimMessage } from "@/data/ramos";
import type { RenewalBucket } from "@/data/ramos";
import { POLICY_LABEL } from "@/lib/types";
import { daysUntil, fmtDateTime, fullName } from "@/lib/format";
import { PHOTO_SLOTS, slotLabel } from "@/lib/waPack";
import type { ChatMessage } from "@/lib/types";

function previewInbox(m?: ChatMessage): string {
  if (!m) return "Sin mensajes";
  if (m.kind === "image") return "📷 Foto";
  if (m.kind === "file" || m.kind === "expediente") return "📄 Archivo";
  const t = m.text.replace(/\s+/g, " ").trim();
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

const templates = [
  {
    name: "r90",
    title: "Renovación · 90 días",
    body: "[Nombre], en 90 días vence tu [Ramo]. ¿Revisamos coberturas antes de que la compañía arme la renovación?",
  },
  {
    name: "r30",
    title: "Renovación · 30 días",
    body: "[Nombre], tu [Ramo] vence el [Fecha]. Si renovamos ahora mantenemos condiciones. ¿Seguimos?",
  },
  {
    name: "aviso_cuota",
    title: "Cuota · 3 días",
    body: "Hola [Nombre], el [Fecha] vence la cuota de tu [Ramo]. Cupón: [Link]",
  },
  {
    name: "mora",
    title: "Mora · reclamo amistoso",
    body: generateDunningMessage("[Nombre]", new Date().toISOString()).replace(
      /\d{1,2} de \w+ \d{4}/,
      "[Fecha]",
    ),
  },
  {
    name: "docs_vida",
    title: "Pedido de docs · vida / SMG",
    body: "[Nombre], para cargar tu vida en la compañía necesito: DNI frente, DNI dorso, tarjeta frente y dorso (o CBU). Mandamelos por acá, aunque sean fotos. Yo armo el PDF.",
  },
  {
    name: "cumple",
    title: "Cumpleaños / referido",
    body: "[Nombre], feliz cumpleaños. Si alguien de la familia necesita cobertura, decile que te escriba.",
  },
  {
    name: "retencion_vida",
    title: "Retención · aniversario de póliza",
    body: generateRetentionMessage("[Nombre]", 1).replace(" 1 años", " [Años] años"),
  },
];

export function WhatsApp() {
  const { state, injectLiaMessage, sendBotReply, receiveClientPhotos, markRead, updateBot, toggleBotPause, isProcessingMedia } =
    useLia();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetClient = params.get("cliente") ?? "";
  const retentionYearsParam = params.get("retencion");
  const moraPolicyId = params.get("mora");
  const stuckClaimId = params.get("siniestro");
  const renewalPolicyId = params.get("renovacion");
  const renewalBucketParam = params.get("bucket") as RenewalBucket | null;
  const avisoPolicyId = params.get("aviso");
  const moraSent = useRef<string | null>(null);
  const stuckSent = useRef<string | null>(null);
  const renewalSent = useRef<string | null>(null);
  const avisoSent = useRef<string | null>(null);
  const [active, setActive] = useState(
    () =>
      state.conversations.find((c) => c.clientId === presetClient)?.id ?? state.conversations[0]?.id,
  );
  const [draft, setDraft] = useState("");
  const [sim, setSim] = useState("Te mando las fotos del DNI");
  const bottomRef = useRef<HTMLDivElement>(null);
  const conv = state.conversations.find((c) => c.id === active);
  const client = conv ? state.clients.find((x) => x.id === conv.clientId) : undefined;
  const pending = conv?.pendingPhotos ?? [];
  const live = state.bot.connected;

  useEffect(() => {
    if (!presetClient) return;
    const id = state.conversations.find((c) => c.clientId === presetClient)?.id;
    if (id) setActive(id);
    // Solo cuando cambia el query: si no, markRead te devolvería al hilo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetClient]);

  // Scroll al último mensaje cuando cambia el hilo activo o llegan mensajes nuevos.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active, conv?.messages.length]);

  useEffect(() => {
    if (!moraPolicyId || !presetClient) return;
    const policy =
      state.policies.find((p) => p.id === moraPolicyId) ??
      state.policies.find((p) => p.clientId === presetClient && daysUntil(p.nextDueDate) < 0);
    const who = state.clients.find((c) => c.id === presetClient);
    if (!policy || !who) return;
    const text = generateDunningMessage(who.firstName, policy.nextDueDate);
    const key = `${presetClient}-${policy.id}`;
    if (moraSent.current === key) return;
    moraSent.current = key;
    void injectLiaMessage(presetClient, text).then((id) => {
      if (id) setActive(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moraPolicyId, presetClient]);

  useEffect(() => {
    if (!stuckClaimId || !presetClient) return;
    const who = state.clients.find((c) => c.id === presetClient);
    const claim = state.claims.find((s) => s.id === stuckClaimId && s.clientId === presetClient);
    if (!who || !claim) return;
    const text = generateStuckClaimMessage(who.firstName);
    const key = `${presetClient}-${claim.id}`;
    if (stuckSent.current === key) return;
    stuckSent.current = key;
    void injectLiaMessage(presetClient, text).then((id) => {
      if (id) setActive(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stuckClaimId, presetClient]);

  useEffect(() => {
    if (!renewalPolicyId || !presetClient || !renewalBucketParam) return;
    const who = state.clients.find((c) => c.id === presetClient);
    const policy = state.policies.find((p) => p.id === renewalPolicyId && p.clientId === presetClient);
    if (!who || !policy) return;
    const text = generateRenewalMessage(
      who.firstName,
      POLICY_LABEL[policy.type],
      policy.endDate,
      renewalBucketParam,
    );
    const key = `${presetClient}-${policy.id}-${renewalBucketParam}`;
    if (renewalSent.current === key) return;
    renewalSent.current = key;
    void injectLiaMessage(presetClient, text).then((id) => {
      if (id) setActive(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renewalPolicyId, renewalBucketParam, presetClient]);

  useEffect(() => {
    if (!avisoPolicyId || !presetClient) return;
    const who = state.clients.find((c) => c.id === presetClient);
    const policy = state.policies.find((p) => p.id === avisoPolicyId && p.clientId === presetClient);
    if (!who || !policy) return;
    const text = generatePaymentReminderMessage(who.firstName, POLICY_LABEL[policy.type], policy.nextDueDate);
    const key = `${presetClient}-${policy.id}-aviso`;
    if (avisoSent.current === key) return;
    avisoSent.current = key;
    void injectLiaMessage(presetClient, text).then((id) => {
      if (id) setActive(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avisoPolicyId, presetClient]);

  function yearsForRetention() {
    const fromQuery = Number(retentionYearsParam);
    if (Number.isFinite(fromQuery) && fromQuery >= 1) return fromQuery;
    const vida = state.policies.find(
      (p) => p.clientId === client?.id && p.type === "vida" && p.status !== "cancelada",
    );
    return vida?.startDate ? Math.max(1, differenceInYears(new Date(), parseISO(vida.startDate))) : 1;
  }

  async function sendRetentionAsLia() {
    if (!client) return;
    const text = generateRetentionMessage(client.firstName, yearsForRetention());
    const id = await injectLiaMessage(client.id, text);
    if (id) setActive(id);
  }

  function openExpediente(m: ChatMessage) {
    const doc = m.docId ? state.documents.find((d) => d.id === m.docId) : undefined;
    if (doc?.archived) {
      if (client) navigate(`/clientes/${client.id}`);
      return;
    }
    const url = doc?.dataUrl || m.imageDataUrl;
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = doc?.name ?? "expediente.pdf";
      a.target = "_blank";
      a.rel = "noreferrer";
      a.click();
      return;
    }
    if (m.kind === "expediente") {
      if (client) navigate(`/expediente?cliente=${client.id}`);
      return;
    }
    if (client) navigate(`/clientes/${client.id}`);
  }

  async function onPhotos(list: FileList | null) {
    if (!conv || !list?.length || isProcessingMedia) return;
    await receiveClientPhotos(conv.id, [...list]);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_1fr_320px]">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="font-medium">Bandeja de Lía</p>
            <Badge tone={live ? "forest" : "gold"}>{live ? "WhatsApp live" : "Simulador"}</Badge>
          </div>
          <p className="text-xs text-ink-soft">
            {live ? "Mensajes reales de Meta · se sincronizan solos" : "Probá flujos sin celular"}
          </p>
        </div>
        {state.conversations.map((c) => {
          const who = state.clients.find((x) => x.id === c.clientId);
          const last = c.messages.at(-1);
          return (
            <button
              key={c.id}
              onClick={() => {
                setActive(c.id);
                markRead(c.id);
              }}
              className={`flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left ${
                active === c.id ? "bg-paper-2" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{who ? fullName(who) : c.phone}</p>
                <p className="line-clamp-2 text-sm leading-snug text-ink-soft">{previewInbox(last)}</p>
              </div>
              {c.botPaused ? (
                <Badge tone="warn">Pausa</Badge>
              ) : c.unread > 0 ? (
                <span className="h-2 w-2 rounded-full bg-wa" />
              ) : null}
            </button>
          );
        })}
      </Card>

      <Card className="flex min-h-[480px] flex-col p-0">
        {conv ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <div>
                <p className="font-medium">{client ? fullName(client) : conv.phone}</p>
                <p className="text-xs text-ink-soft">
                  {conv.phone} · {conv.botPaused ? "Lía en pausa · contestás vos" : "el PDF queda en esta ficha"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={conv.botPaused ? "gold" : "ghost"}
                  className="h-8 px-3 text-xs"
                  onClick={() => void toggleBotPause(conv.id)}
                >
                  {conv.botPaused ? "Reanudar Bot" : "Pausar Bot"}
                </Button>
                {client && (
                  <Link to={`/clientes/${client.id}`} className="text-xs text-gold">
                    Ver ficha 360°
                  </Link>
                )}
              </div>
            </div>
            {conv.botPaused && (
              <div className="border-b border-gold/30 bg-gold/5 px-5 py-2 text-xs">
                Botón de pánico: Lía no responde en este hilo. El cliente escribe y queda para vos.
              </div>
            )}
            {moraPolicyId && client && (
              <div className="border-b border-gold/30 bg-gold/5 px-5 py-2 text-xs">
                Reclamo de mora enviado a {fullName(client)}
              </div>
            )}
            {stuckClaimId && client && (
              <div className="border-b border-gold/30 bg-gold/5 px-5 py-2 text-xs">
                Seguimiento de siniestro enviado a {fullName(client)}
              </div>
            )}
            {renewalPolicyId && client && (
              <div className="border-b border-gold/30 bg-gold/5 px-5 py-2 text-xs">
                Mensaje de renovación enviado a {fullName(client)}
              </div>
            )}
            {avisoPolicyId && client && (
              <div className="border-b border-gold/30 bg-gold/5 px-5 py-2 text-xs">
                Aviso de cuota enviado a {fullName(client)}
              </div>
            )}
            {retentionYearsParam && client && (
              <div className="flex items-center justify-between gap-3 border-b border-gold/30 bg-gold/5 px-5 py-2 text-xs">
                <span>Cumpleaños de Póliza: Enviar mensaje de retención a {fullName(client)}</span>
                <Button
                  type="button"
                  variant="gold"
                  className="h-7 px-3 text-xs"
                  onClick={() => void sendRetentionAsLia()}
                >
                  Enviar ahora
                </Button>
              </div>
            )}
            {isProcessingMedia && (
              <div className="flex items-center gap-2 border-b border-gold/30 bg-gold/5 px-5 py-2 text-xs">
                <LoaderCircle size={14} className="animate-spin text-gold" />
                Procesando imágenes y armando PDF...
              </div>
            )}
            {pending.length > 0 && (
              <div className="border-b border-gold/30 bg-gold/5 px-5 py-2 text-xs">
                {pending.length} foto{pending.length === 1 ? "" : "s"} de {client ? client.firstName : "este cliente"}
                {pending.length < 4
                  ? ` · falta ${slotLabel(pending.length)}`
                  : " · armando PDF"}
                . Escribí LISTO si ya están.
              </div>
            )}
            <div className="flex-1 space-y-3 overflow-y-auto bg-[#efeae2] p-5" style={{ scrollbarWidth: "thin" }}>
              {conv.messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === "client" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      m.from === "client" ? "bg-white" : m.from === "lia" ? "bg-[#d9fdd3]" : "bg-gold/20"
                    }`}
                  >
                    {m.kind === "image" && m.imageDataUrl ? (
                      <img src={m.imageDataUrl} alt={m.text} className="mb-1 max-h-48 rounded-md" />
                    ) : null}
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.kind === "expediente" || m.kind === "file" || m.docId ? (
                      <button
                        type="button"
                        className="mt-2 rounded-md bg-forest px-3 py-1.5 text-xs font-medium text-paper"
                        onClick={() => openExpediente(m)}
                      >
                        {(() => {
                          const doc = m.docId ? state.documents.find((d) => d.id === m.docId) : undefined;
                          if (doc?.archived) return "Archivado (Solo Metadata)";
                          return m.kind === "file" ? "Abrir PDF" : "Abrir Expediente";
                        })()}
                      </button>
                    ) : null}
                    <p className="mt-1 text-[10px] text-ink-soft">{fmtDateTime(m.at)}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form
              className="flex gap-2 border-t border-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                sendBotReply(conv.id, draft.trim());
                setDraft("");
              }}
            >
              <label
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-white text-ink-soft ${
                  isProcessingMedia ? "pointer-events-none opacity-50" : "cursor-pointer hover:text-gold"
                }`}
              >
                <ImagePlus size={18} />
                <input
                  type="file"
                  accept="image/*,image/heic,image/heif,.heic,.heif,application/pdf"
                  multiple
                  disabled={isProcessingMedia}
                  className="hidden"
                  onChange={(e) => {
                    void onPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <input
                className={inputClass}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  isProcessingMedia
                    ? "Procesando imágenes y armando PDF..."
                    : live
                      ? "Simular respuesta del cliente (opcional)…"
                      : "Simular mensaje del cliente… o LISTO"
                }
                disabled={isProcessingMedia}
              />
              <Button type="submit" disabled={isProcessingMedia}>
                Enviar
              </Button>
            </form>
          </>
        ) : state.conversations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-serif text-xl">Todavía no hay conversaciones</p>
            <p className="mt-2 text-sm text-ink-soft">
              Importá cartera o esperá que un cliente escriba por WhatsApp. También podés simular desde
              el panel de la derecha.
            </p>
          </div>
        ) : (
          <p className="p-6 text-sm text-ink-soft">Elegí un hilo</p>
        )}
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">Fotos → PDF → ficha</p>
            <Badge tone="gold">Automático</Badge>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            El cliente manda DNI y tarjeta al chat de Lía. Con 4 fotos (o LISTO) se arma el PDF y
            queda en la bóveda de <strong>ese</strong> cliente, no en un archivo suelto.
          </p>
          <p className="mt-2 text-xs text-ink-soft">Orden: {PHOTO_SLOTS.join(" → ")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">Meta Cloud API</p>
            <Badge tone={state.bot.connected ? "forest" : "danger"}>
              {state.bot.connected ? "Bot en línea" : "Bot apagado"}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {live
              ? "Los chats reales llegan de Meta. El simulador de abajo es opcional para probar sin celular."
              : "Con el bot activo, el simulador usa el mismo NLU que Meta. Sin bot, responde el motor web."}
          </p>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="font-medium">Plantillas que venden</p>
          {templates.map((t) => (
            <div key={t.name} className="rounded-md bg-paper-2 p-3">
              <p className="text-xs uppercase tracking-wide text-gold">{t.title}</p>
              <p className="mt-1 text-sm">{t.body}</p>
            </div>
          ))}
        </Card>

        <Card className="space-y-3 p-4">
          <p className="font-medium">Automatizaciones</p>
          <label className="flex items-center justify-between text-sm">
            Aviso {state.bot.paymentReminderDays} días antes
            <input
              type="checkbox"
              checked
              readOnly
              title="Configurable en Marca → Meta Cloud API"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            Cumpleaños
            <input
              type="checkbox"
              checked={state.bot.birthdayGreetings}
              onChange={(e) => updateBot({ birthdayGreetings: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            Autogestión del cliente
            <input
              type="checkbox"
              checked={state.bot.selfService}
              onChange={(e) => updateBot({ selfService: e.target.checked })}
            />
          </label>
        </Card>

        {!live && (
        <Card className="p-4">
          <p className="mb-2 font-medium">Probar como el cliente</p>
          <select className={inputClass} value={sim} onChange={(e) => setSim(e.target.value)}>
            <option>Te mando las fotos del DNI</option>
            <option>LISTO</option>
            <option>Descargar mi póliza</option>
            <option>Necesito mi póliza</option>
            <option>Frente de póliza</option>
            <option>Teléfono de grúa</option>
            <option>Choqué</option>
            <option>Se me inundó el departamento</option>
            <option>Beneficiarios de la póliza de vida</option>
            <option>Accidente en el trabajo ART</option>
            <option>Asistencia al viajero</option>
            <option>Cupón de pago</option>
            <option>Aniversario de póliza</option>
            <option>Humano</option>
          </select>
          <Button
            className="mt-3 w-full"
            variant="gold"
            disabled={isProcessingMedia}
            onClick={() => conv && sendBotReply(conv.id, sim)}
          >
            Mandar texto
          </Button>
          <label
            className={`mt-2 flex w-full items-center justify-center rounded-md border border-line py-2 text-sm ${
              isProcessingMedia ? "pointer-events-none opacity-50" : "cursor-pointer"
            }`}
          >
            {isProcessingMedia ? "Procesando imágenes y armando PDF..." : "Mandar fotos como el cliente"}
            <input
              type="file"
              accept="image/*,image/heic,image/heif,.heic,.heif,application/pdf"
              multiple
              disabled={isProcessingMedia}
              className="hidden"
              onChange={(e) => {
                void onPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </Card>
        )}
      </div>
    </div>
  );
}
