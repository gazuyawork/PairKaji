// src/components/common/LoadingSpinner.tsx
'use client';

import { motion } from 'framer-motion';
import clsx from 'clsx';

type Props = {
  size?: number;
};

export default function LoadingSpinner({ size = 32 }: Props) {
  return (
    <motion.div
      className={clsx(
        'rounded-full border-4 border-t-transparent border-gray-400'
      )}
      style={{ width: size, height: size }}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
    />
  );
}
