import type { SelectHTMLAttributes } from "react";
import { Select, type SelectOption } from "./Select";
import styles from "./FieldSelect.module.css";

export type FieldSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className" | "id" | "children"
> & {
  id: string;
  label: string;
  options: readonly SelectOption[];
  helper?: string;
  error?: string;
  className?: string;
  hideLabel?: boolean;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Field / Select (Figma 53:129) wrapping Select (Figma 34:3).
 */
export function FieldSelect({
  id,
  label,
  options,
  helper,
  error,
  className,
  hideLabel = false,
  disabled,
  ...rest
}: FieldSelectProps) {
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
      <Select
        id={id}
        options={options}
        disabled={disabled}
        invalid={showError}
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
