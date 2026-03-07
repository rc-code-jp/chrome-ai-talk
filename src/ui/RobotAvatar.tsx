import type { ChatState } from '../lib/types';

interface RobotAvatarProps {
  status: ChatState['status'];
}

export function RobotAvatar({ status }: RobotAvatarProps) {
  return (
    <div className={`chrome-ai-robot chrome-ai-robot-${status}`}>
      <svg
        className="chrome-ai-robot-svg"
        viewBox="0 0 280 280"
        role="img"
        aria-label="Robot guide character"
      >
        <defs>
          <linearGradient id="robotBody" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffe7a8" />
            <stop offset="100%" stopColor="#ff936c" />
          </linearGradient>
          <linearGradient id="robotFace" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff9ee" />
            <stop offset="100%" stopColor="#ffe0cc" />
          </linearGradient>
        </defs>
        <circle cx="140" cy="140" r="120" fill="url(#robotBody)" />
        <rect x="78" y="62" width="124" height="108" rx="34" fill="url(#robotFace)" />
        <circle className="chrome-ai-eye chrome-ai-eye-left" cx="112" cy="115" r="12" />
        <circle className="chrome-ai-eye chrome-ai-eye-right" cx="168" cy="115" r="12" />
        <path
          className="chrome-ai-mouth"
          d={status === 'streaming' ? 'M105 145 Q140 168 175 145' : 'M104 144 Q140 154 176 144'}
          fill="none"
          stroke="#17324d"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <rect x="104" y="185" width="72" height="18" rx="9" fill="#17324d" opacity="0.18" />
        <circle cx="140" cy="42" r="16" fill="#17324d" />
        <path d="M140 42 L140 70" stroke="#17324d" strokeWidth="6" strokeLinecap="round" />
        <circle className="chrome-ai-antenna-light" cx="140" cy="28" r="9" fill="#2ad3b6" />
        <circle cx="76" cy="108" r="11" fill="#17324d" opacity="0.2" />
        <circle cx="204" cy="108" r="11" fill="#17324d" opacity="0.2" />
      </svg>
    </div>
  );
}
