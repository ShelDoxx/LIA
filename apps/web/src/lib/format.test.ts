import { describe, expect, it } from "vitest";
import { daysUntil, fmtDate, isBirthdayToday, normalizePhoneAR } from "./format";

describe("normalizePhoneAR", () => {
  it("convierte móvil CABA con +54 9", () => {
    expect(normalizePhoneAR("+54 9 11 6230-4411")).toBe("5491162304411");
  });

  it("acepta formato 549 ya normalizado", () => {
    expect(normalizePhoneAR("5491162304411")).toBe("5491162304411");
  });

  it("quita 15 del medio", () => {
    expect(normalizePhoneAR("11 15-6230-4411")).toBe("5491162304411");
  });

  it("interior con 15 local queda 549 sin 15", () => {
    expect(normalizePhoneAR("02346 15-501704")).toBe("5492346501704");
  });

  it("iguala el 15 que pone Meta en la lista de prueba", () => {
    expect(normalizePhoneAR("54234615501704")).toBe("5492346501704");
  });

  it("devuelve vacío si no hay dígitos", () => {
    expect(normalizePhoneAR("")).toBe("");
  });
});

describe("fmtDate", () => {
  it("no tira error con fecha vacía (ficha WhatsApp)", () => {
    expect(fmtDate("")).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
    expect(isBirthdayToday("")).toBe(false);
    expect(Number.isNaN(daysUntil(""))).toBe(true);
  });
});
