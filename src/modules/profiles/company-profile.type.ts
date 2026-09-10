export interface CompanyProfile {
  id: string;
  user_id: string;
  business_name: string;
  rut: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  brand_color: string | null;
  description: string | null;
  quote_logo_url: string | null;
  quote_style: string | null;
  quote_accent_color: string | null;
  currency: string | null;
  /** Porcentaje de impuesto (ej: 19 para IVA 19%). 0 = sin impuesto, no se muestra en la cotización. */
  tax_rate: number;
  /** Nombre del impuesto a mostrar (ej: "IVA", "IGV", "ITBIS"). Default "IVA" si tax_rate > 0. */
  tax_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyProfileInput {
  user_id: string;
  business_name: string;
  rut?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  brand_color?: string | null;
  description?: string | null;
}
