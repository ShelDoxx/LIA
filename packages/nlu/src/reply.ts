import { differenceInYears, parseISO } from "date-fns";
import {
  ALL_RAMOS,
  POLICY_LABEL,
  craneNumber,
  detectRamo,
  lineFor,
  playbook,
  ramoMenu,
  type PolicyType,
} from "./catalog";
import { foldText } from "./fold";
import { generateRetentionMessage } from "./messages";

export type PolicyLite = {
  type: string;
  number: string;
  company: string;
  plate?: string;
  status?: string;
  startDate?: string;
  nextDueDate: string;
  cuponUrl?: string;
  pdfUrl?: string;
};

export type DocLite = {
  id?: string;
  type: string;
  name: string;
};

export type LiaBotReply = {
  text: string;
  docId?: string;
  kind?: "file";
};

export type AssistanceOpts = {
  text: string;
  firstName: string;
  producerName: string;
  greeting: string;
  signOff: string;
  activeRamos: string[];
  policies: PolicyLite[];
  documents?: DocLite[];
  cranePhones?: Record<string, string>;
  selfService?: boolean;
};

function asRamo(value: string): PolicyType | undefined {
  return ALL_RAMOS.includes(value as PolicyType) ? (value as PolicyType) : undefined;
}

function pickPolicy(policies: PolicyLite[], ramo: PolicyType | undefined) {
  if (ramo) return policies.find((p) => p.type === ramo);
  return policies[0];
}

function isRoadsideEmergency(t: string) {
  if (/\bart\b|laboral|trabajo|accidente personal|\bap\b/.test(t)) return false;
  return /grua|auxilio|remolque|choqu|\baccidente\b/.test(t);
}

function isDocSelfService(t: string): "poliza" | "cupon" | null {
  if (/cupon( de pago)?/.test(t)) return "cupon";
  if (
    /necesito mi poliza|frente de poliza|\bcarnet\b|pasame (la |mi )?poliza|mandame (la |mi )?poliza|descargar mi poliza/.test(
      t,
    )
  ) {
    return "poliza";
  }
  if (/poliza/.test(t) && /necesito|pasame|mandame|descargar|frente|pdf|carnet/.test(t)) return "poliza";
  return null;
}

export function assistanceReply(opts: AssistanceOpts): LiaBotReply {
  const t = foldText(opts.text);
  const active = (opts.activeRamos.length ? opts.activeRamos : ALL_RAMOS)
    .map(asRamo)
    .filter((x): x is PolicyType => Boolean(x));
  const enabledPolicies = opts.policies.filter((p) => active.includes(p.type as PolicyType));
  const say = (text: string, extra?: Omit<LiaBotReply, "text">): LiaBotReply => ({ text, ...extra });
  const n = opts.firstName.trim();
  const addr = (rest: string) => (n ? `${n}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));
  const handoff = say(`Ahora mismo le aviso a ${opts.producerName}. Te escribe en breve. ${opts.signOff}`.trim());

  if (/\bhumano\b|\bproductor\b|\basesor\b/.test(t)) return handoff;

  if (/retencion|aniversario|cumpleanos de (la )?poliza|ganarle a la inflacion/.test(t)) {
    const vida = enabledPolicies.find((p) => p.type === "vida") ?? enabledPolicies[0];
    const years = vida?.startDate ? Math.max(1, differenceInYears(new Date(), parseISO(vida.startDate))) : 1;
    return say(generateRetentionMessage(opts.firstName, years));
  }

  if (isRoadsideEmergency(t)) {
    const auto = enabledPolicies.find((p) => p.type === "auto" && p.status !== "cancelada");
    const phone = auto ? craneNumber(auto.company, opts.cranePhones) : undefined;
    if (!auto || !phone) return handoff;
    return say(
      `¡Uy! Espero que estés bien. Veo que tenés el auto asegurado en ${auto.company}. Llamá ya mismo al ${phone} para pedir la grúa. Contame por acá cómo se resuelve.`,
    );
  }

  const docIntent = isDocSelfService(t);
  if (docIntent) {
    if (opts.selfService === false) return handoff;
    const vault = opts.documents ?? [];
    const prefer = docIntent === "cupon" ? "cupon" : "poliza";
    const doc =
      vault.find((d) => d.type === prefer) ?? vault.find((d) => d.type === "poliza" || d.type === "cupon");
    if (!doc) {
      return say(
        "No tengo el documento a mano, ya le dejé el aviso a tu productor para que te lo mande ni bien se conecte.",
      );
    }
    const label = doc.type === "cupon" ? "Cupón de pago" : "Frente de Póliza";
    return say(`¡Acá lo tenés! Llevá siempre este documento a mano. 📄 [PDF Adjunto: ${label}]`, {
      kind: "file",
      docId: doc.id,
    });
  }

  const ramo = detectRamo(t, active);
  const wantsHelp = Boolean(ramo) || /siniestro|accidente|choque|granizo|auxilio|grua|plomer|cerrajer|beneficiar|art\b|viajero/.test(t);

  if (wantsHelp) {
    if (!ramo && enabledPolicies.length > 1) {
      const optsList = [...new Set(enabledPolicies.map((p) => POLICY_LABEL[p.type as PolicyType] ?? p.type))].join(", ");
      return say(addr(`¿es por ${optsList}? Decime el ramo y te paso el 0800 y qué hacer.`));
    }
    const chosen = ramo ?? asRamo(enabledPolicies[0]?.type ?? "");
    if (!chosen) {
      return say(addr("este estudio no tiene ese ramo cargado. Escribí «humano»."));
    }
    const book = playbook(chosen);
    const pol = pickPolicy(enabledPolicies, chosen);
    if (!pol) {
      return say(addr(`no veo una póliza de ${POLICY_LABEL[chosen]} a tu nombre. Escribí «humano».`));
    }
    const line = lineFor(pol.company, chosen);
    return say(
      [
        `${POLICY_LABEL[chosen]} · ${pol.company} · póliza ${pol.number}${pol.plate ? ` · ${pol.plate}` : ""}.`,
        book ? book.firstStep : "",
        line
          ? `${book?.assistanceLabel ?? "Asistencia"}: ${line.assistance}. Denuncia: ${line.claims}. ${line.notes}`
          : "No tengo el 0800 de esa compañía. Escribí «humano» y lo vemos.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (/poliza|descargar|pdf|cobertura|certificado/.test(t)) {
    if (!enabledPolicies.length) return say("No encuentro pólizas a tu nombre. Escribí «humano».");
    const list = enabledPolicies
      .map((p) => `• ${POLICY_LABEL[p.type as PolicyType] ?? p.type} ${p.number} (${p.company})`)
      .join("\n");
    return say(n ? `Listo, ${n}.\n${list}` : `Listo.\n${list}`);
  }

  if (/pago|cuota|vence|vencimiento/.test(t)) {
    const next = [...enabledPolicies].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0];
    if (!next) return say("No veo cuotas pendientes.");
    const due = `La próxima cuota de tu ${POLICY_LABEL[next.type as PolicyType] ?? next.type} (${next.company}) vence el ${new Date(next.nextDueDate).toLocaleDateString("es-AR")}.`;
    return say(next.cuponUrl ? `${due} ${next.cuponUrl}` : due);
  }

  const greeting = n
    ? opts.greeting.replace("[Nombre]", n)
    : opts.greeting.replace(/\s*\[Nombre\]/, "").replace(/^Hola\s+\S+\.?/i, "Hola.").replace(/^Hola\s*$/i, "Hola.");
  return say(`${greeting}\nPuedo ayudarte con: ${ramoMenu(active)}.`);
}
