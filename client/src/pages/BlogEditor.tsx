import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, Send, Trash2 } from "lucide-react";
import { Link } from "wouter";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function BlogEditor() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isEditing = !!slug;

  const [title, setTitle] = useState("");
  const [postSlug, setPostSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [postId, setPostId] = useState<number | null>(null);
  const [autoSlug, setAutoSlug] = useState(true);

  // Load existing post for editing
  const { data: allPosts } = trpc.blog.all.useQuery(undefined, {
    enabled: isEditing && !!user,
  });

  useEffect(() => {
    if (isEditing && allPosts) {
      const post = allPosts.find((p) => p.slug === slug);
      if (post) {
        setTitle(post.title);
        setPostSlug(post.slug);
        setExcerpt(post.excerpt || "");
        setContent(post.content);
        setCoverImageUrl(post.coverImageUrl || "");
        setTagsStr((post.tags as string[])?.join(", ") || "");
        setMetaTitle(post.metaTitle || "");
        setMetaDescription(post.metaDescription || "");
        setPostId(post.id);
        setAutoSlug(false);
      }
    }
  }, [isEditing, allPosts, slug]);

  // Auto-generate slug from title
  useEffect(() => {
    if (autoSlug && title) {
      setPostSlug(slugify(title));
    }
  }, [title, autoSlug]);

  const utils = trpc.useUtils();

  const createMutation = trpc.blog.create.useMutation({
    onSuccess: (data) => {
      toast.success("Post created!");
      utils.blog.all.invalidate();
      utils.blog.published.invalidate();
      navigate("/blog");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.blog.update.useMutation({
    onSuccess: () => {
      toast.success("Post updated!");
      utils.blog.all.invalidate();
      utils.blog.published.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.blog.delete.useMutation({
    onSuccess: () => {
      toast.success("Post deleted!");
      utils.blog.all.invalidate();
      utils.blog.published.invalidate();
      navigate("/blog");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (status: "draft" | "published") => {
    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!content.trim()) {
      toast.error("Content is required");
      return;
    }
    if (!postSlug.trim()) {
      toast.error("Slug is required");
      return;
    }

    const payload = {
      title: title.trim(),
      slug: postSlug.trim(),
      excerpt: excerpt.trim() || undefined,
      content: content.trim(),
      coverImageUrl: coverImageUrl.trim() || undefined,
      tags,
      metaTitle: metaTitle.trim() || undefined,
      metaDescription: metaDescription.trim() || undefined,
      status,
    };

    if (isEditing && postId) {
      updateMutation.mutate({ id: postId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isOwner = user?.openId === import.meta.env.VITE_OWNER_OPEN_ID || user?.role === "admin";

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Please log in to access the blog editor.</p>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">You don't have permission to access the blog editor.</p>
      </div>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/blog" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">{isEditing ? "Edit Post" : "New Post"}</h1>
        </div>
        <div className="flex items-center gap-2">
          {isEditing && postId && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Delete this post?")) {
                  deleteMutation.mutate({ id: postId });
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave("draft")}
            disabled={isSaving}
          >
            <Save className="h-4 w-4 mr-1" /> Save Draft
          </Button>
          <Button
            size="sm"
            onClick={() => handleSave("published")}
            disabled={isSaving}
          >
            <Send className="h-4 w-4 mr-1" /> Publish
          </Button>
          {isEditing && postSlug && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/blog/${postSlug}`} target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4 mr-1" /> Preview
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="How to Go Viral on Instagram Reels in 2026"
            className="text-lg"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Slug (URL)</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">/blog/</span>
            <Input
              value={postSlug}
              onChange={(e) => {
                setPostSlug(e.target.value);
                setAutoSlug(false);
              }}
              placeholder="how-to-go-viral-instagram-reels-2026"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Excerpt</label>
          <Textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="A brief summary that appears in blog listings and search results..."
            rows={2}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Content (HTML)</label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="<h2>Introduction</h2><p>Write your article content here using HTML...</p>"
            rows={20}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use HTML tags for formatting. Supports h2, h3, p, strong, a, ul, ol, li, blockquote, code, pre, img.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Cover Image URL</label>
            <Input
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://cdn.example.com/image.jpg"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Tags (comma-separated)</label>
            <Input
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="Instagram, Reels, Growth, Strategy"
            />
          </div>
        </div>

        <div className="border-t border-border/50 pt-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">SEO Settings</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Meta Title</label>
              <Input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Defaults to post title if empty"
              />
              <p className="text-xs text-muted-foreground mt-0.5">
                {(metaTitle || title).length}/60 characters
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Meta Description</label>
              <Textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="A compelling description for search engines (150-160 characters ideal)"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-0.5">
                {(metaDescription || excerpt).length}/160 characters
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
