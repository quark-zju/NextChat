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
import DeleteIcon from "../icons/delete.svg";

import {
  ALL_MODELS,
  Message,
  SubmitKey,
  useChatStore,
  BOT_HELLO,
  ROLES,
  createMessage,
} from "../store";
import { useScreen } from "../store/screen";

import {
  copyToClipboard,
  downloadAs,
  getEmojiUrl,
  isMobileScreen,
  selectOrCopy,
} from "../utils";

import dynamic from "next/dynamic";

import { ControllerPool, requestReasoningTranslation } from "../requests";
import { Prompt, usePromptStore } from "../store/prompt";
import Locale, { getLang } from "../locales";

import { IconButton } from "./button";
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

function isMostlyEnglish(text: string) {
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return latinCount >= 40 && latinCount > cjkCount * 2;
}

function getCompactModelName(model?: string) {
  if (!model || model.length === 0) return "";
  return model.includes("/") ? model.split("/").at(-1) ?? model : model;
}

function getModelPersona(model: string) {
  const provider = getProviderByModel(model);
  if (provider === "anthropic") return Locale.Store.ModelPicker.Claude;
  if (provider === "google") return Locale.Store.ModelPicker.Gemini;
  return Locale.Store.ModelPicker.GPT;
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

function exportMessages(messages: Message[], topic: string) {
  const mdText =
    `# ${topic}\n\n` +
    messages
      .map((m) => {
        return m.role === "user"
          ? `## ${Locale.Export.MessageFromYou}:\n${m.content}`
          : `## ${Locale.Export.MessageFromChatGPT}:\n${m.content.trim()}`;
      })
      .join("\n\n");
  const filename = `${topic}.md`;

  showModal({
    title: Locale.Export.Title,
    children: (
      <div className="markdown-body">
        <pre className={styles["export-content"]}>{mdText}</pre>
      </div>
    ),
    actions: [
      <IconButton
        key="copy"
        icon={<CopyIcon />}
        bordered
        text={Locale.Export.Copy}
        onClick={() => copyToClipboard(mdText)}
      />,
      <IconButton
        key="download"
        icon={<DownloadIcon />}
        bordered
        text={Locale.Export.Download}
        onClick={() => downloadAs(mdText, filename)}
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
  const context = session.context;

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
            {Locale.Context.Toast(context.length)}
          </span>
        </div>
      )}
      {props.showModal && (
        <div className="modal-mask">
          <Modal
            title={Locale.Context.Edit}
            onClose={() => props.setShowModal(false)}
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
  type RenderMessage = Message & { preview?: boolean };

  const chatStore = useChatStore();
  const [session, sessionIndex] = useChatStore((state) => [
    state.currentSession(),
    state.currentSessionIndex,
  ]);
  const fontSize = useChatStore((state) => state.config.fontSize);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [userInput, setUserInput] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
    const scale =
      Math.min(1, maxEdge / Math.max(img.width, img.height)) || 1;
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

  const onPickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const picked = Array.from(files).slice(0, 3);
    try {
      const converted = await Promise.all(picked.map(resizeImageToJpeg));
      setPendingImages((prev) => prev.concat(converted));
    } catch (error) {
      showToast(Locale.Store.Error);
      console.error("[Image Convert]", error);
    }
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
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
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
  const onRightClick = (e: any, message: Message) => {
    // auto fill user input
    if (message.role === "user") {
      setUserInput(message.content);
    }

    // copy to clipboard
    if (selectOrCopy(e.currentTarget, message.content)) {
      e.preventDefault();
    }
  };

  const onResend = (botIndex: number) => {
    // find last user input message and resend
    for (let i = botIndex; i >= 0; i -= 1) {
      if (messages[i].role === "user") {
        setIsLoading(true);
        chatStore
          .onUserInput(messages[i].content, messages[i].imageUrls)
          .then(() => setIsLoading(false));
        chatStore.updateCurrentSession((session) =>
          session.messages.splice(i, 2),
        );
        inputRef.current?.focus();
        return;
      }
    }
  };

  const onToggleReasoning = (message: Message) => {
    chatStore.updateCurrentSession((session) => {
      const target = session.messages.find((m) => m.id === message.id);
      if (target) {
        target.reasoningVisible = !target.reasoningVisible;
      }
    });
  };

  const onSelectModelForNewChat = (modelName: string) => {
    chatStore.updateConfig((config) => {
      config.modelConfig.model = modelName;
    });
    showToast(Locale.Store.ModelPicker.Selected(getCompactModelName(modelName)));
  };

  const onTranslateReasoning = async (message: Message) => {
    if (!message.reasoning || message.reasoningTranslating) return;

    chatStore.updateCurrentSession((session) => {
      const target = session.messages.find((m) => m.id === message.id);
      if (target) {
        target.reasoningTranslating = true;
      }
    });

    try {
      const result = await requestReasoningTranslation(message.reasoning, {
        targetLanguage: "zh-CN",
      });
      chatStore.updateCurrentSession((session) => {
        const target = session.messages.find((m) => m.id === message.id);
        if (target) {
          target.reasoningTranslated = result.translated;
        }
      });
    } catch (error) {
      showToast(Locale.Store.Error);
      console.error("[Reasoning Translate]", error);
    } finally {
      chatStore.updateCurrentSession((session) => {
        const target = session.messages.find((m) => m.id === message.id);
        if (target) {
          target.reasoningTranslating = false;
        }
      });
    }
  };

  const config = useChatStore((state) => state.config);

  const context: RenderMessage[] = session.context.slice();

  if (
    context.length === 0 &&
    session.messages.at(0)?.content !== BOT_HELLO.content
  ) {
    const model =
      session.messages.find((m) => m.model)?.model ?? config.modelConfig.model;
    context.push({ ...BOT_HELLO, model });
  }

  // preview messages
  const messages = context.concat(session.messages as RenderMessage[]).concat(
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

  // Auto focus
  useEffect(() => {
    if (props.sideBarShowing && isMobile) return;
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (getLang() !== "cn") return;

    const target = session.messages.find(
      (m) =>
        m.role === "assistant" &&
        !m.streaming &&
        !!m.reasoning &&
        !m.reasoningTranslated &&
        !m.reasoningTranslating &&
        isMostlyEnglish(m.reasoning),
    );

    if (!target) return;
    onTranslateReasoning(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.messages]);

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
            {Locale.Chat.SubTitle(session.messages.length)}
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
              onClick={() => {
                exportMessages(
                  session.messages.filter((msg) => !msg.isError),
                  session.topic,
                );
              }}
            />
          </div>
        </div>

        <PromptToast
          showToast={!hitBottom && false}
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
        {messages.map((message, i) => {
          const isUser = message.role === "user";
          const isModelPicker =
            !isUser &&
            message.content === BOT_HELLO.content &&
            session.messages.length === 0;

          return (
            <div
              key={i}
              className={
                isUser ? styles["chat-message-user"] : styles["chat-message"]
              }
            >
              <div className={styles["chat-message-container"]}>
                <div className={styles["chat-message-avatar"]}>
                  <Avatar role={message.role} model={message.model} />
                  {(message.preview || message.streaming) && (
                    <div className={styles["chat-message-status"]}>
                      {Locale.Chat.Typing}
                    </div>
                  )}
                </div>
                <div className={styles["chat-message-item"]}>
                  {!isUser &&
                    !isModelPicker &&
                    !(message.preview || message.content.length === 0) && (
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
                            onClick={() => onResend(i)}
                          >
                            {Locale.Chat.Actions.Retry}
                          </div>
                        )}

                        <div
                          className={styles["chat-message-top-action"]}
                          onClick={() => copyToClipboard(message.content)}
                        >
                          {Locale.Chat.Actions.Copy}
                        </div>
                      </div>
                    )}
                  {(message.preview || message.content.length === 0) &&
                  !isUser &&
                  !isModelPicker ? (
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
                          const selected = config.modelConfig.model === m.name;
                          return (
                            <div
                              key={m.name}
                              className={
                                styles["model-picker-item"] +
                                " " +
                                (selected ? styles["model-picker-item-selected"] : "")
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
                      <div
                        className="markdown-body"
                        style={{ fontSize: `${fontSize}px` }}
                        onContextMenu={(e) => onRightClick(e, message)}
                        onDoubleClickCapture={() => {
                          if (!isMobile) return;
                          setUserInput(message.content);
                        }}
                      >
                        <Markdown content={message.content} />
                      </div>
                      {!isUser && !!message.reasoning && (
                        <div className={styles["chat-message-reasoning"]}>
                          <div
                            className={styles["chat-message-reasoning-toggle"]}
                            onClick={() => onToggleReasoning(message)}
                          >
                            {message.reasoningVisible
                              ? Locale.Chat.Actions.HideReasoning
                              : Locale.Chat.Actions.ShowReasoning}
                          </div>
                          {message.reasoningVisible && (
                            <div
                              className={styles["chat-message-reasoning-content"]}
                            >
                              <Markdown
                                content={
                                  message.reasoningTranslated || message.reasoning
                                }
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {!isUser && !message.preview && (
                  <div className={styles["chat-message-actions"]}>
                    <div className={styles["chat-message-action-date"]}>
                      {renderModelName(message.model)}
                      {message.date.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles["chat-input-panel"]}>
        <PromptHints prompts={promptHints} onPromptSelect={onPromptSelect} />
        {pendingImages.length > 0 && (
          <div className={styles["chat-input-images"]}>
            {pendingImages.map((url, i) => (
              <div className={styles["chat-input-image-item"]} key={url + i}>
                <img src={url} className={styles["chat-input-image-thumb"]} alt="pending-upload" />
                <div
                  className={styles["chat-input-image-remove"]}
                  onClick={() =>
                    setPendingImages((prev) => prev.filter((_, idx) => idx !== i))
                  }
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
            capture="environment"
            multiple
            className={styles["chat-image-input"]}
            onChange={(e) => onPickImages(e.currentTarget.files)}
          />
          <IconButton
            icon={<AddIcon />}
            className={styles["chat-image-picker"]}
            onClick={() => imageInputRef.current?.click()}
            bordered
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
