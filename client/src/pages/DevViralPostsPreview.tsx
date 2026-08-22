/**
 * THROWAWAY: local visual proof for Viral Posts without auth.
 * Product path is /viral-posts inside DashboardLayout (requires login).
 */
import ViralPosts from "@/pages/ViralPosts";

export default function DevViralPostsPreview() {
  return (
    <div className="min-h-screen bg-[#08070d] text-[#f6f4fb]" data-testid="dev-viral-posts">
      <div className="border-b border-[#2b2739] bg-[#111019] px-4 py-3 text-sm text-[#a9a4b8]">
        <strong className="text-[#f6f4fb]">Local Viral Posts preview</strong>
        <span className="ml-2">
          Auth-free. Logged-in product path is{" "}
          <code className="text-[#ddceff]">/viral-posts</code>.
        </span>
      </div>
      <ViralPosts />
    </div>
  );
}
