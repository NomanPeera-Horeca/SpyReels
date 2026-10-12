/** Shape returned by `blog.bySlug` / `blog.published` for the public article page. */
export type PublicBlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  status: "draft" | "published";
  publishedAt: string | Date | null;
  updatedAt: string | Date | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  noIndex: boolean;
};

export type BlogTocItem = {
  id: string;
  /** Full heading text from the article. */
  text: string;
  /** Short TOC label (≤30 chars), used in the nav. */
  label: string;
  level: 2 | 3;
};

export type BlogFaqItem = {
  question: string;
  answer: string;
};
