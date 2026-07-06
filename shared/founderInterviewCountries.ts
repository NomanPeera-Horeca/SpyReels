export type FounderInterviewCountry = {
  code: string;
  name: string;
  dialCode: string;
};

export function founderInterviewCountryFlag(code: string): string {
  if (code.length !== 2) return "";
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...[...upper].map((char) => 127397 + char.charCodeAt(0))
  );
}

export const FOUNDER_INTERVIEW_COUNTRIES: FounderInterviewCountry[] = [
  { code: "US", name: "United States", dialCode: "+1" },
  { code: "CA", name: "Canada", dialCode: "+1" },
  { code: "GB", name: "United Kingdom", dialCode: "+44" },
  { code: "AU", name: "Australia", dialCode: "+61" },
  { code: "NZ", name: "New Zealand", dialCode: "+64" },
  { code: "IE", name: "Ireland", dialCode: "+353" },
  { code: "DE", name: "Germany", dialCode: "+49" },
  { code: "FR", name: "France", dialCode: "+33" },
  { code: "NL", name: "Netherlands", dialCode: "+31" },
  { code: "BE", name: "Belgium", dialCode: "+32" },
  { code: "ES", name: "Spain", dialCode: "+34" },
  { code: "IT", name: "Italy", dialCode: "+39" },
  { code: "PT", name: "Portugal", dialCode: "+351" },
  { code: "CH", name: "Switzerland", dialCode: "+41" },
  { code: "AT", name: "Austria", dialCode: "+43" },
  { code: "SE", name: "Sweden", dialCode: "+46" },
  { code: "NO", name: "Norway", dialCode: "+47" },
  { code: "DK", name: "Denmark", dialCode: "+45" },
  { code: "FI", name: "Finland", dialCode: "+358" },
  { code: "PL", name: "Poland", dialCode: "+48" },
  { code: "CZ", name: "Czech Republic", dialCode: "+420" },
  { code: "RO", name: "Romania", dialCode: "+40" },
  { code: "GR", name: "Greece", dialCode: "+30" },
  { code: "TR", name: "Turkey", dialCode: "+90" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966" },
  { code: "IL", name: "Israel", dialCode: "+972" },
  { code: "IN", name: "India", dialCode: "+91" },
  { code: "PK", name: "Pakistan", dialCode: "+92" },
  { code: "BD", name: "Bangladesh", dialCode: "+880" },
  { code: "SG", name: "Singapore", dialCode: "+65" },
  { code: "MY", name: "Malaysia", dialCode: "+60" },
  { code: "PH", name: "Philippines", dialCode: "+63" },
  { code: "ID", name: "Indonesia", dialCode: "+62" },
  { code: "TH", name: "Thailand", dialCode: "+66" },
  { code: "VN", name: "Vietnam", dialCode: "+84" },
  { code: "JP", name: "Japan", dialCode: "+81" },
  { code: "KR", name: "South Korea", dialCode: "+82" },
  { code: "CN", name: "China", dialCode: "+86" },
  { code: "HK", name: "Hong Kong", dialCode: "+852" },
  { code: "TW", name: "Taiwan", dialCode: "+886" },
  { code: "ZA", name: "South Africa", dialCode: "+27" },
  { code: "NG", name: "Nigeria", dialCode: "+234" },
  { code: "KE", name: "Kenya", dialCode: "+254" },
  { code: "EG", name: "Egypt", dialCode: "+20" },
  { code: "GH", name: "Ghana", dialCode: "+233" },
  { code: "BR", name: "Brazil", dialCode: "+55" },
  { code: "MX", name: "Mexico", dialCode: "+52" },
  { code: "AR", name: "Argentina", dialCode: "+54" },
  { code: "CO", name: "Colombia", dialCode: "+57" },
  { code: "CL", name: "Chile", dialCode: "+56" },
  { code: "PE", name: "Peru", dialCode: "+51" },
];

export const DEFAULT_FOUNDER_INTERVIEW_COUNTRY_CODE = "US";

export function findFounderInterviewCountry(
  code: string
): FounderInterviewCountry | undefined {
  return FOUNDER_INTERVIEW_COUNTRIES.find((country) => country.code === code);
}

export function normalizeFounderInterviewPhoneNational(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15);
}

export function isValidFounderInterviewPhoneNational(value: string): boolean {
  const digits = normalizeFounderInterviewPhoneNational(value);
  return digits.length >= 6 && digits.length <= 15;
}

export function formatFounderInterviewPhoneE164(
  dialCode: string,
  phoneNational: string
): string {
  const digits = normalizeFounderInterviewPhoneNational(phoneNational);
  return `${dialCode}${digits}`;
}

export function buildFounderInterviewCalendlyUrl(options: {
  baseUrl: string;
  email?: string | null;
  name?: string | null;
  phoneE164: string;
}): string {
  const url = new URL(options.baseUrl);
  if (options.email?.trim()) {
    url.searchParams.set("email", options.email.trim());
  }
  if (options.name?.trim()) {
    url.searchParams.set("name", options.name.trim());
  }
  url.searchParams.set("a1", options.phoneE164);
  return url.toString();
}
