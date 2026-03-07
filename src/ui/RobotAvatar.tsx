import Lottie from 'lottie-react';
import type { ChatState } from '../lib/types';
import characterAnimation from '../assets/character.lottie.json';

interface RobotAvatarProps {
  status: ChatState['status'];
}

export function RobotAvatar({ status }: RobotAvatarProps) {
  return (
    <div className={`chrome-ai-robot chrome-ai-robot-${status}`}>
      <Lottie
        animationData={characterAnimation}
        loop={true}
        autoplay={true}
        className="chrome-ai-robot-svg"
      />
    </div>
  );
}
