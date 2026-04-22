# Rules of Hooks drift in `onboarding.tsx`

**Status:** Non-blocking. Works today. Will break under React Strict Mode
stricter checks and is a known hazard in future React minor/major
upgrades.

## Symptom

`client/src/pages/onboarding.tsx` declares hooks **after** conditional
early `return` statements. This violates the [Rules of
Hooks](https://react.dev/reference/rules/rules-of-hooks): hooks must be
called in the same order on every render. React 19 currently accepts
this because the conditional returns are stable within a given auth /
onboarding session, but the component is one state change away from
rendering a different hook sequence than a prior render, which is
exactly the class of bug the rule exists to prevent.

The ESLint `react-hooks/rules-of-hooks` rule does not currently surface
this (the returns happen before the offending hooks, and the rule only
flags hooks inside conditionals/loops/etc. in-place). A future upgrade
of `eslint-plugin-react-hooks` or React itself is likely to catch it.

## Where it lives

All line numbers are at HEAD of `client/src/pages/onboarding.tsx` at the
time of writing.

- **Early returns happen here:**
  - `if (loading || onboardingStateQuery.isLoading) return <Loader2 … />` —
    ~line 86
  - `if (!user) return null;` — ~line 94
  - `if (shouldBypassOnboarding) return null;` — ~line 102

- **Hooks that execute *after* those returns:**
  - `useEffect(() => { if (shouldBypassOnboarding) setLocation("/dashboard"); }, ...)`
    — ~line 96 (runs between the second and third early return — a hook
    between two `return`s is the clearest violation)
  - `useMemo(() => { … selectedCreator … }, [groupedCreators, selectedCreatorHandle, selectedNiches])`
    — ~line 110

- **Hooks that are correctly at the top (for contrast):**
  `useState`, `useAuth`, `trpc.onboarding.getState.useQuery`,
  `trpc.onboarding.complete.useMutation`,
  `trpc.onboarding.skip.useMutation`,
  `useMemo(() => shouldBypassOnboarding, …)`,
  `trpc.featured.accountsByNicheSlugs.useQuery`,
  `usePostHog`.

## Why this will eventually break

1. **Hook order identity.** React identifies hooks by *call order*. If
   the first render returns early before the `useEffect` at ~line 96
   and a subsequent render gets past the early returns, React sees a
   different hook count / order and throws:
   `Rendered more hooks than during the previous render` (or the
   converse).
2. **Strict Mode double-render.** In React 19 Strict Mode, components
   render twice during development to surface exactly this bug. The
   current flow hides it because the early-return branch keeps firing
   consistently while loading, then consistently not firing after load.
   Any change that makes `loading` toggle back to `true` after a
   successful render (e.g. a refetch that sets `isLoading: true` again,
   a new auth refresh path, or an `Suspense` boundary being introduced
   above this page) will trip the mismatch.
3. **Future React versions.** React Forget / compiler-era React is
   strict about hook order at compile time. Code like this is on the
   deprecation path — it's not a question of *if* but *when* this has
   to be cleaned up.

## Suggested fix (not in this change)

Hoist **every** hook to the top of the component, unconditionally, and
gate the *rendered output* (not the hook calls) with the early-return
conditions.

Rough sketch:

```tsx
export default function OnboardingPage() {
  // 1. ALL hooks, unconditionally, in a stable order.
  const posthog = usePostHog();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  // … other useState calls …

  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const onboardingStateQuery = trpc.onboarding.getState.useQuery(/* … */);
  const completeMutation = trpc.onboarding.complete.useMutation();
  const skipMutation = trpc.onboarding.skip.useMutation();

  const shouldBypassOnboarding = useMemo(() => { /* … */ }, [/* … */]);

  const creatorsByNicheQuery = trpc.featured.accountsByNicheSlugs.useQuery(
    { slugs: selectedNiches },
    {
      // keep the `enabled` gate so the query doesn't fire on the
      // loader / bypass branches
      enabled: Boolean(user) && !shouldBypassOnboarding && step === 2 && selectedNiches.length > 0,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    }
  );

  const groupedCreators = creatorsByNicheQuery.data?.groups ?? {};
  const selectedCreator = useMemo(() => { /* … */ }, [/* … */]);

  useEffect(() => {
    if (shouldBypassOnboarding) setLocation("/dashboard");
  }, [setLocation, shouldBypassOnboarding]);

  // 2. Now — and only now — early-return on rendered UI.
  if (loading || onboardingStateQuery.isLoading) {
    return <FullPageLoader />;
  }
  if (!user) return null;
  if (shouldBypassOnboarding) return null;

  // 3. Normal render path.
  return (/* … */);
}
```

Key points:

- The `useEffect` that redirects on bypass stays in the hook list and
  just short-circuits when `shouldBypassOnboarding` is false. This is
  the pattern `Home.tsx` already uses.
- Queries get an `enabled` gate that includes the "don't run on the
  loader / bypass branches" conditions, so this doesn't accidentally
  increase network traffic.
- `selectedCreator`'s `useMemo` runs every render; that's fine — it's
  cheap and already memoized.

## Non-blocking for current work

- Section 3–8 work ships with this drift in place because it was
  pre-existing and fixing it correctly touches the whole component.
- Priority is **low-to-medium**: no user-facing bug today, but the blast
  radius if it trips in production is a white-screen onboarding page.
- Recommended pickup point: before the next real feature change in
  `onboarding.tsx` (e.g. a step 3, a redesign, or a bypass-rule change).
