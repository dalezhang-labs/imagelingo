const faqs = [
  {
    q: "What does ImageLingo do?",
    a: "ImageLingo uses AI to detect and translate text embedded in your product images. You submit an image URL or upload an image, choose target languages, and the app returns translated versions of the image with the original layout preserved.",
  },
  {
    q: "Which languages are supported?",
    a: "Currently supported target languages: English (US), Japanese, Korean, French, German, and Spanish. More languages will be added in future updates.",
  },
  {
    q: "How do I translate an image?",
    a: "Go to the Translate page, paste your product image URL or drag-and-drop an image file, select one or more target languages, then click the Translate button. Results will appear once the job is complete (usually within 30–60 seconds).",
  },
  {
    q: "Can I translate multiple images at once?",
    a: "Yes. On the Translate page, click '+ Add another URL' to add multiple image URLs, or drag-and-drop multiple files at once. All images will be submitted as a batch job.",
  },
  {
    q: "Where can I find my past translations?",
    a: "All translation jobs are saved in the History page. You can view results, download translated images, and retry any failed jobs from there.",
  },
  {
    q: "What are the plan limits?",
    a: "The Free plan includes 5 image translations per month. Paid plans: Basic ($9/mo, 200 images), Pro ($29/mo, 1,000 images), Business ($59/mo, unlimited). Limits reset at the start of each calendar month.",
  },
  {
    q: "What happens when I reach my monthly limit?",
    a: "You will see a warning banner when you are close to your limit. Once the limit is reached, new translation requests will be blocked until the next month or until you upgrade your plan.",
  },
  {
    q: "How do I upgrade my plan?",
    a: "Go to the Dashboard page and click 'Upgrade Plan'. Payment integration is currently in progress — please contact us at dalezhang2020@qq.com to arrange an upgrade manually.",
  },
  {
    q: "Is my store data safe?",
    a: "Yes. We only store your store handle and OAuth session token to authenticate API requests. We do not store buyer personal data, and we comply with GDPR requirements. See our Privacy Policy for full details.",
  },
  {
    q: "What happens to my data when I uninstall the app?",
    a: "When you uninstall ImageLingo, your store session is deleted automatically. You can also contact us to request full deletion of all associated data.",
  },
  {
    q: "My translation job failed. What should I do?",
    a: "Go to the History page, find the failed job, and click the 'Retry' button. If the problem persists, please contact us with the job ID and we will investigate.",
  },
  {
    q: "How do I contact support?",
    a: "Email us at dalezhang2020@qq.com. We aim to respond within 48 hours.",
  },
];

export default function Faq() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Frequently Asked Questions</h1>
        <p className="text-gray-500 text-sm mb-10">Everything you need to know about ImageLingo.</p>

        <div className="space-y-4">
          {faqs.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">{item.q}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-10">
          Still have questions?{" "}
          <a href="mailto:dalezhang2020@qq.com" className="text-indigo-600 hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}
