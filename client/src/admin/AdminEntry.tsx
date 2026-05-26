import { useAuth } from "@/_core/hooks/useAuth";
import NotFound from "@/pages/NotFound";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "./AdminLayout";
import { isAdminPanelClient } from "./isAdminClient";
import BlogStudioPage from "./pages/BlogStudioPage";
import CreatorsPage from "./pages/CreatorsPage";
import EmailsPage from "./pages/EmailsPage";
import TrafficPage from "./pages/TrafficPage";
import SeoHubPage, { type SeoHubSub } from "./pages/seo/SeoHubPage";
import UserDetailPage from "./pages/UserDetailPage";
import UsersPage from "./pages/UsersPage";
import AdminOutreach from "@/pages/AdminOutreach";

const SEO_SUBS: SeoHubSub[] = ["health", "gsc", "bing", "ai-mentions", "bots", "sitemap"];

function parseSeoSub(loc: string): "redirect" | "invalid" | SeoHubSub {
  if (loc === "/admin/seo" || loc === "/admin/seo/") return "redirect";
  const m = loc.match(/^\/admin\/seo\/([^/?#]+)\/?$/);
  if (!m) return "invalid";
  const raw = m[1];
  if (!SEO_SUBS.includes(raw as SeoHubSub)) return "invalid";
  return raw as SeoHubSub;
}

function adminTabFromPath(loc: string): string | null {
  if (loc.startsWith("/admin/traffic")) return "traffic";
  if (loc.startsWith("/admin/blogs")) return "blogs";
  if (loc.startsWith("/admin/creators")) return "creators";
  if (loc.startsWith("/admin/emails")) return "emails";
  if (loc.startsWith("/admin/users")) return "users";
  if (loc.startsWith("/admin/outreach")) return "outreach";
  if (loc.startsWith("/admin/seo")) return "seo";
  return null;
}

export default function AdminEntry() {
  const [loc, navigate] = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!isAdminPanelClient(user)) return;
    if (loc === "/admin" || loc === "/admin/") {
      navigate("/admin/traffic");
    }
  }, [loading, loc, navigate, user]);

  useEffect(() => {
    if (loading) return;
    if (!isAdminPanelClient(user)) return;
    if (!loc.startsWith("/admin/seo")) return;
    if (parseSeoSub(loc) === "redirect") {
      navigate("/admin/seo/health", { replace: true });
    }
  }, [loading, loc, navigate, user]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isAdminPanelClient(user)) {
    return <NotFound />;
  }

  if (loc === "/admin" || loc === "/admin/") {
    return null;
  }

  if (adminTabFromPath(loc) === "seo" && parseSeoSub(loc) === "redirect") {
    return null;
  }

  const tab = adminTabFromPath(loc);
  if (!tab) {
    return <NotFound />;
  }

  const userDetailMatch = loc.match(/^\/admin\/users\/(\d+)$/);
  const userDetailId = userDetailMatch ? Number(userDetailMatch[1]) : null;

  const seoParse = tab === "seo" ? parseSeoSub(loc) : null;
  if (tab === "seo" && seoParse === "invalid") {
    return <NotFound />;
  }

  const child =
    tab === "traffic" ? (
      <TrafficPage />
    ) : tab === "blogs" ? (
      <BlogStudioPage />
    ) : tab === "creators" ? (
      <CreatorsPage />
    ) : tab === "emails" ? (
      <EmailsPage />
    ) : tab === "users" ? (
      userDetailId != null && !Number.isNaN(userDetailId) ? (
        <UserDetailPage userId={userDetailId} />
      ) : (
        <UsersPage />
      )
    ) : tab === "outreach" ? (
      <AdminOutreach />
    ) : tab === "seo" && seoParse != null && seoParse !== "redirect" && seoParse !== "invalid" ? (
      <SeoHubPage activeSub={seoParse} />
    ) : null;

  return <AdminLayout activeTab={tab}>{child}</AdminLayout>;
}
