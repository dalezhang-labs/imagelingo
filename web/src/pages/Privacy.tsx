export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: April 2025</p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">1. Overview</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            ImageLingo ("we", "our", or "us") is a SHOPLINE app that provides AI-powered product image
            translation services. This Privacy Policy explains how we collect, use, and protect information
            when you install and use our app through the SHOPLINE platform.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">2. Information We Collect</h2>
          <ul className="text-gray-600 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>
              <strong>Store information:</strong> Your SHOPLINE store handle and OAuth access token,
              used solely to authenticate API requests on your behalf.
            </li>
            <li>
              <strong>Image URLs:</strong> Product image URLs you submit for translation. These are
              processed by our AI service and not stored permanently after the job completes.
            </li>
            <li>
              <strong>Usage data:</strong> Monthly translation counts per store, used to enforce plan
              quotas and display your usage dashboard.
            </li>
            <li>
              <strong>Translation job records:</strong> Job status, target languages, and result image
              URLs, retained in your translation history for your reference.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">3. How We Use Your Information</h2>
          <ul className="text-gray-600 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>To authenticate your store and process translation requests via SHOPLINE APIs.</li>
            <li>To track usage against your subscription plan limits.</li>
            <li>To display your translation history within the app.</li>
            <li>We do not sell, share, or transfer your data to third parties for marketing purposes.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">4. Data Storage & Retention</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Store credentials and usage data are stored in a secure database. Translation job records
            are retained for up to 90 days. You may request deletion of your data at any time by
            contacting us. When you uninstall the app, your store session data is deleted automatically
            via SHOPLINE's uninstall webhook.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">5. GDPR Compliance</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            We comply with GDPR requirements for all users regardless of location. We respond to
            SHOPLINE's mandatory GDPR webhooks for customer data requests, customer data erasure,
            and merchant data erasure. We do not store end-customer (buyer) personal data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">6. Third-Party Services</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            We use third-party AI translation APIs to process image content. Image data is transmitted
            to these services solely for the purpose of translation and is not retained by them beyond
            the processing request.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">7. Your Rights</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            You have the right to access, correct, or delete your data at any time. To exercise these
            rights or ask any privacy-related questions, please contact us at the email below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">8. Contact</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            If you have any questions about this Privacy Policy, please contact us at:{" "}
            <a href="mailto:dalezhang2020@qq.com" className="text-indigo-600 hover:underline">
              dalezhang2020@qq.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
