import { companyProfileRepository } from "./company_profile_repository";
import { CompanyProfile, CompanyProfileInput } from "./company-profile.type";

const getByUserId = async (userId: string): Promise<CompanyProfile | null> => {
  if (!userId || !userId.trim()) {
    throw new Error("userId es obligatorio");
  }
  return companyProfileRepository.getByUserId(userId.trim());
};

const upsert = async (input: CompanyProfileInput): Promise<CompanyProfile> => {
  if (!input.user_id || !input.user_id.trim()) {
    throw new Error("user_id es obligatorio");
  }
  if (!input.business_name || !input.business_name.trim()) {
    throw new Error("business_name es obligatorio");
  }

  const sanitizedInput: CompanyProfileInput = {
    user_id: input.user_id.trim(),
    business_name: input.business_name.trim(),
    rut: input.rut?.trim() ? input.rut.trim() : null,
    city: input.city?.trim() || null,
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    brand_color: input.brand_color ?? null,
    description: input.description?.trim() || null,
  };

  return companyProfileRepository.upsert(sanitizedInput);
};

export const companyProfileService = {
  getByUserId,
  upsert,
};
