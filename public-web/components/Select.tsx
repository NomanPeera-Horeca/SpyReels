import type { SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className" | "id" | "children"
> & {
  id: string;
  options: readonly SelectOption[];
  className?: string;
  invalid?: boolean;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function ChevronDownIcon() {
  return (
    <svg
      className={styles.chevron}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Select (Figma 34:3).
 * Native select matching the Select control shell + chevron.
 */
export function Select({
  id,
  options,
  className,
  invalid,
  disabled,
  ...rest
}: SelectProps) {
  return (
    <div className={cx(styles.wrap, className)}>
      <select
        id={id}
        className={cx("sr-text-product-body-medium", styles.select)}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon />
    </div>
  );
}
