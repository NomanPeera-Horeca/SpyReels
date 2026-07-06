import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  buildFounderInterviewCalendlyUrl,
  DEFAULT_FOUNDER_INTERVIEW_COUNTRY_CODE,
  findFounderInterviewCountry,
  founderInterviewCountryFlag,
  FOUNDER_INTERVIEW_COUNTRIES,
  isValidFounderInterviewPhoneNational,
  normalizeFounderInterviewPhoneNational,
} from "@shared/founderInterviewCountries";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const FOUNDER_BANNER_DISMISSED_KEY = "spyreels_founder_banner_dismissed";
export const FOUNDER_BANNER_SESSION_DEFER_KEY = "spyreels_founder_banner_deferred_session";
export const FOUNDER_BANNER_MIN_SCRIPTS = 2;
export const FOUNDER_BANNER_SCHEDULE_URL =
  "https://calendly.com/noman-peera/spyreels-feedback";

type FounderInterviewBannerProps = {
  scriptsCount: number;
};

function readPermanentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FOUNDER_BANNER_DISMISSED_KEY) === "true";
}

function readSessionDeferred(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(FOUNDER_BANNER_SESSION_DEFER_KEY) === "true";
}

export function useShowFounderInterviewBanner(scriptsCount: number): boolean {
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    setEligible(
      scriptsCount >= FOUNDER_BANNER_MIN_SCRIPTS &&
        !readPermanentlyDismissed() &&
        !readSessionDeferred()
    );
  }, [scriptsCount]);

  return eligible;
}

export function FounderInterviewBanner({ scriptsCount }: FounderInterviewBannerProps) {
  const { user } = useAuth();
  const shouldOffer = useShowFounderInterviewBanner(scriptsCount);
  const [open, setOpen] = useState(false);
  const [countryCode, setCountryCode] = useState(DEFAULT_FOUNDER_INTERVIEW_COUNTRY_CODE);
  const [phoneNational, setPhoneNational] = useState("");

  const selectedCountry = useMemo(
    () => findFounderInterviewCountry(countryCode) ?? FOUNDER_INTERVIEW_COUNTRIES[0],
    [countryCode]
  );

  const normalizedPhone = useMemo(
    () => normalizeFounderInterviewPhoneNational(phoneNational),
    [phoneNational]
  );

  const phoneIsValid = isValidFounderInterviewPhoneNational(normalizedPhone);

  const submitInterestMutation = trpc.founderInterview.submitInterest.useMutation({
    onError: (error) => {
      toast.error(error.message || "Could not save your phone number. Try again.");
    },
  });

  useEffect(() => {
    if (!shouldOffer) {
      setOpen(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(timeoutId);
  }, [shouldOffer]);

  const dismissPermanently = useCallback(() => {
    window.localStorage.setItem(FOUNDER_BANNER_DISMISSED_KEY, "true");
    setOpen(false);
  }, []);

  const deferForSession = useCallback(() => {
    window.sessionStorage.setItem(FOUNDER_BANNER_SESSION_DEFER_KEY, "true");
    setOpen(false);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setOpen(true);
        return;
      }
      deferForSession();
    },
    [deferForSession]
  );

  const handleBookCall = useCallback(async () => {
    if (!phoneIsValid) {
      toast.error("Select your country code and enter a valid phone number.");
      return;
    }

    try {
      const result = await submitInterestMutation.mutateAsync({
        countryCode: selectedCountry.code,
        phoneNational: normalizedPhone,
      });

      const calendlyUrl = buildFounderInterviewCalendlyUrl({
        baseUrl: FOUNDER_BANNER_SCHEDULE_URL,
        email: user?.email,
        name: user?.name,
        phoneE164: result.phoneE164,
      });

      window.open(calendlyUrl, "_blank", "noopener,noreferrer");
      deferForSession();
    } catch {
      // Toast handled in mutation onError.
    }
  }, [
    phoneIsValid,
    submitInterestMutation,
    selectedCountry.code,
    normalizedPhone,
    user?.email,
    user?.name,
    deferForSession,
  ]);

  if (!shouldOffer && !open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Help us make SpyReels actually useful for you</DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            I&apos;m Noah Perry. My CTO and I are talking to SpyReels users about
            how you create reels and what we should improve. Book a{" "}
            <span className="font-semibold text-foreground">15-minute call</span>{" "}
            and help shape what we build next.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="founder-interview-phone">Phone number</Label>
          <div className="flex gap-2">
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger
                id="founder-interview-country"
                size="sm"
                className="w-[7.75rem] shrink-0 px-2 [&_svg:last-child]:opacity-90"
                aria-label="Country code"
              >
                <SelectValue placeholder="Code">
                  <span className="flex items-center gap-1">
                    <span aria-hidden>{founderInterviewCountryFlag(selectedCountry.code)}</span>
                    <span>{selectedCountry.dialCode}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[250] max-h-64 min-w-[14rem]">
                {FOUNDER_INTERVIEW_COUNTRIES.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    <span className="flex items-center gap-2">
                      <span aria-hidden>{founderInterviewCountryFlag(country.code)}</span>
                      <span className="font-medium">{country.dialCode}</span>
                      <span className="text-muted-foreground">{country.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="founder-interview-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              className="min-w-0 flex-1"
              placeholder="555 123 4567"
              value={phoneNational}
              onChange={(event) =>
                setPhoneNational(normalizeFounderInterviewPhoneNational(event.target.value))
              }
              aria-invalid={phoneNational.length > 0 && !phoneIsValid}
            />
          </div>
          {phoneNational.length > 0 && !phoneIsValid ? (
            <p className="text-[11px] text-destructive">
              Enter at least 6 digits.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={dismissPermanently}
            disabled={submitInterestMutation.isPending}
          >
            Not now
          </Button>
          <Button
            type="button"
            onClick={() => void handleBookCall()}
            disabled={!phoneIsValid || submitInterestMutation.isPending}
          >
            {submitInterestMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Book a 15-minute call"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
