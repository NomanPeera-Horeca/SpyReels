"use client";

import type { ReactNode } from "react";
import { ResultCard, type ResultCardData } from "./ResultCard";
import styles from "./FinderResultsPreview.module.css";

type FinderResultsPreviewProps = {
  handle: string;
  results: ResultCardData[];
  platformLabel: string;
  platformMark: ReactNode;
  loading?: boolean;
  error?: string | null;
  onRemake: (data: ResultCardData) => void;
};

export function FinderResultsPreview({
  handle,
  results,
  platformLabel,
  platformMark,
  loading = false,
  error = null,
  onRemake,
}: FinderResultsPreviewProps) {
  return (
    <section
      className={styles.panel}
      aria-label="Interactive Viral Finder product example"
    >
      <header className={styles.header}>
        <small>Interactive example</small>
        <strong>@{handle.replace(/^@/, "")}</strong>
      </header>

      {loading ? (
        <div className={styles.state}>Loading results…</div>
      ) : error ? (
        <div className={styles.state}>The interactive example is unavailable right now.</div>
      ) : results.length ? (
        <div className={styles.viewport}>
          <div className={styles.results}>
            {results.slice(0, 4).map((result) => (
              <ResultCard
                key={result.id}
                data={result}
                platformLabel={platformLabel}
                platformMark={platformMark}
                onRemake={onRemake}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.state}>No public results are available right now.</div>
      )}
    </section>
  );
}
