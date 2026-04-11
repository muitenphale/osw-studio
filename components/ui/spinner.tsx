import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  size?: number;
  color?: string;
}

export function Spinner({ className, size = 48, color }: SpinnerProps) {
  const r = 18; // radius
  const circumference = 2 * Math.PI * r;
  const arcLength = circumference * 0.7; // 70% arc

  return (
    <svg
      className={cn('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="22"
        cy="22"
        r={r}
        stroke={color || 'currentColor'}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${arcLength} ${circumference - arcLength}`}
      />
    </svg>
  );
}
