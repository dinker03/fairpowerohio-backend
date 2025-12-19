import { Hero } from '../components/landing/Hero';
import { Features } from '../components/landing/Features';
import { LiveRates } from '../components/landing/LiveRates';
import { Statistics } from '../components/landing/Statistics';
import { CTA } from '../components/landing/CTA';

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <Hero />
      <Statistics />
      <Features />
      <LiveRates />
      <CTA />
    </div>
  );
}
