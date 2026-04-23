import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Chrome, Download, ArrowRight, Eye, Mic, Bookmark,
  BarChart3, Zap, Shield, SortAsc, Sparkles, Calendar,
  Check, ArrowLeft
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

const SPYREELS_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";
const EXTENSION_ZIP = "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/reels-dashboard-extension_3c447ef3.zip";

const FEATURES = [
  {
    icon: SortAsc,
    title: "Sort Any Creator's Feed",
    description: "Instantly sort any Instagram profile's Reels by views, likes, comments, or engagement rate. Find their top-performing content in seconds.",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    icon: Mic,
    title: "Transcribe Reels Instantly",
    description: "One click to transcribe any Reel while browsing Instagram. Get the exact words, timestamps, and hooks without leaving the page.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: Bookmark,
    title: "Save to Dashboard",
    description: "Save any Reel directly to your SpyReels dashboard with one click. Build your swipe file of winning content effortlessly.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: Sparkles,
    title: "AI Script Re-Create",
    description: "Turn any Reel into your own original script right from Instagram. The AI reverse-engineers the viral formula and rewrites it in your voice.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: Calendar,
    title: "Add to Calendar",
    description: "Schedule transcribed Reels directly to your content calendar. Plan your posting schedule without switching tabs.",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
  },
  {
    icon: BarChart3,
    title: "Engagement Overlay",
    description: "See engagement rates, view counts, and performance metrics overlaid directly on Instagram. Spot winners at a glance.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
  },
];

const INSTALL_STEPS = [
  {
    step: "1",
    title: "Download the Extension",
    description: "Click the download button above to get the SpyReels extension ZIP file.",
  },
  {
    step: "2",
    title: "Unzip the File",
    description: "Extract the downloaded ZIP file to a folder on your computer.",
  },
  {
    step: "3",
    title: "Open Chrome Extensions",
    description: "Go to chrome://extensions/ in your browser and enable Developer Mode (top right).",
  },
  {
    step: "4",
    title: "Load the Extension",
    description: "Click \"Load unpacked\" and select the unzipped folder. SpyReels will appear in your toolbar.",
  },
];

const FREE_VS_PRO = [
  { feature: "Sort creator feeds", free: true, pro: true },
  { feature: "Engagement rate overlay", free: true, pro: true },
  { feature: "Save Reels to dashboard", free: true, pro: true },
  { feature: "Transcribe Reels", free: "3/day", pro: "Unlimited" },
  { feature: "AI Script Re-Create", free: false, pro: true },
  { feature: "Calendar integration", free: false, pro: true },
  { feature: "Bulk transcription", free: false, pro: true },
];

export default function Extension() {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    window.open(EXTENSION_ZIP, "_blank");
    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <img src={SPYREELS_LOGO} alt="SpyReels" className="h-8 w-8" />
            <span className="font-semibold text-lg text-foreground">SpyReels</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/pricing">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Pricing
              </Button>
            </Link>
            <Button onClick={handleDownload} size="sm" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white gap-2">
              <Chrome className="h-4 w-4" />
              Add to Chrome
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-600/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-blue-600/5 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-4 pt-20 pb-16 text-center">
          <Badge variant="outline" className="mb-6 border-purple-500/30 text-purple-400 px-4 py-1.5">
            <Chrome className="h-3.5 w-3.5 mr-1.5" />
            Chrome Extension
          </Badge>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Spy on Viral Reels
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Without Leaving Instagram
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Sort any creator's feed by engagement, transcribe Reels in one click,
            and save winning content to your dashboard, all from inside Instagram.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Button
              onClick={handleDownload}
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white gap-2.5 px-8 h-13 text-base rounded-xl shadow-lg shadow-purple-600/20"
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <Download className="h-5 w-5 animate-bounce" />
                  Downloading...
                </>
              ) : (
                <>
                  <Chrome className="h-5 w-5" />
                  Download for Chrome · Free
                </>
              )}
            </Button>
            <Link href="/">
              <Button variant="outline" size="lg" className="gap-2 h-13 text-base rounded-xl border-border/60">
                Open Web App
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <p className="text-sm text-muted-foreground/60">
            Free to use · 3 transcriptions/day · No account required for sorting
          </p>
        </div>
      </section>

      {/* Browser Mockup */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="relative rounded-2xl border border-border/40 bg-card/50 overflow-hidden shadow-2xl shadow-purple-900/10">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-card/80">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-muted/50 rounded-lg px-4 py-1 text-sm text-muted-foreground flex items-center gap-2 max-w-md w-full">
                <Shield className="h-3.5 w-3.5 text-green-500" />
                instagram.com/natgeo
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-md px-2 py-0.5 flex items-center gap-1">
                <img src={SPYREELS_LOGO} alt="" className="h-4 w-4" />
                <span className="text-xs text-white font-medium">SpyReels</span>
              </div>
            </div>
          </div>
          {/* Content mockup */}
          <div className="p-6 sm:p-10 bg-gradient-to-b from-card/30 to-background/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Sort panel mockup */}
              <div className="bg-card/80 rounded-xl border border-border/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <SortAsc className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-medium">Sort Feed</span>
                </div>
                <div className="space-y-2">
                  {["Views ↓", "Likes ↓", "Comments ↓", "Engagement ↓"].map((label) => (
                    <div key={label} className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-purple-500/10 hover:text-purple-400 transition-colors cursor-pointer">
                      {label}
                    </div>
                  ))}
                </div>
              </div>
              {/* Reel card mockup */}
              <div className="bg-card/80 rounded-xl border border-border/30 p-4">
                <div className="aspect-[9/12] rounded-lg bg-gradient-to-br from-purple-900/30 to-blue-900/30 mb-3 flex items-center justify-center">
                  <Eye className="h-8 w-8 text-purple-400/40" />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>2.4M views</span>
                  <span>8.2% ER</span>
                </div>
              </div>
              {/* Action buttons mockup */}
              <div className="bg-card/80 rounded-xl border border-border/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-medium">Quick Actions</span>
                </div>
                <div className="space-y-2">
                  {[
                    { icon: Mic, label: "Transcribe", color: "text-emerald-400" },
                    { icon: Bookmark, label: "Save to Dashboard", color: "text-blue-400" },
                    { icon: Sparkles, label: "AI Re-Create", color: "text-amber-400" },
                    { icon: Calendar, label: "Add to Calendar", color: "text-pink-400" },
                  ].map(({ icon: Icon, label, color }) => (
                    <div key={label} className="bg-muted/30 rounded-lg px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors cursor-pointer">
                      <Icon className={`h-3.5 w-3.5 ${color}`} />
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Everything You Need,{" "}
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Right Inside Instagram
            </span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            No more switching between tabs. SpyReels works directly inside Instagram
            so you can research, save, and create without breaking your flow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="bg-card/50 border-border/30 hover:border-border/60 transition-all group">
              <CardContent className="p-6">
                <div className={`${feature.bg} w-11 h-11 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`h-5 w-5 ${feature.color}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Free vs Pro */}
      <section className="max-w-3xl mx-auto px-4 pb-24">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-4">Free vs Pro</h2>
          <p className="text-muted-foreground">
            Start free with basic features. Upgrade for unlimited access.
          </p>
        </div>

        <div className="rounded-2xl border border-border/40 overflow-hidden bg-card/30">
          <div className="grid grid-cols-3 gap-0 border-b border-border/40 bg-card/50">
            <div className="p-4 text-sm font-medium text-muted-foreground">Feature</div>
            <div className="p-4 text-sm font-medium text-center">Free</div>
            <div className="p-4 text-sm font-medium text-center text-purple-400">Pro</div>
          </div>
          {FREE_VS_PRO.map((row, i) => (
            <div key={row.feature} className={`grid grid-cols-3 gap-0 ${i < FREE_VS_PRO.length - 1 ? "border-b border-border/20" : ""}`}>
              <div className="p-4 text-sm text-foreground">{row.feature}</div>
              <div className="p-4 flex justify-center items-center">
                {row.free === true ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : row.free === false ? (
                  <span className="text-muted-foreground/40">-</span>
                ) : (
                  <span className="text-sm text-muted-foreground">{row.free}</span>
                )}
              </div>
              <div className="p-4 flex justify-center items-center">
                {row.pro === true ? (
                  <Check className="h-4 w-4 text-purple-400" />
                ) : (
                  <span className="text-sm text-purple-400">{row.pro}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link href="/pricing">
            <Button variant="outline" className="gap-2 border-border/60">
              View All Plans
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* How to Install */}
      <section className="max-w-4xl mx-auto px-4 pb-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-4">Install in 60 Seconds</h2>
          <p className="text-muted-foreground text-lg">
            No Chrome Web Store needed. Install directly from this page.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {INSTALL_STEPS.map((step) => (
            <div key={step.step} className="relative">
              <div className="bg-card/50 border border-border/30 rounded-xl p-5 h-full">
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 w-8 h-8 rounded-lg flex items-center justify-center mb-4 text-white font-bold text-sm">
                  {step.step}
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-sm">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Button
            onClick={handleDownload}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white gap-2.5 px-8 h-13 text-base rounded-xl shadow-lg shadow-purple-600/20"
          >
            <Download className="h-5 w-5" />
            Download SpyReels Extension
          </Button>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 pb-24">
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          <div className="relative p-10 sm:p-14 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ready to Spy Smarter?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Join thousands of creators using SpyReels to find viral content
              and create winning scripts, directly from Instagram.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                onClick={handleDownload}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white gap-2 px-8 h-13 rounded-xl"
              >
                <Chrome className="h-5 w-5" />
                Get the Extension
              </Button>
              <Link href="/">
                <Button variant="outline" size="lg" className="gap-2 h-13 rounded-xl border-border/60">
                  Try Web App Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={SPYREELS_LOGO} alt="SpyReels" className="h-6 w-6" />
            <span className="text-sm text-muted-foreground">SpyReels</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
