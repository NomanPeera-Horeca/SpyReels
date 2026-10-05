"use client";

import { useEffect, useRef, useState } from "react";

export type FinderProfileLookupResult = {
  found: true;
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isVerified: boolean;
  isPrivate: boolean;
};

type UseFinderProfileLookupOptions = {
  input: string;
  normalize: (raw: string) => string;
  isValid: (handle: string) => boolean;
  invalidMessage: string;
  isDemoHandle: (handle: string) => boolean;
  /** Called when a non-demo handle is ready to look up. */
  fetchProfile: (
    handle: string,
    signal: AbortSignal
  ) => Promise<FinderProfileLookupResult>;
  onProfileFound?: (profile: FinderProfileLookupResult) => void;
  debounceMs?: number;
};

/**
 * Shared Finder handle → profile-preview state machine:
 * idle typing → debounce → loading → error | validated profile.
 * Demo handles skip lookup (caller owns demo results).
 */
export function useFinderProfileLookup({
  input,
  normalize,
  isValid,
  invalidMessage,
  isDemoHandle,
  fetchProfile,
  onProfileFound,
  debounceMs = 700,
}: UseFinderProfileLookupOptions) {
  const [debouncedHandle, setDebouncedHandle] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<FinderProfileLookupResult | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const fetchRef = useRef(fetchProfile);
  const onFoundRef = useRef(onProfileFound);
  const isValidRef = useRef(isValid);
  const isDemoRef = useRef(isDemoHandle);
  const invalidMessageRef = useRef(invalidMessage);
  fetchRef.current = fetchProfile;
  onFoundRef.current = onProfileFound;
  isValidRef.current = isValid;
  isDemoRef.current = isDemoHandle;
  invalidMessageRef.current = invalidMessage;

  const normalizedInput = normalize(input);
  const isDemoInput = isDemoHandle(normalizedInput);
  const matchingProfile =
    profile && profile.username.toLowerCase() === normalizedInput
      ? profile
      : null;

  useEffect(() => {
    setProfile(null);
    setProfileError(null);

    if (isDemoRef.current(normalizedInput)) {
      setDebouncedHandle("");
      setProfileLoading(false);
      return;
    }

    if (normalizedInput.length < 2) {
      setDebouncedHandle("");
      setProfileLoading(false);
      return;
    }

    if (!isValidRef.current(normalizedInput)) {
      setDebouncedHandle("");
      setProfileError(invalidMessageRef.current);
      return;
    }

    const timer = window.setTimeout(
      () => setDebouncedHandle(normalizedInput),
      debounceMs
    );
    return () => window.clearTimeout(timer);
  }, [normalizedInput, debounceMs]);

  useEffect(() => {
    if (!debouncedHandle) return;
    const controller = new AbortController();
    setProfileLoading(true);
    setProfileError(null);

    fetchRef
      .current(debouncedHandle, controller.signal)
      .then((body) => {
        setProfile(body);
        onFoundRef.current?.(body);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setProfile(null);
        setProfileError(
          error instanceof Error ? error.message : "We could not find that account."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setProfileLoading(false);
      });

    return () => controller.abort();
  }, [debouncedHandle]);

  function requestProfileNow(handle: string) {
    setProfile(null);
    setProfileError(null);
    setProfileLoading(true);
    setDebouncedHandle("");
    window.setTimeout(() => setDebouncedHandle(handle), 0);
  }

  return {
    normalizedInput,
    isDemoInput,
    matchingProfile,
    profile,
    profileLoading,
    profileError,
    setProfileError,
    requestProfileNow,
  };
}
