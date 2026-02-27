import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { JourneyProvider } from "@/lib/journeyContext";
import Onboarding from "./pages/Onboarding";
import Challenges from "./pages/Challenges";
import Gallery from "./pages/Gallery";
import Summary from "./pages/Summary";
import NotFound from "./pages/NotFound";
import Crop from "./pages/Crop";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    const setAppHeight = () => {
      if (typeof window === "undefined") return;
      const height = window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    };
    setAppHeight();
    window.addEventListener("resize", setAppHeight);
    window.addEventListener("orientationchange", setAppHeight);
    return () => {
      window.removeEventListener("resize", setAppHeight);
      window.removeEventListener("orientationchange", setAppHeight);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <JourneyProvider>
            <Routes>
              <Route path="/" element={<Onboarding />} />
              <Route path="/challenges" element={<Challenges />} />
              <Route path="/crop" element={<Crop />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/summary" element={<Summary />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </JourneyProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
