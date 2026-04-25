import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface NotificationProps {
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
  onClose: () => void;
}

export const Notification: React.FC<NotificationProps> = ({
  message,
  type = 'info',
  duration = 3000,
  onClose
}) => {
  React.useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const colors = {
    info: 'border-neon-cyan bg-neon-cyan/20',
    success: 'border-green-500 bg-green-500/20',
    error: 'border-red-500 bg-red-500/20',
    warning: 'border-yellow-500 bg-yellow-500/20'
  };

  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: -50, x: '-50%' }}
      className={`fixed top-6 left-1/2 z-50 ${colors[type]} border-2 rounded-xl px-6 py-4 backdrop-blur-lg shadow-2xl max-w-md`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icons[type]}</span>
        <p className="text-white font-medium">{message}</p>
        <button
          onClick={onClose}
          className="ml-auto text-white/70 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
};

interface NotificationManagerProps {
  notifications: Array<{ id: string; message: string; type?: 'info' | 'success' | 'error' | 'warning' }>;
  onRemove: (id: string) => void;
}

export const NotificationManager: React.FC<NotificationManagerProps> = ({ notifications, onRemove }) => {
  return (
    <AnimatePresence>
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => onRemove(notification.id)}
        />
      ))}
    </AnimatePresence>
  );
};
