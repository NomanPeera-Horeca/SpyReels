import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  DollarSign,
  TrendingUp,
  UserPlus,
  Activity,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Shield,
  AlertTriangle,
  XCircle,
  CheckCircle,
} from "lucide-react";

function StatCard({ title, value, subtitle, icon: Icon, color }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function RetentionBadge({ status }: { status: string }) {
  if (status === "active") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
      <CheckCircle className="w-3 h-3" /> Active
    </span>
  );
  if (status === "at_risk") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-400">
      <AlertTriangle className="w-3 h-3" /> At Risk
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">
      <XCircle className="w-3 h-3" /> Churned
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    free: "bg-zinc-500/20 text-zinc-400",
    starter: "bg-blue-500/20 text-blue-400",
    pro: "bg-purple-500/20 text-purple-400",
    business: "bg-amber-500/20 text-amber-400",
    agency: "bg-emerald-500/20 text-emerald-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[plan] || colors.free}`}>
      {plan.charAt(0).toUpperCase() + plan.slice(1)}
    </span>
  );
}

function UserDetailDialog({ userId, open, onClose }: { userId: number | null; open: boolean; onClose: () => void }) {
  const { data, isLoading } = trpc.admin.userDetail.useQuery(
    { userId: userId! },
    { enabled: !!userId && open }
  );

  if (!userId) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* User Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <p className="font-medium">{data.user.name || "Unknown"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <p className="font-medium">{data.user.email || "No email"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Login Method</label>
                <p className="font-medium">{data.user.loginMethod || "unknown"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Role</label>
                <p className="font-medium">{data.user.role}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Signed Up</label>
                <p className="font-medium">{new Date(data.user.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Last Active</label>
                <p className="font-medium">{new Date(data.user.lastSignedIn).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Subscription */}
            {data.subscription && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Subscription</h3>
                <div className="grid grid-cols-3 gap-4 bg-muted/30 rounded-lg p-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Plan</label>
                    <p><PlanBadge plan={data.subscription.plan} /></p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Status</label>
                    <p className="font-medium">{data.subscription.status}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Billing</label>
                    <p className="font-medium">{data.subscription.billingInterval || "monthly"}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Usage History */}
            {data.usageHistory && data.usageHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Monthly Usage</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-muted-foreground font-medium">Month</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Scrapes</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Transcribe</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Recreate</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Rewrite</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Search</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.usageHistory.map((u: any) => (
                        <tr key={u.usageMonth} className="border-b border-border/50">
                          <td className="py-2">{u.usageMonth}</td>
                          <td className="text-right py-2">{u.scrapeCount}</td>
                          <td className="text-right py-2">{u.transcribeCount}</td>
                          <td className="text-right py-2">{u.recreateCount}</td>
                          <td className="text-right py-2">{u.rewriteCount}</td>
                          <td className="text-right py-2">{u.searchCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent Scripts */}
            {data.recentScripts && data.recentScripts.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Recent Scripts</h3>
                <div className="space-y-2">
                  {data.recentScripts.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-2 px-3">
                      <span className="text-sm truncate max-w-[300px]">{s.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{s.status}</span>
                        <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Scrape Jobs */}
            {data.recentJobs && data.recentJobs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Recent Research Jobs</h3>
                <div className="space-y-2">
                  {data.recentJobs.map((j: any) => (
                    <div key={j.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-2 px-3">
                      <span className="text-sm font-medium">@{j.handle}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{j.totalReels} reels</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${j.status === "completed" ? "bg-green-500/20 text-green-400" : j.status === "failed" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>{j.status}</span>
                        <span className="text-xs text-muted-foreground">{new Date(j.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">User not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "lastSignedIn" | "name">("createdAt");
  const [page, setPage] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const limit = 20;

  const overview = trpc.admin.overview.useQuery();
  const usersList = trpc.admin.users.useQuery({
    search: search || undefined,
    plan: planFilter !== "all" ? planFilter : undefined,
    sortBy,
    sortOrder: "desc",
    limit,
    offset: page * limit,
  });

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Admin Access Required</h2>
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-purple-500" /> Admin Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">User analytics, retention, and activity overview</p>
      </div>

      {/* Overview Cards */}
      {overview.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Users" value={overview.data.totalUsers} icon={Users} color="bg-blue-500/20 text-blue-400" />
          <StatCard title="Paid Users" value={overview.data.paidUsers} subtitle={`${overview.data.freeUsers} free`} icon={DollarSign} color="bg-green-500/20 text-green-400" />
          <StatCard title="MRR" value={`$${overview.data.mrr}`} icon={TrendingUp} color="bg-purple-500/20 text-purple-400" />
          <StatCard title="New This Week" value={overview.data.newThisWeek} icon={UserPlus} color="bg-amber-500/20 text-amber-400" />
          <StatCard title="Active Today" value={overview.data.activeToday} icon={Activity} color="bg-cyan-500/20 text-cyan-400" />
          <StatCard title="Active This Week" value={overview.data.activeThisWeek} icon={Activity} color="bg-indigo-500/20 text-indigo-400" />
          <StatCard title="Active This Month" value={overview.data.activeThisMonth} icon={Activity} color="bg-teal-500/20 text-teal-400" />
          <StatCard title="Conversion Rate" value={overview.data.totalUsers > 0 ? `${Math.round((overview.data.paidUsers / overview.data.totalUsers) * 100)}%` : "0%"} subtitle="Paid / Total" icon={TrendingUp} color="bg-rose-500/20 text-rose-400" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="agency">Agency</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Signup Date</SelectItem>
            <SelectItem value="lastSignedIn">Last Active</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">User</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Plan</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Scripts</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Scrapes</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Collected</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last Active</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Signed Up</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersList.isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto" />
                  </td>
                </tr>
              ) : usersList.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">No users found</td>
                </tr>
              ) : (
                usersList.data?.items.map((u) => (
                  <tr key={u.id} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4"><PlanBadge plan={u.plan} /></td>
                    <td className="py-3 px-4"><RetentionBadge status={u.retentionStatus} /></td>
                    <td className="text-right py-3 px-4">{u.scriptsCreated}</td>
                    <td className="text-right py-3 px-4">{u.scrapeJobsRun}</td>
                    <td className="text-right py-3 px-4">{u.reelsCollected}</td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="text-sm">{new Date(u.lastSignedIn).toLocaleDateString()}</p>
                        <p className="text-xs text-muted-foreground">{u.daysSinceActive === 0 ? "Today" : `${u.daysSinceActive}d ago`}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSelectedUserId(u.id); setDetailOpen(true); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {usersList.data && usersList.data.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <span className="text-sm text-muted-foreground">
              Showing {page * limit + 1}-{Math.min((page + 1) * limit, usersList.data.total)} of {usersList.data.total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * limit >= usersList.data.total} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Dialog */}
      <UserDetailDialog userId={selectedUserId} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  );
}
