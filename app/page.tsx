"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RegradingTab } from "@/components/re-grading";
import { UncodingTab } from "@/components/uncoding";
import { GraduationCap } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header with distinctive academic styling */}
        <div className="mb-12 text-center space-y-4 relative">
          <div className="absolute inset-0 -z-10 opacity-5">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-primary rounded-full blur-3xl" />
            <div className="absolute top-0 right-1/4 w-64 h-64 bg-accent rounded-full blur-3xl" />
          </div>

          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-serif font-bold text-primary tracking-tight">
            Department of Mathematics
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            King Fahd University of Petroleum & Minerals
          </p>
          <div className="h-px w-32 bg-gradient-to-r from-transparent via-primary/50 to-transparent mx-auto my-6" />
          <h2 className="text-xl md:text-2xl font-medium text-foreground/90">
            MCQ-Based Exam Re-grading and Item Analysis Tool
          </h2>
        </div>

        {/* Main content with tabs */}
        <div className="backdrop-blur-sm bg-white/50 rounded-2xl shadow-xl border border-white/60 p-8">
          <Tabs defaultValue="regrading" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
              <TabsTrigger value="regrading" className="text-base">
                Re-grading
              </TabsTrigger>
              <TabsTrigger value="uncoding" className="text-base">
                Uncoding
              </TabsTrigger>
            </TabsList>

            <TabsContent value="regrading" className="mt-6">
              <RegradingTab />
            </TabsContent>

            <TabsContent value="uncoding" className="mt-6">
              <UncodingTab />
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-2">
            <span>Developed by</span>
            <span className="font-semibold text-foreground">
              Dr. Nasir Abbas and Dr. Mohammed Alshahrani
            </span>
            <span>•</span>
            <span>Department of Mathematics, KFUPM</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
