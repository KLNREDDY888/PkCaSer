const $ = (selector) => document.querySelector(selector);
const statusMessage = $('#status-message');
const statusLabel = $('#status-label');
const statusBanner = $('#partner-status');
const linkButton = $('#link-accounts');
const amountInput = $('#amount');
const modalBackdrop = $('#modal-backdrop');
const modalContent = $('#modal-content');
const activityContent = $('#activity-content');
const DEMO_KEY = 'moneta-demo-v1';
const AUTH_KEY = 'moneta-demo-auth';
const WORKSPACE_KEY = 'moneta-workspace-key';
let workspaceKey = localStorage.getItem(WORKSPACE_KEY);
if (!/^[a-f0-9]{32}$/.test(workspaceKey || '')) {
  workspaceKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(WORKSPACE_KEY, workspaceKey);
}
const SAMPLE_CARDS = [
  { id: 'visa-demo', network: 'VISA', name: 'Everyday Visa', last4: '4242', theme: 'forest' },
  { id: 'mastercard-demo', network: 'MASTERCARD', name: 'Travel Mastercard', last4: '5555', theme: 'midnight' },
  { id: 'rupay-demo', network: 'RuPay', name: 'RuPay Sample Card', last4: '8888', theme: 'plum' },
];
let loggedIn = sessionStorage.getItem(AUTH_KEY) === '1';
let authMode = 'login';
let currentAuthUser = null;
let toastTimer;

const today = $('#today-date');
today.textContent = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date());

function readDemo() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(DEMO_KEY) || '{}');
    const customCards = Array.isArray(stored.customCards) ? stored.customCards.filter((card) =>
      card && /^custom-[a-z0-9]{8,16}$/.test(card.id) && typeof card.name === 'string' && card.name.length <= 32
      && typeof card.issuer === 'string' && card.issuer.length <= 32
      && typeof card.holder === 'string' && card.holder.length <= 32
      && ['VISA', 'MASTERCARD', 'RuPay', 'OTHER'].includes(card.network)
      && /^\d{4}$/.test(card.last4) && ['forest', 'midnight', 'plum'].includes(card.theme),
    ).slice(0, 10) : [];
    const validIds = new Set([...SAMPLE_CARDS.map((card) => card.id), ...customCards.map((card) => card.id)]);
    const savedSavings = stored.savingsAccount;
    const savingsAccount = savedSavings && typeof savedSavings.name === 'string' && savedSavings.name.length <= 32
      && typeof savedSavings.bank === 'string' && savedSavings.bank.length <= 32
      && typeof savedSavings.holder === 'string' && savedSavings.holder.length <= 32
      && /^\d{4}$/.test(savedSavings.last4)
      ? { name: savedSavings.name, bank: savedSavings.bank, holder: savedSavings.holder, last4: savedSavings.last4 }
      : null;
    return {
      active: stored.active === true,
      accountsLinked: stored.accountsLinked === true,
      customCards,
      savingsAccount,
      cards: Array.isArray(stored.cards) ? [...new Set(stored.cards.filter((id) => validIds.has(id)))].slice(0, 13) : [],
      selectedCardId: validIds.has(stored.selectedCardId) ? stored.selectedCardId : null,
      transfers: Array.isArray(stored.transfers) ? stored.transfers.filter((item) =>
        item && /^DEMO-[A-Z0-9]{6}$/.test(item.id) && Number.isInteger(item.amount)
        && item.amount >= 500 && item.amount <= 15000
        && Number.isInteger(item.fee) && item.fee === Math.round(item.amount * 0.02)
        && Number.isFinite(new Date(item.createdAt).valueOf()),
      ).slice(0, 20) : [],
    };
  } catch {
    return { active: false, accountsLinked: false, customCards: [], savingsAccount: null, cards: [], selectedCardId: null, transfers: [] };
  }
}

const demo = readDemo();
SAMPLE_CARDS.push(...demo.customCards);
let demoSaveQueue = Promise.resolve();

function saveDemo() {
  const snapshot = JSON.stringify(demo);
  demoSaveQueue = demoSaveQueue.catch(() => {}).then(() => fetch(`/api/demo-data?key=${workspaceKey}`, {
    method: 'PUT', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: JSON.parse(snapshot) }),
  })).then((response) => {
    if (!response.ok) throw new Error('Could not save demo data.');
    return true;
  }).catch(() => {
    showToast('Demo data could not be saved to the local data file.');
    return false;
  });
  return demoSaveQueue;
}

async function loadDemo() {
  try {
    const response = await fetch(`/api/demo-data?key=${workspaceKey}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not load demo data.');
    const result = await response.json();
    if (result.data) {
      Object.assign(demo, result.data);
      SAMPLE_CARDS.splice(0, SAMPLE_CARDS.length, ...SAMPLE_CARDS.filter((card) => !card.custom), ...demo.customCards);
    }
    else if (sessionStorage.getItem(DEMO_KEY)) await saveDemo();
    sessionStorage.removeItem(DEMO_KEY);
  } catch {
    showToast('Saved demo data could not be loaded from the local data file.');
  }
}

function renderAuthState() {
  $('#login-screen').hidden = loggedIn;
  $('#app-shell').hidden = !loggedIn;
  const label = currentAuthUser?.email || 'Demo user';
  $('#sidebar-user-name').textContent = label;
  $('#sidebar-user-name').title = label;
  $('#sidebar-avatar').textContent = label.slice(0, 1).toUpperCase();
  $('#top-avatar').textContent = label.slice(0, 1).toUpperCase();
  $('.profile-copy span').textContent = currentAuthUser ? 'Signed in' : 'India · INR';
  if (loggedIn) document.body.classList.remove('login-open');
  else document.body.classList.add('login-open');
}

function signInToDemo() {
  loggedIn = true;
  currentAuthUser = null;
  sessionStorage.setItem(AUTH_KEY, '1');
  renderAuthState();
  activateDemo();
  closeModal();
}

function activateDemo() {
  demo.active = true;
  saveDemo();
  renderDemoState();
  showToast('Interactive demo started. Everything here uses fictional sample data.');
}

function renderDemoState() {
  const disclaimer = $('#demo-disclaimer');
  disclaimer.hidden = !demo.active;

  if (demo.active) {
    statusBanner.classList.add('demo-status');
    statusMessage.textContent = 'Demo mode is on. This workspace uses fictional sample accounts; the live transfer partner is not connected.';
    statusLabel.textContent = 'Demo only';
    $('#step-copy').textContent = demo.accountsLinked
      ? 'Sample card and savings account are connected.'
      : 'Connect the fictional sample accounts to try the flow.';
    $('#step-title').textContent = demo.accountsLinked ? 'Accounts connected' : 'Choose your accounts';
    $('#step-count').textContent = demo.accountsLinked ? 'STEP 2 OF 3' : 'STEP 1 OF 3';
    $('#step-number').textContent = demo.accountsLinked ? '2' : '1';
    linkButton.querySelector('span').textContent = demo.accountsLinked ? 'Sample accounts linked' : 'Link sample accounts';
    linkButton.querySelector('.button-lock').textContent = demo.accountsLinked ? 'Change' : 'Demo';
    $('#check-partner-copy').textContent = 'Live partner still required for real transfers';
    $('#check-partner-status').textContent = 'NOT CONNECTED';
    $('#readiness-title').textContent = 'Demo workspace';
    $('#readiness-copy')?.replaceChildren(document.createTextNode('Try the transfer journey with sample information. No identity or bank details are collected.'));
    $('#check-identity').classList.toggle('complete', true);
    $('#check-accounts').classList.toggle('complete', demo.accountsLinked);
    $('#check-accounts-copy').textContent = demo.accountsLinked ? 'Sample accounts linked for this session' : 'Connect sample accounts to continue';
    $('#progress-value').textContent = demo.accountsLinked ? '100%' : '50%';
    $('#progress-ring').classList.add('demo-progress');
    $('#progress-ring').classList.toggle('progress-half', !demo.accountsLinked);
    $('#readiness-title').textContent = demo.accountsLinked ? 'Ready to explore' : 'Demo workspace';
    $('#amount-help').querySelector('span').textContent = demo.accountsLinked
      ? 'Sample transfers: ₹500 to ₹15,000.'
      : 'Connect sample accounts to try a simulated quote.';
    $('#amount').setAttribute('aria-label', 'Sample transfer amount in rupees');
  } else {
    statusBanner.classList.remove('demo-status');
    statusMessage.textContent = 'We’re connecting an approved bank or card issuer. Your account details are not being collected.';
    statusLabel.textContent = 'Partner setup';
    $('#step-copy').textContent = 'Link accounts with our approved partner or try sample accounts.';
    $('#step-title').textContent = 'Choose your accounts';
    $('#step-count').textContent = 'STEP 1 OF 3';
    $('#step-number').textContent = '1';
    linkButton.querySelector('span').textContent = 'Link accounts';
    linkButton.querySelector('.button-lock').textContent = 'Demo';
    $('#check-partner-copy').textContent = 'Bank or issuer setup in progress';
    $('#check-partner-status').textContent = 'IN PROGRESS';
    $('#readiness-title').textContent = 'Almost ready';
    $('#check-identity').classList.remove('complete');
    $('#check-accounts').classList.remove('complete');
    $('#check-accounts-copy').textContent = 'Card and savings account in your name';
    $('#progress-value').textContent = '0%';
    $('#progress-ring').classList.remove('demo-progress');
    $('#progress-ring').classList.remove('progress-half');
    $('#amount-help').querySelector('span').textContent = '₹500–₹15,000 in the sample demo.';
    $('#amount').removeAttribute('aria-label');
  }

  renderAccounts();
  renderCards();
  renderActivity();
  updateQuotePreview();
}

function renderAccounts() {
  const boxes = document.querySelectorAll('.account-box');
  if (demo.accountsLinked) {
    const card = SAMPLE_CARDS.find((item) => item.id === demo.selectedCardId) || SAMPLE_CARDS[0];
    boxes[0].querySelector('.account-topline span:last-child').textContent = 'SAMPLE';
    boxes[0].querySelector('.account-empty strong').textContent = `${card.name} ···· ${card.last4}`;
    boxes[0].querySelector('.account-empty span:not(.account-icon)').textContent = `${card.network} · Demo only`;
    boxes[1].querySelector('.account-topline .not-linked').textContent = 'SAMPLE';
    boxes[1].querySelector('.account-empty strong').textContent = 'Sample savings ···· 1234';
    boxes[1].querySelector('.account-empty span:not(.account-icon)').textContent = 'Priya Sharma · Same-name demo';
  } else {
    boxes[0].querySelector('.account-topline span:last-child').textContent = 'NOT LINKED';
    boxes[0].querySelector('.account-empty strong').textContent = 'Link an eligible card';
    boxes[0].querySelector('.account-empty span:not(.account-icon)').textContent = 'Issuer approval required';
    boxes[1].querySelector('.account-topline .not-linked').textContent = demo.savingsAccount ? 'PREVIEW' : 'NOT LINKED';
    boxes[1].querySelector('.account-empty strong').textContent = demo.savingsAccount
      ? `${demo.savingsAccount.name} ···· ${demo.savingsAccount.last4}`
      : 'Link your savings account';
    boxes[1].querySelector('.account-empty span:not(.account-icon)').textContent = demo.savingsAccount
      ? `${demo.savingsAccount.bank} · ${demo.savingsAccount.holder}`
      : 'Must be in your name';
  }
  boxes[1].querySelector('.account-manage').textContent = demo.savingsAccount ? 'Edit' : 'Add details';
}

function openSavingsAccountModal() {
  const saved = demo.savingsAccount;
  showModal(saved ? 'Edit savings account preview' : 'Add savings account preview',
    `<p>Add display details for your own savings account. This does not connect to your bank or verify account ownership.</p><form id="savings-account-form" class="custom-card-form"><label for="savings-name">Account name</label><input id="savings-name" name="name" maxlength="32" required placeholder="e.g. Main savings" value="${escapeHtml(saved?.name || '')}" /><label for="savings-bank">Bank</label><input id="savings-bank" name="bank" maxlength="32" required placeholder="e.g. Your bank" value="${escapeHtml(saved?.bank || '')}" /><label for="savings-holder">Account holder name</label><input id="savings-holder" name="holder" maxlength="32" required placeholder="Name on the account" value="${escapeHtml(saved?.holder || '')}" /><label for="savings-last4">Last four digits only</label><input id="savings-last4" name="last4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" required placeholder="1234" value="${escapeHtml(saved?.last4 || '')}" /><button class="button button-primary" type="submit">Save savings account</button></form><div class="modal-notice"><strong>Display only—no bank connection</strong><span>Do not enter a full account number, IFSC, UPI PIN, password, OTP, or other banking credentials. Only the last four digits are used in this preview.</span></div>`,
    saved ? secondaryButton('Remove preview', 'remove-savings') : secondaryButton('Close', 'close-modal'));
  $('#savings-account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const fields = new FormData(event.currentTarget);
    const savings = {
      name: String(fields.get('name') || '').trim(),
      bank: String(fields.get('bank') || '').trim(),
      holder: String(fields.get('holder') || '').trim(),
      last4: String(fields.get('last4') || ''),
    };
    if (!savings.name || !savings.bank || !savings.holder || !/^\d{4}$/.test(savings.last4)) {
      showToast('Enter the account name, bank, holder name, and last four digits.');
      return;
    }
    const previous = demo.savingsAccount;
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    demo.savingsAccount = savings;
    const savedSuccessfully = await saveDemo();
    if (!savedSuccessfully) {
      demo.savingsAccount = previous;
      submitButton.disabled = false;
      return;
    }
    renderAccounts();
    closeModal();
    showToast('Savings account preview saved in the local data file.');
  });
}

function renderCards() {
  const container = $('#saved-cards');
  $('#card-count').textContent = String(demo.cards.length);
  if (demo.cards.length === 0) {
    container.innerHTML = '<div class="cards-empty"><span class="empty-card-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18m-14 5h3"/></svg></span><strong>No cards added</strong><p>Choose a fictional sample card to see its card image here.</p><button type="button" data-action="add-card">Add a sample card</button></div>';
    return;
  }
  container.innerHTML = demo.cards.map((id) => {
    const card = SAMPLE_CARDS.find((item) => item.id === id);
    if (!card) return '';
    const selected = demo.selectedCardId === card.id;
    const cardName = escapeHtml(card.name);
    const cardIssuer = escapeHtml(card.issuer || 'Sample issuer');
    const cardHolder = escapeHtml((card.holder || 'DEMO USER').toUpperCase());
    const cardNetwork = escapeHtml(card.network);
    return `<article class="wallet-card-wrap">
      <div class="wallet-card art-${card.theme}" aria-label="${card.custom ? 'Preview' : 'Sample'} ${cardNetwork} credit card ending in ${card.last4}">
        <div class="wallet-card-top"><span class="wallet-brand">${cardName}</span><span class="sample-pill">PREVIEW</span></div>
        <span class="wallet-chip" aria-hidden="true"><i></i><i></i><i></i></span>
        <div class="wallet-card-number">•••• &nbsp;•••• &nbsp;•••• &nbsp;${card.last4}</div>
        <div class="wallet-card-bottom"><div><small>${cardIssuer}</small><strong>${cardHolder}</strong></div><span class="wallet-network">${cardNetwork}</span></div>
        <span class="wallet-orbit orbit-one"></span><span class="wallet-orbit orbit-two"></span>
      </div>
      <div class="wallet-card-info"><div><strong>${cardName}</strong><small>${selected ? 'Selected for preview' : 'Display only · not linked for payments'}</small></div><button type="button" class="card-detail-button" data-action="card-details" data-card-id="${card.id}">Details</button></div>
    </article>`;
  }).join('');
}

function ensureDemoCard() {
  if (demo.cards.length === 0) demo.cards.push('visa-demo');
  if (!demo.selectedCardId || !demo.cards.includes(demo.selectedCardId)) demo.selectedCardId = demo.cards[0];
}

function selectedSampleCard() {
  return SAMPLE_CARDS.find((card) => card.id === demo.selectedCardId) || SAMPLE_CARDS.find((card) => card.id === demo.cards[0]) || SAMPLE_CARDS[0];
}

function openAddCardModal() {
  const available = SAMPLE_CARDS.filter((card) => !card.custom && !demo.cards.includes(card.id));
  const choices = available.map((card) => `<button class="sample-card-option" type="button" data-action="add-sample-card" data-card-id="${card.id}"><span class="mini-card art-${card.theme}"><i></i><b>${card.network}</b></span><span><strong>${card.name}</strong><small>Fictional sample · ending ${card.last4}</small></span><span class="option-plus">＋</span></button>`).join('');
  const customForm = `<form id="custom-card-form" class="custom-card-form"><label for="custom-card-name">Card name</label><input id="custom-card-name" name="name" maxlength="32" required placeholder="e.g. Rewards card" /><label for="custom-card-issuer">Bank or issuer</label><input id="custom-card-issuer" name="issuer" maxlength="32" required placeholder="e.g. Your bank" /><label for="custom-card-holder">Name shown on card</label><input id="custom-card-holder" name="holder" maxlength="32" placeholder="Optional" /><label for="custom-card-network">Card network</label><select id="custom-card-network" name="network"><option>VISA</option><option>MASTERCARD</option><option>RuPay</option><option>OTHER</option></select><label for="custom-card-last4">Last four digits only</label><input id="custom-card-last4" name="last4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" required placeholder="1234" /><button class="button button-primary" type="submit">Add card image</button></form><div class="modal-notice"><strong>Display only</strong><span>Never enter a full card number, expiry date, CVV, PIN, password, or OTP. Display details are saved to this local app's data file and cannot make payments.</span></div>`;
  const list = customForm + (choices || '<div class="modal-notice"><strong>All sample cards are added</strong><span>Remove a sample card first if you want to add it again.</span></div>');
  showModal('Add a credit card',
    `<p>Choose a fictional card to preview its design in your wallet. This does not connect a payment card.</p><div class="sample-card-options">${list}</div><div class="modal-notice"><strong>Real card linking is not available</strong><span>A bank or issuer partner must host the secure card flow. Never enter full card numbers or CVV in this app.</span></div>`,
    `${secondaryButton('Close', 'close-modal')}${primaryButton('Why can’t I add a real card?', 'live-card-link')}`);
  modalContent.querySelector('.modal-body > p').textContent = 'Enter display details for your wallet image below, or choose a fictional sample card.';
}

function showCardDetails(id) {
  const card = SAMPLE_CARDS.find((item) => item.id === id && demo.cards.includes(id));
  if (!card) return showToast('That sample card is no longer in your wallet.');
  const selected = demo.selectedCardId === id;
  showModal('Sample card details',
    `<div class="wallet-card detail-card art-${card.theme}"><div class="wallet-card-top"><span class="wallet-brand">moneta<span>.</span></span><span class="sample-pill">DEMO</span></div><span class="wallet-chip" aria-hidden="true"><i></i><i></i><i></i></span><div class="wallet-card-number">•••• &nbsp;•••• &nbsp;•••• &nbsp;${card.last4}</div><div class="wallet-card-bottom"><div><small>CARDHOLDER</small><strong>DEMO USER</strong></div><span class="wallet-network">${card.network}</span></div><span class="wallet-orbit orbit-one"></span><span class="wallet-orbit orbit-two"></span></div><dl class="receipt-details"><div><dt>Card type</dt><dd>Credit card · sample only</dd></div><div><dt>Network</dt><dd>${card.network}</dd></div><div><dt>Cardholder</dt><dd>Demo User</dd></div><div><dt>Number</dt><dd>Only last four shown · ${card.last4}</dd></div></dl><div class="modal-notice"><strong>No real card is linked</strong><span>This sample image cannot be used for a payment or cash advance.</span></div>`,
    `${secondaryButton('Remove sample card', 'remove-sample-card')}${primaryButton(selected ? 'Selected for demo' : 'Use for demo transfer', 'select-sample-card', selected ? 'disabled' : '')}`);
  const modal = $('#modal-content');
  if (card.custom) {
    $('#modal-title').textContent = 'Card image preview';
    modal.querySelector('.detail-card .wallet-brand').textContent = card.name;
    modal.querySelector('.detail-card .sample-pill').textContent = 'PREVIEW';
    modal.querySelector('.detail-card .wallet-card-bottom small').textContent = card.issuer;
    modal.querySelector('.detail-card .wallet-card-bottom strong').textContent = card.holder || 'CARDHOLDER';
    const details = modal.querySelectorAll('.receipt-details dd');
    details[0].textContent = 'Display only';
    details[1].textContent = card.network;
    details[2].textContent = card.holder || 'Not specified';
    details[3].textContent = `Last four · ${card.last4}`;
    modal.querySelector('.modal-notice strong').textContent = 'Display only';
    modal.querySelector('.modal-notice span').textContent = 'This card image is not connected to your issuer and cannot be used for payments.';
    modal.querySelector('[data-action="remove-sample-card"]').textContent = 'Remove card preview';
    const choose = modal.querySelector('[data-action="select-sample-card"]');
    if (choose) choose.textContent = selected ? 'Selected for preview' : 'Select for preview';
  }
  modal.querySelectorAll('[data-action="remove-sample-card"], [data-action="select-sample-card"]').forEach((button) => {
    button.dataset.cardId = id;
  });
}

async function loadPartnerStatus() {
  try {
    const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Partner status is unavailable.');
    const config = await response.json();
    if (config.transfersEnabled) {
      statusMessage.textContent = 'A partner is connected, but live account authorization is still required before transfers can be enabled.';
      statusLabel.textContent = 'Setup required';
    }
  } catch {
    if (!demo.active) {
      statusMessage.textContent = 'We can’t confirm partner availability right now. Real transfers remain paused.';
      statusLabel.textContent = 'Status unavailable';
    }
  }
}

function showModal(title, content, actions = '') {
  modalContent.innerHTML = `<span class="modal-kicker">MONETA · INDIA PILOT</span><h2 id="modal-title">${title}</h2><div class="modal-body">${content}</div>${actions ? `<div class="modal-actions">${actions}</div>` : ''}`;
  modalBackdrop.hidden = false;
  document.body.classList.add('modal-open');
  modalBackdrop.querySelector('.modal-close').focus();
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function closeModal() {
  modalBackdrop.hidden = true;
  document.body.classList.remove('modal-open');
}

const secondaryButton = (label, action) => `<button class="modal-button secondary" type="button" data-action="${action}">${label}</button>`;
const primaryButton = (label, action, extra = '') => `<button class="modal-button primary" type="button" data-action="${action}" ${extra}>${label}</button>`;

function openLinkModal() {
  if (!demo.active) {
    showModal('Live account linking is not connected',
      '<p>An approved bank or issuer has not been connected, so this page cannot link real accounts. You can still explore the flow with fictional sample accounts.</p><div class="modal-notice"><strong>Demo safety</strong><span>Do not enter card numbers, bank details, passwords, or OTPs here.</span></div>',
      `${secondaryButton('Not now', 'close-modal')}${secondaryButton('Add card display details', 'display-card')}${primaryButton('Start interactive demo', 'start-demo-and-link')}`);
    return;
  }

  if (demo.accountsLinked) {
    const card = selectedSampleCard();
    showModal('Sample accounts are connected',
      `<p>These are fictional accounts used only for this browser session.</p><div class="account-summary"><span>FROM</span><strong>${card.name} ···· ${card.last4}</strong><small>Demo User · Demo only</small></div><div class="account-summary"><span>TO</span><strong>Sample savings ···· 1234</strong><small>Demo User · Same-name demo</small></div>`,
      `${secondaryButton('Close', 'close-modal')}${primaryButton('Disconnect sample accounts', 'disconnect-samples')}`);
    return;
  }

  const card = selectedSampleCard();
  showModal('Connect sample accounts',
    `<p>Selecting these accounts does not connect to a bank or card network. The account names and numbers are fictional.</p><div class="account-summary"><span>FROM · CREDIT CARD</span><strong>${card.name} ···· ${card.last4}</strong><small>Demo User · ₹50,000 sample limit</small></div><div class="account-summary"><span>TO · SAVINGS ACCOUNT</span><strong>Sample savings ···· 1234</strong><small>Demo User · Same-name sample account</small></div><div class="modal-notice"><strong>Same-person check</strong><span>The sample cardholder and savings account holder match.</span></div>`,
    `${secondaryButton('Cancel', 'close-modal')}${primaryButton('Connect sample accounts', 'connect-samples')}`);
}

function readAmount() {
  const value = Number(amountInput.value);
  if (!Number.isInteger(value) || value < 500 || value > 15000 || value % 100 !== 0) return null;
  return value;
}

function formatRupees(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function updateQuotePreview() {
  const panel = $('#quote-panel');
  const amount = readAmount();
  if (!demo.active || !demo.accountsLinked || !amount) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const fee = Math.round(amount * 0.02);
  panel.hidden = false;
  panel.innerHTML = `<div><span>Demo estimate · illustrative only</span><strong>${formatRupees(amount)}</strong></div><div><span>Sample service fee (2%)</span><strong>−${formatRupees(fee)}</strong></div><div class="quote-total"><span>Sample amount to savings</span><strong>${formatRupees(amount - fee)}</strong></div><small>This is not a real provider quote. Real issuer fees and interest may differ.</small>`;
}

function reviewTransfer() {
  if (!demo.active) {
    showModal('Real transfers are paused',
      '<p>No approved transfer partner is connected. This app cannot charge a credit card or send funds to a bank account yet.</p><p>Try the interactive demo to preview the steps with fictional sample accounts.</p>',
      `${secondaryButton('Close', 'close-modal')}${primaryButton('Try the demo', 'start-demo-and-link')}`);
    return;
  }
  if (!demo.accountsLinked) {
    openLinkModal();
    return;
  }
  const amount = readAmount();
  if (!amount) {
    amountInput.setAttribute('aria-invalid', 'true');
    amountInput.focus();
    showToast('Enter a whole amount from ₹500 to ₹15,000 in ₹100 steps.');
    return;
  }
  amountInput.removeAttribute('aria-invalid');
  const fee = Math.round(amount * 0.02);
  showModal('Review sample transfer',
    `<div class="transfer-review"><div><span>Sample card charge</span><strong>${formatRupees(amount)}</strong></div><div><span>Illustrative demo fee · 2%</span><strong>−${formatRupees(fee)}</strong></div><div class="review-total"><span>Sample savings deposit</span><strong>${formatRupees(amount - fee)}</strong></div></div><div class="modal-notice"><strong>Simulation only</strong><span>No card is charged and no money is deposited. The sample fee is not a real quote.</span></div><label class="demo-consent"><input type="checkbox" id="demo-consent" /><span>I understand this is a fictional demo and no money will move.</span></label>`,
    `${secondaryButton('Back', 'close-modal')}${primaryButton('Simulate transfer', 'confirm-demo-transfer', 'disabled')}`);
}

function renderActivity() {
  if (demo.transfers.length === 0) {
    activityContent.innerHTML = '<div class="empty-activity"><div class="empty-illustration"><span class="empty-circle circle-one"></span><span class="empty-circle circle-two"></span><div class="empty-receipt"><span></span><span></span><span></span></div><div class="empty-check">↗</div></div><strong>No transfers yet</strong><p>Complete a simulated transfer to see<br />sample activity here.</p></div>';
    return;
  }
  const recent = demo.transfers.slice(0, 3);
  activityContent.innerHTML = `<div class="transfer-list">${recent.map((item) => `<button class="transfer-row" type="button" data-action="view-transfer" data-id="${item.id}"><span class="transfer-row-icon">↗</span><span class="transfer-row-copy"><strong>Sample transfer to savings</strong><small>${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))} · ${item.id}</small></span><span class="transfer-row-amount"><strong>${formatRupees(item.amount - item.fee)}</strong><small>DEMO · DONE</small></span></button>`).join('')}</div>`;
}

function showTransferDetail(id) {
  const item = demo.transfers.find((transfer) => transfer.id === id);
  if (!item) return showToast('That sample transfer is no longer in this session.');
  showModal('Sample transfer complete',
    `<div class="detail-status"><span>✓</span><div><strong>Completed · simulation</strong><small>No real funds were sent.</small></div></div><div class="transfer-review"><div><span>Amount requested</span><strong>${formatRupees(item.amount)}</strong></div><div><span>Illustrative fee</span><strong>−${formatRupees(item.fee)}</strong></div><div class="review-total"><span>Sample deposit</span><strong>${formatRupees(item.amount - item.fee)}</strong></div></div><dl class="receipt-details"><div><dt>Reference</dt><dd>${item.id}</dd></div><div><dt>Date</dt><dd>${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</dd></div><div><dt>Destination</dt><dd>Sample savings ···· 1234</dd></div><div><dt>Mode</dt><dd>Demo only · no money moved</dd></div></dl>`,
    `${secondaryButton('Close', 'close-modal')}${primaryButton('Print receipt', 'print-receipt')}`);
}

function openAllActivity() {
  if (demo.transfers.length === 0) {
    showModal('No sample transfers yet', '<p>Start the interactive demo, connect the fictional sample accounts, and simulate a transfer. It will appear in your activity list.</p>', `${secondaryButton('Close', 'close-modal')}${primaryButton('Go to transfer', 'go-transfer')}`);
    return;
  }
  const rows = demo.transfers.map((item) => `<button class="transfer-row modal-transfer-row" type="button" data-action="view-transfer" data-id="${item.id}"><span class="transfer-row-icon">↗</span><span class="transfer-row-copy"><strong>${formatRupees(item.amount - item.fee)} to sample savings</strong><small>${item.id} · ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></span><span class="transfer-row-amount"><small>DEMO · DONE</small></span></button>`).join('');
  showModal('All demo activity', `<div class="transfer-list all-transfers">${rows}</div><p class="modal-footnote">Every item is simulated. No funds moved.</p>`, secondaryButton('Close', 'close-modal'));
}

function showInformation(type) {
  const content = {
    help: ['Pilot help', '<p>This preview uses fictional sample data. Real account linking, identity checks, and transfers will be added only after an approved bank or issuer is connected.</p><div class="modal-notice"><strong>Need support?</strong><span>Support contact information will appear here when the private pilot is ready.</span></div><h3>Quick answers</h3><ul><li>Does this demo charge my card? No.</li><li>Does it deposit money? No.</li><li>Should I enter real account information? No. Never enter card numbers, passwords, or OTPs here.</li></ul>'],
    notifications: ['Notifications', '<div class="notification-item"><span class="notification-dot"></span><div><strong>Partner setup in progress</strong><p>Live transfers are paused until an approved provider is connected.</p></div></div><div class="notification-item"><span class="notification-dot sample"></span><div><strong>Demo available</strong><p>Explore the transfer flow with fictional sample accounts.</p></div></div>'],
    privacy: ['Privacy preview', '<p>Card and savings preview names, bank or issuer labels, cardholder labels, and last four digits are stored in the local app data file. Full card or account numbers, expiry dates, IFSC codes, CVVs, PINs, passwords, and OTPs are not requested.</p><p>This screen is not a final privacy policy. A complete policy and approved data-handling design are required before pilot onboarding.</p>'],
    terms: ['Terms preview', '<p>This preview is for demonstration only. Simulated amounts, fees, accounts, and statuses are fictional and do not represent a transfer offer or provider quote.</p><p>Real transfers will remain unavailable until an approved partner, applicable terms, and production controls are in place.</p>'],
  }[type];
  showModal(content[0], content[1], secondaryButton('Close', 'close-modal'));
}

function openProfile() {
  const userLabel = currentAuthUser?.email || 'Demo User · India pilot';
  showModal('Pilot workspace',
    `<div class="profile-modal-row"><span class="avatar">${escapeHtml(userLabel.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(userLabel)}</strong><small>${demo.active ? 'Interactive demo is on' : currentAuthUser ? 'Local account signed in' : 'Live partner not connected'}</small></div></div><div class="modal-notice"><strong>Card previews</strong><span>Display details and last four digits are kept in the local app data file; no payment credentials are stored.</span></div>`,
    `${secondaryButton('Sign out', 'sign-out')}${secondaryButton('Close', 'close-modal')}${primaryButton(demo.active ? 'Reset demo data' : 'Start interactive demo', demo.active ? 'ask-reset-demo' : 'start-demo')}`);
}

function startDemoAndLink() {
  activateDemo();
  ensureDemoCard();
  demo.accountsLinked = true;
  saveDemo();
  renderDemoState();
  closeModal();
  showToast('Sample accounts connected. Enter an amount to continue.');
  $('#amount').focus();
}

function confirmDemoTransfer() {
  const consent = $('#demo-consent');
  if (!consent?.checked) return showToast('Confirm that you understand this is only a simulation.');
  const amount = readAmount();
  if (!amount || !demo.accountsLinked) return closeModal();
  const fee = Math.round(amount * 0.02);
  const reference = `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const transfer = { id: reference, amount, fee, createdAt: new Date().toISOString() };
  demo.transfers.unshift(transfer);
  demo.transfers = demo.transfers.slice(0, 20);
  saveDemo();
  renderActivity();
  renderDemoState();
  showTransferDetail(reference);
}

function showResetConfirmation() {
  showModal('Reset this demo?', '<p>This clears the fictional accounts and sample activity from this browser session. It does not affect any real account.</p>', `${secondaryButton('Keep demo', 'close-modal')}${primaryButton('Reset sample data', 'confirm-reset-demo')}`);
}

function resetDemo() {
  demo.active = false;
  demo.accountsLinked = false;
  demo.cards = [];
  SAMPLE_CARDS.splice(0, SAMPLE_CARDS.length, ...SAMPLE_CARDS.filter((card) => !card.custom));
  demo.customCards = [];
  demo.savingsAccount = null;
  demo.selectedCardId = null;
  demo.transfers = [];
  saveDemo().catch(() => showToast('Demo data could not be saved to the local data file.'));
  amountInput.value = '';
  renderDemoState();
  closeModal();
  showToast('Demo data cleared. Live transfers remain paused.');
}

function signOut() {
  loggedIn = false;
  currentAuthUser = null;
  sessionStorage.removeItem(AUTH_KEY);
  fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  closeModal();
  renderAuthState();
}

function setAuthMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  $('#login-title').textContent = authMode === 'register' ? 'Create your account' : 'Welcome back';
  $('#login-form button[type="submit"]').textContent = authMode === 'register' ? 'Create account' : 'Sign in securely';
  $('#login-password').autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
  $('[data-action="auth-mode"]').textContent = authMode === 'register' ? 'I already have an account · Sign in' : 'Create account';
}

function handleAction(action, target) {
  switch (action) {
    case 'help': case 'notifications': case 'privacy': case 'terms': showInformation(action); break;
    case 'profile': openProfile(); break;
    case 'close-modal': closeModal(); break;
    case 'live-login':
      showModal('Secure sign-in is not connected', '<p>This pilot has no real authentication service yet. Do not enter your email password, card PIN, or OTP on this page.</p><div class="modal-notice"><strong>Use demo sign-in</strong><span>The demo creates a temporary sample session in this browser only.</span></div>', `${secondaryButton('Close', 'close-modal')}${primaryButton('Enter demo workspace', 'demo-login')}`);
      break;
    case 'demo-login': signInToDemo(); break;
    case 'auth-mode': setAuthMode(authMode === 'login' ? 'register' : 'login'); break;
    case 'sign-out': signOut(); break;
    case 'add-card': openAddCardModal(); break;
    case 'live-card-link':
      showModal('Real card linking is not connected', '<p>Real card enrollment must happen inside an issuer-approved, PCI-compliant hosted flow. This app does not accept card numbers, expiration dates, CVV, PINs, or OTPs.</p><p>For now, add one of the fictional sample cards to preview the card wallet.</p>', `${secondaryButton('Close', 'close-modal')}${primaryButton('Choose a sample card', 'show-add-card')}`);
      break;
    case 'show-add-card': openAddCardModal(); break;
    case 'display-card':
      closeModal();
      showView('cards', true);
      openAddCardModal();
      break;
    case 'add-savings': openSavingsAccountModal(); break;
    case 'remove-savings':
      demo.savingsAccount = null;
      saveDemo(); renderDemoState(); closeModal();
      showToast('Savings account preview removed.');
      break;
    case 'add-sample-card': {
      const id = target.dataset.cardId;
      if (!SAMPLE_CARDS.some((card) => card.id === id) || demo.cards.includes(id)) return showToast('That sample card is already in your wallet.');
      demo.active = true;
      demo.cards.push(id);
      if (!demo.selectedCardId) demo.selectedCardId = id;
      saveDemo(); renderDemoState(); closeModal();
      showToast('Sample card added to your demo wallet.');
      break;
    }
    case 'card-details': showCardDetails(target.dataset.cardId); break;
    case 'select-sample-card': {
      const id = target.dataset.cardId;
      if (!demo.cards.includes(id)) return showToast('That sample card is not in your wallet.');
      demo.selectedCardId = id; saveDemo(); renderDemoState(); closeModal();
      showToast('Sample card selected for demo transfers.');
      break;
    }
    case 'remove-sample-card': {
      const id = target.dataset.cardId;
      const removed = SAMPLE_CARDS.find((card) => card.id === id);
      demo.cards = demo.cards.filter((cardId) => cardId !== id);
      if (removed?.custom) {
        demo.customCards = demo.customCards.filter((card) => card.id !== id);
        SAMPLE_CARDS.splice(SAMPLE_CARDS.indexOf(removed), 1);
      }
      if (demo.selectedCardId === id) demo.selectedCardId = demo.cards[0] || null;
      if (demo.cards.length === 0) demo.accountsLinked = false;
      saveDemo(); renderDemoState(); closeModal();
      showToast('Sample card removed from this demo.');
      break;
    }
    case 'start-demo': activateDemo(); closeModal(); break;
    case 'start-demo-and-link': startDemoAndLink(); break;
    case 'connect-samples':
      if (!demo.active) activateDemo();
      ensureDemoCard();
      demo.accountsLinked = true; saveDemo(); renderDemoState(); closeModal();
      showToast('Sample accounts linked. Try a sample transfer amount.');
      break;
    case 'disconnect-samples':
      demo.accountsLinked = false; amountInput.value = ''; saveDemo(); renderDemoState(); closeModal();
      showToast('Sample accounts disconnected.');
      break;
    case 'view-all':
      if (document.body.dataset.view === 'activity') openAllActivity();
      else showView('activity', true);
      break;
    case 'view-transfer': showTransferDetail(target.dataset.id); break;
    case 'go-transfer': closeModal(); showView('transfer', true); break;
    case 'confirm-demo-transfer': confirmDemoTransfer(); break;
    case 'ask-reset-demo': showResetConfirmation(); break;
    case 'reset-demo': showResetConfirmation(); break;
    case 'confirm-reset-demo': resetDemo(); break;
    case 'print-receipt': window.print(); break;
    default: break;
  }
}

document.addEventListener('click', (event) => {
  const actionElement = event.target.closest('[data-action]');
  if (actionElement) {
    handleAction(actionElement.dataset.action, actionElement);
    return;
  }
  if (event.target.closest('#start-demo')) {
    activateDemo();
    return;
  }
  if (event.target.closest('#link-accounts')) {
    openLinkModal();
    return;
  }
  if (event.target.closest('#continue-transfer')) {
    reviewTransfer();
    return;
  }
  if (event.target === modalBackdrop) closeModal();
});

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'custom-card-form') return;
  event.preventDefault();
  if (demo.customCards.length >= 10) return showToast('The wallet supports up to 10 custom card previews.');
  const fields = new FormData(event.target);
  const network = String(fields.get('network'));
  const card = {
    id: `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    custom: true,
    name: String(fields.get('name')).trim(),
    issuer: String(fields.get('issuer')).trim(),
    holder: String(fields.get('holder') || '').trim(),
    network,
    last4: String(fields.get('last4')),
    theme: network === 'MASTERCARD' ? 'midnight' : network === 'RuPay' ? 'plum' : 'forest',
  };
  if (!card.name || !card.issuer || !/^\d{4}$/.test(card.last4)) return showToast('Enter the card name, issuer, and last four digits only.');
  demo.customCards.push(card);
  SAMPLE_CARDS.push(card);
  demo.cards.push(card.id);
  demo.selectedCardId = card.id;
  demo.active = true;
  saveDemo();
  renderDemoState();
  closeModal();
  showView('cards', true);
  showToast('Card preview added to your wallet. No payment card was linked.');
});

$('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const values = new FormData(form);
  submit.disabled = true;
  fetch(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
  }).then(async (response) => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Could not sign in.');
    loggedIn = true;
    currentAuthUser = result.user || null;
    form.reset();
    renderAuthState();
    showView(location.hash.slice(1));
    showToast(authMode === 'register' ? 'Account created and signed in.' : 'Signed in successfully.');
  }).catch((error) => {
    $('#login-password').value = '';
    showModal('Could not sign in', `<p>${error.message}</p>`, secondaryButton('Close', 'close-modal'));
  }).finally(() => { submit.disabled = false; });
});

document.addEventListener('input', (event) => {
  if (event.target === amountInput) {
    amountInput.removeAttribute('aria-invalid');
    updateQuotePreview();
  }
  if (event.target.id === 'demo-consent') {
    const confirmButton = modalContent.querySelector('[data-action="confirm-demo-transfer"]');
    if (confirmButton) confirmButton.disabled = !event.target.checked;
  }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'demo-consent') {
    const confirmButton = modalContent.querySelector('[data-action="confirm-demo-transfer"]');
    if (confirmButton) confirmButton.disabled = !event.target.checked;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modalBackdrop.hidden) closeModal();
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.help-card-button')) {
    event.preventDefault(); showInformation('help');
  }
});

const views = {
  home: ['Overview', 'Your transfer workspace', 'A clear view of your card-to-savings transfers.'],
  cards: ['My cards', 'Your card wallet', 'View and manage the sample cards in this demo.'],
  transfer: ['New transfer', 'Move money to savings', 'Request a cash advance to your own savings account.'],
  activity: ['Activity', 'Transfer activity', 'Review simulated transfers and open their receipts.'],
};

function showView(viewName, updateHistory = false) {
  const view = views[viewName] ? viewName : 'home';
  const [label, title, subtitle] = views[view];
  document.body.dataset.view = view;
  $('.breadcrumb strong').textContent = label;
  $('.welcome-row h1').textContent = title;
  $('.welcome-sub').textContent = subtitle;
  document.querySelectorAll('.nav-item').forEach((link) => {
    const active = link.hash === `#${view}` || (view === 'home' && link.hash === '#home');
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (updateHistory && location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav-item, .brand').forEach((link) => {
  link.addEventListener('click', (event) => {
    const view = link.hash.slice(1);
    if (!views[view]) return;
    event.preventDefault();
    showView(view, true);
  });
});
window.addEventListener('popstate', () => showView(location.hash.slice(1)));
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));

loadDemo().then(() => {
  renderDemoState();
  return fetch('/api/auth/session', { credentials: 'same-origin' });
}).then((response) => response.json()).then((session) => {
  loggedIn = loggedIn || session.authenticated === true;
  currentAuthUser = session.authenticated ? session.user : null;
  renderAuthState();
  showView(location.hash.slice(1));
}).catch(() => { renderAuthState(); showView(location.hash.slice(1)); });
loadPartnerStatus();
