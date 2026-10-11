import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminPanelProcedure } from "../_core/trpc";
import { getPublishedIndexableBlogPosts, getBlogPostBySlug, getAllBlogPosts, getBlogPostById, createBlogPost, updateBlogPost, deleteBlogPost } from "../db";

export const blogRouter = router({
    // Public: list published posts
    published: publicProcedure.query(async () => {
      return getPublishedIndexableBlogPosts();
    }),

    // Public: get single post by slug
    bySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const post = await getBlogPostBySlug(input.slug);
        if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
        return post;
      }),

    // Admin: list all posts (drafts + published)
    all: adminPanelProcedure.query(async () => {
      return getAllBlogPosts();
    }),

    // Admin: get post by id for editing
    byId: adminPanelProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const post = await getBlogPostById(input.id);
        if (!post) throw new TRPCError({ code: "NOT_FOUND" });
        return post;
      }),

    // Admin: create post
    create: adminPanelProcedure
      .input(z.object({
        title: z.string().min(1).max(512),
        slug: z.string().min(1).max(512),
        excerpt: z.string().optional(),
        content: z.string().min(1),
        coverImageUrl: z.string().optional(),
        tags: z.array(z.string()).optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createBlogPost({
          ...input,
          authorId: ctx.user.id,
          publishedAt: input.status === "published" ? new Date() : undefined,
        });
        return { id };
      }),

    // Admin: update post
    update: adminPanelProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(512).optional(),
        slug: z.string().min(1).max(512).optional(),
        excerpt: z.string().optional(),
        content: z.string().optional(),
        coverImageUrl: z.string().optional(),
        tags: z.array(z.string()).optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        if (data.status === "published") {
          const existing = await getBlogPostById(id);
          if (existing && !existing.publishedAt) {
            (data as any).publishedAt = new Date();
          }
        }
        await updateBlogPost(id, data);
        return { success: true };
      }),

    // Admin: delete post
    delete: adminPanelProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteBlogPost(input.id);
        return { success: true };
      }),
});
