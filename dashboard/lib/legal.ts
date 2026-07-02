export function legalInfo() {
  return {
    company: process.env.NEXT_PUBLIC_LEGAL_COMPANY ?? 'PriceVault',
    address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? 'Adresse wird vor Produktionsstart konfiguriert',
    email: process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? 'legal@pricevault.de',
    phone: process.env.NEXT_PUBLIC_LEGAL_PHONE ?? '',
    managingDirector: process.env.NEXT_PUBLIC_LEGAL_DIRECTOR ?? '',
    register: process.env.NEXT_PUBLIC_LEGAL_REGISTER ?? '',
    vatId: process.env.NEXT_PUBLIC_LEGAL_VAT_ID ?? '',
    dpaEmail: process.env.NEXT_PUBLIC_DPA_EMAIL ?? 'datenschutz@pricevault.de',
  }
}
