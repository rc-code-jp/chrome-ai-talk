import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
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

  return (
    <div className="chrome-ai-shell" data-overlay-enabled={overlayEnabled}>
      <button
        className="chrome-ai-toggle"
        type="button"
        onClick={handleOverlayToggle}
      >
        {overlayEnabled ? 'Hide overlay' : 'Show overlay'}
      </button>

      {!overlayEnabled ? null : (
        <main className="chrome-ai-overlay">
          <section className="chrome-ai-avatar-panel">
            <div className="chrome-ai-avatar-card">
              <RobotAvatar status={chatState.status} />
              <div className="chrome-ai-status">
                <p className="chrome-ai-status-label">Robot status</p>
                <strong>{statusLabel(chatState.status)}</strong>
                <span>
                  {chatState.syncError
                    ? chatState.syncError
                    : 'Mirroring the ChatGPT conversation behind this layer.'}
                </span>
              </div>
            </div>
          </section>

          <section className="chrome-ai-chat-panel">
            <div className="chrome-ai-chat-frame">
              <header className="chrome-ai-chat-header">
                <div>
                  <p>Chrome AI Talk</p>
                  <h1>Robot conversation overlay</h1>
                </div>
                <span className="chrome-ai-pill">{chatState.messages.length} messages</span>
              </header>

              <div className="chrome-ai-messages">
                {chatState.messages.length ? (
                  chatState.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`chrome-ai-message chrome-ai-message-${message.role}`}
                    >
                      <p className="chrome-ai-role">
                        {message.role === 'user' ? 'You' : 'Robot'}
                      </p>
                      <div className="chrome-ai-bubble">
                        <p>{message.text}</p>
                        {message.isStreaming ? (
                          <span className="chrome-ai-streaming">Responding...</span>
                        ) : null}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="chrome-ai-empty">
                    <p>Conversation not detected yet.</p>
                    <span>Open an active ChatGPT chat to start syncing.</span>
                  </div>
                )}
              </div>

              <form className="chrome-ai-composer" onSubmit={handleSubmit}>
                <label className="chrome-ai-composer-label" htmlFor="chrome-ai-input">
                  Talk to the robot
                </label>
                <textarea
                  id="chrome-ai-input"
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
                        ? 'Input will be forwarded to ChatGPT.'
                        : 'Composer unavailable on this page.'}
                  </span>
                  <button type="submit" disabled={!chatState.composerAvailable || !draft.trim()}>
                    Send
                  </button>
                </div>
              </form>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function statusLabel(status: ChatState['status']) {
  switch (status) {
    case 'idle':
      return 'Listening';
    case 'streaming':
      return 'Thinking';
    case 'sync-error':
      return 'Lost sync';
    case 'waiting-input':
      return 'Ready';
    default:
      return 'Ready';
  }
}
