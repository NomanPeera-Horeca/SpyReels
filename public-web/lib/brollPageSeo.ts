import { DEFAULT_OG_IMAGE } from "../../shared/defaultOgImage";
import {
  canonicalUrlForPathname,
  getStaticPublicPageSeo,
} from "../../shared/publicPageMeta";
import type { Metadata } from "next";
import { BROLL_LANDING_DESCRIPTION, BROLL_PATH } from "./brollLandingCopy";

function requireBrollSeo() {
  const seo = getStaticPublicPageSeo(BROLL_PATH);
  if (!seo) {
    throw new Error(`Missing STATIC_PUBLIC_PAGE_SEO for ${BROLL_PATH}`);
  }
  return seo;
}

export const BROLL_SEO = requireBrollSeo();
export const BROLL_CANONICAL = canonicalUrlForPathname(BROLL_PATH);

export const brollMetadata: Metadata = {
  title: BROLL_SEO.title,
  description: BROLL_SEO.description,
  alternates: { canonical: BROLL_CANONICAL },
  openGraph: {
    type: "website",
    url: BROLL_CANONICAL,
    siteName: "SpyReels",
    title: BROLL_SEO.title,
    description: BROLL_LANDING_DESCRIPTION,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: BROLL_SEO.title,
    description: BROLL_LANDING_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
};
