import { useCallback } from "react";
import { useLocation } from "wouter";
import { navigateAppBack } from "@shared/appNavigation";

export function useAppBack(fallback: string) {
  const [, setLocation] = useLocation();
  return useCallback(() => {
    navigateAppBack(setLocation, fallback);
  }, [fallback, setLocation]);
}
