import { useEffect, useState, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { RobotAvatar } from './RobotAvatar';
import type { ChatGptDomAdapter } from '../lib/chatgptDomAdapter';
import type { ChatMessage, ChatState } from '../lib/types';

interface ChatOverlayAppProps {
  adapter: ChatGptDomAdapter;
  initialOverlayEnabled: boolean;
}

const EMPTY_STATE: ChatState = {
  messages: [],
  status: 'waiting-input',
  composerAvailable: false,
  syncError: null,
  overlayEnabled: true,
  currentModel: null,
};

function renderMessageBody(message: ChatMessage) {
  if (message.role === 'user' || !message.html) {
    return <p className="chrome-ai-chat-text">{message.text}</p>;
  }

  return (
    <div
      className="chrome-ai-rich-content"
      dangerouslySetInnerHTML={{ __html: message.html }}
    />
  );
}

export function ChatOverlayApp({
  adapter,
  initialOverlayEnabled,
}: ChatOverlayAppProps) {
  const [chatState, setChatState] = useState<ChatState>({
    ...EMPTY_STATE,
    overlayEnabled: initialOverlayEnabled,
  });
  const [draft, setDraft] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    adapter.setOverlayEnabled(initialOverlayEnabled);
    const unsubscribe = adapter.subscribe((state) => {
      setChatState(state);
    });
    return unsubscribe;
  }, [adapter, initialOverlayEnabled]);

  const overlayEnabled = chatState.overlayEnabled;
  const chatPaneRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [chatState.messages]);

  function handleChatPaneScroll() {
    const pane = chatPaneRef.current;
    if (!pane) {
      return;
    }

    const distanceFromBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 48;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextDraft = draft.trim();
    if (!nextDraft) {
      return;
    }

    shouldAutoScrollRef.current = true;
    const result = await adapter.sendMessage(nextDraft);

    if (!result.ok) {
      setSubmitError(result.error ?? 'Unable to send message.');
      return;
    }

    setSubmitError(null);
    setDraft('');
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || !event.metaKey || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    if (!chatState.composerAvailable || !draft.trim()) {
      return;
    }

    event.preventDefault();
    void adapter.sendMessage(draft.trim()).then((result) => {
      if (!result.ok) {
        setSubmitError(result.error ?? 'Unable to send message.');
        return;
      }

      setSubmitError(null);
      setDraft('');
    });
  }

  function handleNewChat() {
    const result = adapter.startNewChat();
    if (!result.ok) {
      setSubmitError(result.error ?? 'Unable to start a new chat.');
      return;
    }

    shouldAutoScrollRef.current = true;
    setSubmitError(null);
    setDraft('');
  }

  return (
    <div className="chrome-ai-shell" data-overlay-enabled={overlayEnabled}>
      {!overlayEnabled ? null : (
        <main className="chrome-ai-overlay">
          {chatState.currentModel && (
            <div className="chrome-ai-model-badge">{chatState.currentModel}</div>
          )}

          <button
            className="chrome-ai-new-chat"
            type="button"
            onClick={handleNewChat}
            aria-label="Start new chat"
            title="Start new chat"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4.5 4.5h15v10.5h-8l-4.5 4v-4h-2.5z" />
              <path d="M12 8v4M10 10h4" />
            </svg>
          </button>

          <section className="chrome-ai-stage">
            <section className="chrome-ai-scene chrome-ai-scene-split">
              {/* Left Side: Robot */}
              <div className="chrome-ai-pane-left">
                <div className="chrome-ai-robot-wrap">
                  <RobotAvatar status={chatState.status} />
                </div>
              </div>

              {/* Right Side: Chat History */}
              <div className="chrome-ai-pane-right" ref={chatPaneRef} onScroll={handleChatPaneScroll}>
                <div className="chrome-ai-chat-history">
                  {chatState.messages.length === 0 ? (
                    <div className="chrome-ai-chat-balloon chrome-ai-chat-balloon-assistant">
                      Hello. I am ready when your ChatGPT tab is ready.
                    </div>
                  ) : (
                    chatState.messages.map((msg) => (
                      <div key={msg.id} className={`chrome-ai-chat-balloon chrome-ai-chat-balloon-${msg.role}`}>
                        {renderMessageBody(msg)}
                        {msg.isStreaming && (
                          <span className="chrome-ai-streaming-indicator">...</span>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            </section>

            <form className="chrome-ai-composer chrome-ai-composer-panel" onSubmit={handleSubmit}>
              <textarea
                ref={textareaRef}
                id="chrome-ai-input"
                aria-label="Message input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Type here and send through the hidden ChatGPT composer..."
                rows={1}
                disabled={!chatState.composerAvailable}
              />
              <button className="chrome-ai-send-btn" type="submit" disabled={!chatState.composerAvailable || !draft.trim()}>
                Send
              </button>
              {submitError && <p className="chrome-ai-composer-error">{submitError}</p>}
            </form>
          </section>
        </main>
      )}
    </div>
  );
}
