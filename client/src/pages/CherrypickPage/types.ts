import type {
  SavedConversation,
  ParsedConversation,
  ConversationExchange,
} from "../../types/conversation";

export type PageState =
  | { phase: "upload" }
  | { phase: "edit"; parsed: ParsedConversation; fileName: string }
  | {
      phase: "preview";
      parsed: ParsedConversation;
      fileName: string;
      pruned: SavedConversation;
    };

export interface CherrypickActions {
  handleFile: (file: File) => void;
  handlePreview: () => void;
  handleDownload: () => void;
  handleReset: () => void;
  toggleMainId: (id: number) => void;
  toggleTangentId: (id: number) => void;
  toggleAllMain: (exchanges: ConversationExchange[]) => void;
  toggleAllTangent: (exchanges: ConversationExchange[]) => void;
  goBackToEdit: () => void;
}

export interface CherrypickState {
  pageState: PageState;
  error: string | null;
  deleteMainIds: Set<number>;
  deleteTangentIds: Set<number>;
  totalSelected: number;
}
