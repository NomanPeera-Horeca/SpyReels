"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./page.module.css";

const DEMO_HANDLES = ["garyvee", "humphreytalks", "russellbrunson", "codiesanchez"];

const PENDING_HANDLE_KEY = "spyreels:research_pending_handle";
const AUTOSTART_KEY = "spyreels:research_autostart";
const PLATFORM_KEY = "spyreels:research_pending_platform";

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  const urlMatch = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  const candidate = (urlMatch?.[1] ?? trimmed).replace(/^@/, "").trim().toLowerCase();
  return candidate.replace(/\/$/, "");
}

function isValidInstagramHandle(handle: string): boolean {
  return /^[a-z0-9._]{1,30}$/i.test(handle);
}

function getAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "spyreels.ai") {
    return window.location.origin;
  }
  return "https://spyreels.ai";
}

export default function FinderHandoffForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const normalized = useMemo(() => normalizeHandle(value), [value]);

  function continueToResearch(handle: string) {
    try {
      sessionStorage.setItem(PENDING_HANDLE_KEY, handle);
      sessionStorage.setItem(AUTOSTART_KEY, "1");
      sessionStorage.setItem(PLATFORM_KEY, "instagram");
    } catch {
      // Session storage can be unavailable in hardened/private browsing modes.
      // The destination still opens so the user can paste the handle there.
    }
    window.location.assign(`${getAppOrigin()}/research`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalized || !isValidInstagramHandle(normalized)) {
      setError("Enter a valid public Instagram username or profile URL.");
      return;
    }
    setError(null);
    continueToResearch(normalized);
  }

  return (
    <div className={styles.finderIsland}>
      <form className={styles.finderForm} onSubmit={submit} noValidate>
        <span className={styles.platformMark} aria-hidden>
          ◎
        </span>
        <label className={styles.srOnly} htmlFor="viral-reel-finder-handle">
          Instagram username or profile link
        </label>
        <input
          id="viral-reel-finder-handle"
          className={styles.finderInput}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder="@username or instagram.com/username"
          autoComplete="off"
          spellCheck={false}
        />
        <button className={styles.primaryButton} type="submit">
          Find Viral Reels
        </button>
      </form>
      {error ? (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.tryHandles}>
        or try{" "}
        {DEMO_HANDLES.map((handle, index) => (
          <span key={handle}>
            {index > 0 ? " · " : null}
            <button
              type="button"
              onClick={() => {
                setValue(handle);
                setError(null);
              }}
            >
              @{handle}
            </button>
          </span>
        ))}
      </p>
      <noscript>
        <p className={styles.formError}>
          JavaScript is only required to run the live research tool. The rest of this page remains
          readable without it.
        </p>
      </noscript>
    </div>
  );
}
