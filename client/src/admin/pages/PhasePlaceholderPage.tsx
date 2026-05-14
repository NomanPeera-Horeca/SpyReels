export default function PhasePlaceholderPage({
  title,
  phase,
}: {
  title: string;
  phase: 2 | 3;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">
        This tab is part of Phase {phase} of the admin PRD. Routing and shell are wired; product
        UI ships next.
      </p>
    </div>
  );
}
