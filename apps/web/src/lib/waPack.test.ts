import { describe, expect, it } from "vitest";
import { isPackClose, asksForPack } from "./packNlu";

describe("waPack NLU", () => {
  it("cierra el pack con LISTO", () => {
    expect(isPackClose("LISTO")).toBe(true);
    expect(isPackClose("listo")).toBe(true);
    expect(isPackClose("armar pdf")).toBe(true);
  });

  it("no cierra con texto cualquiera", () => {
    expect(isPackClose("choqué")).toBe(false);
    expect(isPackClose("cupón de pago")).toBe(false);
  });

  it("detecta pedido de expediente", () => {
    expect(asksForPack("Te mando las fotos del DNI")).toBe(true);
    expect(asksForPack("alta SMG")).toBe(true);
  });
});
