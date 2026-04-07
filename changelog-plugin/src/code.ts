// Changelog & Documentation Plugin - Controller (runs in Figma sandbox)

figma.showUI(__html__, { width: 380, height: 500, themeColors: true });

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

interface ScanRequest {
  type: 'SCAN_PAGES';
  days: number;
}

interface SaveKeysRequest {
  type: 'SAVE_KEYS';
  keys: {
    email: string;
    anthropicKey: string;
    confluenceKey: string;
    figmaToken: string;
  };
}

interface LoadKeysRequest {
  type: 'LOAD_KEYS';
}

interface PublishRequest {
  type: 'PUBLISH_CONFLUENCE';
  confluenceUrl: string;
  entries: ChangeEntry[];
}

interface GenerateAnnouncementRequest {
  type: 'GENERATE_ANNOUNCEMENT';
  entries: ChangeEntry[];
  confluenceUrl: string;
}

type UIMessage =
  | ScanRequest
  | SaveKeysRequest
  | LoadKeysRequest
  | PublishRequest
  | GenerateAnnouncementRequest;

// ─── Client Storage Keys ─────────────────────────────────────────────────────

const STORAGE_KEYS = {
  EMAIL: 'changelog_email',
  ANTHROPIC_KEY: 'changelog_anthropic_key',
  CONFLUENCE_KEY: 'changelog_confluence_key',
  FIGMA_TOKEN: 'changelog_figma_token',
} as const;

// ─── Page Scanner ────────────────────────────────────────────────────────────

async function scanPages(days: number): Promise<ChangeEntry[]> {
  const entries: ChangeEntry[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  await figma.loadAllPagesAsync();

  const pages = figma.root.children;

  for (const page of pages) {
    await figma.setCurrentPageAsync(page);

    const allNodes = page.findAll();

    for (const node of allNodes) {
      // Skip invisible/tiny helper nodes
      if ('visible' in node && !node.visible) continue;

      // Categorize based on node properties
      const entry = categorizeNode(node, page, cutoffDate);
      if (entry) {
        entries.push(entry);
      }
    }
  }

  // Sort by page name, then by category
  entries.sort((a, b) => {
    const pageCompare = a.pageName.localeCompare(b.pageName);
    if (pageCompare !== 0) return pageCompare;
    return categoryOrder(a.category) - categoryOrder(b.category);
  });

  return entries;
}

function categoryOrder(cat: ChangeEntry['category']): number {
  const order = { Added: 0, Updated: 1, Fixed: 2, Removed: 3 };
  return order[cat] ?? 4;
}

function categorizeNode(
  node: SceneNode,
  page: PageNode,
  cutoffDate: Date
): ChangeEntry | null {
  // Use node name patterns and heuristics for categorization
  const name = node.name.toLowerCase();
  const now = new Date();

  // Check if node was recently added or modified
  // Since Figma Plugin API doesn't expose lastModified at node level,
  // we rely on naming conventions and structural heuristics

  let category: ChangeEntry['category'] = 'Updated';

  if (name.includes('[new]') || name.includes('[added]')) {
    category = 'Added';
  } else if (name.includes('[fix]') || name.includes('[fixed]')) {
    category = 'Fixed';
  } else if (name.includes('[removed]') || name.includes('[deprecated]')) {
    category = 'Removed';
  } else if (name.includes('[update]') || name.includes('[updated]')) {
    category = 'Updated';
  } else {
    // Skip nodes without markers for now — the AI categorization
    // will handle these when Anthropic API key is configured
    return null;
  }

  // Clean the name by removing category markers
  const cleanName = node.name
    .replace(/\[(new|added|fix|fixed|removed|deprecated|update|updated)\]/gi, '')
    .trim();

  return {
    pageId: page.id,
    pageName: page.name,
    nodeName: cleanName || node.name,
    nodeId: node.id,
    nodeType: node.type,
    category,
    description: `${category}. ${cleanName || node.name}`,
    timestamp: now.toISOString().split('T')[0].replace(/-/g, '.'),
  };
}

// ─── Format Changelog ────────────────────────────────────────────────────────

function formatChangelog(entries: ChangeEntry[]): string {
  if (entries.length === 0) return 'No changes found in the selected period.';

  const byPage = new Map<string, ChangeEntry[]>();
  for (const entry of entries) {
    const existing = byPage.get(entry.pageName) || [];
    existing.push(entry);
    byPage.set(entry.pageName, existing);
  }

  const lines: string[] = [];
  for (const [pageName, pageEntries] of byPage) {
    lines.push(`-${pageName} -`);
    for (const entry of pageEntries) {
      lines.push(`${entry.description} - ${entry.timestamp}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Generate Announcement ───────────────────────────────────────────────────

function generateAnnouncement(
  entries: ChangeEntry[],
  confluenceUrl: string
): string {
  if (entries.length === 0) return 'No updates to announce.';

  // Group by category
  const added = entries.filter((e) => e.category === 'Added');
  const updated = entries.filter((e) => e.category === 'Updated');
  const fixed = entries.filter((e) => e.category === 'Fixed');
  const removed = entries.filter((e) => e.category === 'Removed');

  const parts: string[] = [];

  if (added.length > 0) {
    parts.push(`\u2728 ${added.length} new addition${added.length > 1 ? 's' : ''}`);
  }
  if (updated.length > 0) {
    parts.push(`\uD83D\uDD04 ${updated.length} update${updated.length > 1 ? 's' : ''}`);
  }
  if (fixed.length > 0) {
    parts.push(`\uD83D\uDEE0\uFE0F ${fixed.length} fix${fixed.length > 1 ? 'es' : ''}`);
  }
  if (removed.length > 0) {
    parts.push(`\uD83D\uDDD1\uFE0F ${removed.length} removal${removed.length > 1 ? 's' : ''}`);
  }

  // Build the top highlights
  const topEntries = entries.slice(0, 3);
  const highlights = topEntries
    .map((e) => {
      const emoji =
        e.category === 'Added'
          ? '\u2728'
          : e.category === 'Fixed'
            ? '\uD83D\uDEE0\uFE0F'
            : e.category === 'Removed'
              ? '\uD83D\uDDD1\uFE0F'
              : '\uD83D\uDD04';
      return `${emoji} ${e.nodeName}`;
    })
    .join('\n');

  let announcement = `\uD83D\uDCE2 Design System Update\n\n${parts.join(' \u2022 ')}\n\nTop changes:\n${highlights}`;

  if (confluenceUrl) {
    announcement += `\n\n\uD83D\uDD17 Full changelog: ${confluenceUrl}`;
  }

  // Enforce 350 character limit
  if (announcement.length > 350) {
    announcement = announcement.substring(0, 347) + '...';
  }

  return announcement;
}

// ─── Message Handler ─────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg: UIMessage) => {
  switch (msg.type) {
    case 'SCAN_PAGES': {
      figma.ui.postMessage({ type: 'SCAN_START' });

      try {
        const entries = await scanPages(msg.days);
        const formatted = formatChangelog(entries);

        figma.ui.postMessage({
          type: 'SCAN_RESULT',
          entries,
          formatted,
          count: entries.length,
        });
      } catch (error: any) {
        figma.ui.postMessage({
          type: 'SCAN_ERROR',
          error: error.message || 'Failed to scan pages',
        });
      }
      break;
    }

    case 'SAVE_KEYS': {
      try {
        await figma.clientStorage.setAsync(STORAGE_KEYS.EMAIL, msg.keys.email);
        await figma.clientStorage.setAsync(
          STORAGE_KEYS.ANTHROPIC_KEY,
          msg.keys.anthropicKey
        );
        await figma.clientStorage.setAsync(
          STORAGE_KEYS.CONFLUENCE_KEY,
          msg.keys.confluenceKey
        );
        await figma.clientStorage.setAsync(
          STORAGE_KEYS.FIGMA_TOKEN,
          msg.keys.figmaToken
        );

        figma.ui.postMessage({ type: 'KEYS_SAVED' });
      } catch (error: any) {
        figma.ui.postMessage({
          type: 'KEYS_ERROR',
          error: error.message || 'Failed to save keys',
        });
      }
      break;
    }

    case 'LOAD_KEYS': {
      try {
        const email =
          (await figma.clientStorage.getAsync(STORAGE_KEYS.EMAIL)) || '';
        const anthropicKey =
          (await figma.clientStorage.getAsync(STORAGE_KEYS.ANTHROPIC_KEY)) || '';
        const confluenceKey =
          (await figma.clientStorage.getAsync(STORAGE_KEYS.CONFLUENCE_KEY)) ||
          '';
        const figmaToken =
          (await figma.clientStorage.getAsync(STORAGE_KEYS.FIGMA_TOKEN)) || '';

        figma.ui.postMessage({
          type: 'KEYS_LOADED',
          keys: { email, anthropicKey, confluenceKey, figmaToken },
        });
      } catch (error: any) {
        figma.ui.postMessage({
          type: 'KEYS_ERROR',
          error: error.message || 'Failed to load keys',
        });
      }
      break;
    }

    case 'PUBLISH_CONFLUENCE': {
      // The actual Confluence publish happens in the UI iframe
      // since it has network access. We just provide formatted data.
      const formatted = formatChangelog(msg.entries);
      figma.ui.postMessage({
        type: 'PUBLISH_DATA',
        formatted,
        confluenceUrl: msg.confluenceUrl,
      });
      break;
    }

    case 'GENERATE_ANNOUNCEMENT': {
      const announcement = generateAnnouncement(
        msg.entries,
        msg.confluenceUrl
      );
      figma.ui.postMessage({
        type: 'ANNOUNCEMENT_RESULT',
        announcement,
      });
      break;
    }
  }
};
