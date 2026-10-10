import type {
  FormEventHandler,
  FormHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import styles from "./FinderSearchShell.module.css";

type FinderSearchShellProps = {
  children?: never;
  /** Platform mark rendered inside the shell (InstagramMark / TikTokMark / etc.) */
  platformMark: ReactNode;
  /** Accessible label text for the visible input */
  label: string;
  inputId: string;
  value: string;
  onChange: InputHTMLAttributes<HTMLInputElement>["onChange"];
  placeholder: string;
  /** Submit / primary action slot (typically PrimaryButton) */
  action: ReactNode;
  invalid?: boolean;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  noValidate?: boolean;
  className?: string;
  /** Extra attributes on the form (e.g. data-finder-ready) */
  formProps?: Omit<
    FormHTMLAttributes<HTMLFormElement>,
    "className" | "onSubmit" | "noValidate" | "children"
  > & Record<string, string | undefined>;
  /** Extra attributes on the input beyond the controlled field props */
  inputProps?: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "id" | "value" | "onChange" | "placeholder" | "className"
  >;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function FinderSearchShell({
  platformMark,
  label,
  inputId,
  value,
  onChange,
  placeholder,
  action,
  invalid = false,
  onSubmit,
  noValidate,
  className,
  formProps,
  inputProps,
}: FinderSearchShellProps) {
  return (
    <form
      {...formProps}
      className={cx(styles.shell, className)}
      data-invalid={invalid ? "true" : undefined}
      onSubmit={onSubmit}
      noValidate={noValidate}
    >
      <span className={styles.mark} aria-hidden>
        {platformMark}
      </span>
      <label className={styles.srOnly} htmlFor={inputId}>
        {label}
      </label>
      <input
        {...inputProps}
        id={inputId}
        className={styles.input}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={invalid}
      />
      <span className={styles.action}>{action}</span>
    </form>
  );
}
