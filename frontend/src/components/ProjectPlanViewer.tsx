import React from 'react';
import { motion } from 'framer-motion';
import { ProjectPlan } from '../types';

interface ProjectPlanViewerProps {
  plan: ProjectPlan | null;
}

export const ProjectPlanViewer: React.FC<ProjectPlanViewerProps> = ({ plan }) => {
  if (!plan) {
    return (
      <div className="glass p-6 h-full flex items-center justify-center">
        <div className="text-center text-white/55 max-w-md">
          <p className="text-lg text-white">No recent execution plan</p>
          <p className="text-sm mt-2">
            Once you run a command, JARVIS will store the execution pipeline here so you can review what happened.
          </p>
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4 text-left text-sm text-white/65">
            This panel reflects backend state, not a mock view, so it stays empty until the app has real execution history.
          </div>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400 border-green-400';
      case 'in-progress':
        return 'text-neon-cyan border-neon-cyan';
      case 'failed':
        return 'text-red-400 border-red-400';
      default:
        return 'text-white/50 border-white/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'in-progress':
        return '⏳';
      case 'failed':
        return '❌';
      default:
        return '⭕';
    }
  };

  return (
    <div className="glass p-6 h-full flex flex-col overflow-hidden">
      <div className="mb-6">
        <h2 className="text-2xl font-bold neon-text mb-2">{plan.title}</h2>
        <p className="text-white/70 text-sm">{plan.description}</p>
        <div className="flex items-center gap-2 mt-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(plan.status)}`}>
            {plan.status.toUpperCase()}
          </span>
          <span className="text-white/50 text-xs">
            {plan.steps.filter((step) => step.status === 'completed').length} / {plan.steps.length} completed
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3">
          {plan.steps.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
              className={`p-4 rounded-lg border ${
                step.status === 'in-progress' ? 'bg-neon-cyan/10' : 'bg-white/5'
              } ${getStatusColor(step.status)}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{getStatusIcon(step.status)}</span>
                <div className="flex-1">
                  <p className="text-white font-medium mb-2">{step.description}</p>
                  {step.output && (
                    <div className="mt-2 p-2 bg-black/30 rounded text-xs font-mono text-green-400 whitespace-pre-wrap break-words">
                      {step.output}
                    </div>
                  )}
                  {step.error && (
                    <div className="mt-2 p-2 bg-red-500/20 rounded text-xs text-red-300">
                      Error: {step.error}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
