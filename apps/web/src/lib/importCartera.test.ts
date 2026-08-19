import { describe, expect, it } from "vitest";
import { mapHeaders, parseRamo, parseVencimiento, exportCarteraCsv } from "./importCartera";
import { nextInvoiceRef } from "./commissions";
import type { CommissionRow } from "./types";

describe("importCartera", () => {
  it("mapea headers de portal", () => {
    const map = mapHeaders(["Nombre Completo", "Teléfono", "DNI", "Ramo", "Compañía", "Número de Póliza", "Vencimiento"]);
    expect(Object.values(map)).toContain("nombre");
    expect(Object.values(map)).toContain("telefono");
    expect(Object.values(map)).toContain("vencimiento");
  });

  it("parsea ramo y vencimiento AR", () => {
    expect(parseRamo("Automotor")).toBe("auto");
    expect(parseRamo("vida")).toBe("vida");
    const iso = parseVencimiento("15/03/2027");
    expect(iso?.startsWith("2027-03-15")).toBe(true);
  });

  it("exporta CSV con el header de la plantilla", () => {
    const csv = exportCarteraCsv({
      clients: [
        {
          id: "c1",
          firstName: "Ana",
          lastName: "Pérez",
          dni: "30111222",
          phone: "5491155552211",
        },
      ],
      policies: [
        {
          id: "p1",
          clientId: "c1",
          type: "auto",
          company: "Sancor Seguros",
          number: "AU-1",
          status: "activa",
          endDate: "2027-03-15T12:00:00.000Z",
        },
      ],
    } as never);
    expect(csv.startsWith("Nombre Completo,Teléfono,DNI")).toBe(true);
    expect(csv).toContain("Ana Pérez");
    expect(csv).toContain("AU-1");
    expect(csv).toContain("15/03/2027");
  });
});

describe("nextInvoiceRef", () => {
  it("incrementa correlativo interno", () => {
    expect(nextInvoiceRef([])).toBe("INT-0501");
    expect(nextInvoiceRef([{ invoiceRef: "INT-0507" } as CommissionRow])).toBe("INT-0508");
  });
});
