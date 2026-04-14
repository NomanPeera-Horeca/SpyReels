<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the SpyReels dashboard. Here is a summary of what was done:

- **Installed** `posthog-js` and `@posthog/react` packages
- **Initialized** PostHog in `client/src/main.tsx` using `VITE_PUBLIC_POSTHOG_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` environment variables, wrapping the app with `PostHogProvider`
- **User identification**: In `DashboardLayout.tsx`, `posthog.identify()` is called whenever a user session is detected, associating all events with the logged-in user's ID, email, and name. `posthog.reset()` is called on logout to unlink the session.
- **Event tracking**: 11 custom events added across 6 files covering key user actions in the research, idea, script, and billing flows.

| Event | Description | File |
|---|---|---|
| `research_started` | User started a new Instagram account research/scrape job | `client/src/pages/Home.tsx` |
| `idea_submitted` | User submitted a new idea to the Idea to Script pipeline | `client/src/pages/IdeaToScript.tsx` |
| `idea_approved` | User approved an AI-validated idea for script generation | `client/src/pages/IdeaToScript.tsx` |
| `idea_rejected` | User rejected an AI-validated idea | `client/src/pages/IdeaToScript.tsx` |
| `idea_saved_to_scripts` | User saved a completed AI-generated script to My Scripts | `client/src/pages/IdeaToScript.tsx` |
| `plan_checkout_initiated` | User clicked to initiate a paid plan checkout | `client/src/pages/Pricing.tsx` |
| `reel_transcribed` | User triggered transcription of a collected reel | `client/src/pages/CollectedReels.tsx` |
| `reel_added_by_url` | User added a reel to their collection by pasting a URL | `client/src/pages/CollectedReels.tsx` |
| `telegram_connect_initiated` | User initiated Telegram bot connection | `client/src/pages/Settings.tsx` |
| `script_saved` | User manually saved a script in the script editor | `client/src/pages/ScriptEditor.tsx` |
| `user_signed_out` | User signed out of the app | `client/src/components/DashboardLayout.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/381070/dashboard/1463595
- **Research Jobs Started (Daily)**: https://us.posthog.com/project/381070/insights/xKtvRo7Q
- **Idea Pipeline Funnel** (idea submitted → approved → saved): https://us.posthog.com/project/381070/insights/LHBARvv8
- **Plan Checkout Initiated by Plan**: https://us.posthog.com/project/381070/insights/NJSGCw4H
- **Reel Transcriptions (Daily)**: https://us.posthog.com/project/381070/insights/AmtQRiXk
- **Script Saves & Signouts (Retention vs Churn)**: https://us.posthog.com/project/381070/insights/saGqvBbN

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-react-vite/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
