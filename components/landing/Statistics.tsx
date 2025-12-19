import { TrendingDown, Users, Lightbulb, BarChart3 } from 'lucide-react';

export function Statistics() {
  const stats = [
    {
      icon: TrendingDown,
      value: '7.2¢',
      label: 'Average Rate',
      sublabel: 'per kWh',
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      icon: Users,
      value: '50+',
      label: 'Energy Suppliers',
      sublabel: 'tracked daily',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      icon: Lightbulb,
      value: '2',
      label: 'Utility Types',
      sublabel: 'Electric & Gas',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50'
    },
    {
      icon: BarChart3,
      value: '3+',
      label: 'Years of Data',
      sublabel: 'historical trends',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {stats.map((stat, index) => (
          <div key={index} className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 ${stat.bgColor} rounded-2xl mb-4`}>
              <stat.icon className={`w-8 h-8 ${stat.color}`} />
            </div>
            <div className={`text-4xl mb-2 ${stat.color}`}>
              {stat.value}
            </div>
            <div className="text-gray-900 mb-1">
              {stat.label}
            </div>
            <div className="text-gray-500 text-sm">
              {stat.sublabel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
