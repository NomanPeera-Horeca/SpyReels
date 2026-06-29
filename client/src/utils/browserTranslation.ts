/** Signals that Chrome/Edge/Google Translate modified the page DOM. */
export function isBrowserTranslatedPage(): boolean {
  if (typeof document === "undefined") return false;
  const html = document.documentElement;
  return (
    html.classList.contains("translated-ltr") ||
    html.classList.contains("translated-rtl")
  );
}

export function browserTranslationContext(): Record<string, string | boolean | null> {
  if (typeof document === "undefined") {
    return {
      document_lang: null,
      browser_translated: false,
      page_path: null,
    };
  }

  return {
    document_lang: document.documentElement.lang || null,
    browser_translated: isBrowserTranslatedPage(),
    page_path: typeof window !== "undefined" ? window.location.pathname : null,
  };
}
