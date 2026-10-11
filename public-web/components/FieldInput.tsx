import type { InputHTMLAttributes } from "react";
import styles from "./FieldInput.module.css";

export type FieldInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "id" | "type"
> & {
  id: string;
  label: string;
  /** Defaults to text. Search kind is reserved for Input / Search (34:2). */
  type?: "text" | "email" | "password" | "url" | "tel" | "search";
  helper?: string;
  error?: string;
  className?: string;
  hideLabel?: boolean;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Field / Input (Figma 53:107).
 * Label + single-line control + helper/error. Owns vertical field rhythm.
 */
export function FieldInput({
  id,
  label,
  type = "text",
  helper,
  error,
  className,
  hideLabel = false,
  disabled,
  ...rest
}: FieldInputProps) {
  const helperId = helper || error ? `${id}-helper` : undefined;
  const showError = Boolean(error);

  return (
    <div className={cx(styles.root, className)}>
      <label
        htmlFor={id}
        className={cx(
          "sr-text-product-label",
          styles.label,
          disabled && styles.labelDisabled,
          hideLabel && styles.visuallyHidden
        )}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={cx("sr-text-product-body-medium", styles.control)}
        disabled={disabled}
        aria-invalid={showError || undefined}
        aria-describedby={helperId}
        {...rest}
      />
      {showError ? (
        <p
          id={helperId}
          className={cx("sr-text-product-caption", styles.helper, styles.helperError)}
          role="alert"
        >
          {error}
        </p>
      ) : helper ? (
        <p
          id={helperId}
          className={cx(
            "sr-text-product-caption",
            styles.helper,
            disabled && styles.helperDisabled
          )}
        >
          {helper}
        </p>
      ) : null}
    </div>
  );
}
