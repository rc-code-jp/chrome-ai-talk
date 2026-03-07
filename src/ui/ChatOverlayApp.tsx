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
  const latestAssistantMessage = [...chatState.messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const latestUserMessage = [...chatState.messages]
    .reverse()
    .find((message) => message.role === 'user');

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
        aria-label={overlayEnabled ? 'Hide overlay' : 'Show overlay'}
        title={overlayEnabled ? 'Hide overlay' : 'Show overlay'}
      >
        <span className="chrome-ai-toggle-icon" aria-hidden="true">
          {overlayEnabled ? '◐' : '◯'}
        </span>
      </button>

      {!overlayEnabled ? null : (
        <main className="chrome-ai-overlay">
          <section className="chrome-ai-stage">
            <section className="chrome-ai-scene">
              <div className="chrome-ai-scene-glow" />
              <div className="chrome-ai-robot-wrap">
                <RobotAvatar status={chatState.status} />
              </div>

              <div className="chrome-ai-scene-bubbles">
                <article className="chrome-ai-hero-bubble chrome-ai-hero-bubble-assistant">
                  <p className="chrome-ai-role">Robot</p>
                  {latestAssistantMessage ? (
                    <div className="chrome-ai-bubble chrome-ai-bubble-assistant">
                      <p>{latestAssistantMessage.text}</p>
                      {latestAssistantMessage.isStreaming ? (
                        <span className="chrome-ai-streaming">Responding...</span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="chrome-ai-bubble chrome-ai-bubble-assistant">
                      <p>Hello. I am ready when your ChatGPT tab is ready.</p>
                    </div>
                  )}
                </article>

                <article className="chrome-ai-hero-bubble chrome-ai-hero-bubble-user">
                  <p className="chrome-ai-role">You</p>
                  {latestUserMessage ? (
                    <div className="chrome-ai-bubble chrome-ai-bubble-user">
                      <p>{latestUserMessage.text}</p>
                    </div>
                  ) : (
                    <div className="chrome-ai-bubble chrome-ai-bubble-user chrome-ai-bubble-muted">
                      <p>Ask the robot something.</p>
                    </div>
                  )}
                </article>
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
