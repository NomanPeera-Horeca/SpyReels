import type { TextareaHTMLAttributes } from "react";
import styles from "./FieldTextarea.module.css";

export type FieldTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className" | "id"
> & {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  className?: string;
  hideLabel?: boolean;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Field / Textarea (Figma 1106:4775).
 * Multi-line text field; minimum 3 visible rows; vertical resize only.
 */
export function FieldTextarea({
  id,
  label,
  helper,
  error,
  className,
  hideLabel = false,
  disabled,
  rows = 3,
  ...rest
}: FieldTextareaProps) {
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
      <textarea
        id={id}
        className={cx("sr-text-product-body-medium", styles.control)}
        rows={rows}
        disabled={disabled}
        aria-invalid={showError || undefined}
        aria-describedby={helperId}
        {...rest}
      />
      {showError ? (
        <p id={helperId} className={cx("sr-text-product-caption", styles.helper, styles.helperError)}>
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
