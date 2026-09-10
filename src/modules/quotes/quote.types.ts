export type QuoteTemplateType =
  | "servicios"
  | "productos"
  | "construccion"
  | "eventos"
  | "rapida";

export const TEMPLATE_LABELS: Record<QuoteTemplateType, string> = {
  servicios:    "Servicios Profesionales",
  productos:    "Productos / Suministros",
  construccion: "Construcción",
  eventos:      "Propuesta de Evento",
  rapida:       "Cotización",
};

export type QuotePdfInput = {
  token: string;
  brand: string;
  brandRut?: string;
  brandAddress?: string;
  brandPhone?: string;
  brandCoverImageUrl?: string;
  brandAccentColor?: string;
  quoteStyle?: string;
  /** Código ISO 4217 (CLP, USD, EUR, MXN, ...) — ver utils/format.ts. Default CLP. */
  currency?: string;
  title?: string;
  subtitle?: string;
  templateType?: QuoteTemplateType;
  customer: {
    name: string;
    email: string;
    phone: string;
    notes: string;
  };
  lines: {
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  /** Total final (con impuesto ya sumado, si aplica) — es el monto que se muestra y se cobra. */
  total: number;
  /** Porcentaje de impuesto aplicado (ej: 19). 0/undefined = sin impuesto, no se muestra desglose. */
  taxRate?: number;
  /** Monto de impuesto ya calculado (subtotal * taxRate/100). El subtotal se deriva como total - taxAmount. */
  taxAmount?: number;
  /** Nombre del impuesto a mostrar (ej: "IVA"). Default "IVA" si taxRate > 0 y no se especifica. */
  taxLabel?: string;
  extraFields?: {
    paymentConditions?: string;
    deliveryDate?: string;
    exclusions?: string;
    deliveryTime?: string;
    priceValidity?: string;
    workAddress?: string;
    duration?: string;
    paymentSchedule?: string;
    eventDate?: string;
    bookingDeposit?: string;
    cancellationPolicy?: string;
    notes?: string;
  };
};
