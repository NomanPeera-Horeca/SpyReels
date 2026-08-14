import { Link } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export type PublicBreadcrumbCrumb = {
  label: string;
  /** Omit on the current page (last item). */
  href?: string;
};

type PublicBreadcrumbProps = {
  items: PublicBreadcrumbCrumb[];
  className?: string;
  /** Overrides list text color (e.g. light chrome on dark heroes). */
  listClassName?: string;
  pageClassName?: string;
};

/**
 * Visible breadcrumbs for public marketing LPs (matches B-Roll Generator pattern).
 * Schema BreadcrumbList alone is not enough. Ship this UI on free-tool and feature pages.
 */
export function PublicBreadcrumb({
  items,
  className,
  listClassName,
  pageClassName,
}: PublicBreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className={cn("text-muted-foreground", listClassName)}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <span key={`${item.label}-${index}`} className="contents">
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage className={cn("text-foreground", pageClassName)}>
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
