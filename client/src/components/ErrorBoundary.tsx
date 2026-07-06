import { cn } from "@/lib/utils";
import { browserTranslationContext } from "@/utils/browserTranslation";
import { AlertTriangle, RotateCcw } from "lucide-react";
import posthog from "posthog-js";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string | null }) {
    try {
      const message = error.message ?? "";
      posthog.capture("client_error_boundary", {
        error_name: error.name,
        error_message: message.slice(0, 320),
        error_stack: error.stack?.slice(0, 800) ?? null,
        component_stack: errorInfo.componentStack?.slice(0, 400) ?? null,
        likely_remove_child: message.includes("removeChild"),
        ...browserTranslationContext(),
      });
    } catch {
      // Ignore PostHog failures during crash handling.
    }
  }

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      const stack = this.state.error?.stack;

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-lg p-8 text-center">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Your work may still be saved. Reload the page to continue. If the
              problem keeps happening, contact support.
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg mb-6",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload page
            </button>

            {stack && (
              <details
                className="w-full text-left rounded-lg border border-border bg-muted/50"
                open={isDev}
              >
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground select-none">
                  Show technical details
                </summary>
                <div className="px-4 pb-4 overflow-auto max-h-64">
                  <pre className="text-xs text-muted-foreground whitespace-break-spaces">
                    {stack}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
