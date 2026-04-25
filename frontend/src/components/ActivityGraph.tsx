import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Session } from '../types';

interface ActivityGraphProps {
  session: Session;
  showTimeline?: boolean;
  showMemory?: boolean;
  showBarChart?: boolean;
  maxItems?: number;
}

interface ActivityBucket {
  time: string;
  count: number;
  label: string;
}

export const ActivityGraph: React.FC<ActivityGraphProps> = ({
  session,
  showTimeline = true,
  showMemory = true,
  showBarChart = true,
  maxItems = 10
}) => {
  const recentCommands = useMemo(() => {
    return (session.commandHistory || []).slice(-maxItems).reverse();
  }, [session.commandHistory, maxItems]);

  const activityBuckets = useMemo<ActivityBucket[]>(() => {
    const now = Date.now();
    const buckets: ActivityBucket[] = [];
    const bucketSize = 3600000; // 1 hour

    for (let i = 5; i >= 0; i--) {
      const bucketStart = now - i * bucketSize;
      const bucketEnd = bucketStart + bucketSize;
      const count = (session.commandHistory || []).filter(
        cmd => cmd.timestamp >= bucketStart && cmd.timestamp < bucketEnd
      ).length;

      const date = new Date(bucketStart);
      buckets.push({
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        count,
        label: `${date.getHours()}:00`
      });
    }

    return buckets;
  }, [session.commandHistory]);

  const maxCount = Math.max(...activityBuckets.map(b => b.count), 1);
  const totalCommands = session.commandHistory?.length || 0;

  return (
    <div className="space-y-3 p-3">
      {/* Timeline View */}
      {showTimeline && recentCommands.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs uppercase tracking-widest text-white/60 font-semibold">
            Recent Activity
          </h4>
          <div className="flex gap-1 flex-wrap">
            {recentCommands.map((cmd, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="w-6 h-6 rounded"
                style={{
                  backgroundColor: 'rgba(6, 182, 212, 0.4)',
                  borderLeft: '2px solid rgba(6, 182, 212, 0.8)'
                }}
                title={`${cmd.command.substring(0, 30)}...`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bar Chart - Activity over time */}
      {showBarChart && (
        <div className="space-y-2">
          <h4 className="text-xs uppercase tracking-widest text-white/60 font-semibold">
            Activity Distribution
          </h4>
          <div className="space-y-1.5">
            {activityBuckets.map((bucket, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-white/50 w-12">{bucket.label}</span>
                <div className="flex-1 h-6 bg-white/5 rounded border border-white/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-neon-cyan/60 to-neon-cyan/40"
                    initial={{ width: 0 }}
                    animate={{ width: `${(bucket.count / maxCount) * 100}%` }}
                    transition={{ duration: 0.5, delay: idx * 0.05 }}
                  />
                </div>
                <span className="text-xs text-white/60 w-6 text-right">{bucket.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Commands Visualization */}
      {showTimeline && (
        <div className="space-y-2">
          <h4 className="text-xs uppercase tracking-widest text-white/60 font-semibold">
            Last {Math.min(maxItems, recentCommands.length)} Commands
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {recentCommands.length === 0 ? (
              <p className="text-xs text-white/40 italic">No commands yet</p>
            ) : (
              recentCommands.map((cmd, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="flex items-start gap-2 p-1.5 rounded bg-white/5 border border-white/10 hover:border-neon-cyan/30 transition-colors group"
                  title={cmd.command}
                >
                  <span className="text-xs text-neon-cyan/60 flex-shrink-0 mt-0.5">
                    {idx + 1}.
                  </span>
                  <span className="text-xs text-white/70 truncate group-hover:text-white/90 transition-colors">
                    {cmd.command.substring(0, 40)}
                  </span>
                  {cmd.timestamp && (
                    <span className="text-xs text-white/40 flex-shrink-0">
                      {new Date(cmd.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Memory Usage Indicator */}
      {showMemory && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          <h4 className="text-xs uppercase tracking-widest text-white/60 font-semibold">
            Activity Stats
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-white/5 border border-white/10">
              <p className="text-xs text-white/50 mb-1">Total Commands</p>
              <p className="text-lg font-bold text-neon-cyan">{totalCommands}</p>
            </div>
            <div className="p-2 rounded bg-white/5 border border-white/10">
              <p className="text-xs text-white/50 mb-1">Session Age</p>
              <p className="text-lg font-bold text-neon-purple">
                {((Date.now() - session.createdAt) / 60000).toFixed(0)}m
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityGraph;
