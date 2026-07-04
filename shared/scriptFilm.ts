export function scriptFilmPath(savedScriptId: number): string {
  return `/scripts/${savedScriptId}?film=1`;
}

export function shouldAutoOpenFilm(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("film") === "1";
}
