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

export type QuoteLayoutBlockId = "client" | "notes" | "items" | "terms" | "signature" | "footer";

export type QuoteLayoutBlock = {
  id: QuoteLayoutBlockId;
  title: string;
  visible: boolean;
  /** Solo aplica a "terms" y "footer" — texto libre editado por el usuario. */
  text?: string;
};

// Orden y textos por defecto — deben reproducir exactamente lo que ya dibuja
// style1.ts hoy, para que una plantilla no guardada (usuarios existentes) no
// cambie el PDF de nadie.
export const DEFAULT_QUOTE_LAYOUT: QuoteLayoutBlock[] = [
  { id: "client",    title: "Cotización para",                visible: true },
  { id: "notes",     title: "Comentarios o instrucciones",    visible: true },
  { id: "items",     title: "Detalle de servicios",           visible: true },
  { id: "terms",     title: "Términos y condiciones",         visible: false, text: "" },
  { id: "signature", title: "Firma",                          visible: false },
  // text vacío = usar la frase de contacto original con la marca interpolada
  // (ver renderFooterBlock en style1.ts), no un placeholder real.
  { id: "footer",    title: "¡Gracias por su preferencia!",   visible: true, text: "" },
];

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
  /** Plantilla de orden/títulos/visibilidad de secciones (solo style1 por ahora). Sin esto, se usa DEFAULT_QUOTE_LAYOUT. */
  layout?: QuoteLayoutBlock[];
};
