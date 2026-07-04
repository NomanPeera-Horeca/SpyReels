export function MobileAppLayoutSkeleton() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="h-14 shrink-0 animate-pulse border-b bg-muted/40 pt-safe" />
      <div className="flex-1 space-y-3 p-4">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-32 animate-pulse rounded-xl bg-muted/60" />
      </div>
      <div className="h-16 shrink-0 animate-pulse border-t bg-muted/30 pb-safe" />
    </div>
  );
}
