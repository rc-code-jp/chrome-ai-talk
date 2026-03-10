import DOMPurify from 'dompurify';
import type { ChatMessage, ChatState, ChatStatus } from './types';

type Listener = (state: ChatState) => void;

const DEFAULT_STATE: ChatState = {
  messages: [],
  status: 'waiting-input',
  composerAvailable: false,
  syncError: null,
  overlayEnabled: true,
  currentModel: null,
};

export class ChatGptDomAdapter {
  private listeners = new Set<Listener>();

  private observer: MutationObserver | null = null;

  private refreshScheduled = false;

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
    if (overlayEnabled === this.state.overlayEnabled) {
      return;
    }

    this.state = { ...this.state, overlayEnabled };

    if (overlayEnabled) {
      if (this.listeners.size > 0 && !this.observer) {
        this.start();
        return;
      }

      this.refresh();
      return;
    }

    this.stop();
    this.emit();
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

  startNewChat(): { ok: boolean; error?: string } {
    const trigger = this.findNewChatTrigger();
    if (!trigger) {
      this.refresh('New chat trigger was not found on the page.');
      return { ok: false, error: 'New chat unavailable' };
    }

    trigger.click();
    window.setTimeout(() => {
      this.refresh();
    }, 0);

    return { ok: true };
  }

  refresh(errorMessage?: string) {
    if (!this.state.overlayEnabled) {
      return;
    }

    const nextState = this.computeState(errorMessage ?? null);
    this.state = nextState;
    this.emit();
  }

  private start() {
    if (!this.state.overlayEnabled || this.observer) {
      return;
    }

    this.refresh();

    this.observer = new MutationObserver((records) => {
      if (!records.some((record) => this.shouldProcessMutation(record))) {
        return;
      }

      this.scheduleRefresh();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  private stop() {
    this.observer?.disconnect();
    this.observer = null;
    this.refreshScheduled = false;
  }

  private scheduleRefresh() {
    if (this.refreshScheduled) {
      return;
    }

    this.refreshScheduled = true;
    window.requestAnimationFrame(() => {
      this.refreshScheduled = false;
      this.refresh();
    });
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
    const isStreaming = this.detectStreaming();
    const messages = this.collectMessages(isStreaming);
    const composer = this.findComposer();
    const composerAvailable = Boolean(composer);

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
      currentModel: this.detectModel(),
    };
  }

  private collectMessages(isStreaming: boolean): ChatMessage[] {
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

        const content = this.extractMessageContent(node);
        if (!content.text) {
          return null;
        }

        const messageStreaming =
          roleValue === 'assistant' &&
          index === nodes.length - 1 &&
          isStreaming;

        return {
          id: node.id || `${roleValue}-${index}`,
          role: roleValue,
          text: content.text,
          html: content.html,
          isStreaming: messageStreaming,
        } satisfies ChatMessage;
      })
      .filter((message): message is ChatMessage => Boolean(message));
  }

  private extractMessageContent(node: HTMLElement): { text: string; html: string | null } {
    const preferred =
      node.querySelector<HTMLElement>('[data-message-content]') ??
      node.querySelector<HTMLElement>('.markdown') ??
      node;

    const text = preferred.innerText.replace(/\n{3,}/g, '\n\n').trim();
    const isAssistantMessage = node.dataset.messageAuthorRole === 'assistant';
    const html = isAssistantMessage ? this.sanitizeMessageHtml(preferred.innerHTML) : null;

    return {
      text,
      html,
    };
  }

  private sanitizeMessageHtml(html: string): string | null {
    const trimmed = html.trim();
    if (!trimmed) {
      return null;
    }

    const sanitizedHtml = DOMPurify.sanitize(trimmed, {
      USE_PROFILES: { html: true },
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
    });

    return sanitizedHtml || null;
  }

  private shouldProcessMutation(record: MutationRecord): boolean {
    if (!this.isExternalNode(record.target)) {
      return false;
    }

    if (record.type === 'childList') {
      const addedNodes = Array.from(record.addedNodes).some((node) => this.isExternalNode(node));
      const removedNodes = Array.from(record.removedNodes).some((node) => this.isExternalNode(node));
      return addedNodes || removedNodes;
    }

    return true;
  }

  private isExternalNode(node: Node | null): boolean {
    if (!node) {
      return false;
    }

    const element = node instanceof Element ? node : node.parentElement;
    if (!element) {
      return false;
    }

    return !element.closest('#chrome-ai-talk-root') && !element.closest('style[data-chrome-ai-talk]');
  }

  private detectModel(): string | null {
    const selectors = [
      '[data-testid="model-switcher-dropdown-button"]',
      'button[aria-haspopup="menu"][aria-label*="Model"]',
      'button[aria-haspopup="listbox"]',
      '[data-testid*="model-switcher"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) continue;
      const text = el.innerText?.trim().split('\n')[0];
      if (text) return text;
    }

    // Fallback: look for a button in the page header that names a known model
    const knownModels = ['o3', 'o1', 'o4', 'GPT-4o', 'GPT-4', 'GPT-3.5', 'Claude', 'Gemini'];
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('header button, nav button'));
    for (const btn of buttons) {
      const text = btn.innerText?.trim().split('\n')[0];
      if (text && knownModels.some((m) => text.includes(m))) {
        return text;
      }
    }

    return null;
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

  private findNewChatTrigger(): HTMLElement | null {
    const selectors = [
      'button[data-testid="create-new-chat-button"]',
      'a[data-testid="create-new-chat-button"]',
      'button[aria-label*="New chat" i]',
      'a[aria-label*="New chat" i]',
      'button[aria-label*="new conversation" i]',
      'a[aria-label*="new conversation" i]',
      'button[aria-label*="新しいチャット"]',
      'a[aria-label*="新しいチャット"]',
      'nav a[href="/"]',
      'aside a[href="/"]',
    ] as const;

    for (const selector of selectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) {
        continue;
      }

      const isDisabled =
        el.getAttribute('aria-disabled') === 'true' ||
        (el instanceof HTMLButtonElement && el.disabled);

      if (!isDisabled) {
        return el;
      }
    }

    return null;
  }

}
