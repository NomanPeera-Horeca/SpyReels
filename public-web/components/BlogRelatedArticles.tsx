import { DEFAULT_OG_IMAGE } from "../../shared/defaultOgImage";
import { formatBlogDate } from "../lib/blog/seo";
import type { PublicBlogPost } from "../lib/blog/types";
import styles from "./BlogRelatedArticles.module.css";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function BlogRelatedArticles({ posts }: { posts: readonly PublicBlogPost[] }) {
  if (posts.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="related-articles-heading">
      <div className={styles.shell}>
        <h2 id="related-articles-heading" className={cx("sr-text-marketing-heading-2", styles.heading)}>
          Related articles
        </h2>
        <div className={styles.grid}>
          {posts.map((post) => (
            <a key={post.slug} href={`/blog/${post.slug}`} className={styles.card}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.image}
                src={post.coverImageUrl || DEFAULT_OG_IMAGE}
                alt=""
              />
              <h3 className={cx("sr-text-marketing-title-medium", styles.title)}>{post.title}</h3>
              {post.excerpt ? (
                <p className={cx("sr-text-marketing-body-small", styles.excerpt)}>{post.excerpt}</p>
              ) : null}
              {post.publishedAt ? (
                <p className={cx("sr-text-marketing-caption", styles.date)}>
                  {formatBlogDate(post.publishedAt)}
                </p>
              ) : null}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
