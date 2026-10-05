import type {
  FormEventHandler,
  FormHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { FinderSearchShell } from "./FinderSearchShell";
import {
  FinderProfilePreview,
  type FinderProfilePreviewData,
} from "./FinderProfilePreview";

type FinderSearchProps = {
  platformMark: ReactNode;
  label: string;
  inputId: string;
  value: string;
  onChange: InputHTMLAttributes<HTMLInputElement>["onChange"];
  placeholder: string;
  action: ReactNode;
  invalid?: boolean;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  noValidate?: boolean;
  className?: string;
  formProps?: Omit<
    FormHTMLAttributes<HTMLFormElement>,
    "className" | "onSubmit" | "noValidate" | "children"
  > &
    Record<string, string | undefined>;
  inputProps?: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "id" | "value" | "onChange" | "placeholder" | "className"
  >;
  /** Below-shell extras (demo examples, hints) */
  children?: ReactNode;
  profileLoading?: boolean;
  profileLoadingLabel?: string;
  profileError?: string | null;
  profileErrorId?: string;
  profile?: FinderProfilePreviewData | null;
  profileTestId?: string;
  profileActionLabel?: string;
  profilePrivateActionLabel?: string;
  profileContinueAriaLabel?: (username: string) => string;
  onProfileContinue?: (username: string) => void;
};

/**
 * Shared Finder / Search interaction surface:
 * input shell + loading / error / validated profile-preview states.
 * Platform pages supply mark, copy, fetch mapping, and continue handlers.
 */
export function FinderSearch({
  platformMark,
  label,
  inputId,
  value,
  onChange,
  placeholder,
  action,
  invalid,
  onSubmit,
  noValidate,
  className,
  formProps,
  inputProps,
  children,
  profileLoading,
  profileLoadingLabel,
  profileError,
  profileErrorId,
  profile,
  profileTestId,
  profileActionLabel,
  profilePrivateActionLabel,
  profileContinueAriaLabel,
  onProfileContinue,
}: FinderSearchProps) {
  return (
    <>
      <FinderSearchShell
        platformMark={platformMark}
        label={label}
        inputId={inputId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        action={action}
        invalid={invalid}
        onSubmit={onSubmit}
        noValidate={noValidate}
        className={className}
        formProps={formProps}
        inputProps={inputProps}
      />
      <FinderProfilePreview
        loading={profileLoading}
        loadingLabel={profileLoadingLabel}
        error={profileError}
        errorId={profileErrorId}
        profile={profile}
        testId={profileTestId}
        actionLabel={profileActionLabel}
        privateActionLabel={profilePrivateActionLabel}
        continueAriaLabel={profileContinueAriaLabel}
        onContinue={onProfileContinue}
      />
      {children}
    </>
  );
}
