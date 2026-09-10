// Monedas soportadas para cotizaciones — no solo Chile. El locale de cada una se
// elige para que el símbolo y el separador de miles/decimales salgan como se
// esperaría en ese país (ej: $45.000 en Chile, $45,000.00 en México).
export const SUPPORTED_CURRENCIES = [
  "CLP", "USD", "EUR", "MXN", "ARS", "COP", "PEN", "BRL",
  "UYU", "GTQ", "BOB", "PYG", "DOP", "CRC", "HNL", "NIO", "PAB", "VES",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

const LOCALE_BY_CURRENCY: Record<string, string> = {
  CLP: "es-CL", USD: "en-US", EUR: "de-DE", MXN: "es-MX", ARS: "es-AR",
  COP: "es-CO", PEN: "es-PE", BRL: "pt-BR", UYU: "es-UY", GTQ: "es-GT",
  BOB: "es-BO", PYG: "es-PY", DOP: "es-DO", CRC: "es-CR", HNL: "es-HN",
  NIO: "es-NI", PAB: "es-PA", VES: "es-VE",
};

// Monedas que en uso normal no llevan decimales (igual que CLP) — el resto usa 2.
const ZERO_DECIMAL_CURRENCIES = new Set(["CLP", "PYG"]);

// Nombre real del impuesto al valor agregado/ventas en el país de cada moneda —
// no es un campo libre: cada país tiene un nombre oficial, se deriva siempre de
// acá server-side, nunca se confía en lo que mande el cliente.
export const TAX_NAME_BY_CURRENCY: Record<string, string> = {
  CLP: "IVA", USD: "Sales Tax", EUR: "IVA", MXN: "IVA", ARS: "IVA",
  COP: "IVA", PEN: "IGV", BRL: "ICMS", UYU: "IVA", GTQ: "IVA",
  BOB: "IVA", PYG: "IVA", DOP: "ITBIS", CRC: "IVA", HNL: "ISV",
  NIO: "IVA", PAB: "ITBMS", VES: "IVA",
};

export function taxNameForCurrency(currency?: string | null): string {
  return TAX_NAME_BY_CURRENCY[(currency || "CLP").toUpperCase()] || "IVA";
}

export function isSupportedCurrency(value: string | null | undefined): value is CurrencyCode {
  return !!value && (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

export function formatCurrency(value: number, currency?: string | null): string {
  const code = (currency || "CLP").toUpperCase();
  const locale = LOCALE_BY_CURRENCY[code] || "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2,
    }).format(Number(value || 0));
  } catch {
    // Código de moneda no reconocido por Intl (no debería pasar con la lista de arriba,
    // pero por si acaso no queremos que se caiga la generación del PDF por esto).
    return formatCurrency(value, "CLP");
  }
}
