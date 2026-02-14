import { Header } from "@/components/header";
import { HeroSection } from "@/components/sections/hero-section";
import { PhilosophySection } from "@/components/sections/philosophy-section";
import { TechnologySection } from "@/components/sections/technology-section";
import { MannequinSection } from "@/components/sections/mannequin-section";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <PhilosophySection />
      <TechnologySection />
      <MannequinSection />
    </main>
  );
}
