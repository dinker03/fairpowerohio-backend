import { LineChart, Search, Bell, TrendingUp } from 'lucide-react';

export function Features() {
  const features = [
    {
      icon: LineChart,
      title: 'Historical Trends',
      description: 'Analyze energy pricing trends over time with interactive charts. See how rates have changed across different utilities and suppliers since 2022.',
      gradient: 'from-purple-500 to-indigo-500'
    },
    {
      icon: Search,
      title: 'Compare Suppliers',
      description: 'Browse and compare rates from 50+ energy suppliers across Ohio. Filter by utility type, plan duration, and pricing structure to find your best match.',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: Bell,
      title: 'Live Rate Updates',
      description: 'Stay informed with real-time rate updates from Energy Choice Ohio. Monitor daily changes and catch the best deals as they become available.',
      gradient: 'from-pink-500 to-rose-500'
    },
    {
      icon: TrendingUp,
      title: 'Market Analytics',
      description: 'Dive deep into market analytics with our advanced explorer. Visualize pricing by supplier, utility, and rate type with powerful filtering tools.',
      gradient: 'from-green-500 to-emerald-500'
    }
  ];

  return (
    <div className="bg-gray-50 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl mb-4 text-gray-900">
            Everything You Need to Track Energy Rates
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Powerful tools and comprehensive data to help you understand and navigate Ohio's energy market
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-shadow">
              <div className={`inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br ${feature.gradient} rounded-xl mb-6`}>
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl mb-4 text-gray-900">
                {feature.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
