import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FrontendSettings } from '../types';

interface SettingsPanelProps {
  isOpen: boolean;
  settings: FrontendSettings;
  onChange: <K extends keyof FrontendSettings>(key: K, value: FrontendSettings[K]) => void;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, settings, onChange, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.9, x: '-50%', y: '-50%' }}
            className="fixed top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-2xl glass p-8 z-50 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold neon-text">⚙️ Settings</h2>
                <p className="text-sm text-white/60 mt-1">Changes save automatically for the next local run.</p>
              </div>
              <button
                onClick={onClose}
                className="text-white/70 hover:text-white text-2xl transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2 text-white/80">
                  Voice Language
                </label>
                <select
                  value={settings.voiceLang}
                  onChange={(e) => onChange('voiceLang', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-white/20 text-white focus:outline-none focus:border-neon-cyan transition-all"
                >
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="es-ES">Spanish</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-white/80">
                  Voice Character
                </label>
                <select
                  value={settings.voiceStyle}
                  onChange={(e) => onChange('voiceStyle', e.target.value as FrontendSettings['voiceStyle'])}
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-white/20 text-white focus:outline-none focus:border-neon-cyan transition-all"
                >
                  <option value="natural">Natural</option>
                  <option value="clear">Clear</option>
                  <option value="default">System default</option>
                </select>
                <p className="text-xs text-white/50 mt-2">
                  Natural prefers the most human-sounding local voice available. Clear biases toward a cleaner assistant tone.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4 mb-2">
                  <label className="block text-sm font-semibold text-white/80">
                    Speech Pace
                  </label>
                  <span className="text-xs text-white/50">{settings.speechRate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.05"
                  step="0.01"
                  value={settings.speechRate}
                  onChange={(e) => onChange('speechRate', Number.parseFloat(e.target.value))}
                  className="w-full accent-cyan-300"
                />
                <p className="text-xs text-white/50 mt-2">
                  Slightly slower pacing sounds more realistic for longer answers.
                </p>
              </div>

               <div>
                 <div className="flex items-center justify-between gap-4 mb-2">
                   <label className="block text-sm font-semibold text-white/80">
                     Voice Pitch
                   </label>
                   <span className="text-xs text-white/50">{settings.speechPitch.toFixed(2)}</span>
                 </div>
                 <input
                   type="range"
                   min="0.5"
                   max="2.0"
                   step="0.1"
                   value={settings.speechPitch}
                   onChange={(e) => onChange('speechPitch', Number.parseFloat(e.target.value))}
                   className="w-full accent-cyan-300"
                 />
                 <p className="text-xs text-white/50 mt-2">
                   Adjust the pitch for a more natural tone. Higher values sound higher-pitched.
                 </p>
               </div>

               <div>
                 <div className="flex items-center justify-between gap-4 mb-2">
                   <label className="block text-sm font-semibold text-white/80">
                     Voice Volume
                   </label>
                   <span className="text-xs text-white/50">{Math.round(settings.speechVolume * 100)}%</span>
                 </div>
                 <input
                   type="range"
                   min="0.1"
                   max="1.0"
                   step="0.1"
                   value={settings.speechVolume}
                   onChange={(e) => onChange('speechVolume', Number.parseFloat(e.target.value))}
                   className="w-full accent-cyan-300"
                 />
                 <p className="text-xs text-white/50 mt-2">
                   Control the volume of the voice output.
                 </p>
               </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-white/80">
                  App Endpoint
                </label>
                <input
                  type="text"
                  value={settings.apiEndpoint}
                  onChange={(e) => onChange('apiEndpoint', e.target.value)}
                  placeholder="http://localhost:3000"
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-neon-cyan transition-all"
                />
                <p className="text-xs text-white/50 mt-2">Use the frontend origin in development and let Vite proxy API + socket traffic to the backend.</p>
              </div>

              <div className="space-y-3">
                {[
                   {
                     key: 'autoSave',
                     label: 'Sync conversation memory',
                     description: 'Persist the current session to SQLite so memories and history survive reloads.'
                   },
                  {
                    key: 'continuousListening',
                    label: 'Continuous voice capture',
                    description: 'Leave the microphone active until you stop it manually.'
                  },
                  {
                    key: 'speakResponses',
                    label: 'Speak assistant responses',
                    description: 'Read LEXOIRE replies aloud with your browser voice.'
                  }
                ].map(({ key, label, description }) => (
                  <label key={key} className="flex items-start justify-between gap-4 cursor-pointer group rounded-lg border border-white/10 p-4 bg-white/5">
                    <div>
                      <span className="text-white/80 group-hover:text-white transition-colors block">
                        {label}
                      </span>
                      <span className="text-xs text-white/50 mt-1 block">{description}</span>
                    </div>
                    <div className="relative mt-1">
                      <input
                        type="checkbox"
                        checked={settings[key as keyof Pick<FrontendSettings, 'autoSave' | 'continuousListening' | 'speakResponses'>]}
                        onChange={(e) => onChange(key as 'autoSave' | 'continuousListening' | 'speakResponses', e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-12 h-6 rounded-full transition-all ${
                        settings[key as keyof Pick<FrontendSettings, 'autoSave' | 'continuousListening' | 'speakResponses'>]
                          ? 'bg-neon-cyan'
                          : 'bg-white/20'
                      }`}>
                        <motion.div
                          animate={{
                            x: settings[key as keyof Pick<FrontendSettings, 'autoSave' | 'continuousListening' | 'speakResponses'>] ? 24 : 0
                          }}
                          className="w-6 h-6 bg-white rounded-full shadow-lg"
                        />
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 p-4 text-sm text-white/75">
                Hotkeys stay the same: <span className="font-semibold text-white">Ctrl/Cmd + Space</span> to toggle voice, <span className="font-semibold text-white">Ctrl/Cmd + ,</span> for settings, and <span className="font-semibold text-white">Esc</span> to abort.
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
