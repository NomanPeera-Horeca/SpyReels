/**
 * Core components shared with the marketing site (REUSE).
 *
 * Button / Primary and Field / Input are already built from the locked Figma
 * components in public-web and are framework free (no Next.js imports).
 * The app imports the SAME files, so both apps render one component and a
 * Figma change is made once. Same pattern as shared/ui/PlatformMarks.
 */
export { PrimaryButton } from "../../../public-web/components/PrimaryButton";
export type { PrimaryButtonProps } from "../../../public-web/components/PrimaryButton";
export { FieldInput } from "../../../public-web/components/FieldInput";
export type { FieldInputProps } from "../../../public-web/components/FieldInput";
export { SecondaryButton } from "../../../public-web/components/SecondaryButton";
