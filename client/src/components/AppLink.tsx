import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

/**
 * In-app route link with a real href so users can open in a new tab,
 * middle-click, or copy the link. Normal clicks still use client routing.
 */
export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, className, children, ...props },
  ref
) {
  return (
    <Link href={href} {...props} className={cn(className)} ref={ref}>
      {children}
    </Link>
  );
});
