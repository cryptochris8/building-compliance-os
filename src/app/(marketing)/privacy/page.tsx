import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Building Compliance OS",
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: March 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-semibold mt-8 mb-4">1. Information We Collect</h2>
          <p className="text-muted-foreground">
            We collect information you provide when creating an account, including your name, email address, and organization details.
            We also collect building data, utility consumption readings, and compliance information you enter into the platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-4">2. How We Use Your Information</h2>
          <p className="text-muted-foreground">
            We use your information to provide and improve our building compliance tracking services, calculate emissions,
            generate compliance reports, and communicate with you about your account and our services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-4">3. Data Storage and Security</h2>
          <p className="text-muted-foreground">
            Your data is stored securely using industry-standard encryption. We use Supabase for database hosting with
            row-level security policies. Sensitive credentials are encrypted using AES-256-GCM.
            We do not sell your personal data or building information to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-4">4. Data Sharing</h2>
          <p className="text-muted-foreground">
            We do not share your personal information or building data with third parties except as necessary to provide
            our services (e.g., payment processing through Stripe) or as required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-4">5. Your Rights</h2>
          <p className="text-muted-foreground">
            You may request access to, correction of, or deletion of your personal data at any time by contacting us.
            You may also export your building and compliance data through the platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-4">6. Cookies</h2>
          <p className="text-muted-foreground">
            We use essential cookies for authentication and session management. We do not use tracking or advertising cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-4">7. Contact</h2>
          <p className="text-muted-foreground">
            For privacy-related questions, please contact us at privacy@buildingcomplianceos.com.
          </p>
        </section>
      </div>
    </div>
  );
}
