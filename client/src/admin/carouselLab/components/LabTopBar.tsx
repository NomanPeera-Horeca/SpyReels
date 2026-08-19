import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export function LabTopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white/80 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/traffic"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Admin
        </Link>
        <span className="text-zinc-300 dark:text-zinc-700">/</span>
        <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Carousel Lab
        </h1>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          Admin prototype
        </span>
      </div>
      <p className="hidden text-xs text-zinc-400 sm:block">Mock AI · isolated from production</p>
    </header>
  );
}
