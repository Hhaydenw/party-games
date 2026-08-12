"use client";

import { PlayerInfo } from "@/lib/types";
import UnoView from "@/components/games/UnoView";
import TriviaView from "@/components/games/TriviaView";
import DrawingView from "@/components/games/DrawingView";
import FamilyFeudView from "@/components/games/FamilyFeudView";
import NameThatTuneView from "@/components/games/NameThatTuneView";
import LifeView from "@/components/games/LifeView";
import MonopolyView from "@/components/games/MonopolyView";
import TanksView from "@/components/games/TanksView";
import PaddleBattleView from "@/components/games/PaddleBattleView";
import VoidRaidersView from "@/components/games/VoidRaidersView";
import WildestAnswerView from "@/components/games/WildestAnswerView";

// Dispatches a game's view to its component, shared by GameHost (while
// playing) and FinishedBanner (frozen on the final tick after the game
// ends) so both show the exact same rich, game-specific scoreboard instead
// of duplicating this switch in two places.
export default function GameView({
  gameId,
  view,
  onAction,
  meId,
  players,
}: {
  gameId: string;
  view: unknown;
  onAction: (action: unknown) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  switch (gameId) {
    case "uno":
      return <UnoView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "trivia":
      return <TriviaView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "drawing":
      return <DrawingView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "family-feud":
      return <FamilyFeudView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "name-that-tune":
      return <NameThatTuneView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "life":
      return <LifeView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "monopoly":
      return <MonopolyView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "tanks":
      return <TanksView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "paddle-battle":
      return <PaddleBattleView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "void-raiders":
      return <VoidRaidersView view={view as any} onAction={onAction} meId={meId} players={players} />;
    case "wildest-answer":
      return <WildestAnswerView view={view as any} onAction={onAction} meId={meId} players={players} />;
    default:
      return null;
  }
}
