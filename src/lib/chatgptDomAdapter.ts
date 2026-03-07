import type { ChatMessage, ChatState, ChatStatus } from './types';

type Listener = (state: ChatState) => void;

const DEFAULT_STATE: ChatState = {
  messages: [],
  status: 'waiting-input',
  composerAvailable: false,
  syncError: null,
  overlayEnabled: true,
};

export class ChatGptDomAdapter {
  private listeners = new Set<Listener>();

  private observer: MutationObserver | null = null;

  private state: ChatState = DEFAULT_STATE;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);

    if (!this.observer) {
      this.start();
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  setOverlayEnabled(overlayEnabled: boolean) {
    this.setState({ overlayEnabled });
  }

  async sendMessage(text: string): Promise<{ ok: boolean; error?: string }> {
    const composer = this.findComposer();
    if (!composer) {
      this.refresh('Composer was not found on the page.');
      return { ok: false, error: 'Composer unavailable' };
    }

    try {
      this.setComposerText(composer, text);
    } catch {
      return { ok: false, error: 'Composer setter unavailable' };
    }

    await this.waitForComposerSync();

    const submitted = this.submitComposer(composer);
    if (!submitted) {
      return { ok: false, error: 'Submit button unavailable' };
    }

    window.setTimeout(() => {
      const activeComposer = this.findComposer();
      if (!activeComposer) {
        return;
      }

      try {
        this.setComposerText(activeComposer, '');
      } catch {
        // Ignore late cleanup failures.
      }
    }, 150);

    return { ok: true };
  }

  refresh(errorMessage?: string) {
    const nextState = this.computeState(errorMessage ?? null);
    this.state = nextState;
    this.emit();
  }

  private start() {
    this.refresh();

    this.observer = new MutationObserver(() => {
      this.refresh();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  }

  private stop() {
    this.observer?.disconnect();
    this.observer = null;
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private setState(patch: Partial<ChatState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private computeState(errorMessage: string | null): ChatState {
    const messages = this.collectMessages();
    const composer = this.findComposer();
    const composerAvailable = Boolean(composer);
    const isStreaming = this.detectStreaming();

    let status: ChatStatus = 'waiting-input';
    let syncError = errorMessage;

    if (!messages.length) {
      status = composerAvailable ? 'waiting-input' : 'sync-error';
      if (!composerAvailable && !syncError) {
        syncError = 'ChatGPT chat UI was not detected.';
      }
    } else if (isStreaming) {
      status = 'streaming';
    } else if (!composerAvailable) {
      status = 'sync-error';
      if (!syncError) {
        syncError = 'Composer disappeared from the page.';
      }
    } else {
      status = 'idle';
    }

    return {
      messages,
      composerAvailable,
      status,
      syncError,
      overlayEnabled: this.state.overlayEnabled,
    };
  }

  private collectMessages(): ChatMessage[] {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('main [data-message-author-role]'),
    );

    if (!nodes.length) {
      return [];
    }

    return nodes
      .map((node, index) => {
        const roleValue = node.dataset.messageAuthorRole;
        if (roleValue !== 'user' && roleValue !== 'assistant') {
          return null;
        }

        const content = this.extractMessageText(node);
        if (!content) {
          return null;
        }

        const isStreaming =
          roleValue === 'assistant' &&
          index === nodes.length - 1 &&
          this.detectStreaming();

        return {
          id: node.id || `${roleValue}-${index}`,
          role: roleValue,
          text: content,
          isStreaming,
        } satisfies ChatMessage;
      })
      .filter((message): message is ChatMessage => Boolean(message));
  }

  private extractMessageText(node: HTMLElement): string {
    const preferred =
      node.querySelector<HTMLElement>('[data-message-content]') ??
      node.querySelector<HTMLElement>('.markdown') ??
      node;

    const text = preferred.innerText.replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  private detectStreaming(): boolean {
    return Boolean(
      document.querySelector(
        'button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="stop"]',
      ),
    );
  }

  private findComposer(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>(
        '#prompt-textarea[contenteditable="true"], div[contenteditable="true"][data-testid="prompt-textarea"]',
      ) ??
      document.querySelector<HTMLElement>('textarea') ??
      null
    );
  }

  private setComposerText(composer: HTMLElement, text: string) {
    composer.focus();

    if (composer instanceof HTMLTextAreaElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;

      if (!nativeSetter) {
        throw new Error('Composer setter unavailable');
      }

      nativeSetter.call(composer, text);
    } else {
      composer.textContent = text;
    }

    composer.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: text,
        inputType: 'insertText',
      }),
    );
  }

  private async waitForComposerSync() {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  private submitComposer(composer: HTMLElement): boolean {
    const submitButton = this.findSubmitButton(composer);
    if (submitButton) {
      submitButton.click();
      return true;
    }

    const form = composer.closest('form');
    if (form?.requestSubmit) {
      form.requestSubmit();
      return true;
    }

    composer.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
        metaKey: true,
      }),
    );
    composer.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
        metaKey: true,
      }),
    );
    return true;
  }

  private findSubmitButton(composer: HTMLElement): HTMLButtonElement | null {
    const form = composer.closest('form');
    const button =
      form?.querySelector<HTMLButtonElement>(
        'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"], button[data-testid="fruitjuice-send-button"]',
      ) ??
      document.querySelector<HTMLButtonElement>(
        'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"], button[data-testid="fruitjuice-send-button"]',
      ) ??
      null;

    if (
      !button ||
      button.disabled ||
      button.getAttribute('aria-disabled') === 'true'
    ) {
      return null;
    }

    return button;
  }
}
