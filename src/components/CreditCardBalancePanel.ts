import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

export interface CreditCardAccount {
  id: string;
  name: string;
  lastFour: string;
  creditLimit: number;
  currentBalance: number;
  minimumPayment: number;
  dueDate: string; // ISO date string (YYYY-MM-DD)
  apr: number;
  autoPay: boolean;
}

const STORAGE_KEY = 'worldmonitor-credit-cards';

function loadAccounts(): CreditCardAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: CreditCardAccount[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function daysUntilDue(dueDateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr + 'T00:00:00');
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatCurrency(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function utilizationClass(balance: number, limit: number): string {
  if (limit <= 0) return '';
  const pct = (balance / limit) * 100;
  if (pct >= 75) return 'cc-util-high';
  if (pct >= 50) return 'cc-util-medium';
  return 'cc-util-low';
}

function dueDateClass(days: number): string {
  if (days < 0) return 'cc-overdue';
  if (days <= 3) return 'cc-due-urgent';
  if (days <= 7) return 'cc-due-soon';
  return 'cc-due-ok';
}

function dueDateLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days}d left`;
}

export class CreditCardBalancePanel extends Panel {
  private accounts: CreditCardAccount[] = [];
  private showingForm = false;
  private editingId: string | null = null;

  constructor() {
    super({
      id: 'credit-cards',
      title: 'Credit Card Balances',
      showCount: true,
      infoTooltip: 'Track credit card balances, payment due dates, and utilization across all your accounts.',
    });
  }

  public async fetchData(): Promise<void> {
    this.accounts = loadAccounts();
    this.renderPanel();
  }

  private renderPanel(): void {
    if (this.showingForm) {
      this.renderForm();
      return;
    }

    const accounts = this.accounts;

    if (!accounts.length) {
      this.setContent(`
        <div class="cc-empty">
          <div class="cc-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
          </div>
          <div class="cc-empty-text">No credit cards added yet</div>
          <button class="cc-add-btn" data-action="add">+ Add Credit Card</button>
        </div>
      `);
      this.bindActions();
      this.setCount(0);
      return;
    }

    const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);
    const totalLimit = accounts.reduce((s, a) => s + a.creditLimit, 0);
    const totalMinDue = accounts.reduce((s, a) => s + a.minimumPayment, 0);
    const overallUtil = totalLimit > 0 ? ((totalBalance / totalLimit) * 100).toFixed(1) : '0.0';

    const sortedAccounts = [...accounts].sort((a, b) => daysUntilDue(a.dueDate) - daysUntilDue(b.dueDate));

    const nextDue = sortedAccounts[0];
    const nextDueDays = daysUntilDue(nextDue.dueDate);

    const cardRows = sortedAccounts.map(a => {
      const days = daysUntilDue(a.dueDate);
      const utilPct = a.creditLimit > 0 ? ((a.currentBalance / a.creditLimit) * 100) : 0;
      return `
        <div class="cc-card-row" data-id="${escapeHtml(a.id)}">
          <div class="cc-card-header">
            <div class="cc-card-name">
              <span class="cc-card-label">${escapeHtml(a.name)}</span>
              <span class="cc-card-last4">****${escapeHtml(a.lastFour)}</span>
            </div>
            <div class="cc-card-actions">
              <button class="cc-icon-btn" data-action="edit" data-id="${escapeHtml(a.id)}" title="Edit">&#9998;</button>
              <button class="cc-icon-btn cc-delete-btn" data-action="delete" data-id="${escapeHtml(a.id)}" title="Delete">&times;</button>
            </div>
          </div>
          <div class="cc-card-body">
            <div class="cc-card-balance">
              <span class="cc-balance-amount">${formatCurrency(a.currentBalance)}</span>
              <span class="cc-balance-limit">/ ${formatCurrency(a.creditLimit)}</span>
            </div>
            <div class="cc-util-bar-wrap">
              <div class="cc-util-bar ${utilizationClass(a.currentBalance, a.creditLimit)}" style="width:${Math.min(utilPct, 100).toFixed(1)}%"></div>
            </div>
            <div class="cc-card-details">
              <div class="cc-detail">
                <span class="cc-detail-label">Min Payment</span>
                <span class="cc-detail-value">${formatCurrency(a.minimumPayment)}</span>
              </div>
              <div class="cc-detail">
                <span class="cc-detail-label">APR</span>
                <span class="cc-detail-value">${a.apr.toFixed(1)}%</span>
              </div>
              <div class="cc-detail">
                <span class="cc-detail-label">Due Date</span>
                <span class="cc-detail-value ${dueDateClass(days)}">${dueDateLabel(days)}</span>
              </div>
              <div class="cc-detail">
                <span class="cc-detail-label">Auto-Pay</span>
                <span class="cc-detail-value">${a.autoPay ? 'On' : 'Off'}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <div class="cc-container">
        <div class="cc-summary">
          <div class="cc-summary-row">
            <div class="cc-summary-item">
              <span class="cc-summary-label">Total Balance</span>
              <span class="cc-summary-value cc-total-balance">${formatCurrency(totalBalance)}</span>
            </div>
            <div class="cc-summary-item">
              <span class="cc-summary-label">Total Min Due</span>
              <span class="cc-summary-value">${formatCurrency(totalMinDue)}</span>
            </div>
          </div>
          <div class="cc-summary-row">
            <div class="cc-summary-item">
              <span class="cc-summary-label">Overall Utilization</span>
              <span class="cc-summary-value ${utilizationClass(totalBalance, totalLimit)}">${overallUtil}%</span>
            </div>
            <div class="cc-summary-item">
              <span class="cc-summary-label">Next Payment</span>
              <span class="cc-summary-value ${dueDateClass(nextDueDays)}">${dueDateLabel(nextDueDays)}</span>
            </div>
          </div>
        </div>
        <div class="cc-card-list">${cardRows}</div>
        <button class="cc-add-btn" data-action="add">+ Add Credit Card</button>
      </div>
    `;

    this.setContent(html);
    this.bindActions();
    this.setCount(accounts.length);
  }

  private renderForm(): void {
    const editing = this.editingId ? this.accounts.find(a => a.id === this.editingId) : null;
    const title = editing ? 'Edit Credit Card' : 'Add Credit Card';

    const html = `
      <div class="cc-form-container">
        <div class="cc-form-title">${title}</div>
        <form class="cc-form" data-action="save">
          <div class="cc-form-row">
            <label>Card Name</label>
            <input type="text" name="name" placeholder="e.g. Chase Sapphire" value="${escapeHtml(editing?.name ?? '')}" required />
          </div>
          <div class="cc-form-row">
            <label>Last 4 Digits</label>
            <input type="text" name="lastFour" placeholder="1234" maxlength="4" pattern="[0-9]{4}" value="${escapeHtml(editing?.lastFour ?? '')}" required />
          </div>
          <div class="cc-form-row-pair">
            <div class="cc-form-row">
              <label>Credit Limit ($)</label>
              <input type="number" name="creditLimit" step="0.01" min="0" placeholder="10000" value="${editing?.creditLimit ?? ''}" required />
            </div>
            <div class="cc-form-row">
              <label>Current Balance ($)</label>
              <input type="number" name="currentBalance" step="0.01" min="0" placeholder="2500" value="${editing?.currentBalance ?? ''}" required />
            </div>
          </div>
          <div class="cc-form-row-pair">
            <div class="cc-form-row">
              <label>Min Payment ($)</label>
              <input type="number" name="minimumPayment" step="0.01" min="0" placeholder="35" value="${editing?.minimumPayment ?? ''}" required />
            </div>
            <div class="cc-form-row">
              <label>APR (%)</label>
              <input type="number" name="apr" step="0.01" min="0" max="100" placeholder="24.99" value="${editing?.apr ?? ''}" required />
            </div>
          </div>
          <div class="cc-form-row">
            <label>Payment Due Date</label>
            <input type="date" name="dueDate" value="${escapeHtml(editing?.dueDate ?? '')}" required />
          </div>
          <div class="cc-form-row cc-form-checkbox">
            <label><input type="checkbox" name="autoPay" ${editing?.autoPay ? 'checked' : ''} /> Auto-Pay Enabled</label>
          </div>
          <div class="cc-form-buttons">
            <button type="button" class="cc-cancel-btn" data-action="cancel">Cancel</button>
            <button type="submit" class="cc-save-btn">${editing ? 'Update' : 'Add Card'}</button>
          </div>
        </form>
      </div>
    `;

    this.setContent(html);
    this.bindActions();
  }

  private bindActions(): void {
    const el = this.content;
    if (!el) return;

    el.querySelectorAll('[data-action="add"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.editingId = null;
        this.showingForm = true;
        this.renderPanel();
      });
    });

    el.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.editingId = (btn as HTMLElement).dataset.id ?? null;
        this.showingForm = true;
        this.renderPanel();
      });
    });

    el.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm('Remove this credit card?')) {
          this.accounts = this.accounts.filter(a => a.id !== id);
          saveAccounts(this.accounts);
          this.renderPanel();
        }
      });
    });

    el.querySelectorAll('[data-action="cancel"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showingForm = false;
        this.editingId = null;
        this.renderPanel();
      });
    });

    const form = el.querySelector('form[data-action="save"]') as HTMLFormElement | null;
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const account: CreditCardAccount = {
          id: this.editingId ?? generateId(),
          name: (fd.get('name') as string).trim(),
          lastFour: (fd.get('lastFour') as string).trim(),
          creditLimit: parseFloat(fd.get('creditLimit') as string) || 0,
          currentBalance: parseFloat(fd.get('currentBalance') as string) || 0,
          minimumPayment: parseFloat(fd.get('minimumPayment') as string) || 0,
          dueDate: fd.get('dueDate') as string,
          apr: parseFloat(fd.get('apr') as string) || 0,
          autoPay: fd.get('autoPay') === 'on',
        };

        if (this.editingId) {
          const idx = this.accounts.findIndex(a => a.id === this.editingId);
          if (idx >= 0) this.accounts[idx] = account;
        } else {
          this.accounts.push(account);
        }

        saveAccounts(this.accounts);
        this.showingForm = false;
        this.editingId = null;
        this.renderPanel();
      });
    }
  }
}
