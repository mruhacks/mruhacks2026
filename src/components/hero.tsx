import Image from "next/image";
import Link from "next/link";
import logoImage from "@/assets/logo_color_and_black.png";
import crtHero from "@/assets/crt_hero.png";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative w-full max-w-3xl mx-auto bg-white text-black flex flex-col items-center pt-4 px-4 ">
      <div className="w-full flex justify-between items-center pb-6">
        <div className="relative w-40 h-12">
          <Image 
            src={logoImage} 
            alt="MRUHacks Logo" 
            fill 
            className="object-contain object-left"
            priority 
          />
        </div>
        <Button className="rounded-full bg-black text-white hover:bg-neutral-800 px-6 py-2 h-auto font-medium">
          Register Now
        </Button>
      </div>

      {/* Badge */}
      <div className="bg-[#bdfbc0] text-[#0f5132] px-4 py-1.5 mb-4 text-sm font-dm-mono uppercase tracking-wider rounded-sm">
        Registrations are now open
      </div>

      <h1 className="text-4xl md:text-6xl font-bold text-center leading-[1.1] mb-4 tracking-tight">
        Mount Royal University&apos;s
        <br />
        Premier Hackathon.
        <br />
        Now <span className="relative inline-block">
          <span className="relative z-10">Three</span>
          <svg 
            className="absolute left-0 bottom-[-4px] w-full h-[6px] z-0" 
            viewBox="0 0 82 5" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <path 
              d="M0.107778 3.08917C15.5068 1.97995 53.2924 0.350634 81.242 2.70707" 
              stroke="#0C00FD" 
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </span> Days!
      </h1>

      <div className="text-center text-gray-500 text-lg md:text-xl mb-6 font-medium">
        <p>October 23-25, 2026</p>
        <p>In-Person Event @ Riddell Library & Learning Centre</p>
      </div>

      {/* Buttons */}
      <div className="flex flex-row gap-4 w-full justify-center items-center">
        <Button variant="gradient" size="pill">
          Register Now
        </Button>
        <Button variant="discord" size="pill">
          Join our Discord
        </Button>
      </div>

      <div className="relative w-full max-w-[350px] aspect-[4/3] overflow-hidden">
        <div className="relative z-10 w-full h-full">
             <Image 
                src={crtHero} 
                alt="MRUHacks Mascot" 
                fill
                className="object-cover object-center"
                priority
            />
        </div>
      </div>
    </section>
  );
}
