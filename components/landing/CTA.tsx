import { Zap } from 'lucide-react';

export function CTA() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 py-16 sm:py-24">
      {/* Background decorative elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/2 left-1/3 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/3 w-96 h-96 bg-indigo-500 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl mb-6">
            <Zap className="w-8 h-8 text-yellow-400" />
          </div>

          <h2 className="text-4xl sm:text-5xl text-white mb-4">
            Frequently Asked Questions
          </h2>

          <p className="text-lg text-purple-200 max-w-2xl">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique.
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-purple-100">
            <div className="p-8 text-left">
              <h3 className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-2">
                Q: Where does this data come from?
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                All our data is sourced directly from the Public Utilities Commission of Ohio (PUCO) official
                &nbsp;&quot;Apples to Apples&quot; comparison. Our system updates every morning at 6:00 AM EST to
                ensure you are seeing the latest available offers.
              </p>
            </div>

            <div className="p-8 text-left">
              <h3 className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-2">
                Q: Is this service free?
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Yes, Fair Energy Ohio is 100% free to use. We do not charge fees, and we do not sell your data.
                We simply provide a cleaner, faster way to view the public rates that are already available to you.
              </p>
            </div>
          </div>

          <div className="border-t border-purple-100 grid grid-cols-1 md:grid-cols-2">
            <div className="p-8 text-left">
              <h3 className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-2">
                Q: What is the &quot;Price to Compare&quot;?
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                The &quot;Price to Compare&quot; (PTC) is the rate you are currently paying your local utility
                (like AEP Ohio or Duke Energy) for the generation of your electricity or gas. If you can find a
                supplier with a fixed rate lower than the PTC, you will save money on your bill.
              </p>
            </div>

            <div className="p-8 text-left">
              <h3 className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-2">
                Q: How do I switch suppliers?
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Once you find a rate you like in our table, simply click the &quot;Sign Up&quot; button next to the offer.
                This will take you directly to that supplier&apos;s official enrollment page. You can also use the Public
                Utilities Commission of Ohio (PUCO) official &quot;Apples to Apples&quot; table to find and select a new supplier.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}