/** Ensures only one dashboard grid video plays at a time across the app. */

type GridVideoPlayer = {
  pause: () => void;
};

const players = new Map<string, GridVideoPlayer>();
let activePlayerId: string | null = null;

export function registerGridVideoPlayer(
  playerId: string,
  player: GridVideoPlayer
): () => void {
  players.set(playerId, player);
  return () => {
    players.delete(playerId);
    if (activePlayerId === playerId) {
      activePlayerId = null;
    }
  };
}

export function requestGridVideoPlay(playerId: string): void {
  if (activePlayerId && activePlayerId !== playerId) {
    players.get(activePlayerId)?.pause();
  }
  activePlayerId = playerId;
}

export function releaseGridVideoPlay(playerId: string): void {
  if (activePlayerId === playerId) {
    activePlayerId = null;
  }
}
