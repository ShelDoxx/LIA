import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { get, set, del } from "idb-keyval";
import { seedState } from "@/data/seed";
import { assistanceReply } from "@/data/ramos";
import type {
  BotSettings,
  ChatMessage,
  Claim,
  Client,
  Conversation,
  Endorsement,
  LiaState,
  Policy,
  Quote,
  VaultDoc,
} from "@/lib/types";
import {
  asksForPack,
  assembleClientPdf,
  filesToPackPhotos,
  isPackClose,
  packInstructions,
  packedReply,
  receivedAck,
  type PackPhoto,
} from "@/lib/waPack";
import { fullName } from "@/lib/format";
import { addMonths, differenceInDays, parseISO } from "date-fns";
import { runDailyAutomations } from "@/lib/dailyJob";
import { recalcCommissionsFromPolicies } from "@/lib/commissions";
import { syncBotContext } from "@/lib/botSync";
import { fetchBotHealth, simulateBotReply } from "@/lib/botApi";
import { normalizeStatePhones } from "@/lib/normalizeState";
import { generateDunningMessage } from "@/data/ramos";
import { daysUntil } from "@/lib/format";
import { estudioState } from "@/data/estudio";
import { renewPolicyDates } from "@/lib/renewPolicy";
import { pushMetaConfigToBot, sendOutboundBatch, shouldSendWhatsApp } from "@/lib/outbound";
import { pullPendingBotDocs } from "@/lib/botDocsSync";
import { cloudSyncAvailable, loadStateFromCloud, saveStateToCloud } from "@/lib/cloudSync";
import { auth, firebaseEnabled } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

const KEY = "lia-state-v7";
const AUTH_KEY = "lia-auth";
const LEGACY_KEYS = ["lia-state-v6", "lia-state-v5", "lia-state-v4", "lia-state-v3", "lia-state-v2", "lia-state-v1"];

function mergeState(seed: LiaState, parsed: LiaState): LiaState {
  return {
    ...seed,
    ...parsed,
    doneAgenda: parsed.doneAgenda ?? [],
    lastDailyRun: parsed.lastDailyRun,
    lastDailySent: parsed.lastDailySent,
    lastWaSent: parsed.lastWaSent,
    automationLog: parsed.automationLog ?? [],
    claims: (parsed.claims ?? seed.claims).map((c) => ({
      ...c,
      status: normalizeClaimStatus(c.status as string),
      updatedAt: c.updatedAt ?? c.date,
    })),
    quotes: (parsed.quotes ?? seed.quotes).map(normalizeQuote),
    endorsements: parsed.endorsements ?? seed.endorsements,
    producer: {
      ...seed.producer,
      ...parsed.producer,
      activeRamos: parsed.producer?.activeRamos?.length
        ? parsed.producer.activeRamos
        : seed.producer.activeRamos,
    },
    bot: {
      ...seed.bot,
      ...parsed.bot,
      whatsappOutbound: parsed.bot?.whatsappOutbound ?? true,
      cranePhones: parsed.bot?.cranePhones ?? seed.bot.cranePhones,
    },
  };
}

function normalizeQuote(q: Quote): Quote {
  const pipelineType = q.pipelineType ?? (q.ramo === "vida" ? "vida" : "general");
  let status = q.status;
  if (pipelineType === "vida") {
    if (status === "borrador") status = "anf";
    else if (status === "enviada") status = "propuesta";
    else if (status === "seguimiento") status = "examenes";
    else if (status === "ganada") status = "emitida";
  }
  return { ...q, pipelineType, status };
}

function normalizeClaimStatus(s: string): Claim["status"] {
  if (s === "abierto") return "denuncia";
  if (s === "en_tramite") return "inspeccion";
  if (s === "rechazado") return "cerrado";
  if (s === "denuncia" || s === "inspeccion" || s === "liquidacion" || s === "cerrado") return s;
  return "denuncia";
}

function runGarbageCollector(state: LiaState): LiaState {
  const now = new Date();
  let changed = false;
  const documents = state.documents.map((d) => {
    if (!d.dataUrl) return d;
    let age = 0;
    try {
      age = differenceInDays(now, parseISO(d.uploadedAt));
    } catch {
      return d;
    }
    if (age <= 30) return d;
    changed = true;
    const { dataUrl: _drop, ...rest } = d;
    return { ...rest, archived: true };
  });
  return changed ? { ...state, documents } : state;
}

async function hydrateState(): Promise<LiaState> {
  const seed = seedState();
  try {
    const fromIdb = await get<LiaState>(KEY);
    if (fromIdb) {
      const merged = mergeState(seed, fromIdb);
      const { state: normalized, changed: phonesChanged } = normalizeStatePhones(merged);
      const cleaned = runGarbageCollector(normalized);
      if (cleaned !== merged || phonesChanged) await set(KEY, cleaned);
      return cleaned;
    }
    for (const k of LEGACY_KEYS) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as LiaState;
      const merged = runGarbageCollector(mergeState(seed, parsed));
      const { state: normalized } = normalizeStatePhones(merged);
      await set(KEY, normalized);
      localStorage.removeItem(k);
      return normalized;
    }
  } catch {
    /* seed */
  }
  return seed;
}

async function hydrateAuth(): Promise<boolean> {
  try {
    const fromIdb = await get<string>(AUTH_KEY);
    if (fromIdb === "1") return true;
    if (localStorage.getItem(AUTH_KEY) === "1") {
      await set(AUTH_KEY, "1");
      localStorage.removeItem(AUTH_KEY);
      return true;
    }
  } catch {
    /* signed out */
  }
  return false;
}

function slimForStorage(state: LiaState): LiaState {
  return {
    ...state,
    documents: state.documents.map(({ dataUrl, ...d }) => ({
      ...d,
      archived: d.archived || Boolean(dataUrl),
    })),
    conversations: state.conversations.map((c) => ({
      ...c,
      pendingPhotos: c.pendingPhotos?.map((p) => ({ ...p, dataUrl: "" })),
      messages: c.messages.map(({ imageDataUrl: _i, ...m }) => m),
    })),
  };
}

type LiaContextValue = {
  state: LiaState;
  firebaseEnabled: boolean;
  signedIn: boolean;
  signIn: (name?: string, email?: string, plan?: "demo" | "estudio") => Promise<void>;
  signInWithGoogle: (plan?: "demo" | "estudio") => Promise<void>;
  signOut: () => Promise<void>;
  save: (next: LiaState) => Promise<void>;
  restoreState: (next: LiaState) => Promise<void>;
  recalcCommissions: () => Promise<void>;
  claimAllMora: () => Promise<number>;
  addClient: (c: Client) => Promise<void>;
  updateClient: (c: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  addPolicy: (p: Policy) => Promise<void>;
  updatePolicy: (p: Policy) => Promise<void>;
  renewPolicy: (policyId: string) => Promise<void>;
  addEndorsement: (e: Endorsement) => Promise<void>;
  updateEndorsement: (e: Endorsement) => Promise<void>;
  addQuote: (q: Quote) => Promise<void>;
  addClaim: (c: Claim) => Promise<void>;
  importCartera: (clients: Client[], policies: Policy[]) => Promise<void>;
  addDocument: (d: VaultDoc) => Promise<void>;
  updateClaim: (c: Claim) => Promise<void>;
  updateBot: (b: Partial<BotSettings>) => Promise<void>;
  sendBotReply: (conversationId: string, userText: string) => void;
  toggleBotPause: (conversationId: string) => Promise<void>;
  markPremiumPaid: (policyId: string) => Promise<void>;
  injectLiaMessage: (clientId: string, text: string, extra?: Partial<ChatMessage>) => Promise<string>;
  startDocCollection: (clientId: string) => Promise<string>;
  receiveClientPhotos: (conversationId: string, files: File[]) => Promise<void>;
  isProcessingMedia: boolean;
  markRead: (conversationId: string) => Promise<void>;
  toggleDone: (id: string) => Promise<void>;
};

const LiaContext = createContext<LiaContextValue | null>(null);

function liaReply(text: string, state: LiaState, clientId: string) {
  const client = state.clients.find((c) => c.id === clientId);
  return assistanceReply({
    text,
    firstName: client?.firstName ?? "",
    producerName: state.producer.name,
    greeting: state.producer.liaGreeting,
    signOff: state.producer.liaSignOff,
    activeRamos: state.producer.activeRamos ?? [],
    policies: state.policies.filter((p) => p.clientId === clientId),
    documents: state.documents.filter((d) => d.clientId === clientId),
    cranePhones: state.bot.cranePhones,
    selfService: state.bot.selfService,
  });
}

function appendMessages(conv: Conversation, extra: ChatMessage[]): Conversation {
  const last = extra.at(-1);
  return {
    ...conv,
    lastAt: last?.at ?? conv.lastAt,
    unread: 0,
    messages: [...conv.messages, ...extra],
  };
}

async function withWhatsAppOutbound(
  state: LiaState,
  outbound: import("@/lib/outbound").OutboundMessage[],
): Promise<LiaState> {
  if (!shouldSendWhatsApp(state) || outbound.length === 0) return state;
  const wa = await sendOutboundBatch(outbound);
  if (wa.sent === 0) return state;
  return { ...state, lastWaSent: wa.sent };
}

export function LiaProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiaState | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const stateRef = useRef<LiaState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await hydrateState();
      const auth = await hydrateAuth();
      if (cancelled) return;

      let finalState = next;
      if (auth) {
        const { state: afterDaily, outbound } = runDailyAutomations(next);
        finalState = afterDaily;
        const health = await fetchBotHealth();
        if (health.ok !== finalState.bot.connected) {
          finalState = { ...finalState, bot: { ...finalState.bot, connected: health.ok } };
        }
        finalState = await withWhatsAppOutbound(finalState, outbound);
        finalState = await pullPendingBotDocs(finalState);
        if (
          afterDaily.lastDailyRun !== next.lastDailyRun ||
          afterDaily.lastDailySent ||
          health.ok !== next.bot.connected ||
          finalState.lastWaSent
        ) {
          try {
            await set(KEY, finalState);
          } catch {
            try {
              await set(KEY, slimForStorage(finalState));
            } catch {
              /* quota */
            }
          }
        }
        void syncBotContext(finalState);
      }

      stateRef.current = finalState;
      setState(finalState);
      setSignedIn(auth);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (next: LiaState) => {
    stateRef.current = next;
    setState(next);
    try {
      await set(KEY, next);
    } catch {
      try {
        await set(KEY, slimForStorage(next));
      } catch {
        /* quota */
      }
    }
    void syncBotContext(next);
    if (cloudSyncAvailable() && next.producer.firebaseUid) {
      void saveStateToCloud(next);
    }
  };

  useEffect(() => {
    if (!signedIn) return;

    let alive = true;
    let running = false;
    let delayMs = 6000;
    let timer: number | null = null;

    const schedule = () => {
      if (!alive) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (!alive) return;
      if (running) return;
      running = true;
      try {
        // Evita fetches innecesarios si el productor dejó la pestaña en segundo plano.
        if (document.hidden) return;

        const current = stateRef.current;
        if (!current) return;

        const next = await pullPendingBotDocs(current);
        if (next !== current) {
          // Volvemos rápido porque sí hubo algo nuevo.
          delayMs = 6000;
          await persist(next);
        } else {
          // Sin cambios: backoff progresivo hasta un máximo razonable.
          delayMs = Math.min(60000, Math.round(delayMs * 1.5));
        }
      } finally {
        running = false;
        schedule();
      }
    };

    const onVisibility = () => {
      if (!alive) return;
      // Al volver a la pestaña, intentamos rápido.
      if (!document.hidden) {
        delayMs = Math.min(delayMs, 6000);
        schedule();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    schedule();

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) window.clearTimeout(timer);
    };
  }, [signedIn]);

  async function finishPack(current: LiaState, conv: Conversation, photos: PackPhoto[]) {
    const client = current.clients.find((c) => c.id === conv.clientId);
    if (!client || photos.length === 0) return current;
    const { doc, filename } = await assembleClientPdf({
      producer: current.producer,
      client,
      photos,
      logoDataUrl: current.bot.studioLogo,
    });
    const reply: ChatMessage = {
      id: crypto.randomUUID(),
      from: "lia",
      text: packedReply(client.firstName, filename, photos.length),
      at: new Date().toISOString(),
      kind: "expediente",
      docId: doc.id,
      imageDataUrl: doc.dataUrl,
    };
    const nextConv: Conversation = {
      ...appendMessages(conv, [reply]),
      pendingPhotos: [],
    };
    return {
      ...current,
      documents: [doc, ...current.documents],
      conversations: current.conversations.map((c) => (c.id === conv.id ? nextConv : c)),
      clients: current.clients.map((c) =>
        c.id === client.id ? { ...c, lastContactAt: reply.at } : c,
      ),
    };
  }

  const value = useMemo<LiaContextValue | null>(() => {
    if (!state) return null;
    const currentOf = () => stateRef.current ?? state;
    return {
      state,
      firebaseEnabled,
      signedIn,
      isProcessingMedia,
      signIn: async (name, email, plan) => {
        let next: LiaState =
          plan === "estudio"
            ? estudioState({
                name: name || "Productor",
                email: email || "",
              })
            : {
                ...seedState(),
                producer: {
                  ...seedState().producer,
                  name: name || "Productor demo",
                  email: email || "demo@lia.app",
                  plan: "demo",
                },
              };
        const { state: afterDaily, outbound } = runDailyAutomations(next);
        next = afterDaily;
        if (next.bot.metaAccessToken || next.bot.metaPhoneNumberId) {
          await pushMetaConfigToBot(next.bot);
        }
        next = await withWhatsAppOutbound(next, outbound);
        next = await pullPendingBotDocs(next);
        await persist(next);
        await set(AUTH_KEY, "1");
        setSignedIn(true);
      },
      signInWithGoogle: async (plan) => {
        const current = currentOf();
        const chosen = plan ?? "estudio";
        if (!auth || !firebaseEnabled) {
          let next: LiaState =
            chosen === "estudio"
              ? estudioState({ name: "Productor", email: "" })
              : {
                  ...seedState(),
                  producer: { ...seedState().producer, plan: "demo" },
                };
          const { state: afterDaily, outbound } = runDailyAutomations(next);
          next = await withWhatsAppOutbound(afterDaily, outbound);
          next = await pullPendingBotDocs(next);
          await persist(next);
          await set(AUTH_KEY, "1");
          setSignedIn(true);
          return;
        }
        const cred = await signInWithPopup(auth, new GoogleAuthProvider());
        const user = cred.user;
        const cloud = await loadStateFromCloud(user.uid);
        let next: LiaState;
        if (cloud) {
          next = mergeState(seedState(), cloud);
          next = {
            ...next,
            producer: {
              ...next.producer,
              name: user.displayName ?? next.producer.name,
              email: user.email ?? next.producer.email,
              firebaseUid: user.uid,
              plan: chosen ?? next.producer.plan,
            },
          };
        } else if (chosen === "demo") {
          next = {
            ...current,
            producer: {
              ...current.producer,
              name: user.displayName ?? current.producer.name,
              email: user.email ?? current.producer.email,
              firebaseUid: user.uid,
              plan: "demo",
            },
          };
        } else {
          next = estudioState({
            name: user.displayName ?? "Productor",
            email: user.email ?? "",
            firebaseUid: user.uid,
          });
        }
        const { state: afterDaily, outbound } = runDailyAutomations(next);
        next = await withWhatsAppOutbound(afterDaily, outbound);
        next = await pullPendingBotDocs(next);
        await persist(next);
        await set(AUTH_KEY, "1");
        setSignedIn(true);
      },
      signOut: async () => {
        await del(AUTH_KEY);
        setSignedIn(false);
      },
      save: persist,
      restoreState: (incoming) => persist(mergeState(seedState(), incoming)),
      recalcCommissions: async () => {
        const current = currentOf();
        return persist({ ...current, commissions: recalcCommissionsFromPolicies(current) });
      },
      claimAllMora: async () => {
        const current = currentOf();
        let next = current;
        let sent = 0;
        const outbound: import("@/lib/outbound").OutboundMessage[] = [];
        const seen = new Set<string>();
        for (const p of current.policies.filter(
          (x) => x.status !== "cancelada" && daysUntil(x.nextDueDate) < 0,
        )) {
          if (seen.has(p.clientId)) continue;
          seen.add(p.clientId);
          const c = current.clients.find((x) => x.id === p.clientId);
          if (!c) continue;
          const text = generateDunningMessage(c.firstName, p.nextDueDate);
          const id = await (async () => {
            const who = next.clients.find((x) => x.id === p.clientId);
            if (!who) return "";
            const existing = next.conversations.find((x) => x.clientId === p.clientId);
            if (existing?.messages.some((m) => m.from === "lia" && m.text === text)) return existing.id;
            const msg: ChatMessage = {
              id: crypto.randomUUID(),
              from: "lia",
              text,
              at: new Date().toISOString(),
            };
            if (!existing) {
              const conv: Conversation = {
                id: crypto.randomUUID(),
                clientId: p.clientId,
                phone: who.phone,
                lastAt: msg.at,
                unread: 0,
                messages: [msg],
              };
              next = {
                ...next,
                conversations: [conv, ...next.conversations],
                clients: next.clients.map((cl) =>
                  cl.id === p.clientId ? { ...cl, lastContactAt: msg.at } : cl,
                ),
              };
              outbound.push({ phone: who.phone, text });
              return conv.id;
            }
            next = {
              ...next,
              conversations: next.conversations.map((x) =>
                x.id === existing.id
                  ? { ...x, lastAt: msg.at, unread: 0, messages: [...x.messages, msg] }
                  : x,
              ),
              clients: next.clients.map((cl) =>
                cl.id === p.clientId ? { ...cl, lastContactAt: msg.at } : cl,
              ),
            };
            outbound.push({ phone: who.phone, text });
            return existing.id;
          })();
          if (id) sent += 1;
        }
        if (sent > 0) {
          next = await withWhatsAppOutbound(next, outbound);
          await persist(next);
        }
        return sent;
      },
      addClient: (c) => {
        const current = currentOf();
        return persist({ ...current, clients: [c, ...current.clients] });
      },
      updateClient: (c) => {
        const current = currentOf();
        return persist({
          ...current,
          clients: current.clients.map((x) => (x.id === c.id ? c : x)),
        });
      },
      deleteClient: (id) => {
        const current = currentOf();
        return persist({
          ...current,
          clients: current.clients.filter((c) => c.id !== id),
          policies: current.policies.filter((p) => p.clientId !== id),
          claims: current.claims.filter((c) => c.clientId !== id),
          quotes: current.quotes.filter((q) => q.clientId !== id),
          documents: current.documents.filter((d) => d.clientId !== id),
          endorsements: (current.endorsements ?? []).filter((e) => e.clientId !== id),
          conversations: current.conversations.filter((c) => c.clientId !== id),
        });
      },
      addPolicy: (p) => {
        const current = currentOf();
        return persist({ ...current, policies: [p, ...current.policies] });
      },
      updatePolicy: (p) => {
        const current = currentOf();
        return persist({
          ...current,
          policies: current.policies.map((x) => (x.id === p.id ? p : x)),
        });
      },
      renewPolicy: (policyId) => {
        const current = currentOf();
        return persist({
          ...current,
          policies: current.policies.map((x) => (x.id === policyId ? renewPolicyDates(x) : x)),
        });
      },
      addEndorsement: (e) => {
        const current = currentOf();
        return persist({
          ...current,
          endorsements: [e, ...(current.endorsements ?? [])],
        });
      },
      updateEndorsement: (e) => {
        const current = currentOf();
        return persist({
          ...current,
          endorsements: (current.endorsements ?? []).map((x) => (x.id === e.id ? e : x)),
        });
      },
      addQuote: (q) => {
        const current = currentOf();
        return persist({ ...current, quotes: [q, ...current.quotes] });
      },
      addClaim: (claim) => {
        const current = currentOf();
        const now = new Date().toISOString();
        return persist({
          ...current,
          claims: [{ ...claim, updatedAt: claim.updatedAt ?? now }, ...current.claims],
        });
      },
      importCartera: (clients, policies) => {
        if (!clients.length && !policies.length) return Promise.resolve();
        const current = currentOf();
        return persist({
          ...current,
          clients: [...clients, ...current.clients],
          policies: [...policies, ...current.policies],
        });
      },
      addDocument: (d) => {
        const current = currentOf();
        return persist({ ...current, documents: [d, ...current.documents] });
      },
      updateClaim: (claim) => {
        const current = currentOf();
        const prev = current.claims.find((x) => x.id === claim.id);
        const nextClaim =
          !prev || prev.status !== claim.status
            ? { ...claim, updatedAt: new Date().toISOString() }
            : { ...claim, updatedAt: claim.updatedAt || prev.updatedAt || new Date().toISOString() };
        return persist({
          ...current,
          claims: current.claims.map((x) => (x.id === claim.id ? nextClaim : x)),
        });
      },
      updateBot: (b) => {
        const current = currentOf();
        return persist({ ...current, bot: { ...current.bot, ...b } });
      },
      injectLiaMessage: async (clientId, text, extra) => {
        const current = currentOf();
        const who = current.clients.find((c) => c.id === clientId);
        if (!who) return "";
        const existing = current.conversations.find((c) => c.clientId === clientId);
        if (existing?.messages.some((m) => m.from === "lia" && m.text === text)) {
          return existing.id;
        }
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          from: "lia",
          text,
          at: new Date().toISOString(),
          ...extra,
        };
        if (!existing) {
          const conv: Conversation = {
            id: crypto.randomUUID(),
            clientId,
            phone: who.phone,
            lastAt: msg.at,
            unread: 0,
            messages: [msg],
          };
          await persist({ ...current, conversations: [conv, ...current.conversations] });
          return conv.id;
        }
        await persist({
          ...current,
          conversations: current.conversations.map((c) =>
            c.id === existing.id ? appendMessages(c, [msg]) : c,
          ),
        });
        return existing.id;
      },
      sendBotReply: (conversationId, userText) => {
        const current = currentOf();
        const conv = current.conversations.find((c) => c.id === conversationId);
        if (!conv) return;
        const client = current.clients.find((c) => c.id === conv.clientId);
        const now = new Date().toISOString();
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          from: "client",
          text: userText,
          at: now,
        };

        if (conv.botPaused) {
          void persist({
            ...current,
            conversations: current.conversations.map((c) =>
              c.id === conversationId ? appendMessages(conv, [userMsg]) : c,
            ),
          });
          return;
        }

        const pending = conv.pendingPhotos ?? [];

        if (isPackClose(userText) && pending.length > 0) {
          const withUser = appendMessages(conv, [userMsg]);
          setIsProcessingMedia(true);
          void (async () => {
            try {
              await persist({
                ...current,
                conversations: current.conversations.map((c) => (c.id === conversationId ? withUser : c)),
              });
              await persist(await finishPack(stateRef.current ?? current, withUser, pending));
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "No pude armar el PDF. Probá JPG o PNG.";
              const latest = currentOf();
              const c0 = latest.conversations.find((c) => c.id === conversationId);
              if (!c0) return;
              await persist({
                ...latest,
                conversations: latest.conversations.map((c) =>
                  c.id === conversationId
                    ? appendMessages(c0, [
                        {
                          id: crypto.randomUUID(),
                          from: "lia",
                          text: msg,
                          at: new Date().toISOString(),
                        },
                      ])
                    : c,
                ),
              });
            } finally {
              setIsProcessingMedia(false);
            }
          })();
          return;
        }

        if (isPackClose(userText) && pending.length === 0) {
          const reply: ChatMessage = {
            id: crypto.randomUUID(),
            from: "lia",
            text: packInstructions(client?.firstName ?? ""),
            at: new Date(Date.now() + 400).toISOString(),
          };
          void persist({
            ...current,
            conversations: current.conversations.map((c) =>
              c.id === conversationId ? appendMessages(conv, [userMsg, reply]) : c,
            ),
          });
          return;
        }

        if (asksForPack(userText)) {
          const reply: ChatMessage = {
            id: crypto.randomUUID(),
            from: "lia",
            text: packInstructions(client?.firstName ?? ""),
            at: new Date(Date.now() + 400).toISOString(),
          };
          void persist({
            ...current,
            conversations: current.conversations.map((c) =>
              c.id === conversationId ? appendMessages(conv, [userMsg, reply]) : c,
            ),
          });
          return;
        }

        const bot = liaReply(userText, current, conv.clientId);
        const withUser = appendMessages(conv, [userMsg]);
        void (async () => {
          await persist({
            ...current,
            conversations: current.conversations.map((c) =>
              c.id === conversationId ? withUser : c,
            ),
          });
          let replyText = bot.text;
          let kind = bot.kind;
          let docId = bot.docId;
          if (current.bot.connected && client?.phone) {
            const remote = await simulateBotReply(client.phone, userText);
            if (remote) {
              replyText = remote;
              kind = undefined;
              docId = undefined;
            }
          }
          const reply: ChatMessage = {
            id: crypto.randomUUID(),
            from: "lia",
            text: replyText,
            at: new Date(Date.now() + 400).toISOString(),
            kind,
            docId,
          };
          const latest = currentOf();
          const c1 = latest.conversations.find((c) => c.id === conversationId);
          if (!c1) return;
          await persist({
            ...latest,
            conversations: latest.conversations.map((c) =>
              c.id === conversationId ? appendMessages(c1, [reply]) : c,
            ),
          });
        })();
      },
      startDocCollection: async (clientId) => {
        const current = currentOf();
        const client = current.clients.find((c) => c.id === clientId);
        if (!client) return "";
        const liaMsg: ChatMessage = {
          id: crypto.randomUUID(),
          from: "lia",
          text: packInstructions(client.firstName),
          at: new Date().toISOString(),
        };
        const existing = current.conversations.find((c) => c.clientId === clientId);
        if (!existing) {
          const conv: Conversation = {
            id: crypto.randomUUID(),
            clientId,
            phone: client.phone,
            lastAt: liaMsg.at,
            unread: 0,
            messages: [liaMsg],
            pendingPhotos: [],
          };
          await persist({ ...current, conversations: [conv, ...current.conversations] });
          return conv.id;
        }
        const nextConv: Conversation = {
          ...appendMessages(existing, [liaMsg]),
          pendingPhotos: [],
        };
        await persist({
          ...current,
          conversations: current.conversations.map((c) => (c.id === existing.id ? nextConv : c)),
        });
        return existing.id;
      },
      receiveClientPhotos: async (conversationId, files) => {
        if (!files.length) return;
        setIsProcessingMedia(true);
        try {
        const current = currentOf();
        const conv = current.conversations.find((c) => c.id === conversationId);
        if (!conv) return;
        const pending = conv.pendingPhotos ?? [];
        const photos = await filesToPackPhotos(files, pending.length);
        const now = Date.now();
        const imgMsgs: ChatMessage[] = photos.map((p, i) => ({
          id: crypto.randomUUID(),
          from: "client",
          text: `📷 ${p.label}`,
          at: new Date(now + i).toISOString(),
          kind: p.kind,
          imageDataUrl: p.kind === "image" ? p.dataUrl : undefined,
        }));
        const nextPending = [...pending, ...photos];
        if (conv.botPaused) {
          await persist({
            ...current,
            conversations: current.conversations.map((c) =>
              c.id === conversationId
                ? { ...appendMessages(conv, imgMsgs), pendingPhotos: nextPending }
                : c,
            ),
          });
          return;
        }
        const auto = nextPending.length >= 4;
        const ack: ChatMessage = {
          id: crypto.randomUUID(),
          from: "lia",
          text: auto
            ? receivedAck(nextPending.length)
            : receivedAck(nextPending.length) +
              (clientHint(current, conv.clientId)
                ? `\nQueda en la ficha de ${clientHint(current, conv.clientId)}.`
                : ""),
          at: new Date(now + photos.length + 1).toISOString(),
        };
        const nextConv: Conversation = {
          ...appendMessages(conv, auto ? imgMsgs : [...imgMsgs, ack]),
          pendingPhotos: nextPending,
        };
        await persist({
          ...current,
          conversations: current.conversations.map((c) => (c.id === conversationId ? nextConv : c)),
        });
        if (auto) {
          try {
            await persist(await finishPack(stateRef.current ?? current, nextConv, nextPending));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "No pude armar el PDF. Probá JPG o PNG.";
            const latest = currentOf();
            await persist({
              ...latest,
              conversations: latest.conversations.map((c) =>
                c.id === conversationId
                  ? appendMessages(c, [
                      {
                        id: crypto.randomUUID(),
                        from: "lia",
                        text: msg,
                        at: new Date().toISOString(),
                      },
                    ])
                  : c,
              ),
            });
          }
        }
        } finally {
          setIsProcessingMedia(false);
        }
      },
      markRead: (conversationId) => {
        const current = currentOf();
        return persist({
          ...current,
          conversations: current.conversations.map((c) =>
            c.id === conversationId ? { ...c, unread: 0 } : c,
          ),
        });
      },
      toggleBotPause: (conversationId) => {
        const current = currentOf();
        return persist({
          ...current,
          conversations: current.conversations.map((c) =>
            c.id === conversationId ? { ...c, botPaused: !c.botPaused } : c,
          ),
        });
      },
      markPremiumPaid: (policyId) => {
        const current = currentOf();
        return persist({
          ...current,
          policies: current.policies.map((p) =>
            p.id === policyId
              ? { ...p, nextDueDate: addMonths(parseISO(p.nextDueDate), 1).toISOString() }
              : p,
          ),
        });
      },
      toggleDone: (id) => {
        const current = currentOf();
        const has = current.doneAgenda.includes(id);
        return persist({
          ...current,
          doneAgenda: has ? current.doneAgenda.filter((x) => x !== id) : [...current.doneAgenda, id],
        });
      },
    };
  }, [state, signedIn, isProcessingMedia]);

  if (!ready || !state || !value) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper text-ink">
        <p className="font-serif text-2xl">Cargando Lía…</p>
      </div>
    );
  }

  return <LiaContext.Provider value={value}>{children}</LiaContext.Provider>;
}

function clientHint(state: LiaState, clientId: string) {
  const c = state.clients.find((x) => x.id === clientId);
  return c ? fullName(c) : "";
}

export function useLia() {
  const ctx = useContext(LiaContext);
  if (!ctx) throw new Error("useLia must be inside LiaProvider");
  return ctx;
}
