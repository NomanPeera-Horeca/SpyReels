/**
 * Admin Search Lab: try the library video search on real data before the
 * Viral Videos page uses it. Shows why each video matched (where the words
 * were found, word vs meaning score) and how it performed.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Platform = "instagram" | "tiktok" | "youtube" | null;
type Sort = "best" | "viral" | "views" | "newest";

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

export default function SearchLabPage() {
  const [draft, setDraft] = useState("kitchen tips");
  const [query, setQuery] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>(null);
  const [sort, setSort] = useState<Sort>("best");
  const [cursor, setCursor] = useState(0);
  const q = trpc.admin.searchLab.useQuery(
    { query: query ?? "", platform, sort, cursor },
    { enabled: Boolean(query), staleTime: 60_000 }
  );
  const run = () => {
    setCursor(0);
    setQuery(draft.trim() || null);
  };
  const data = q.data;

  return (
    <div className="space-y-4" data-testid="search-lab">
      <div>
        <h1 className="text-xl font-semibold">Search Lab</h1>
        <p className="text-sm text-muted-foreground">
          The new Viral Videos search engine on the real library. Match first (exact phrase, all words, then close meaning), then most viral.
        </p>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={e => {
          e.preventDefault();
          run();
        }}
      >
        <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder="e.g. kitchen tips" className="h-10 max-w-md" />
        <select className="h-10 rounded-md border px-2 text-sm" value={platform ?? ""} onChange={e => setPlatform((e.target.value || null) as Platform)}>
          <option value="">All platforms</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
        </select>
        <select className="h-10 rounded-md border px-2 text-sm" value={sort} onChange={e => setSort(e.target.value as Sort)}>
          <option value="best">Best match</option>
          <option value="viral">Most viral</option>
          <option value="views">Most views</option>
          <option value="newest">Newest</option>
        </select>
        <Button type="submit" className="h-10">Search</Button>
      </form>

      {q.isFetching ? <p className="text-sm text-muted-foreground">Searching…</p> : null}
      {q.error ? <p className="text-sm text-red-600">{q.error.message}</p> : null}
      {data ? (
        <>
          <p className="text-sm text-muted-foreground">
            {data.total} matches · searched {data.indexSize.toLocaleString()} library videos in {data.ms} ms · words: {data.terms.join(", ")} · meaning match{" "}
            {data.usedMeaning ? "on" : "off (OpenAI unavailable, words only)"}
          </p>
          <div className="overflow-x-auto rounded-md border bg-white dark:bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">Video</th>
                  <th className="p-2">Why it matched</th>
                  <th className="p-2">Match</th>
                  <th className="p-2">Performance</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it, i) => (
                  <tr key={it.id} className="border-b align-top">
                    <td className="p-2 text-muted-foreground">{cursor + i + 1}</td>
                    <td className="max-w-[320px] p-2">
                      <div className="font-medium">
                        {it.platform} · @{it.creator}
                      </div>
                      <div className="text-muted-foreground">{it.caption || "(no caption)"}</div>
                      {it.url ? (
                        <a href={it.url} target="_blank" rel="noreferrer" className="text-violet-700 underline">
                          open
                        </a>
                      ) : null}
                    </td>
                    <td className="max-w-[360px] p-2">
                      <div>
                        <span className={it.tier === "strong" ? "font-semibold text-emerald-700" : it.tier === "partial" ? "text-amber-700" : "text-sky-700"}>
                          {it.tier === "strong" ? (it.phrase ? "Exact phrase" : "All words") : it.tier === "partial" ? "Some words" : "Close meaning"}
                        </span>
                        {it.matchedIn.length ? ` · in ${it.matchedIn.join(", ")}` : ""}
                      </div>
                      {it.spokenSnippet ? <div className="mt-1 italic text-muted-foreground">Said: “{it.spokenSnippet}”</div> : null}
                      {it.summary ? <div className="mt-1 text-muted-foreground">Shows: {it.summary}</div> : null}
                      {!it.hasTranscript ? <div className="mt-1 text-muted-foreground">(no transcript yet)</div> : null}
                    </td>
                    <td className="whitespace-nowrap p-2">
                      {it.relevance}
                      <div className="text-muted-foreground">
                        words {it.wordScore} · meaning {it.meaningScore}
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-2">
                      {compact(it.views)} views
                      <div className="text-muted-foreground">
                        {it.multiple != null ? `${it.multiple}× usual` : "usual unknown"} · {it.status}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={cursor === 0} onClick={() => setCursor(c => Math.max(0, c - 30))}>
              Previous
            </Button>
            <Button variant="outline" disabled={data.nextCursor == null} onClick={() => data.nextCursor != null && setCursor(data.nextCursor)}>
              Next
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
