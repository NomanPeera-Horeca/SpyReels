import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugify } from "../lib/blog/markdown";
import { articleTableComponents } from "./MarketingArticleTable";
import { MarketingCallout, PRICING_NOTE_CALLOUT } from "./MarketingCallout";
import styles from "./BlogArticleBody.module.css";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function childrenToText(children: ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  return "";
}

export function BlogArticleBody({
  markdown,
  showAuthorSignature = false,
}: {
  markdown: string;
  showAuthorSignature?: boolean;
}) {
  let lastH2Text = "";
  const tableComponents = articleTableComponents();

  return (
    <div className={styles.prose} data-blog-article-body="">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => {
            const text = childrenToText(children);
            lastH2Text = text;
            const id = slugify(text);
            return (
              <h2 id={id} className={styles.h2}>
                {children}
              </h2>
            );
          },
          h3: ({ children }) => {
            const text = childrenToText(children);
            const id = slugify(text);
            return (
              <h3 id={id} className={styles.h3}>
                {children}
              </h3>
            );
          },
          p: ({ children }) => (
            <p className={cx("sr-text-marketing-body-medium", styles.p)}>{children}</p>
          ),
          ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
          ol: ({ children }) => <ol className={styles.ol}>{children}</ol>,
          li: ({ children }) => (
            <li className={cx("sr-text-marketing-body-medium", styles.li)}>{children}</li>
          ),
          a: ({ href, children }) => (
            <a href={href} className={styles.a}>
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className={styles.strong}>{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className={styles.blockquote}>{children}</blockquote>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.img} src={src || ""} alt={alt || ""} />
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return <code className={className}>{children}</code>;
            }
            return <code className={styles.codeInline}>{children}</code>;
          },
          pre: ({ children }) => <pre className={styles.pre}>{children}</pre>,
          table: (props) => {
            const pricing = /pricing/i.test(lastH2Text);
            return (
              <>
                {pricing ? (
                  <MarketingCallout
                    type={PRICING_NOTE_CALLOUT.type}
                    title={PRICING_NOTE_CALLOUT.title}
                    body={PRICING_NOTE_CALLOUT.body}
                  />
                ) : null}
                {tableComponents.table(props)}
              </>
            );
          },
          thead: tableComponents.thead,
          tbody: tableComponents.tbody,
          tr: tableComponents.tr,
          th: tableComponents.th,
          td: tableComponents.td,
        }}
      >
        {markdown}
      </ReactMarkdown>
      {showAuthorSignature ? (
        <p className={cx("sr-text-marketing-body-medium", styles.signature)}>
          Noah Perry, Founder &amp; CEO.
        </p>
      ) : null}
    </div>
  );
}
