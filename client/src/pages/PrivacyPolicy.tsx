import { ArrowLeft } from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <img src={LOGO_URL} alt="SpyReels" className="h-9 w-9 rounded-lg" />
              <span className="font-semibold text-lg tracking-tight">SpyReels</span>
            </Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </div>
        </div>
      </nav>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-10">Last updated: March 7, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-foreground [&_h3]:font-medium [&_h3]:mt-6 [&_h3]:mb-2 [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline">

          <section>
            <h2>1. Introduction</h2>
            <p>SpyReels ("we," "our," or "us") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, store, and share your information when you use our Service. By using SpyReels, you agree to the practices described in this policy.</p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>
            <h3>2.1 Account Information</h3>
            <p>When you create an account, we collect your name, email address, and authentication credentials through our OAuth provider. We do not store passwords directly.</p>

            <h3>2.2 Usage Data</h3>
            <p>We automatically collect information about how you use the Service, including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Features used and frequency of use (account research, transcriptions, script generations)</li>
              <li>Pages visited and time spent on the Service</li>
              <li>Device information (browser type, operating system)</li>
              <li>IP address and approximate location (country/region level)</li>
            </ul>

            <h3>2.3 Content You Create</h3>
            <p>We store scripts, notes, saved reels, and other content you create or save within the Service. This content is associated with your account and is necessary to provide the Service.</p>

            <h3>2.4 Payment Information</h3>
            <p>Payment processing is handled by Stripe. We do not store your full credit card number, CVV, or expiration date. We may store your Stripe customer ID and subscription status for billing management.</p>

            <h3>2.5 Third-Party Content</h3>
            <p>When you use our research and transcription features, we temporarily process publicly available Instagram content. This content belongs to the original creators and is processed solely to provide you with the requested analysis.</p>
          </section>

          <section>
            <h2>3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process payments and manage your subscription</li>
              <li>Send important service notifications (billing, security, feature updates)</li>
              <li>Enforce our Terms of Service and prevent abuse</li>
              <li>Analyze usage patterns to improve the product (aggregated, anonymized data)</li>
              <li>Respond to your support requests</li>
            </ul>
            <p className="mt-3"><strong>We do not sell your personal data to third parties.</strong> We do not use your content to train AI models. We do not share your data with advertisers.</p>
          </section>

          <section>
            <h2>4. Data Storage and Security</h2>
            <p>Your data is stored on secure, encrypted servers. We implement industry-standard security measures including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Encryption in transit (TLS/SSL) and at rest</li>
              <li>Secure authentication via OAuth</li>
              <li>Regular security audits and monitoring</li>
              <li>Access controls limiting employee access to user data</li>
            </ul>
            <p className="mt-3">While we take reasonable measures to protect your data, no method of transmission or storage is 100% secure. You are responsible for maintaining the security of your account credentials.</p>
          </section>

          <section>
            <h2>5. Data Retention</h2>
            <p>We retain your account data and content for as long as your account is active. Upon account deletion:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your personal data will be deleted within 30 days</li>
              <li>Your scripts, saved reels, and other content will be permanently removed</li>
              <li>Anonymized, aggregated usage data may be retained for analytics purposes</li>
              <li>Billing records may be retained as required by law (typically 7 years)</li>
            </ul>
          </section>

          <section>
            <h2>6. Third-Party Services</h2>
            <p>We use the following third-party services that may process your data:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Stripe</strong>: Payment processing. Subject to <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe's Privacy Policy</a></li>
              <li><strong>Manus OAuth</strong>: Authentication. Used for secure sign-in</li>
              <li><strong>Analytics</strong>: Anonymous usage tracking to improve the Service</li>
            </ul>
          </section>

          <section>
            <h2>7. Cookies</h2>
            <p>We use essential cookies to maintain your session and authentication state. We do not use tracking cookies for advertising purposes. Our analytics service may use cookies to collect anonymized usage data.</p>
          </section>

          <section>
            <h2>8. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the following rights:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Access</strong>: Request a copy of the personal data we hold about you</li>
              <li><strong>Correction</strong>: Request correction of inaccurate personal data</li>
              <li><strong>Deletion</strong>: Request deletion of your personal data and account</li>
              <li><strong>Export</strong>: Export your data in a machine-readable format (available via CSV/Google Sheets export)</li>
              <li><strong>Objection</strong>: Object to processing of your personal data for certain purposes</li>
              <li><strong>Restriction</strong>: Request restriction of processing in certain circumstances</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us through the in-app support channel. We will respond within 30 days.</p>
          </section>

          <section>
            <h2>9. Children's Privacy</h2>
            <p>The Service is not intended for users under the age of 18. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us and we will delete it promptly.</p>
          </section>

          <section>
            <h2>10. International Data Transfers</h2>
            <p>Your data may be processed in countries other than your own. We ensure appropriate safeguards are in place for international data transfers in compliance with applicable data protection laws.</p>
          </section>

          {/*
          <section>
            <h2>11. Chrome Extension</h2>
            <p>The SpyReels Chrome Extension operates on instagram.com to provide feed sorting, transcription, and content saving features. The extension:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Reads public Instagram page content</strong>: to detect Reels, extract engagement metrics (views, likes, comments), and display sorting controls. No private or direct message content is accessed.</li>
              <li><strong>Stores preferences locally</strong>: sort order, theme settings, and cached data are saved in your browser's local storage using the Chrome Storage API.</li>
              <li><strong>Sends data to SpyReels servers</strong>: when you use Transcribe or AI Re-Create features, the Reel URL is sent to spyreels.ai for server-side processing. No personal data, browsing history, or Instagram credentials are transmitted.</li>
              <li><strong>Does not execute remote code</strong>: the extension communicates with our API via JSON data responses only. No external JavaScript is loaded or executed.</li>
              <li><strong>Does not track browsing activity</strong>: the extension only activates on instagram.com and does not monitor activity on other websites.</li>
            </ul>
            <p className="mt-3">The extension requires the following permissions: <strong>activeTab</strong> (to read the current Instagram page), <strong>storage</strong> (to save preferences), <strong>sidePanel</strong> (to display the sorting panel), and <strong>host permissions for instagram.com</strong> (to inject overlay buttons and sorting controls).</p>
          </section>
          */}

          <section>
            <h2>11. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or in-app notification. Your continued use of the Service after changes constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2>12. Contact</h2>
            <p>If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us through the in-app support channel. We aim to respond to all privacy-related inquiries within 30 days.</p>
          </section>
        </div>
      </article>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-muted-foreground/60">
          <span>&copy; {new Date().getFullYear()} SpyReels</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
