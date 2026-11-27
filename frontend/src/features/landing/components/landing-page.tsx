import { LandingNav } from './landing-nav';
import { LandingHero } from './landing-hero';
import { ProductTour } from './product-tour';
import { TemplateSection } from './template-section';
import { SecuritySection } from './security-section';
import { LandingFaq } from './landing-faq';
import { LandingFooter } from './landing-footer';

/** P-51: el acceso a la demo conserva su endpoint y su navegación completa. */
export function LandingPage() {
  return <div data-landing className="grain min-h-dvh bg-bg">
    <LandingNav />
    <main id="contenido">
      <LandingHero />
      <ProductTour />
      <TemplateSection />
      <SecuritySection />
      <LandingFaq />
    </main>
    <LandingFooter />
  </div>;
}
