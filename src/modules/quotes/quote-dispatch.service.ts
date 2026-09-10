import fs from "fs";
import { generateQuotePdf } from "./quote.service";
import { sendQuoteEmail } from "./quote-email.service";
import { saveQuoteHistory } from "./quote-history/quote-history.repository";

export type QuoteLine = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type DispatchClient = { name: string; email: string; phone?: string };

export type DispatchResult = { email: string; ok: boolean; error?: string };

// Los items guardados en quote_history pueden venir en dos formatos según el origen
// (envío manual del admin: {title, price} — cotizador del portal: {name, unitPrice}).
// Esto normaliza cualquiera de los dos a las líneas que espera el generador de PDF.
export function normalizeStoredItemsToLines(items: any[]): QuoteLine[] {
  return (Array.isArray(items) ? items : []).map((it) => {
    const quantity = Math.max(1, Number(it.quantity || 1));
    if (it.unitPrice !== undefined) {
      const unitPrice = Number(it.unitPrice || 0);
      return {
        name:        it.name || "Servicio",
        description: it.description || "",
        quantity,
        unitPrice,
        subtotal: Number(it.subtotal ?? unitPrice * quantity),
      };
    }
    const unitPrice = Number(it.price || 0);
    return {
      name:        it.title || it.name || "Servicio",
      description: it.description || "",
      quantity,
      unitPrice,
      subtotal: unitPrice * quantity,
    };
  });
}

export async function dispatchQuoteToClients(params: {
  userId: string;
  ownerEmail?: string;
  clients: DispatchClient[];
  templateType: string;
  docTitle: string;
  brandName: string;
  brandRut?: string;
  brandAddress?: string;
  brandPhone?: string;
  brandCoverImageUrl?: string;
  brandAccentColor?: string;
  quoteStyle?: string;
  currency?: string;
  subtitle?: string;
  items: any[]; // tal como se guarda en quote_history (formato original del pedido)
  lines: QuoteLine[];
  total: number;
  taxRate?: number;
  taxAmount?: number;
  taxLabel?: string;
  message?: string;
  extraFields?: Record<string, any>;
}): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];

  for (const client of params.clients) {
    let filePath: string | undefined;
    try {
      const generated = await generateQuotePdf({
        token:              `custom-${params.userId}-${Date.now()}-${results.length}`,
        brand:              params.brandName,
        brandRut:           params.brandRut,
        brandAddress:       params.brandAddress,
        brandPhone:         params.brandPhone,
        brandCoverImageUrl: params.brandCoverImageUrl,
        brandAccentColor:   params.brandAccentColor,
        quoteStyle:         params.quoteStyle,
        currency:           params.currency,
        title:              params.docTitle,
        subtitle:           params.subtitle || "",
        templateType:       params.templateType as any,
        customer: {
          name:  client.name,
          email: client.email,
          phone: client.phone || "",
          notes: params.message || "",
        },
        lines: params.lines,
        total: params.total,
        taxRate: params.taxRate,
        taxAmount: params.taxAmount,
        taxLabel: params.taxLabel,
        extraFields: params.extraFields,
      });
      filePath = generated.filePath;

      const savedQuote = await saveQuoteHistory({
        userId:       params.userId,
        templateType: params.templateType,
        clientName:   client.name,
        clientEmail:  client.email,
        clientPhone:  client.phone,
        items:        params.items,
        total:        params.total,
        message:      params.message,
        extraFields:  params.extraFields,
        quoteStyle:        params.quoteStyle,
        quoteAccentColor:  params.brandAccentColor,
        quoteLogoUrl:      params.brandCoverImageUrl,
        currency:          params.currency,
        taxRate:           params.taxRate,
        taxAmount:         params.taxAmount,
        taxLabel:          params.taxLabel,
      }).catch((err) => { console.error("[quoteDispatch] historial:", err); return null; });

      const viewUrl = savedQuote?.quote_token
        ? `${process.env.PUBLIC_BASE_URL}/cotizacion/${savedQuote.quote_token}`
        : undefined;

      await sendQuoteEmail({
        to:           client.email,
        customerName: client.name,
        brandName:    params.brandName,
        pdfPath:      filePath,
        pdfFileName:  generated.fileName,
        items:        params.lines,
        total:        params.total,
        currency:     params.currency,
        taxRate:      params.taxRate,
        taxAmount:    params.taxAmount,
        taxLabel:     params.taxLabel,
        viewUrl,
        replyTo:      params.ownerEmail,
      });

      results.push({ email: client.email, ok: true });
    } catch (err: any) {
      console.error("[quoteDispatch] envío a", client.email, ":", err);
      results.push({ email: client.email, ok: false, error: err?.message });
    } finally {
      if (filePath) fs.unlink(filePath, () => {});
    }
  }

  return results;
}
