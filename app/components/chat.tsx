import { useDebouncedCallback } from "use-debounce";
import { memo, useState, useRef, useEffect, useLayoutEffect } from "react";

import SendWhiteIcon from "../icons/send-white.svg";
import BrainIcon from "../icons/brain.svg";
import ExportIcon from "../icons/export.svg";
import MenuIcon from "../icons/menu.svg";
import CopyIcon from "../icons/copy.svg";
import DownloadIcon from "../icons/download.svg";
import LoadingIcon from "../icons/three-dots.svg";
import BotIcon from "../icons/bot.svg";
import ChatGptIcon from "../icons/chatgpt.svg";
import GeminiIcon from "../icons/gemini.svg";
import ClaudeIcon from "../icons/claude.svg";
import AddIcon from "../icons/add.svg";
import CameraIcon from "../icons/camera.svg";
import DeleteIcon from "../icons/delete.svg";

import {
  ALL_MODELS,
  Message,
  SubmitKey,
  useChatStore,
  BOT_HELLO,
  ROLES,
  createMessage,
  getReasoningStreamSegment,
} from "../store";
import { useScreen } from "../store/screen";

import {
  copyToClipboard,
  downloadAs,
  formatRelativeDateTime,
  getEmojiUrl,
  isMobileScreen,
  selectOrCopy,
} from "../utils";

import dynamic from "next/dynamic";

import { ControllerPool } from "../requests";
import { Prompt, usePromptStore } from "../store/prompt";
import Locale from "../locales";

import { IconButton } from "./button";
import { AnimatedReorderGroup } from "./AnimatedReorderGroup";
import styles from "./home.module.scss";
import chatStyle from "./chat.module.scss";

import { Input, Modal, showModal, showToast } from "./ui-lib";

import TextareaAutosize from "react-textarea-autosize";
import { EmojiStyle } from "emoji-picker-react";

const Markdown = dynamic(
  async () => memo((await import("./markdown")).Markdown),
  {
    loading: () => <LoadingIcon />,
  },
);

const Emoji = dynamic(async () => (await import("emoji-picker-react")).Emoji, {
  loading: () => <LoadingIcon />,
});

function getProviderByModel(model?: string) {
  if (!model) return "default";
  const provider = model.split("/")[0]?.toLowerCase();
  if (provider === "openai") return "openai";
  if (provider === "google") return "google";
  if (provider === "anthropic") return "anthropic";
  return "default";
}

function getLastReasoningSegment(text: string) {
  const normalized = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return "";
  const parts = normalized
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
  const segment = parts.at(-1) ?? normalized;
  if (segment.length <= 500) return segment;
  return segment.slice(-500);
}

function getCompactModelName(model?: string) {
  if (!model || model.length === 0) return "";
  const rawName = model.includes("/")
    ? model.split("/").at(-1) ?? model
    : model;
  const withoutSuffix = rawName.replace(/-pro-preview$/i, "");

  return withoutSuffix
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "gpt") return "GPT";
      if (lower === "ai") return "AI";
      if (/^\d+(\.\d+)*$/.test(part)) return part;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function getModelPersona(model: string) {
  const provider = getProviderByModel(model);
  if (provider === "anthropic") return Locale.Store.ModelPicker.Claude;
  if (provider === "google") return Locale.Store.ModelPicker.Gemini;
  return Locale.Store.ModelPicker.GPT;
}

function getHeaderModelLabel(model?: string) {
  const provider = getProviderByModel(model);
  if (provider === "anthropic") return "Claude";
  if (provider === "google") return "Gemini";
  return "GPT";
}

export function Avatar(props: { role: Message["role"]; model?: string }) {
  const config = useChatStore((state) => state.config);

  if (props.role !== "user") {
    const provider = getProviderByModel(props.model);
    if (provider === "openai") {
      return (
        <div className={styles["provider-icon"]}>
          <ChatGptIcon />
        </div>
      );
    }
    if (provider === "google") {
      return (
        <div className={styles["provider-icon"]}>
          <GeminiIcon />
        </div>
      );
    }
    if (provider === "anthropic") {
      return (
        <div className={styles["provider-icon"]}>
          <ClaudeIcon />
        </div>
      );
    }
    return <BotIcon className={styles["user-avtar"]} />;
  }

  return (
    <div className={styles["user-avtar"]}>
      <Emoji
        unified={config.avatar}
        size={18}
        getEmojiUrl={getEmojiUrl}
        emojiStyle={EmojiStyle.NATIVE}
      />
    </div>
  );
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const element = document.createElement("a");
  element.setAttribute("href", dataUrl);
  element.setAttribute("download", filename);
  element.style.display = "none";
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function inlineComputedStyles(
  source: HTMLElement,
  target: HTMLElement,
) {
  const computed = window.getComputedStyle(source);
  const styleText = Array.from(computed)
    .map((name) => `${name}: ${computed.getPropertyValue(name)};`)
    .join(" ");
  target.setAttribute("style", styleText);

  const sourceChildren = Array.from(source.children) as HTMLElement[];
  const targetChildren = Array.from(target.children) as HTMLElement[];
  for (let i = 0; i < sourceChildren.length; i += 1) {
    const sourceChild = sourceChildren[i];
    const targetChild = targetChildren[i];
    if (!sourceChild || !targetChild) continue;
    inlineComputedStyles(sourceChild, targetChild);
  }
}

async function renderNodeSliceToPng(
  node: HTMLElement,
  width: number,
  offsetY: number,
  height: number,
  options?: {
    paddingX?: number;
    paddingTop?: number;
    paddingBottom?: number;
  },
) {
  const paddingX = options?.paddingX ?? 0;
  const paddingTop = options?.paddingTop ?? 0;
  const paddingBottom = options?.paddingBottom ?? 0;
  const canvasWidth = width + paddingX * 2;
  const canvasHeight = height + paddingTop + paddingBottom;

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.width = `${canvasWidth}px`;
  wrapper.style.height = `${canvasHeight}px`;
  wrapper.style.overflow = "hidden";
  wrapper.style.background = getComputedStyle(document.body).backgroundColor;

  const cloned = node.cloneNode(true) as HTMLElement;
  inlineComputedStyles(node, cloned);
  cloned.style.margin = "0";
  cloned.style.width = `${width}px`;
  cloned.style.transform = `translate(${paddingX}px, ${paddingTop - offsetY}px)`;
  cloned.style.transformOrigin = "top left";
  wrapper.appendChild(cloned);

  const wrapperHtml = new XMLSerializer().serializeToString(wrapper);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
      <foreignObject x="0" y="0" width="100%" height="100%">
        ${wrapperHtml}
      </foreignObject>
    </svg>
  `;

  const image = new Image();
  image.decoding = "async";
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load screenshot"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No canvas context");
  }

  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

async function buildBubbleScreenshotPages(node: HTMLElement) {
  const width = Math.ceil(node.getBoundingClientRect().width);
  const totalHeight = Math.max(node.scrollHeight, node.clientHeight);
  const maxSliceHeight = 3200;
  const paddingX = 24;
  const edgePaddingY = 24;
  const pages: string[] = [];

  if (width <= 0 || totalHeight <= 0) {
    return pages;
  }

  // Fast path: render once when the whole node fits in one canvas slice.
  if (totalHeight <= maxSliceHeight) {
    const single = await renderNodeSliceToPng(node, width, 0, totalHeight, {
      paddingX,
      paddingTop: edgePaddingY,
      paddingBottom: edgePaddingY,
    });
    return [single];
  }

  for (let offsetY = 0; offsetY < totalHeight; offsetY += maxSliceHeight) {
    const sliceHeight = Math.min(maxSliceHeight, totalHeight - offsetY);
    const isFirst = offsetY === 0;
    const isLast = offsetY + sliceHeight >= totalHeight;
    const page = await renderNodeSliceToPng(
      node,
      width,
      offsetY,
      sliceHeight,
      {
        paddingX,
        paddingTop: isFirst ? edgePaddingY : 0,
        paddingBottom: isLast ? edgePaddingY : 0,
      },
    );
    pages.push(page);
  }

  return pages;
}

function exportMessages(
  messages: Message[],
  topic: string,
  screenshotNode?: HTMLElement | null,
) {
  const textContent =
    `${topic}\n\n` +
    messages
      .map((m) => {
        const title =
          m.role === "user"
            ? Locale.Export.MessageFromYou
            : Locale.Export.MessageFromChatGPT;
        const content = (m.content ?? "").trim();
        return `${title}:\n${content}`;
      })
      .join("\n\n");

  const textFilename = `${topic}.txt`;

  let closeModal = () => {};
  closeModal = showModal({
    title: Locale.Export.Title,
    actions: [
      <IconButton
        key="copy"
        icon={<CopyIcon />}
        bordered
        text={Locale.Export.Copy}
        onClick={() => {
          copyToClipboard(textContent);
          closeModal();
          showToast(Locale.Copy.Success);
        }}
      />,
      <IconButton
        key="download"
        icon={<DownloadIcon />}
        bordered
        text={Locale.Export.Download}
        onClick={() => downloadAs(textContent, textFilename)}
      />,
      <IconButton
        key="screenshot"
        icon={<CameraIcon />}
        bordered
        text={Locale.Export.Screenshot}
        onClick={async () => {
          if (!screenshotNode) {
            showToast(Locale.Export.ScreenshotFailed);
            return;
          }

          try {
            const pages = await buildBubbleScreenshotPages(screenshotNode);
            if (pages.length === 0) {
              showToast(Locale.Export.ScreenshotFailed);
              return;
            }
            if (pages.length === 1) {
              downloadDataUrl(pages[0], `${topic}.png`);
              return;
            }
            pages.forEach((page, index) => {
              downloadDataUrl(page, `${topic}-part-${index + 1}.png`);
            });
            showToast(Locale.Export.ScreenshotMulti(pages.length));
          } catch {
            showToast(Locale.Export.ScreenshotFailed);
          }
        }}
      />,
    ],
  });
}

function PromptToast(props: {
  showToast?: boolean;
  showModal?: boolean;
  setShowModal: (_: boolean) => void;
}) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const [showCompressedMessages, setShowCompressedMessages] = useState(false);

  const compressedEndIndex = Math.max(
    0,
    Math.min(session.lastSummarizeIndex, session.messages.length),
  );
  const compressedMessages = session.messages
    .slice(0, compressedEndIndex)
    .filter((m) => !m.isError);

  const addContextPrompt = (prompt: Message) => {
    chatStore.updateCurrentSession((session) => {
      session.context.push(prompt);
    });
  };

  const removeContextPrompt = (i: number) => {
    chatStore.updateCurrentSession((session) => {
      session.context.splice(i, 1);
    });
  };

  const updateContextPrompt = (i: number, prompt: Message) => {
    chatStore.updateCurrentSession((session) => {
      session.context[i] = prompt;
    });
  };

  return (
    <div className={chatStyle["prompt-toast"]} key="prompt-toast">
      {props.showToast && (
        <div
          className={chatStyle["prompt-toast-inner"] + " clickable"}
          role="button"
          onClick={() => props.setShowModal(true)}
        >
          <BrainIcon />
          <span className={chatStyle["prompt-toast-content"]}>
            {Locale.Memory.CompressedToast}
          </span>
        </div>
      )}
      {props.showModal && (
        <div className="modal-mask">
          <Modal
            title={Locale.Context.Edit}
            onClose={() => {
              setShowCompressedMessages(false);
              props.setShowModal(false);
            }}
            actions={[
              <IconButton
                key="reset"
                icon={<CopyIcon />}
                bordered
                text={Locale.Memory.Reset}
                onClick={() =>
                  confirm(Locale.Memory.ResetConfirm) &&
                  chatStore.resetSession()
                }
              />,
              <IconButton
                key="copy"
                icon={<CopyIcon />}
                bordered
                text={Locale.Memory.Copy}
                onClick={() => copyToClipboard(session.memoryPrompt)}
              />,
            ]}
          >
            <>
              {/*
              <div className={chatStyle["context-prompt"]}>
                {context.map((c, i) => (
                  <div className={chatStyle["context-prompt-row"]} key={i}>
                    <select
                      value={c.role}
                      className={chatStyle["context-role"]}
                      onChange={(e) =>
                        updateContextPrompt(i, {
                          ...c,
                          role: e.target.value as any,
                        })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={c.content}
                      type="text"
                      className={chatStyle["context-content"]}
                      rows={1}
                      onInput={(e) =>
                        updateContextPrompt(i, {
                          ...c,
                          content: e.currentTarget.value as any,
                        })
                      }
                    />
                    <IconButton
                      icon={<DeleteIcon />}
                      className={chatStyle["context-delete-button"]}
                      onClick={() => removeContextPrompt(i)}
                      bordered
                    />
                  </div>
                ))}

                <div className={chatStyle["context-prompt-row"]}>
                  <IconButton
                    icon={<AddIcon />}
                    text={Locale.Context.Add}
                    bordered
                    className={chatStyle["context-prompt-button"]}
                    onClick={() =>
                      addContextPrompt({
                        role: "system",
                        content: "",
                        date: "",
                      })
                    }
                  />
                </div>
              </div>
              */}
              <div className={chatStyle["memory-prompt"]}>
                <div className={chatStyle["memory-prompt-title"]}>
                  <span>
                    {Locale.Memory.Title} ({session.lastSummarizeIndex} /{" "}
                    {session.messages.length})
                  </span>

                  <label className={chatStyle["memory-prompt-action"]}>
                    {Locale.Memory.Send}
                    <input
                      type="checkbox"
                      checked={session.sendMemory}
                      onChange={() =>
                        chatStore.updateCurrentSession(
                          (session) =>
                            (session.sendMemory = !session.sendMemory),
                        )
                      }
                    ></input>
                  </label>
                </div>
                <div className={chatStyle["memory-prompt-content"]}>
                  {session.memoryPrompt || Locale.Memory.EmptyContent}
                </div>
                {compressedEndIndex > 0 && (
                  <div className={chatStyle["memory-prompt-compressed"]}>
                    <div className={chatStyle["memory-prompt-note"]}>
                      {Locale.Memory.CompressedNotice}
                    </div>
                    <button
                      type="button"
                      className={chatStyle["memory-prompt-toggle"]}
                      onClick={() =>
                        setShowCompressedMessages(!showCompressedMessages)
                      }
                    >
                      {showCompressedMessages
                        ? Locale.Memory.CollapseCompressed
                        : Locale.Memory.ExpandCompressed}
                    </button>
                    {showCompressedMessages && (
                      <div className={chatStyle["memory-prompt-history"]}>
                        {compressedMessages.length === 0 ? (
                          <div
                            className={chatStyle["memory-prompt-history-empty"]}
                          >
                            {Locale.Memory.EmptyCompressedHistory}
                          </div>
                        ) : (
                          compressedMessages.map((m, i) => (
                            <div
                              key={`${m.id ?? i}-${m.date}`}
                              className={
                                chatStyle["memory-prompt-history-item"]
                              }
                            >
                              <div
                                className={
                                  chatStyle["memory-prompt-history-role"]
                                }
                              >
                                {m.role === "user"
                                  ? Locale.Export.MessageFromYou
                                  : Locale.Export.MessageFromChatGPT}
                              </div>
                              <div
                                className={
                                  chatStyle["memory-prompt-history-content"]
                                }
                              >
                                {m.content}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          </Modal>
        </div>
      )}
    </div>
  );
}

function useSubmitHandler() {
  const config = useChatStore((state) => state.config);
  const submitKey = config.submitKey;

  const shouldSubmit = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return false;
    if (e.key === "Enter" && e.nativeEvent.isComposing) return false;
    return (
      (config.submitKey === SubmitKey.AltEnter && e.altKey) ||
      (config.submitKey === SubmitKey.CtrlEnter && e.ctrlKey) ||
      (config.submitKey === SubmitKey.ShiftEnter && e.shiftKey) ||
      (config.submitKey === SubmitKey.MetaEnter && e.metaKey) ||
      (config.submitKey === SubmitKey.Enter &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey)
    );
  };

  return {
    submitKey,
    shouldSubmit,
  };
}

export function PromptHints(props: {
  prompts: Prompt[];
  onPromptSelect: (prompt: Prompt) => void;
}) {
  if (props.prompts.length === 0) return null;

  return (
    <div className={styles["prompt-hints"]}>
      {props.prompts.map((prompt, i) => (
        <div
          className={styles["prompt-hint"]}
          key={prompt.title + i.toString()}
          onClick={() => props.onPromptSelect(prompt)}
        >
          <div className={styles["hint-title"]}>{prompt.title}</div>
          <div className={styles["hint-content"]}>{prompt.content}</div>
        </div>
      ))}
    </div>
  );
}

function useScrollToBottom() {
  // for auto-scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // auto scroll
  useLayoutEffect(() => {
    const dom = scrollRef.current;
    if (dom && autoScroll) {
      setTimeout(() => (dom.scrollTop = dom.scrollHeight), 1);
    }
  });

  return {
    scrollRef,
    autoScroll,
    setAutoScroll,
  };
}

export function Chat(props: {
  showSideBar?: () => void;
  sideBarShowing?: boolean;
}) {
  type RenderMessage = Message & {
    preview?: boolean;
    compressedSummary?: boolean;
    compressedMessages?: Message[];
    sourceIndex?: number;
  };

  const chatStore = useChatStore();
  const [session, sessionIndex] = useChatStore((state) => [
    state.currentSession(),
    state.currentSessionIndex,
  ]);
  const fontSize = useChatStore((state) => state.config.fontSize);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const exportCaptureRef = useRef<HTMLDivElement>(null);
  const [userInput, setUserInput] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCompressedInChat, setShowCompressedInChat] = useState(false);
  const [reasoningVisibility, setReasoningVisibility] = useState<
    Record<string, boolean>
  >({});
  const { submitKey, shouldSubmit } = useSubmitHandler();
  const { scrollRef, setAutoScroll } = useScrollToBottom();
  const [hitBottom, setHitBottom] = useState(false);

  const isMobile = useScreen((screen) => screen.isMobile);

  const onChatBodyScroll = (e: HTMLElement) => {
    const isTouchBottom = e.scrollTop + e.clientHeight >= e.scrollHeight - 20;
    setHitBottom(isTouchBottom);
  };

  // prompt hints
  const promptStore = usePromptStore();
  const [promptHints, setPromptHints] = useState<Prompt[]>([]);
  const onSearch = useDebouncedCallback(
    (text: string) => {
      setPromptHints(promptStore.search(text));
    },
    100,
    { leading: true, trailing: true },
  );

  const onPromptSelect = (prompt: Prompt) => {
    setUserInput(prompt.content);
    setPromptHints([]);
    inputRef.current?.focus();
  };

  const resizeImageToJpeg = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("read file failed"));
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("load image failed"));
      image.src = dataUrl;
    });

    const maxEdge = 800;
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height)) || 1;
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas unavailable");
    }

    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  };

  const clearImageInputValues = () => {
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  };

  const onPickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const picked = Array.from(files).slice(0, 3);
    try {
      const converted = await Promise.all(picked.map(resizeImageToJpeg));
      setPendingImages((prev) => prev.concat(converted));
    } catch (error) {
      showToast(Locale.Store.Error);
      console.error("[Image Convert]", error);
    } finally {
      clearImageInputValues();
    }
  };

  const openImagePicker = () => {
    if (!isMobile) {
      imageInputRef.current?.click();
      return;
    }

    let closeModal = () => {};
    closeModal = showModal({
      title: Locale.Chat.Actions.UploadImage,
      actions: [
        <IconButton
          key="take-photo"
          icon={<CameraIcon />}
          bordered
          text={Locale.Chat.Actions.TakePhoto}
          onClick={() => {
            closeModal();
            cameraInputRef.current?.click();
          }}
        />,
        <IconButton
          key="choose-album"
          icon={<AddIcon />}
          bordered
          text={Locale.Chat.Actions.ChooseFromAlbum}
          onClick={() => {
            closeModal();
            imageInputRef.current?.click();
          }}
        />,
      ],
    });
  };

  const scrollInput = () => {
    const dom = inputRef.current;
    if (!dom) return;
    const paddingBottomNum: number = parseInt(
      window.getComputedStyle(dom).paddingBottom,
      10,
    );
    dom.scrollTop = dom.scrollHeight - dom.offsetHeight + paddingBottomNum;
  };

  // only search prompts when user input is short
  const SEARCH_TEXT_LIMIT = 30;
  const onInput = (text: string) => {
    scrollInput();
    setUserInput(text);
    const n = text.trim().length;

    // clear search results
    if (n === 0) {
      setPromptHints([]);
    } else if (!chatStore.config.disablePromptHint && n < SEARCH_TEXT_LIMIT) {
      // check if need to trigger auto completion
      if (text.startsWith("/")) {
        let searchText = text.slice(1);
        if (searchText.length === 0) {
          searchText = " ";
        }
        onSearch(searchText);
      }
    }
  };

  // submit user input
  const onUserSubmit = () => {
    if (userInput.length <= 0 && pendingImages.length === 0) return;
    setIsLoading(true);
    chatStore
      .onUserInput(userInput, pendingImages)
      .then(() => setIsLoading(false));
    setUserInput("");
    setPendingImages([]);
    setPromptHints([]);
    clearImageInputValues();
    if (!isMobile) inputRef.current?.focus();
    setAutoScroll(true);
  };

  // stop response
  const onUserStop = (messageId: number) => {
    ControllerPool.stop(sessionIndex, messageId);
  };

  // check if should send message
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSubmit(e)) {
      onUserSubmit();
      e.preventDefault();
    }
  };

  const getMessageReorderId = (message: RenderMessage, index: number) => {
    if (message.compressedSummary) {
      return undefined;
    }
    const sourcePart =
      typeof message.sourceIndex === "number"
        ? `src-${message.sourceIndex}`
        : `idx-${index}`;
    const rolePart = message.role;
    const typePart = message.compressedSummary
      ? "compressed"
      : message.preview
      ? "preview"
      : "normal";
    return `${session.id}:${sourcePart}:${rolePart}:${typePart}`;
  };
  const onRightClick = (e: any, message: Message) => {
    // auto fill user input
    if (message.role === "user") {
      setUserInput(message.content ?? "");
    }

    // copy to clipboard
    if (selectOrCopy(e.currentTarget, message.content ?? "")) {
      e.preventDefault();
    }
  };

  const onResend = (botIndexInSession: number) => {
    // find last user input message and resend
    for (let i = botIndexInSession; i >= 0; i -= 1) {
      if (session.messages[i]?.role === "user") {
        setIsLoading(true);
        chatStore
          .onUserInput(
            session.messages[i].content ?? "",
            session.messages[i].imageUrls,
          )
          .then(() => setIsLoading(false));
        chatStore.updateCurrentSession((session) =>
          session.messages.splice(i, 2),
        );
        inputRef.current?.focus();
        return;
      }
    }
  };

  const getReasoningKey = (message: Message & { sourceIndex?: number }) =>
    `${message.sourceIndex ?? message.id ?? "unknown"}`;

  const onToggleReasoning = (message: Message & { sourceIndex?: number }) => {
    const key = getReasoningKey(message);
    setReasoningVisibility((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const onSelectModelForNewChat = (modelName: string) => {
    chatStore.updateConfig((config) => {
      config.modelConfig.model = modelName;
    });
  };

  const config = useChatStore((state) => state.config);
  const currentModel =
    session.messages
      .slice()
      .reverse()
      .find((m) => m.model)?.model ?? config.modelConfig.model;
  const headerModelName = getHeaderModelLabel(currentModel);
  const headerSubTitle = Locale.Chat.SubTitle(
    session.messages.length,
    headerModelName,
  );
  const hasMessagesToExport = session.messages.some((msg) => !msg.isError);

  const context: RenderMessage[] = session.context.slice();
  const compressedEndIndex = Math.max(
    0,
    Math.min(session.lastSummarizeIndex, session.messages.length),
  );
  const compressedMessages = session.messages
    .slice(0, compressedEndIndex)
    .filter((m) => !m.isError);
  const shouldShowCompressedSummaryInChat =
    compressedEndIndex > 0 && !!session.memoryPrompt;

  if (context.length === 0 && session.messages.length === 0) {
    const model =
      session.messages.find((m) => m.model)?.model ?? config.modelConfig.model;
    context.push({ ...BOT_HELLO, model });
  }

  const renderedSessionMessages: RenderMessage[] =
    shouldShowCompressedSummaryInChat
      ? [
          {
            ...createMessage({
              role: "assistant",
              content: session.memoryPrompt,
              model: compressedMessages
                .slice()
                .reverse()
                .find((m) => m.role === "assistant" && !!m.model)?.model,
            }),
            date: compressedMessages.at(-1)?.date ?? session.lastUpdate,
            compressedSummary: true,
            compressedMessages,
            sourceIndex: compressedEndIndex - 1,
          },
          ...session.messages
            .slice(compressedEndIndex)
            .map((m, idx) => ({ ...m, sourceIndex: idx + compressedEndIndex })),
        ]
      : session.messages.map((m, idx) => ({ ...m, sourceIndex: idx }));

  // preview messages
  const messages = context.concat(renderedSessionMessages).concat(
    isLoading
      ? [
          {
            ...createMessage({
              role: "assistant",
              content: "……",
            }),
            preview: true,
          },
        ]
      : [],
  );
  const [showPromptModal, setShowPromptModal] = useState(false);

  useEffect(() => {
    setShowCompressedInChat(false);
    setReasoningVisibility({});
  }, [session.id, session.lastSummarizeIndex]);

  // Auto focus
  useEffect(() => {
    if (props.sideBarShowing && isMobile) return;
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.chat} key={session.id}>
      <div className={styles["window-header"]}>
        <div
          className={styles["window-header-title"]}
          onClick={props?.showSideBar}
        >
          <div
            className={`${styles["window-header-main-title"]} ${styles["chat-body-title"]}`}
            onClick={() => {
              const newTopic = prompt(Locale.Chat.Rename, session.topic);
              if (newTopic && newTopic !== session.topic) {
                chatStore.updateCurrentSession(
                  (session) => (session.topic = newTopic!),
                );
              }
            }}
          >
            {session.topic}
          </div>
          <div className={styles["window-header-sub-title"]}>
            {headerSubTitle}
          </div>
        </div>
        <div className={styles["window-actions"]}>
          <div className={styles["window-action-button"] + " " + styles.mobile}>
            <IconButton
              icon={<MenuIcon />}
              bordered
              title={Locale.Chat.Actions.ChatList}
              onClick={props?.showSideBar}
            />
          </div>
          <div className={styles["window-action-button"]}>
            <IconButton
              icon={<BrainIcon />}
              bordered
              title={Locale.Chat.Actions.CompressedHistory}
              disabled={!session.memoryPrompt}
              onClick={() => {
                setShowPromptModal(true);
              }}
            />
          </div>
          <div className={styles["window-action-button"]}>
            <IconButton
              icon={<ExportIcon />}
              bordered
              title={Locale.Chat.Actions.Export}
              disabled={!hasMessagesToExport}
              onClick={() => {
                exportMessages(
                  session.messages.filter((msg) => !msg.isError),
                  session.topic,
                  exportCaptureRef.current,
                );
              }}
            />
          </div>
        </div>

        <PromptToast
          showToast={false}
          showModal={showPromptModal}
          setShowModal={setShowPromptModal}
        />
      </div>

      <div
        className={styles["chat-body"]}
        ref={scrollRef}
        onScroll={(e) => onChatBodyScroll(e.currentTarget)}
        onWheel={(e) => setAutoScroll(hitBottom && e.deltaY > 0)}
        onTouchStart={() => {
          inputRef.current?.blur();
          setAutoScroll(false);
        }}
      >
        <div ref={exportCaptureRef}>
          <AnimatedReorderGroup animationDuration={220} animationMinPixel={2}>
            {messages.map((message, i) => {
            const isUser = message.role === "user";
            const isCompressedSummary = !!message.compressedSummary;
            const isModelPicker =
              !isUser &&
              message.content === BOT_HELLO.content &&
              session.messages.length === 0;
            const hasAssistantText =
              typeof message.content === "string" &&
              message.content.trim().length > 0;
            const hasReasoning = (message.reasoning?.trim().length ?? 0) > 0;
            const reasoningVisible =
              !!reasoningVisibility[getReasoningKey(message)];
            const isThinking =
              !isUser && !!message.streaming && !hasAssistantText;
            const isReasoningOnlyStreaming =
              !isUser &&
              !!message.streaming &&
              !hasAssistantText &&
              hasReasoning &&
              !isModelPicker &&
              !isCompressedSummary;
            const thinkingPreview =
              getReasoningStreamSegment(message.id) ||
              getLastReasoningSegment(message.reasoning ?? "");
            const showInlineThinkingDuringLoading =
              isReasoningOnlyStreaming && thinkingPreview.trim().length > 0;
            const showLoadingOnly =
              (message.preview || !hasAssistantText) &&
              !isUser &&
              !isModelPicker;
            const reorderId = getMessageReorderId(message, i);
            const avatarReorderId = reorderId ? `avatar:${reorderId}` : undefined;
            const renderKey = reorderId ?? `static:${session.id}:${i}`;

            return (
              <div
                key={renderKey}
                className={
                  isUser ? styles["chat-message-user"] : styles["chat-message"]
                }
              >
                <div
                  className={`${styles["chat-message-container"]} ${
                    isCompressedSummary
                      ? styles["chat-message-container-full"]
                      : ""
                  }`}
                >
                  {!isCompressedSummary && (
                    <div
                      className={styles["chat-message-avatar"]}
                      data-reorder-id={avatarReorderId}
                    >
                      <Avatar role={message.role} model={message.model} />
                      {(message.preview || message.streaming) && (
                        <div className={styles["chat-message-status"]}>
                          {isThinking
                            ? Locale.Chat.Thinking
                            : Locale.Chat.Typing}
                        </div>
                      )}
                    </div>
                  )}
                  {showInlineThinkingDuringLoading && (
                    <div className={styles["chat-thinking-inline"]}>
                      <div className={styles["chat-thinking-inline-content"]}>
                        <Markdown content={thinkingPreview} />
                      </div>
                    </div>
                  )}
                  <div
                    className={styles["chat-message-item"]}
                    data-reorder-id={reorderId}
                  >
                    {!isUser &&
                      !isModelPicker &&
                      !isCompressedSummary &&
                      !((message.preview ?? "") || (message.content?.length ?? 0) === 0) && (
                        <div className={styles["chat-message-top-actions"]}>
                          {message.streaming ? (
                            <div
                              className={styles["chat-message-top-action"]}
                              onClick={() => onUserStop(message.id ?? i)}
                            >
                              {Locale.Chat.Actions.Stop}
                            </div>
                          ) : (
                            <div
                              className={styles["chat-message-top-action"]}
                              onClick={() => onResend(message.sourceIndex ?? i)}
                            >
                              {Locale.Chat.Actions.Retry}
                            </div>
                          )}

                          <div
                            className={styles["chat-message-top-action"]}
                            onClick={() => copyToClipboard(message.content ?? "")}
                          >
                            {Locale.Chat.Actions.Copy}
                          </div>
                        </div>
                      )}
                    {showLoadingOnly ? (
                      <LoadingIcon />
                    ) : isModelPicker ? (
                      <div className={styles["model-picker"]}>
                        <div className={styles["model-picker-title"]}>
                          {Locale.Store.ModelPicker.Title}
                        </div>
                        <div className={styles["model-picker-subtitle"]}>
                          {Locale.Store.ModelPicker.SubTitle}
                        </div>
                        <div className={styles["model-picker-list"]}>
                          {ALL_MODELS.filter((m) => m.available).map((m) => {
                            const selected =
                              config.modelConfig.model === m.name;
                            return (
                              <div
                                key={m.name}
                                className={
                                  styles["model-picker-item"] +
                                  " " +
                                  (selected
                                    ? styles["model-picker-item-selected"]
                                    : "")
                                }
                                onClick={() => onSelectModelForNewChat(m.name)}
                              >
                                <div className={styles["model-picker-name"]}>
                                  {getCompactModelName(m.name)}
                                </div>
                                <div className={styles["model-picker-persona"]}>
                                  {getModelPersona(m.name)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : isCompressedSummary ? (
                      <div className={styles["chat-compressed-summary"]}>
                        <div className={styles["chat-compressed-note"]}>
                          {Locale.Memory.CompressedNotice}
                        </div>
                        <div
                          className="markdown-body"
                          style={{ fontSize: `${fontSize}px` }}
                        >
                          <Markdown content={message.content ?? ""} />
                        </div>
                        <button
                          type="button"
                          className={styles["chat-compressed-toggle"]}
                          onClick={() => setShowCompressedInChat((v) => !v)}
                        >
                          {showCompressedInChat
                            ? Locale.Memory.CollapseCompressed
                            : Locale.Memory.ExpandCompressed}
                        </button>
                        {showCompressedInChat && (
                          <div className={styles["chat-compressed-history"]}>
                            {(message.compressedMessages ?? []).length === 0 ? (
                              <div className={styles["chat-compressed-empty"]}>
                                {Locale.Memory.EmptyCompressedHistory}
                              </div>
                            ) : (
                              (message.compressedMessages ?? []).map(
                                (m, idx) => (
                                  <div
                                    key={`${m.id ?? idx}-${m.date}`}
                                    className={
                                      styles["chat-compressed-history-item"]
                                    }
                                  >
                                    <div
                                      className={styles["chat-compressed-role"]}
                                    >
                                      {m.role === "user"
                                        ? Locale.Export.MessageFromYou
                                        : Locale.Export.MessageFromChatGPT}
                                    </div>
                                    <div
                                      className={
                                        styles["chat-compressed-content"]
                                      }
                                    >
                                      <Markdown content={m.content ?? ""} />
                                    </div>
                                  </div>
                                ),
                              )
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {isUser && !!message.imageUrls?.length && (
                          <div className={styles["chat-image-list"]}>
                            {message.imageUrls.map((url, idx) => (
                              <img
                                src={url}
                                key={message.id + "-img-" + idx}
                                className={styles["chat-image-thumb"]}
                                alt="user-upload"
                              />
                            ))}
                          </div>
                        )}
                        {hasAssistantText && (
                          <div
                            className="markdown-body"
                            style={{ fontSize: `${fontSize}px` }}
                            onContextMenu={(e) => onRightClick(e, message)}
                            onDoubleClickCapture={() => {
                              if (!isMobile) return;
                              setUserInput(message.content ?? "");
                            }}
                          >
                            <Markdown content={message.content ?? ""} />
                          </div>
                        )}
                        {!isUser && hasReasoning && (
                          <div className={styles["chat-message-reasoning"]}>
                            <div
                              className={
                                styles["chat-message-reasoning-toggle"]
                              }
                              onClick={() => onToggleReasoning(message)}
                            >
                              {reasoningVisible
                                ? Locale.Chat.Actions.HideReasoning
                                : Locale.Chat.Actions.ShowReasoning}
                            </div>
                            {reasoningVisible && (
                              <div
                                className={
                                  styles["chat-message-reasoning-content"]
                                }
                              >
                                <Markdown content={message.reasoning ?? ""} />
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {!isUser &&
                    !message.preview &&
                    !isCompressedSummary &&
                    !isModelPicker &&
                    !showInlineThinkingDuringLoading && (
                      <div className={styles["chat-message-actions"]}>
                        <div className={styles["chat-message-action-date"]}>
                          {renderModelName(message.model)}
                          {formatRelativeDateTime(message.date)}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            );
            })}
          </AnimatedReorderGroup>
        </div>
      </div>

      <div className={styles["chat-input-panel"]}>
        <PromptHints prompts={promptHints} onPromptSelect={onPromptSelect} />
        {pendingImages.length > 0 && (
          <div className={styles["chat-input-images"]}>
            {pendingImages.map((url, i) => (
              <div className={styles["chat-input-image-item"]} key={url + i}>
                <img
                  src={url}
                  className={styles["chat-input-image-thumb"]}
                  alt="pending-upload"
                />
                <div
                  className={styles["chat-input-image-remove"]}
                  onClick={() => {
                    setPendingImages((prev) => {
                      const next = prev.filter((_, idx) => idx !== i);
                      if (next.length === 0) {
                        clearImageInputValues();
                      }
                      return next;
                    });
                  }}
                >
                  ×
                </div>
              </div>
            ))}
          </div>
        )}
        <div className={styles["chat-input-panel-inner"]}>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className={styles["chat-image-input"]}
            onChange={(e) => onPickImages(e.currentTarget.files)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className={styles["chat-image-input"]}
            onChange={(e) => onPickImages(e.currentTarget.files)}
          />
          <IconButton
            icon={<CameraIcon />}
            className={styles["chat-image-picker"]}
            onClick={openImagePicker}
            title={Locale.Chat.Actions.UploadImage}
          />
          <TextareaAutosize
            ref={inputRef}
            className={styles["chat-input"]}
            placeholder={Locale.Chat.Input(submitKey, isMobileScreen())}
            maxRows={4}
            onInput={(e) => onInput(e.currentTarget.value)}
            value={userInput}
            onKeyDown={onInputKeyDown}
            onFocus={() => setAutoScroll(true)}
            onBlur={() => {
              setAutoScroll(false);
              setTimeout(() => setPromptHints([]), 500);
            }}
            autoFocus={!props?.sideBarShowing}
          />
          <IconButton
            icon={<SendWhiteIcon />}
            text={Locale.Chat.Send}
            className={styles["chat-input-send"]}
            noDark
            onClick={onUserSubmit}
          />
        </div>
      </div>
    </div>
  );
}

function renderModelName(model?: string) {
  const compactName = getCompactModelName(model);
  if (!compactName) return null;
  return `${compactName} · `;
}
