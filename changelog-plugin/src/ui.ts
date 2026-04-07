// Changelog & Documentation Plugin - UI Logic

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChangeEntry {
  pageId: string;
  pageName: string;
  nodeName: string;
  nodeId: string;
  nodeType: string;
  category: 'Updated' | 'Fixed' | 'Added' | 'Removed';
  description: string;
  timestamp: string;
}

// ─── State ───────────────────────────────────────────────────────────────────

let currentEntries: ChangeEntry[] = [];
let currentFormatted = '';
let settingsOpen = false;
let hasScanned = false;

// ─── DOM References ──────────────────────────────────────────────────────────

const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-button');
const tabContents = document.querySelectorAll<HTMLDivElement>('.tab-content');
const settingsToggle = document.getElementById('settingsToggle') as HTMLButtonElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLDivElement;
const toast = document.getElementById('toast') as HTMLDivElement;

// Scan tab
const daysSelect = document.getElementById('daysSelect') as HTMLSelectElement;
const scanBtn = document.getElementById('scanBtn') as HTMLButtonElement;
const scanPreview = document.getElementById('scanPreview') as HTMLDivElement;
const scanContent = document.getElementById('scanContent') as HTMLDivElement;
const copyScan = document.getElementById('copyScan') as HTMLButtonElement;

// Publish tab
const confluenceUrl = document.getElementById('confluenceUrl') as HTMLInputElement;
const publishBtn = document.getElementById('publishBtn') as HTMLButtonElement;
const publishInfo = document.getElementById('publishInfo') as HTMLSpanElement;
const publishContent = document.getElementById('publishContent') as HTMLDivElement;
const copyPublish = document.getElementById('copyPublish') as HTMLButtonElement;

// Announcement tab
const announcementBtn = document.getElementById('announcementBtn') as HTMLButtonElement;
const announcementPreview = document.getElementById('announcementPreview') as HTMLDivElement;
const announcementContent = document.getElementById('announcementContent') as HTMLDivElement;
const charCounter = document.getElementById('charCounter') as HTMLDivElement;
const copyAnnouncement = document.getElementById('copyAnnouncement') as HTMLButtonElement;

// Settings
const settingsEmail = document.getElementById('settingsEmail') as HTMLInputElement;
const settingsAnthropic = document.getElementById('settingsAnthropic') as HTMLInputElement;
const settingsConfluence = document.getElementById('settingsConfluence') as HTMLInputElement;
const settingsFigma = document.getElementById('settingsFigma') as HTMLInputElement;
const saveKeysBtn = document.getElementById('saveKeysBtn') as HTMLButtonElement;

// ─── Tab Navigation ──────────────────────────────────────────────────────────

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    if (!tabId) return;

    // Close settings if open
    if (settingsOpen) {
      settingsOpen = false;
      settingsPanel.classList.remove('active');
    }

    // Switch tabs
    tabButtons.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');

    const targetContent = document.getElementById(`tab-${tabId}`);
    if (targetContent) targetContent.classList.add('active');
  });
});

// ─── Settings Toggle ─────────────────────────────────────────────────────────

settingsToggle.addEventListener('click', () => {
  settingsOpen = !settingsOpen;

  if (settingsOpen) {
    // Hide all tab content, show settings
    tabContents.forEach((c) => c.classList.remove('active'));
    settingsPanel.classList.add('active');

    // Request saved keys
    parent.postMessage({ pluginMessage: { type: 'LOAD_KEYS' } }, '*');
  } else {
    // Show current active tab
    settingsPanel.classList.remove('active');
    const activeTab = document.querySelector('.tab-button.active') as HTMLButtonElement;
    if (activeTab?.dataset.tab) {
      const target = document.getElementById(`tab-${activeTab.dataset.tab}`);
      if (target) target.classList.add('active');
    }
  }
});

// ─── Scan ────────────────────────────────────────────────────────────────────

scanBtn.addEventListener('click', () => {
  const days = parseInt(daysSelect.value, 10);
  scanBtn.disabled = true;
  scanBtn.innerHTML = '<span class="spinner"></span>Scanning...';

  parent.postMessage(
    { pluginMessage: { type: 'SCAN_PAGES', days } },
    '*'
  );
});

copyScan.addEventListener('click', () => {
  copyToClipboard(currentFormatted);
});

// ─── Publish ─────────────────────────────────────────────────────────────────

publishBtn.addEventListener('click', () => {
  if (currentEntries.length === 0) {
    showToast('No scan data. Run a scan first.');
    return;
  }

  const url = confluenceUrl.value.trim();
  if (!url) {
    showToast('Enter a Confluence URL');
    return;
  }

  publishBtn.disabled = true;
  publishBtn.innerHTML = '<span class="spinner"></span>Publishing...';

  parent.postMessage(
    {
      pluginMessage: {
        type: 'PUBLISH_CONFLUENCE',
        confluenceUrl: url,
        entries: currentEntries,
      },
    },
    '*'
  );
});

copyPublish.addEventListener('click', () => {
  copyToClipboard(publishContent.textContent || '');
});

// ─── Announcement ────────────────────────────────────────────────────────────

announcementBtn.addEventListener('click', () => {
  if (currentEntries.length === 0) {
    showToast('No scan data. Run a scan first.');
    return;
  }

  announcementBtn.disabled = true;
  announcementBtn.innerHTML = '<span class="spinner"></span>Generating...';

  parent.postMessage(
    {
      pluginMessage: {
        type: 'GENERATE_ANNOUNCEMENT',
        entries: currentEntries,
        confluenceUrl: confluenceUrl.value.trim(),
      },
    },
    '*'
  );
});

copyAnnouncement.addEventListener('click', () => {
  copyToClipboard(announcementContent.textContent || '');
});

// ─── Save Keys ───────────────────────────────────────────────────────────────

saveKeysBtn.addEventListener('click', () => {
  saveKeysBtn.disabled = true;
  saveKeysBtn.innerHTML = '<span class="spinner"></span>Saving...';

  parent.postMessage(
    {
      pluginMessage: {
        type: 'SAVE_KEYS',
        keys: {
          email: settingsEmail.value,
          anthropicKey: settingsAnthropic.value,
          confluenceKey: settingsConfluence.value,
          figmaToken: settingsFigma.value,
        },
      },
    },
    '*'
  );
});

// ─── Message Handler (from plugin controller) ────────────────────────────────

onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'SCAN_START':
      // Already showing spinner via button
      break;

    case 'SCAN_RESULT':
      currentEntries = msg.entries;
      currentFormatted = msg.formatted;
      hasScanned = true;

      scanBtn.disabled = false;
      scanBtn.textContent = 'Rescan';

      scanPreview.style.display = 'flex';
      scanContent.textContent = msg.formatted;

      // Update publish info
      const days = daysSelect.value;
      publishInfo.textContent = `All change log entry from the last ${days} days will be published to your confluence page.`;
      publishContent.textContent = msg.formatted;

      showToast(`Found ${msg.count} change${msg.count !== 1 ? 's' : ''}`);
      break;

    case 'SCAN_ERROR':
      scanBtn.disabled = false;
      scanBtn.textContent = hasScanned ? 'Rescan' : 'Scan pages';
      showToast(`Error: ${msg.error}`);
      break;

    case 'KEYS_LOADED':
      settingsEmail.value = msg.keys.email || '';
      settingsAnthropic.value = msg.keys.anthropicKey || '';
      settingsConfluence.value = msg.keys.confluenceKey || '';
      settingsFigma.value = msg.keys.figmaToken || '';
      break;

    case 'KEYS_SAVED':
      saveKeysBtn.disabled = false;
      saveKeysBtn.textContent = 'Save keys';
      showToast('Keys saved');

      // Close settings, go back to active tab
      settingsOpen = false;
      settingsPanel.classList.remove('active');
      const activeTab = document.querySelector('.tab-button.active') as HTMLButtonElement;
      if (activeTab?.dataset.tab) {
        const target = document.getElementById(`tab-${activeTab.dataset.tab}`);
        if (target) target.classList.add('active');
      }
      break;

    case 'KEYS_ERROR':
      saveKeysBtn.disabled = false;
      saveKeysBtn.textContent = 'Save keys';
      showToast(`Error: ${msg.error}`);
      break;

    case 'PUBLISH_DATA':
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publish to confluence';
      publishContent.textContent = msg.formatted;
      showToast('Ready to publish');
      break;

    case 'ANNOUNCEMENT_RESULT':
      announcementBtn.disabled = false;
      announcementBtn.textContent = 'Generate announcement';
      announcementPreview.style.display = 'flex';
      announcementContent.textContent = msg.announcement;

      const len = msg.announcement.length;
      charCounter.textContent = `${len}/350`;
      charCounter.classList.toggle('over-limit', len > 350);
      break;
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function copyToClipboard(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast('Copied to clipboard');
}

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
