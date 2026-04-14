// Changelog & Documentation Plugin - Controller (runs in Figma sandbox)
"use strict";

figma.showUI(__html__, { width: 380, height: 500, themeColors: true });

// ─── Client Storage Keys ─────────────────────────────────────────────────────

const STORAGE_KEYS = {
  EMAIL: 'changelog_email',
  CONFLUENCE_KEY: 'changelog_confluence_key',
};

// ─── Page Scanner ────────────────────────────────────────────────────────────
// Scans all pages and collects top-level frames/components as changelog entries.
// Groups by page, categorizes by node type heuristics.

async function scanPages(days) {
  await figma.loadAllPagesAsync();

  var entries = [];
  var now = new Date();
  var timestamp = now.toISOString().split('T')[0].replace(/-/g, '.');

  for (var p = 0; p < figma.root.children.length; p++) {
    var page = figma.root.children[p];
    await figma.setCurrentPageAsync(page);

    for (var i = 0; i < page.children.length; i++) {
      var node = page.children[i];

      // Skip hidden nodes
      if ('visible' in node && !node.visible) continue;

      // Categorize based on node name conventions and type
      var category = categorizeNode(node);
      var cleanName = node.name
        .replace(/\[(new|added|fix|fixed|removed|deprecated|update|updated)\]/gi, '')
        .trim() || node.name;

      entries.push({
        pageId: page.id,
        pageName: page.name,
        nodeName: cleanName,
        nodeId: node.id,
        nodeType: node.type,
        category: category,
        description: category + '. ' + cleanName,
        timestamp: timestamp,
      });
    }
  }

  // Sort by page name, then by category
  entries.sort(function(a, b) {
    var pageCompare = a.pageName.localeCompare(b.pageName);
    if (pageCompare !== 0) return pageCompare;
    return categoryOrder(a.category) - categoryOrder(b.category);
  });

  return entries;
}

function categoryOrder(cat) {
  var order = { Added: 0, Updated: 1, Fixed: 2, Removed: 3 };
  return order[cat] !== undefined ? order[cat] : 4;
}

function categorizeNode(node) {
  var name = node.name.toLowerCase();

  // Explicit markers in node names
  if (name.includes('[new]') || name.includes('[added]')) return 'Added';
  if (name.includes('[fix]') || name.includes('[fixed]')) return 'Fixed';
  if (name.includes('[removed]') || name.includes('[deprecated]')) return 'Removed';
  if (name.includes('[update]') || name.includes('[updated]')) return 'Updated';

  // Heuristics based on node type
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') return 'Added';
  if (node.type === 'INSTANCE') return 'Updated';

  return 'Updated';
}

// ─── Format Changelog ────────────────────────────────────────────────────────

function formatChangelog(entries) {
  if (entries.length === 0) return 'No changes found in the selected period.';

  var byPage = new Map();
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var existing = byPage.get(entry.pageName) || [];
    existing.push(entry);
    byPage.set(entry.pageName, existing);
  }

  var lines = [];
  byPage.forEach(function(pageEntries, pageName) {
    lines.push('-' + pageName + ' -');
    for (var j = 0; j < pageEntries.length; j++) {
      lines.push(pageEntries[j].description + ' - ' + pageEntries[j].timestamp);
    }
    lines.push('');
  });

  return lines.join('\n');
}

// ─── Generate Announcement ───────────────────────────────────────────────────

function generateAnnouncement(entries, confluenceUrl) {
  if (entries.length === 0) return 'No updates to announce.';

  var added = entries.filter(function(e) { return e.category === 'Added'; });
  var updated = entries.filter(function(e) { return e.category === 'Updated'; });
  var fixed = entries.filter(function(e) { return e.category === 'Fixed'; });
  var removed = entries.filter(function(e) { return e.category === 'Removed'; });

  var parts = [];
  if (added.length > 0) parts.push('\u2728 ' + added.length + ' new addition' + (added.length > 1 ? 's' : ''));
  if (updated.length > 0) parts.push('\uD83D\uDD04 ' + updated.length + ' update' + (updated.length > 1 ? 's' : ''));
  if (fixed.length > 0) parts.push('\uD83D\uDEE0\uFE0F ' + fixed.length + ' fix' + (fixed.length > 1 ? 'es' : ''));
  if (removed.length > 0) parts.push('\uD83D\uDDD1\uFE0F ' + removed.length + ' removal' + (removed.length > 1 ? 's' : ''));

  var topEntries = entries.slice(0, 3);
  var highlights = topEntries
    .map(function(e) {
      var emoji =
        e.category === 'Added' ? '\u2728' :
        e.category === 'Fixed' ? '\uD83D\uDEE0\uFE0F' :
        e.category === 'Removed' ? '\uD83D\uDDD1\uFE0F' : '\uD83D\uDD04';
      return emoji + ' ' + e.nodeName;
    })
    .join('\n');

  var announcement = '\uD83D\uDCE2 Design System Update\n\n' +
    parts.join(' \u2022 ') +
    '\n\nTop changes:\n' + highlights;

  if (confluenceUrl) {
    announcement += '\n\n\uD83D\uDD17 Full changelog: ' + confluenceUrl;
  }

  if (announcement.length > 350) {
    announcement = announcement.substring(0, 347) + '...';
  }

  return announcement;
}

// ─── Message Handler ─────────────────────────────────────────────────────────

figma.ui.onmessage = async function(msg) {
  switch (msg.type) {
    case 'SCAN_PAGES': {
      figma.ui.postMessage({ type: 'SCAN_START' });

      try {
        var entries = await scanPages(msg.days);
        var formatted = formatChangelog(entries);

        figma.ui.postMessage({
          type: 'SCAN_RESULT',
          entries: entries,
          formatted: formatted,
          count: entries.length,
        });
      } catch (error) {
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
        await figma.clientStorage.setAsync(STORAGE_KEYS.CONFLUENCE_KEY, msg.keys.confluenceKey);

        figma.ui.postMessage({ type: 'KEYS_SAVED' });
      } catch (error) {
        figma.ui.postMessage({
          type: 'KEYS_ERROR',
          error: error.message || 'Failed to save keys',
        });
      }
      break;
    }

    case 'LOAD_KEYS': {
      try {
        var email = (await figma.clientStorage.getAsync(STORAGE_KEYS.EMAIL)) || '';
        var confluenceKey = (await figma.clientStorage.getAsync(STORAGE_KEYS.CONFLUENCE_KEY)) || '';

        figma.ui.postMessage({
          type: 'KEYS_LOADED',
          keys: { email: email, confluenceKey: confluenceKey },
        });
      } catch (error) {
        figma.ui.postMessage({
          type: 'KEYS_ERROR',
          error: error.message || 'Failed to load keys',
        });
      }
      break;
    }

    case 'PUBLISH_CONFLUENCE': {
      try {
        var email = (await figma.clientStorage.getAsync(STORAGE_KEYS.EMAIL)) || '';
        var confluenceKey = (await figma.clientStorage.getAsync(STORAGE_KEYS.CONFLUENCE_KEY)) || '';

        if (!email || !confluenceKey) {
          figma.ui.postMessage({
            type: 'PUBLISH_ERROR',
            error: 'Email and Confluence API key are required. Open Settings to add them.',
          });
          break;
        }

        var formatted2 = formatChangelog(msg.entries);
        figma.ui.postMessage({
          type: 'PUBLISH_DATA',
          formatted: formatted2,
          confluenceUrl: msg.confluenceUrl,
          email: email,
          confluenceKey: confluenceKey,
          entries: msg.entries,
          fileName: figma.root.name,
        });
      } catch (error) {
        figma.ui.postMessage({
          type: 'PUBLISH_ERROR',
          error: error.message || 'Failed to prepare publish data',
        });
      }
      break;
    }

    case 'GENERATE_ANNOUNCEMENT': {
      var announcement = generateAnnouncement(msg.entries, msg.confluenceUrl);
      figma.ui.postMessage({
        type: 'ANNOUNCEMENT_RESULT',
        announcement: announcement,
      });
      break;
    }
  }
};
