import { SubmitKey } from "../store/app";
import type { LocaleType } from "./index";

const en: LocaleType = {
  WIP: "WIP...",
  Error: {
    Unauthorized:
      "Unauthorized access, please enter access code in settings page.",
  },
  ChatItem: {
    ChatItemCount: (count: number) => `${count} messages`,
  },
  Chat: {
    SubTitle: (count: number, modelName?: string) =>
      `${count} messages with ${modelName || "ChatGPT"}`,
    Actions: {
      ChatList: "Go To Chat List",
      CompressedHistory: "Compressed History Memory Prompt",
      Export: "Export All Messages as Markdown",
      Copy: "Copy",
      Stop: "Stop",
      Retry: "Retry",
      UploadImage: "Upload image",
      TakePhoto: "Take photo",
      ChooseFromAlbum: "Choose from album",
      ShowReasoning: "Show reasoning",
      HideReasoning: "Hide reasoning",
    },
    Rename: "Rename Chat",
    Typing: "Typing…",
    Thinking: "Thinking…",
    Input: (submitKey: string) => {
      var inputHints = `Type something and press ${submitKey} to send`;
      if (submitKey === String(SubmitKey.Enter)) {
        inputHints += ", press Shift + Enter to newline";
      }
      return inputHints;
    },
    Send: "Send",
  },
  Export: {
    Title: "Export Messages",
    Copy: "Copy Text",
    Download: "Download Text",
    Screenshot: "Download Screenshot",
    ScreenshotFailed: "Screenshot failed, please try again",
    ScreenshotMulti: (count: number) =>
      `Content is long, exported as ${count} image files`,
    MessageFromYou: "Message From You",
    MessageFromChatGPT: "Message From AI",
  },
  Memory: {
    Title: "Memory Prompt",
    EmptyContent: "Nothing yet.",
    CompressedToast: "Conversation compressed, click to view",
    CompressedNotice:
      "Conversation has been compressed. The AI can only see the compressed summary above, not the full original dialogue.",
    ExpandCompressed: "Expand conversation",
    CollapseCompressed: "Collapse conversation",
    EmptyCompressedHistory: "No compressed conversation content to display.",
    Send: "Send Memory",
    Copy: "Copy Memory",
    Reset: "Reset Session",
    ResetConfirm:
      "Resetting will clear the current conversation history and historical memory. Are you sure you want to reset?",
  },
  Home: {
    NewChat: "New Chat",
    DeleteChat: "Confirm to delete the selected conversation?",
    ArchiveChat: "Archive chat",
    UnarchiveChat: "Unarchive chat",
    ViewArchivedChats: "View archived chats",
    ViewActiveChats: "View active chats",
    ArchivedChatList: "Archived conversations",
    EmptyArchivedChats: "No archived chats yet",
    EmptyActiveChats: "No active chats yet",
  },
  Settings: {
    Title: "Settings",
    SubTitle: "All Settings",
    Actions: {
      ClearAll: "Clear All Data",
      ResetAll: "Reset All Settings",
      Close: "Close",
    },
    Lang: {
      Name: "Language", // ATTENTION: if you wanna add a new translation, please do not translate this value, leave it as `Language`
      Options: {
        cn: "简体中文",
        en: "English",
      },
    },
    Avatar: "Avatar",
    FontSize: {
      Title: "Font Size",
      SubTitle: "Adjust font size of chat content",
    },
    Update: {
      Version: (x: string) => `Version: ${x}`,
      IsLatest: "Latest version",
      CheckUpdate: "Check Update",
      IsChecking: "Checking update...",
      FoundUpdate: (x: string) => `Found new version: ${x}`,
      GoToUpdate: "Update",
    },
    SendKey: "Send Key",
    Theme: "Theme",
    DataMigration: {
      Title: "Backup/Restore All Chats",
      SubTitle: "Backup local chat state as JSON, or restore from backup",
      Export: "Backup",
      Import: "Restore",
      ExportSuccess: "Backed up successfully",
      ImportSuccess: "Restored successfully, refreshing",
      ImportFailed: "Restore failed: invalid backup file",
    },
    TightBorder: "Tight Border",
    SendPreviewBubble: "Send Preview Bubble",
    Prompt: {
      Disable: {
        Title: "Disable auto-completion",
        SubTitle: "Input / to trigger auto-completion",
      },
      List: "Prompt List",
      ListCount: (builtin: number, custom: number) =>
        `${builtin} built-in, ${custom} user-defined`,
      Edit: "Edit",
    },
    HistoryCount: {
      Title: "Attached Messages Count",
      SubTitle: "Number of sent messages attached per request",
    },
    CompressThreshold: {
      Title: "History Compression Threshold",
      SubTitle:
        "Will compress if uncompressed messages length exceeds the value",
    },
    Token: {
      Title: "API Key",
      SubTitle: "Use your key to ignore access code limit",
      Placeholder: "OpenAI API Key",
    },
    Usage: {
      Title: "Account Balance",
      SubTitle(used: any, total: any) {
        return `Used this month $${used}, subscription $${total}`;
      },
      IsChecking: "Checking...",
      Check: "Check Again",
      NoAccess: "Enter API Key to check balance",
    },
    AccessCode: {
      Title: "Access Code",
      SubTitle: "Access control enabled",
      Placeholder: "Need Access Code",
    },
    Model: "Model",
    Temperature: {
      Title: "Temperature",
      SubTitle: "A larger value makes the more random output",
    },
    MaxTokens: {
      Title: "Max Tokens",
      SubTitle: "Maximum length of input tokens and generated tokens",
    },
    PresencePenlty: {
      Title: "Presence Penalty",
      SubTitle:
        "A larger value increases the likelihood to talk about new topics",
    },
  },
  Store: {
    DefaultTopic: "New Conversation",
    BotHello: "Hello! How can I assist you today?",
    Error: "Something went wrong, please try again later.",
    StorageNearLimit:
      "Local storage is almost full. Export your data and clean up old chats soon.",
    StorageFull:
      "Local storage is full. New chats may not be saved. Export data and clean up now.",
    ModelPicker: {
      Title: "Pick a model to start",
      SubTitle: "Each model has different capabilities and style. Please select:",
      Selected: (name: string) => `Switched to ${name}`,
      Claude:
        "From Anthropic. More human, great for communication and rewriting.",
      GPT: "From OpenAI. Neutral and steady, good for general tasks.",
      Gemini:
        "From Google. Strong in STEM and visual analysis.",
    },
    Prompt: {
      History: (content: string) =>
        "This is a summary of the chat history between the AI and the user as a recap: " +
        content,
      Topic:
        "Please generate a four to five word title summarizing our conversation without any lead-in, punctuation, quotation marks, periods, symbols, or additional text. Remove enclosing quotation marks.",
      Summarize:
        "Summarize our discussion briefly in 500 words or less to use as a prompt for future context.",
    },
    ConfirmClearAll: "Confirm to clear all chat and setting data?",
  },
  Copy: {
    Success: "Copied to clipboard",
    Failed: "Copy failed, please grant permission to access clipboard",
  },
  Context: {
    Toast: (x: any) => `With ${x} contextual prompts`,
    Edit: "Contextual and Memory Prompts",
    Add: "Add One",
  },
};

export default en;
