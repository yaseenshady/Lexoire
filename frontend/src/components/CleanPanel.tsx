import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface CleanPanelProps {
  isListening?: boolean;
  isSpeaking?: boolean;
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
  onSendMessage?: (message: string) => void;
  messages?: Message[];
  voiceState?: 'idle' | 'listening' | 'processing' | 'speaking';
  onSettingsClick?: () => void;
}

export const CleanPanel: React.FC<CleanPanelProps> = ({
  isListening = false,
  onVoiceStart,
  onVoiceStop,
  onSendMessage,
  messages = [],
  voiceState = 'idle',
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      onSendMessage?.(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="w-full h-screen bg-black text-lime-400 font-mono flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2 border-b border-lime-700">
        {messages.length === 0 ? (
          <p className="text-lime-700">waiting for input...</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              <span className={msg.role === 'user' ? 'text-yellow-400' : 'text-lime-400'}>
                {msg.role === 'user' ? '> ' : '< '}
              </span>
              <span>{msg.content}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-lime-700 p-4 flex gap-2">
        {/* Mic button */}
        <button
          onMouseDown={onVoiceStart}
          onMouseUp={onVoiceStop}
          className={`px-4 py-2 border border-lime-600 ${
            isListening ? 'bg-yellow-900 text-yellow-300 border-yellow-400' : 'hover:border-yellow-400'
          }`}
        >
          <Mic size={16} />
        </button>

        {/* Text input */}
        <input
          type="text"
          placeholder="command..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          className="flex-1 bg-black border border-lime-600 px-3 py-2 text-lime-400 placeholder-lime-800 focus:outline-none focus:border-yellow-400"
        />

        {/* Send button */}
        <button
          onClick={handleSendMessage}
          className="px-4 py-2 border border-lime-600 hover:border-yellow-400"
        >
          <Send size={16} />
        </button>
      </div>

      {/* Status bar */}
      <div className="border-t border-lime-700 px-4 py-2 text-sm text-lime-700">
        {voiceState === 'listening' && '> LISTENING'}
        {voiceState === 'processing' && '> PROCESSING'}
        {voiceState === 'speaking' && '> SPEAKING'}
        {voiceState === 'idle' && '> READY'}
      </div>
    </div>
  );
};
