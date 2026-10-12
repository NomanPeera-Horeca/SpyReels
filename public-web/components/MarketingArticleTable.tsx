import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type TableHTMLAttributes,
} from "react";
import styles from "./MarketingArticleTable.module.css";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function findChild(node: ReactNode, tag: string): ReactElement | null {
  let found: ReactElement | null = null;
  Children.forEach(node, (child) => {
    if (found || !isValidElement(child)) return;
    const type = child.type;
    if (type === tag || (typeof type === "string" && type.toLowerCase() === tag)) {
      found = child;
      return;
    }
    const nested = findChild((child.props as { children?: ReactNode }).children, tag);
    if (nested) found = nested;
  });
  return found;
}

function rowCells(row: ReactElement): string[] {
  const cells: string[] = [];
  Children.forEach((row.props as { children?: ReactNode }).children, (cell) => {
    if (!isValidElement(cell)) return;
    const type = cell.type;
    if (
      type === "th" ||
      type === "td" ||
      (typeof type === "string" && (type === "th" || type === "td"))
    ) {
      cells.push(textOf((cell.props as { children?: ReactNode }).children).trim());
    }
  });
  return cells;
}

export function MarketingArticleTable({
  children,
  className,
  ...rest
}: TableHTMLAttributes<HTMLTableElement>) {
  const thead = findChild(children, "thead");
  const tbody = findChild(children, "tbody");
  const headerRow = thead
    ? findChild((thead.props as { children?: ReactNode }).children, "tr")
    : null;
  const headers = headerRow ? rowCells(headerRow) : [];

  const bodyRows: string[][] = [];
  if (tbody) {
    Children.forEach((tbody.props as { children?: ReactNode }).children, (row) => {
      if (!isValidElement(row)) return;
      const type = row.type;
      if (type === "tr" || (typeof type === "string" && type === "tr")) {
        bodyRows.push(rowCells(row));
      }
    });
  }

  return (
    <>
      <div className={cx(styles.wrap, className)} data-marketing-article-table="">
        <table className={styles.table} {...rest}>
          {children}
        </table>
      </div>
      {headers.length > 0 && bodyRows.length > 0 ? (
        <div className={styles.stack} data-marketing-article-table-stack="">
          {bodyRows.map((row, rowIndex) => (
            <div key={rowIndex} className={styles.card}>
              {row.map((value, cellIndex) => (
                <div key={cellIndex} className={styles.field}>
                  <p className={cx("sr-text-marketing-label", styles.fieldLabel)}>
                    {headers[cellIndex] || `Column ${cellIndex + 1}`}
                  </p>
                  <p className={cx("sr-text-marketing-body-small", styles.fieldValue)}>{value}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function articleTableComponents() {
  return {
    table: MarketingArticleTable,
    thead: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
    tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
    tr: ({ children }: { children?: ReactNode }) => <tr className={styles.tr}>{children}</tr>,
    th: ({ children }: { children?: ReactNode }) => <th className={styles.th}>{children}</th>,
    td: ({ children }: { children?: ReactNode }) => <td className={styles.td}>{children}</td>,
  };
}
