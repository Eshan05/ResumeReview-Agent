import { cn } from "@/lib/utils";

interface CandidateAvatarProps {
  src: string;
  name: string;
  className?: string;
}

export function CandidateAvatar({
  src,
  name,
  className,
}: CandidateAvatarProps) {
  return (
    // biome-ignore lint/performance/noImgElement: Prototype avatars use a remote mock host outside the current Next image allowlist.
    <img
      src={src}
      alt={name}
      loading="lazy"
      className={cn("rounded-full object-cover shrink-0", className)}
    />
  );
}
