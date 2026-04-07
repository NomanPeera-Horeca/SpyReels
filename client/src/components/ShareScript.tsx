import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Share2, Mail, MessageCircle, Send, Copy, Check, Link2 } from "lucide-react";
import { toast } from "sonner";

const SPYREELS_URL = "https://spyreels.ai";
const BRAND_LINE = `\n\n---\nCreated with SpyReels — Spy on Viral Reels & Generate Winning Scripts\n${SPYREELS_URL}`;

interface ShareScriptProps {
  title: string;
  content: string;
  variant?: "button" | "icon";
  size?: "sm" | "default";
}

export function ShareScript({ title, content, variant = "icon", size = "sm" }: ShareScriptProps) {
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [copied, setCopied] = useState(false);

  const shareBody = `${title}\n\n${content}${BRAND_LINE}`;
  const shareBodyEncoded = encodeURIComponent(shareBody);
  const shareTitleEncoded = encodeURIComponent(`Script: ${title} — via SpyReels`);

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${shareBodyEncoded}`, "_blank");
  };

  const handleTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(SPYREELS_URL)}&text=${shareBodyEncoded}`, "_blank");
  };

  const handleEmailOpen = () => {
    setShowEmailDialog(true);
  };

  const handleEmailSend = () => {
    if (!emailTo.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    window.open(`mailto:${emailTo}?subject=${shareTitleEncoded}&body=${shareBodyEncoded}`, "_blank");
    setShowEmailDialog(false);
    setEmailTo("");
    toast.success("Email client opened");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareBody);
      setCopied(true);
      toast.success("Script copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === "button" ? (
            <Button variant="outline" size={size} className="gap-1.5">
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Share2 className="w-4 h-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Share script via</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleWhatsApp} className="gap-2 cursor-pointer">
            <MessageCircle className="w-4 h-4 text-green-500" />
            WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTelegram} className="gap-2 cursor-pointer">
            <Send className="w-4 h-4 text-blue-400" />
            Telegram
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleEmailOpen} className="gap-2 cursor-pointer">
            <Mail className="w-4 h-4 text-orange-400" />
            Email
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCopyLink} className="gap-2 cursor-pointer">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy to clipboard"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share via Email</DialogTitle>
            <DialogDescription>
              Enter the recipient's email address. Your default email client will open with the script pre-filled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="recipient@example.com"
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmailSend()}
            />
            <p className="text-xs text-muted-foreground">
              The script will include SpyReels branding so recipients can discover the platform.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancel</Button>
            <Button onClick={handleEmailSend} className="gap-1.5">
              <Mail className="w-4 h-4" />
              Open Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
