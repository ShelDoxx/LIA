import { describe, expect, it } from "vitest";
import {
  arMobileKey,
  assistanceReply,
  asksForPack,
  craneNumber,
  isPackClose,
  matchIdentity,
  parseIdentityCue,
} from "@lia/nlu";

const base = {
  firstName: "Martín",
  producerName: "Laura",
  greeting: "Hola [Nombre].",
  signOff: "— Lía",
  activeRamos: ["auto", "vida", "hogar"],
  policies: [
    {
      type: "auto",
      number: "AU-1",
      company: "Sancor Seguros",
      plate: "AE 441 CD",
      status: "activa",
      nextDueDate: "2026-09-01T12:00:00.000Z",
    },
    {
      type: "vida",
      number: "VI-1",
      company: "SMG LIFE",
      status: "activa",
      startDate: "2023-08-18T12:00:00.000Z",
      nextDueDate: "2026-10-01T12:00:00.000Z",
    },
  ],
  documents: [{ id: "d1", type: "cupon", name: "Cupón.pdf" }],
};

describe("NLU compartido", () => {
  it("cierra el pack con LISTO", () => {
    expect(isPackClose("LISTO")).toBe(true);
    expect(isPackClose("armar pdf")).toBe(true);
    expect(isPackClose("choqué")).toBe(false);
  });

  it("detecta pedido de expediente", () => {
    expect(asksForPack("Te mando las fotos del DNI")).toBe(true);
  });

  it("pasa el 0800 de Sancor en grúa", () => {
    const r = assistanceReply({ ...base, text: "choqué, necesito grúa" });
    expect(r.text).toContain("0800-333-2766");
    expect(r.text).toContain("Sancor");
  });

  it("deriva a humano", () => {
    const r = assistanceReply({ ...base, text: "quiero hablar con un humano" });
    expect(r.text).toContain("Laura");
  });

  it("adjunta cupón de autogestión", () => {
    const r = assistanceReply({ ...base, text: "pasame el cupón de pago" });
    expect(r.kind).toBe("file");
    expect(r.docId).toBe("d1");
  });

  it("resuelve 0800 por alias de compañía", () => {
    expect(craneNumber("Sancor")).toBe("0800-333-2766");
  });
});

describe("teléfono AR CSV vs Meta", () => {
  it("iguala 15 local, 0 de área y 549 de Cloud API", () => {
    expect(arMobileKey("02346 15-501704")).toBe("2346501704");
    expect(arMobileKey("5492346501704")).toBe("2346501704");
    expect(arMobileKey("54234615501704")).toBe("2346501704");
    expect(arMobileKey("+54 9 2346 501704")).toBe("2346501704");
  });
});

describe("verificar identidad WhatsApp", () => {
  const records = [
    {
      clientId: "c1",
      firstName: "Laura",
      lastName: "Gómez",
      dni: "30.111.222",
      plates: ["AE 441 CD"],
      policyNumbers: ["AU-441-22981"],
    },
  ];

  it("parsea DNI, patente y póliza", () => {
    expect(parseIdentityCue("30111222")).toEqual({ kind: "dni", value: "30111222" });
    expect(parseIdentityCue("dni 30.111.222")).toEqual({ kind: "dni", value: "30111222" });
    expect(parseIdentityCue("AE441CD")).toEqual({ kind: "plate", value: "AE441CD" });
    expect(parseIdentityCue("póliza AU-441-22981").kind).toBe("policy");
  });

  it("matchea cartera aunque el DNI tenga puntos", () => {
    expect(matchIdentity({ kind: "dni", value: "30111222" }, records)).toHaveLength(1);
    expect(matchIdentity({ kind: "plate", value: "AE441CD" }, records)[0].clientId).toBe("c1");
  });

  it("no inventa cliente si no hay ficha", () => {
    expect(matchIdentity({ kind: "dni", value: "99999999" }, records)).toHaveLength(0);
  });
});
