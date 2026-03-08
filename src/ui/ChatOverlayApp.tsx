import { useEffect, useState, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { RobotAvatar } from './RobotAvatar';
import type { ChatGptDomAdapter } from '../lib/chatgptDomAdapter';
import type { ChatState } from '../lib/types';

interface ChatOverlayAppProps {
  adapter: ChatGptDomAdapter;
  initialOverlayEnabled: boolean;
  onOverlayEnabledChange: (enabled: boolean) => void;
}

const EMPTY_STATE: ChatState = {
  messages: [],
  status: 'waiting-input',
  composerAvailable: false,
  syncError: null,
  overlayEnabled: true,
};

export function ChatOverlayApp({
  adapter,
  initialOverlayEnabled,
  onOverlayEnabledChange,
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

  function handleOverlayToggle() {
    const nextEnabled = !overlayEnabled;
    adapter.setOverlayEnabled(nextEnabled);
    onOverlayEnabledChange(nextEnabled);
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
      <button
        className="chrome-ai-toggle"
        type="button"
        onClick={handleOverlayToggle}
        aria-label={overlayEnabled ? 'Hide overlay' : 'Show overlay'}
        title={overlayEnabled ? 'Hide overlay' : 'Show overlay'}
      >
        <span className="chrome-ai-toggle-icon" aria-hidden="true">
          {overlayEnabled ? '◐' : '◯'}
        </span>
      </button>

      {!overlayEnabled ? null : (
        <main className="chrome-ai-overlay">
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
                    chatState.messages.map((msg, idx) => (
                      <div key={idx} className={`chrome-ai-chat-balloon chrome-ai-chat-balloon-${msg.role}`}>
                        {msg.text}
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
                id="chrome-ai-input"
                aria-label="Message input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Type here and send through the hidden ChatGPT composer..."
                rows={3}
                disabled={!chatState.composerAvailable}
              />
              <div className="chrome-ai-composer-footer">
                <span>
                  {submitError
                    ? submitError
                    : chatState.composerAvailable
                      ? 'Input will be forwarded to ChatGPT. Command+Enter also sends.'
                      : 'Composer unavailable on this page.'}
                </span>
                <button type="submit" disabled={!chatState.composerAvailable || !draft.trim()}>
                  Send
                </button>
              </div>
            </form>
          </section>
        </main>
      )}
    </div>
  );
}
