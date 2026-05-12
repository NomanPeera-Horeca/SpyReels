import { ArrowLeft } from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";
import { Link } from "wouter";

export default function TermsOfService() {
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
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-10">Last updated: March 7, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-foreground [&_h3]:font-medium [&_h3]:mt-6 [&_h3]:mb-2 [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline">

          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>By accessing or using SpyReels ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service. We reserve the right to update these Terms at any time, and your continued use of the Service constitutes acceptance of any changes.</p>
          </section>

          <section>
            <h2>2. Description of Service</h2>
            <p>SpyReels is a software-as-a-service (SaaS) platform that provides tools for analyzing publicly available Instagram Reels content, including collecting and analyzing public profile data, transcribing audio content, generating AI-powered scripts, and managing content workflows. The Service does not require or access your Instagram login credentials.</p>
          </section>

          <section>
            <h2>3. Account Registration</h2>
            <p>To use the Service, you must create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must provide accurate and complete information during registration. You must be at least 18 years old to use the Service.</p>
          </section>

          <section>
            <h2>4. Subscription Plans and Billing</h2>
            <h3>4.1 Free Plan</h3>
            <p>The Free plan provides limited access to the Service at no cost. Free plan features and limits may change at any time.</p>

            <h3>4.2 Paid Plans</h3>
            <p>Paid subscriptions are billed in advance on a monthly or annual basis. By subscribing to a paid plan, you authorize us to charge your payment method on a recurring basis until you cancel. All prices are in USD unless otherwise stated.</p>

            <h3>4.3 Automatic Renewal</h3>
            <p><strong>All paid subscriptions automatically renew</strong> at the end of each billing period unless you cancel before the renewal date. You will be charged the then-current rate for your plan at renewal.</p>

            <h3>4.4 Price Changes</h3>
            <p>We may change subscription prices with 30 days' advance notice. Price changes will take effect at the start of your next billing cycle after the notice period.</p>
          </section>

          <section>
            <h2>5. Refund and Cancellation Policy</h2>
            <h3>5.1 14-Day Money-Back Guarantee</h3>
            <p>New paid subscribers may request a full refund within 14 days of their initial subscription purchase. This guarantee applies only to the first subscription period and does not apply to renewals, upgrades, or additional purchases.</p>

            <h3>5.2 Cancellation</h3>
            <p>You may cancel your subscription at any time through your Billing page. Upon cancellation, you will retain access to paid features until the end of your current billing period. <strong>No partial refunds are provided for unused time within a billing period.</strong></p>

            <h3>5.3 Refund Eligibility</h3>
            <p>Refunds beyond the 14-day guarantee are issued solely at our discretion. Refunds will <strong>not</strong> be issued in the following circumstances:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>You have substantially used the Service during the billing period (including but not limited to: researching profiles, transcribing reels, generating scripts, or exporting data)</li>
              <li>You violated these Terms of Service</li>
              <li>You are requesting a refund for a renewal charge after failing to cancel before the renewal date</li>
              <li>More than 14 days have passed since the charge</li>
            </ul>

            <h3>5.4 Chargebacks and Disputes</h3>
            <p><strong>If you file a chargeback or payment dispute with your bank or payment provider instead of contacting us directly, the following will apply:</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your account will be <strong>immediately suspended</strong> pending resolution of the dispute</li>
              <li>All access to the Service, including saved data, scripts, and exports, will be revoked</li>
              <li>We will provide your payment provider with evidence of service delivery, including usage logs, account activity, and acceptance of these Terms</li>
              <li>If the chargeback is resolved in our favor, a <strong>$25 administrative fee</strong> may be applied to your account before reactivation</li>
              <li>Accounts with multiple chargeback attempts will be <strong>permanently banned</strong></li>
            </ul>
            <p className="mt-4"><strong>We strongly encourage you to contact us directly at support before initiating a chargeback.</strong> We are committed to resolving billing issues quickly and fairly. In most cases, we can resolve concerns faster than the chargeback process.</p>
          </section>

          <section>
            <h2>6. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
              <li>Attempt to reverse-engineer, decompile, or disassemble the Service</li>
              <li>Share your account credentials with third parties or allow unauthorized access</li>
              <li>Use automated tools to access the Service beyond the provided API (if applicable)</li>
              <li>Resell, redistribute, or sublicense access to the Service without written permission</li>
              <li>Use the Service to harass, stalk, or harm any individual</li>
              <li>Circumvent or attempt to circumvent usage limits, rate limits, or access controls</li>
              <li>Use the Service in a way that could damage, disable, or impair the Service</li>
            </ul>
          </section>

          <section>
            <h2>7. Intellectual Property</h2>
            <h3>7.1 Our Property</h3>
            <p>The Service, including its design, code, features, and documentation, is owned by SpyReels and protected by intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the Service for its intended purpose.</p>

            <h3>7.2 Your Content</h3>
            <p>You retain ownership of scripts, notes, and other content you create using the Service. However, you grant us a limited license to store and process your content as necessary to provide the Service.</p>

            <h3>7.3 Third-Party Content</h3>
            <p>Content collected or transcribed from Instagram belongs to the original creators. You are responsible for ensuring your use of such content complies with applicable copyright laws and Instagram's terms of service. We do not claim ownership of third-party content processed through the Service.</p>
          </section>

          <section>
            <h2>8. Data and Privacy</h2>
            <p>Your use of the Service is also governed by our <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>. By using the Service, you consent to the collection and use of information as described in the Privacy Policy.</p>
          </section>

          <section>
            <h2>9. Service Availability and Modifications</h2>
            <p>We strive to maintain high availability but do not guarantee uninterrupted access to the Service. We may modify, suspend, or discontinue any part of the Service at any time. We will provide reasonable notice before discontinuing core features.</p>
          </section>

          <section>
            <h2>10. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, SpyReels and its team shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising from your use of the Service. Our total liability for any claim shall not exceed the amount you paid for the Service in the 12 months preceding the claim.</p>
          </section>

          <section>
            <h2>11. Disclaimer of Warranties</h2>
            <p>The Service is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Service will be error-free, secure, or meet your specific requirements. AI-generated scripts are provided as creative suggestions and should be reviewed before use.</p>
          </section>

          <section>
            <h2>12. Termination</h2>
            <p>We may suspend or terminate your account at any time for violation of these Terms, fraudulent activity, or abuse of the Service. Upon termination, your right to use the Service ceases immediately. Sections regarding intellectual property, limitation of liability, and dispute resolution survive termination.</p>
          </section>

          <section>
            <h2>13. Dispute Resolution</h2>
            <p>Any disputes arising from these Terms or your use of the Service shall first be attempted to be resolved through good-faith negotiation. If negotiation fails, disputes shall be resolved through binding arbitration in accordance with applicable arbitration rules. You agree to waive any right to participate in a class action lawsuit or class-wide arbitration.</p>
          </section>

          <section>
            <h2>14. Contact</h2>
            <p>If you have questions about these Terms, billing issues, or need to request a refund, please contact us through the in-app support channel or email. We aim to respond to all inquiries within 48 hours.</p>
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
