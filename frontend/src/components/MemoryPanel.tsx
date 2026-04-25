import React from 'react';
import { motion } from 'framer-motion';
import { Memory } from '../types';

interface MemoryPanelProps {
  memories: Memory[];
  onSearch: (query: string) => void;
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({ memories, onSearch }) => {
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  return (
    <div className="glass p-6 h-full flex flex-col">
      <h2 className="text-2xl font-bold neon-text mb-4">🧠 Memories</h2>

      <form onSubmit={handleSearch} className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories..."
          className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-neon-cyan transition-all"
        />
      </form>

      <div className="flex-1 overflow-y-auto space-y-3">
        {memories.map((memory, index) => (
          <motion.div
            key={memory.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-neon-purple/50 transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {memory.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 rounded bg-neon-purple/20 border border-neon-purple/30 text-neon-purple"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`text-xs ${
                      i < memory.importance ? 'text-yellow-400' : 'text-white/20'
                    }`}
                  >
                    ⭐
                  </span>
                ))}
              </div>
            </div>
            <p className="text-white/80 text-sm">{memory.content}</p>
            <p className="text-white/40 text-xs mt-2">
              {new Date(memory.createdAt).toLocaleString()}
            </p>
          </motion.div>
        ))}

        {memories.length === 0 && (
          <div className="text-center text-white/50 mt-10">
            <p>No memories found</p>
            <p className="text-sm mt-2">Saved conversations automatically become searchable memory entries.</p>
          </div>
        )}
      </div>
    </div>
  );
};
