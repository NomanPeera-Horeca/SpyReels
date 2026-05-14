import { useAuth } from "@/_core/hooks/useAuth";
import NotFound from "@/pages/NotFound";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "./AdminLayout";
import { isAdminPanelClient } from "./isAdminClient";
import BlogStudioPage from "./pages/BlogStudioPage";
import CreatorsPage from "./pages/CreatorsPage";
import EmailsPage from "./pages/EmailsPage";
import PhasePlaceholderPage from "./pages/PhasePlaceholderPage";
import TrafficPage from "./pages/TrafficPage";
import UserDetailPage from "./pages/UserDetailPage";
import UsersPage from "./pages/UsersPage";

function adminTabFromPath(loc: string): string | null {
  if (loc.startsWith("/admin/traffic")) return "traffic";
  if (loc.startsWith("/admin/blogs")) return "blogs";
  if (loc.startsWith("/admin/creators")) return "creators";
  if (loc.startsWith("/admin/emails")) return "emails";
  if (loc.startsWith("/admin/users")) return "users";
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

  const tab = adminTabFromPath(loc);
  if (!tab) {
    return <NotFound />;
  }

  const userDetailMatch = loc.match(/^\/admin\/users\/(\d+)$/);
  const userDetailId = userDetailMatch ? Number(userDetailMatch[1]) : null;

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
    ) : (
      <PhasePlaceholderPage title="SEO Hub" phase={3} />
    );

  return <AdminLayout activeTab={tab}>{child}</AdminLayout>;
}
