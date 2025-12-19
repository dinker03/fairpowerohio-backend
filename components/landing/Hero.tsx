import { ArrowRight, Zap } from 'lucide-react';

export function Hero() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
      {/* Background decorative elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <div className="text-center">
          {/* Logo/Brand */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl">
              <Zap className="w-8 h-8 text-yellow-400" />
            </div>
            <span className="text-white text-2xl">Fair Energy Ohio</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-white text-5xl sm:text-6xl lg:text-7xl mb-6 max-w-4xl mx-auto">
            Track Ohio Energy Rates
            <span className="block mt-2 bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
              Make Informed Decisions
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-purple-200 text-lg sm:text-xl mb-12 max-w-4xl mx-auto">
            Monitor real-time electric and gas rates across Ohio utilities. 
            Compare historical pricing trends and find the best energy deals for your home or business.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href="/current-rates" className="bg-white text-purple-900 px-8 py-4 rounded-lg hover:bg-purple-50 transition-all flex items-center gap-2 shadow-xl hover:shadow-2xl transform hover:scale-105">
              View Current Rates
              <ArrowRight className="w-5 h-5" />
            </a>
            <a href="/trends" className="bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-lg hover:bg-white/20 transition-all border border-white/20">
              Explore Analytics
            </a>
          </div>

          {/* Trust Indicators */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 text-purple-300">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Live Rate Updates</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>50+ Suppliers Tracked</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Historical Data Since 2022</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom wave decoration */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path d="M0,50 C320,80 640,20 960,50 C1280,80 1440,50 1440,50 L1440,100 L0,100 Z" fill="white"/>
        </svg>
      </div>
    </div>
  );
}