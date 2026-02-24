import { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useProjectStore } from '../../stores/project-store';
import {
  CheckCircle, ChevronRight, ChevronLeft, Sparkles,
} from 'lucide-react';
import appIcon from '../../assets/icon.png';
import AuthStep from './steps/AuthStep';
import ToolsStep from './steps/ToolsStep';
import ProjectStep from './steps/ProjectStep';

// ─── Step definitions ────────────────────────────────────────────────────

type Step = 'auth' | 'tools' | 'project';

const STEPS: { id: Step; label: string }[] = [
  { id: 'auth', label: 'Connect Provider' },
  { id: 'tools', label: 'Tools' },
  { id: 'project', label: 'Open Project' },
];

// ─── Main component ─────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const { hasAnyAuth } = useAuthStore();
  const { onboardingComplete, completeOnboarding } = useAppSettingsStore();
  const { projectPath } = useProjectStore();
  const [currentStep, setCurrentStep] = useState<Step>('auth');

  const currentIndex = STEPS.findIndex(s => s.id === currentStep);

  const canProceed = (() => {
    if (currentStep === 'auth') return hasAnyAuth;
    return true;
  })();

  const handleNext = () => {
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].id);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id);
    }
  };

  const handleFinish = async () => {
    await completeOnboarding();
  };

  const isLastStep = currentIndex === STEPS.length - 1;

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex flex-col items-center gap-3 mb-1">
            <img src={appIcon} alt="Pilot" className="w-16 h-16" draggable={false} />
            <h1 className="text-2xl font-bold text-text-primary">Welcome to Pilot</h1>
          </div>
          <p className="text-sm text-text-secondary">
            Let's get you set up in a few quick steps.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  step.id === currentStep
                    ? 'bg-accent text-white'
                    : i < currentIndex
                      ? 'bg-success/20 text-success'
                      : 'bg-bg-surface text-text-secondary'
                }`}
              >
                {i < currentIndex ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <span className="w-3 h-3 flex items-center justify-center text-[10px]">{i + 1}</span>
                )}
                {step.label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-3 h-3 text-text-secondary/30" />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[300px]">
          {currentStep === 'auth' && <AuthStep />}
          {currentStep === 'tools' && <ToolsStep />}
          {currentStep === 'project' && <ProjectStep />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {isLastStep ? (
            <button
              onClick={handleFinish}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors"
            >
              Get Started
              <Sparkles className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors disabled:opacity-50"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
