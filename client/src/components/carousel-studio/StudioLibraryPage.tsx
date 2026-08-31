import {
  commandForLibraryCard,
  studioLibraryCardMeta,
  type StudioLibraryCard,
} from "./studioLibrary";

type StudioLibraryPageProps = {
  cards: StudioLibraryCard[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onOpenCompleted: (remakeId: number) => void;
  onTryAgain: () => void;
  onCreateNew: () => void;
};

export function StudioLibraryPage({
  cards,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onOpenCompleted,
  onTryAgain,
  onCreateNew,
}: StudioLibraryPageProps) {
  return (
    <div className="page empty-page">
      <div className="eyebrow">Content library</div>
      <h2>Everything you have created, in one place.</h2>
      <p className="sub">
        Reopen a generated carousel to edit and download it from the editor.
      </p>

      {isLoading ? (
        <div className="recent-grid library-grid" style={{ marginTop: 24 }}>
          {[0, 1, 2].map((key) => (
            <div key={key} className="recent-card library-skeleton" aria-hidden>
              <div className="recent-preview" />
              <div className="recent-meta">
                <strong className="skel-line" />
                <span className="skel-line skel-line-sm" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="library-error" role="alert">
          <strong>Could not load your carousels.</strong>
          <p>{errorMessage || "Something went wrong. Try again."}</p>
          <button type="button" className="btn small primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : cards.length === 0 ? (
        <div className="library-empty">
          Your generated carousels will appear here.
        </div>
      ) : (
        <div className="recent-grid library-grid" style={{ marginTop: 24 }}>
          {cards.map((card) =>
            card.status === "failed" ? (
              <article key={card.id} className="recent-card library-card failed">
                <div className="recent-preview">
                  {card.thumbnailUrl ? (
                    <img src={card.thumbnailUrl} alt="" />
                  ) : (
                    <span>{card.title}</span>
                  )}
                </div>
                <div className="recent-meta">
                  <strong>{card.title}</strong>
                  {studioLibraryCardMeta(card)}
                </div>
                <div className="library-card-error">
                  {card.errorMessage || "Carousel generation failed."}
                </div>
                <div className="library-card-actions">
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={onTryAgain}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={onCreateNew}
                  >
                    Create new
                  </button>
                </div>
              </article>
            ) : (
              <button
                key={card.id}
                type="button"
                className="recent-card library-card"
                onClick={() => {
                  const command = commandForLibraryCard(card);
                  if (command.kind !== "open_completed") return;
                  onOpenCompleted(command.remakeId);
                }}
              >
                <div className="recent-preview">
                  {card.thumbnailUrl ? (
                    <img src={card.thumbnailUrl} alt="" />
                  ) : (
                    <span>{card.title}</span>
                  )}
                </div>
                <div className="recent-meta">
                  <strong>{card.title}</strong>
                  {studioLibraryCardMeta(card)}
                </div>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
