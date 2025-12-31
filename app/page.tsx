"use client";

import { useState } from "react";
import { RegradingTab } from "@/components/re-grading";
import { ItemAnalysisTab } from "@/components/item-analysis";
import { GraduationCap, RefreshCw, Home as HomeIcon, LineChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type View = 'home' | 'regrading' | 'item-analysis';

export default function Home() {
  const [currentView, setCurrentView] = useState<View>('home');

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

        {/* Navigation Bar */}
        <nav className="backdrop-blur-sm bg-white/70 rounded-xl shadow-md border border-white/60 p-4 mb-6">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button
              variant={currentView === 'home' ? 'default' : 'ghost'}
              onClick={() => setCurrentView('home')}
              className="gap-2"
            >
              <HomeIcon className="h-4 w-4" />
              Home
            </Button>
            <span className="text-muted-foreground">|</span>
            <Button
              variant={currentView === 'regrading' ? 'default' : 'ghost'}
              onClick={() => setCurrentView('regrading')}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Re-grade Exams
            </Button>
            <span className="text-muted-foreground">|</span>
            <Button
              variant={currentView === 'item-analysis' ? 'default' : 'ghost'}
              onClick={() => setCurrentView('item-analysis')}
              className="gap-2"
            >
              <LineChart className="h-4 w-4" />
              Item Analysis
            </Button>
          </div>
        </nav>

        {/* Main content */}
        <div className="backdrop-blur-sm bg-white/50 rounded-2xl shadow-xl border border-white/60 p-8">
          {currentView === 'home' && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-semibold text-foreground mb-2">Choose a Tool</h3>
                <p className="text-muted-foreground">Select the functionality you need</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                {/* Re-grading Card */}
                <Card className="border-2 border-green-200 dark:border-green-800 hover:shadow-xl transition-shadow cursor-pointer group">
                  <CardHeader className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-lg group-hover:scale-110 transition-transform">
                        <RefreshCw className="h-8 w-8 text-green-600 dark:text-green-400" />
                      </div>
                      <CardTitle className="text-2xl text-green-900 dark:text-green-100">
                        Re-grade Exams
                      </CardTitle>
                    </div>
                    <CardDescription className="text-green-700 dark:text-green-300 text-base">
                      Correct answer keys and re-calculate student scores
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                        <span>Upload exam data (received from Exam center)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                        <span>Modify correct answers</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                        <span>Support for multiple correct answers per question</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                        <span>Export updated results and revised data files</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                        <span>Configurable points per question</span>
                      </li>
                    </ul>
                    <Button
                      onClick={() => setCurrentView('regrading')}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      size="lg"
                    >
                      Start Re-grading
                    </Button>
                  </CardContent>
                </Card>

                {/* Item Analysis Card */}
                <Card className="border-2 border-orange-200 dark:border-orange-800 hover:shadow-xl transition-shadow cursor-pointer group">
                  <CardHeader className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-3 bg-orange-100 dark:bg-orange-900/50 rounded-lg group-hover:scale-110 transition-transform">
                        <LineChart className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                      </div>
                      <CardTitle className="text-2xl text-orange-900 dark:text-orange-100">
                        Item Analysis
                      </CardTitle>
                    </div>
                    <CardDescription className="text-orange-700 dark:text-orange-300 text-base">
                      Comprehensive psychometric analysis, cross-version comparison, and distractor evaluation
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-orange-600 dark:text-orange-400 mt-0.5">✓</span>
                        <span>Upload exam data and item analysis file</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-orange-600 dark:text-orange-400 mt-0.5">✓</span>
                        <span>Item difficulty, discrimination, and reliability (KR-20)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-orange-600 dark:text-orange-400 mt-0.5">✓</span>
                        <span>Cross-version analysis and master question statistics</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-orange-600 dark:text-orange-400 mt-0.5">✓</span>
                        <span>Distractor analysis by performance quartiles</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-orange-600 dark:text-orange-400 mt-0.5">✓</span>
                        <span>Export detailed analytics to Excel</span>
                      </li>
                    </ul>
                    <Button
                      onClick={() => setCurrentView('item-analysis')}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                      size="lg"
                    >
                      Start Item Analysis
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {currentView === 'regrading' && (
            <div className="space-y-6">
              <RegradingTab />
            </div>
          )}

          {currentView === 'item-analysis' && (
            <div className="space-y-6">
              <ItemAnalysisTab />
            </div>
          )}
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
