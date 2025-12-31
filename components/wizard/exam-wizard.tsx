'use client';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle, RotateCcw, ArrowLeft, ArrowRight, SkipForward, AlertTriangle } from 'lucide-react';
import { Stepper } from './stepper';
import { Step1UploadStudentData } from './step1-upload-student-data';
import { Step2Regrading } from './step2-regrading';
import { Step3UploadItemAnalysis } from './step3-upload-item-analysis';
import { Step4AnalysisResults } from './step4-analysis-results';
import { useWizard } from '@/contexts/wizard-context';
import { useState } from 'react';

const STEPS = [
  { number: 1, title: 'Upload Data', subtitle: 'Student answers' },
  { number: 2, title: 'Re-grade', subtitle: 'Optional' },
  { number: 3, title: 'Item Analysis', subtitle: 'Optional' },
  { number: 4, title: 'Results', subtitle: '' },
];

export function ExamWizard() {
  const { state, setCurrentStep, resetWizard } = useWizard();
  const [showSuccess, setShowSuccess] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const canGoNext = () => {
    switch (state.currentStep) {
      case 1:
        return state.studentData !== null;
      case 2:
        return true; // Always can proceed from re-grading
      case 3:
        return state.itemAnalysisData !== null;
      case 4:
        return false; // No next from final step
      default:
        return false;
    }
  };

  const canGoBack = () => {
    return state.currentStep > 1;
  };

  const handleNext = () => {
    if (state.currentStep === 2 && !state.itemAnalysisData) {
      // From Step 2, if going to Step 3
      setCurrentStep(3);
    } else if (state.currentStep < 4) {
      setCurrentStep(state.currentStep + 1);
    }
  };

  const handleBack = () => {
    if (state.currentStep > 1) {
      setCurrentStep(state.currentStep - 1);
    }
  };

  const handleSkip = () => {
    if (state.currentStep === 2) {
      // Skip re-grading, go to item analysis
      setCurrentStep(3);
    } else if (state.currentStep === 3) {
      // Skip item analysis - not really supported, but user could go back
      handleBack();
    }
  };

  const handleFinish = () => {
    setShowSuccess(true);
    setTimeout(() => {
      resetWizard();
      setShowSuccess(false);
      setCurrentStep(1);
    }, 3000);
  };

  const handleStartOver = () => {
    setShowResetDialog(true);
  };

  const confirmStartOver = () => {
    resetWizard();
    setCurrentStep(1);
    setShowResetDialog(false);
  };

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <Step1UploadStudentData />;
      case 2:
        return <Step2Regrading />;
      case 3:
        return <Step3UploadItemAnalysis />;
      case 4:
        return <Step4AnalysisResults />;
      default:
        return null;
    }
  };

  if (showSuccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Alert className="max-w-md border-green-200 bg-green-50 dark:bg-green-950/20">
          <CheckCircle className="h-6 w-6 text-green-600" />
          <AlertTitle className="text-lg text-green-900 dark:text-green-100">Success!</AlertTitle>
          <AlertDescription className="text-green-800 dark:text-green-200">
            Your re-grading has been completed. Starting over...
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with Start Over button */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">KFUPM Exam Grading Tool</h1>
        <Button
          variant="outline"
          onClick={handleStartOver}
          className="text-red-600 border-red-300 hover:bg-red-50"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Start Over
        </Button>
      </div>

      {/* Stepper */}
      <Stepper
        steps={STEPS}
        currentStep={state.currentStep}
        completedSteps={state.completedSteps}
      />

      {/* Step Content */}
      <div className="min-h-[400px]">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t">
        <div>
          {canGoBack() && (
            <Button
              variant="outline"
              onClick={handleBack}
              size="lg"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
        </div>

        <div className="flex gap-4">
          {/* Show Skip button on Step 2 and 3 */}
          {(state.currentStep === 2 || state.currentStep === 3) && (
            <Button
              variant="outline"
              onClick={handleSkip}
              size="lg"
            >
              <SkipForward className="mr-2 h-4 w-4" />
              Skip
            </Button>
          )}

          {/* Show Finish button on Step 2 if they don't want item analysis */}
          {state.currentStep === 2 && (
            <Button
              onClick={handleFinish}
              size="lg"
              variant="secondary"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Finish
            </Button>
          )}

          {/* Show Next/Continue button */}
          {state.currentStep < 4 && canGoNext() && (
            <Button
              onClick={handleNext}
              size="lg"
              disabled={!canGoNext()}
            >
              {state.currentStep === 2 ? 'Continue to Item Analysis' : 'Next'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Start Over Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Start Over?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base pt-2">
              Are you sure you want to start over? This will clear all uploaded data, re-grading changes, and analysis results.
              <span className="block mt-3 font-semibold text-slate-900 dark:text-slate-100">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStartOver}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Yes, Start Over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
