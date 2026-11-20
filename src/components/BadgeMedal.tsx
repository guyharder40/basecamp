import { badgeMedalSvg } from '../types';

// The award medallion, rendered from the shared SVG builder so the grid,
// the badge pop-up and the pinned medals beside the profile name all show
// the same medal. Earned medals glow; locked ones are flat discs.
export default function BadgeMedal({ id, earned, size = 92, mini = false }: { id: string; earned: boolean; size?: number; mini?: boolean }) {
  const height = earned && !mini ? Math.round(size * 1.16) : size;
  return (
    <span
      style={{ display: 'inline-block', width: size, height, flex: 'none', lineHeight: 0, filter: earned && !mini ? 'drop-shadow(0 0 10px rgba(246,201,69,.45))' : undefined }}
      dangerouslySetInnerHTML={{ __html: badgeMedalSvg(id, earned, mini) }}
    />
  );
}
