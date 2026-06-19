/* ============================================
   RSS Reader - Core Application Logic (Vue 3)
   微水泥 × 天鹅绒艺术漆风格
   ============================================ */

const { createApp, ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } = Vue;

// ============================================
// 工具函数
// ============================================

// 简单的 XML parser (RSS/Atom)
function parseRSS(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('XML解析失败');

  // 尝试 Atom 格式
  const isAtom = doc.querySelector('feed > entry');
  const items = isAtom ? parseAtom(doc) : parseRSS2(doc);
  const title = isAtom
    ? doc.querySelector('feed > title')?.textContent || '未命名订阅'
    : doc.querySelector('channel > title')?.textContent || '未命名订阅';

  return { title, items };
}

function parseRSS2(doc) {
  const items = [];
  const entries = doc.querySelectorAll('channel > item');
  entries.forEach(item => {
    const content = item.querySelector('content\\:encoded, encoded')?.textContent
      || item.querySelector('description')?.textContent || '';
    items.push({
      title: item.querySelector('title')?.textContent || '无标题',
      link: item.querySelector('link')?.textContent || '',
      description: item.querySelector('description')?.textContent || '',
      content: content,
      pubDate: item.querySelector('pubDate')?.textContent || '',
      author: item.querySelector('author')?.textContent || item.querySelector('dc\\:creator, creator')?.textContent || '',
      guid: item.querySelector('guid')?.textContent || item.querySelector('link')?.textContent || '',
    });
  });
  return items;
}

function parseAtom(doc) {
  const items = [];
  const entries = doc.querySelectorAll('feed > entry');
  entries.forEach(entry => {
    const content = entry.querySelector('content')?.textContent
      || entry.querySelector('summary')?.textContent || '';
    items.push({
      title: entry.querySelector('title')?.textContent || '无标题',
      link: entry.querySelector('link[href]')?.getAttribute('href') || '',
      description: entry.querySelector('summary')?.textContent || '',
      content: content,
      pubDate: entry.querySelector('published')?.textContent || entry.querySelector('updated')?.textContent || '',
      author: entry.querySelector('author > name')?.textContent || '',
      guid: entry.querySelector('id')?.textContent || '',
    });
  });
  return items;
}

// OPML 解析
function parseOPML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const outlines = doc.querySelectorAll('body > outline');
  const feeds = [];

  outlines.forEach(outline => {
    const xmlUrl = outline.getAttribute('xmlUrl');
    // 有 xmlUrl 的是订阅源
    if (xmlUrl) {
      feeds.push({
        title: outline.getAttribute('title') || outline.getAttribute('text') || '',
        url: xmlUrl,
        group: '未分组',
      });
    } else {
      // 没有 xmlUrl 的是分组
      const groupName = outline.getAttribute('title') || outline.getAttribute('text') || '未分组';
      outline.querySelectorAll(':scope > outline').forEach(child => {
        const childUrl = child.getAttribute('xmlUrl');
        if (childUrl) {
          feeds.push({
            title: child.getAttribute('title') || child.getAttribute('text') || '',
            url: childUrl,
            group: groupName,
          });
        }
      });
    }
  });

  return feeds;
}

// 生成 OPML
function generateOPML(groups, feeds) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head>\n<title>RSS订阅源</title>\n</head>\n<body>\n';

  const grouped = {};
  feeds.forEach(f => {
    const g = f.group || '未分组';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(f);
  });

  // 先输出分组
  Object.keys(grouped).sort().forEach(groupName => {
    if (groupName !== '未分组') {
      xml += `<outline text="${escapeAttr(groupName)}">\n`;
      grouped[groupName].forEach(f => {
        xml += `  <outline type="rss" text="${escapeAttr(f.title)}" title="${escapeAttr(f.title)}" xmlUrl="${escapeAttr(f.url)}" />\n`;
      });
      xml += `</outline>\n`;
    }
  });

  // 未分组的
  if (grouped['未分组']) {
    grouped['未分组'].forEach(f => {
      xml += `<outline type="rss" text="${escapeAttr(f.title)}" title="${escapeAttr(f.title)}" xmlUrl="${escapeAttr(f.url)}" />\n`;
    });
  }

  xml += '</body>\n</opml>';
  return xml;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// CORS 代理
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchWithProxy(url) {
  const proxyUrls = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  // 先尝试直接请求（某些 RSS 源允许跨域）
  try {
    const resp = await fetchWithTimeout(url, {}, 8000);
    if (resp.ok) return await resp.text();
  } catch {}

  // 依次尝试代理
  for (const proxyUrl of proxyUrls) {
    try {
      const resp = await fetchWithTimeout(proxyUrl, {}, 15000);
      if (resp.ok) return await resp.text();
    } catch {}
  }
  throw new Error('所有代理均请求失败');
}

// HTML 清洗（去广告）
function cleanHTML(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;

  // 移除广告相关元素
  const adSelectors = [
    '[class*="ad-"]', '[class*="ad_"]', '[class*="advert"]', '[class*="sponsor"]',
    '[class*="promotion"]', '[class*="social-share"]', '[class*="related-post"]',
    '[class*="newsletter"]', '[class*="subscribe"]', '[class*="popup"]',
    '[id*="ad-"]', '[id*="sponsor"]', '[id*="promotion"]',
    'script', 'style', 'iframe', 'noscript',
    '.share-buttons', '.sharing', '.social-bar', '.author-bio',
    '.comments', '#comments', '.promo', '.banner',
  ];
  adSelectors.forEach(sel => {
    try { div.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
  });

  // 修复懒加载图片
  div.querySelectorAll('img[data-src]').forEach(img => {
    img.src = img.dataset.src;
  });
  div.querySelectorAll('img[data-original]').forEach(img => {
    img.src = img.dataset.original;
  });

  // 移除追踪参数
  div.querySelectorAll('a').forEach(a => {
    try {
      const url = new URL(a.href, 'http://x');
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'share_token'].forEach(p => url.searchParams.delete(p));
      a.href = url.toString();
    } catch {}
  });

  return div.innerHTML;
}

// Readability 全文提取
async function extractFullContent(url) {
  try {
    const html = await fetchWithProxy(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const readable = new Readability(doc).parse();
    return readable ? readable.content : null;
  } catch {
    return null;
  }
}

// Turndown (HTML → Markdown)
function htmlToMarkdown(html) {
  if (typeof TurndownService === 'undefined') return html;
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  return td.turndown(html);
}

// 日期格式化
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}小时前`;
    if (diff < 172800000) return '昨天';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

// 文件下载
function downloadFile(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// Vue 应用
// ============================================

const app = createApp({
  setup() {
    // --- 状态 ---
    const theme = ref(localStorage.getItem('rss-theme') || 'light');
    const readingMode = ref(false);
    const showSidebar = ref(false); // 移动端侧边栏
    const mobileView = ref('list'); // 移动端视图: 'list' | 'article'

    const groups = reactive(JSON.parse(localStorage.getItem('rss-groups') || '["未分组"]'));
    const feeds = reactive(JSON.parse(localStorage.getItem('rss-feeds') || '[]'));
    const articles = reactive(JSON.parse(localStorage.getItem('rss-articles') || '{}'));
    const currentFeed = ref(null);
    const currentArticle = ref(null);
    const searchQuery = ref('');
    const loading = ref(false);
    const toasts = reactive([]);

    // 模态框
    const showModal = ref('');
    const modalData = reactive({});

    // AI 设置
    const aiSettings = reactive(JSON.parse(localStorage.getItem('rss-ai-settings') || '{}'));
    if (!aiSettings.provider) aiSettings.provider = 'openai';
    if (!aiSettings.apiKey) aiSettings.apiKey = '';
    if (!aiSettings.baseUrl) {
      aiSettings.baseUrl = aiSettings.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com/v1';
    }
    if (!aiSettings.model) {
      aiSettings.model = aiSettings.provider === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-4-20250514';
    }

    // 快捷键提示
    const showShortcuts = ref(false);

    // 收藏
    const favorites = reactive(JSON.parse(localStorage.getItem('rss-favorites') || '[]'));
    watch(favorites, () => localStorage.setItem('rss-favorites', JSON.stringify(favorites)), { deep: true });

    function toggleFavorite(article) {
      if (!article) return;
      const key = article.guid || article.link;
      const idx = favorites.findIndex(f => f.key === key);
      if (idx > -1) {
        favorites.splice(idx, 1);
      } else {
        favorites.push({
          key,
          title: article.title,
          link: article.link,
          pubDate: article.pubDate,
          feedUrl: article.feedUrl,
          author: article.author,
          favoritedAt: new Date().toISOString(),
        });
      }
    }

    function isFavorited(article) {
      if (!article) return false;
      const key = article.guid || article.link;
      return favorites.some(f => f.key === key);
    }

    const showFavoritesOnly = ref(false);

    // 右键菜单 & 悬浮球
    const feedContextTarget = ref(null);
    const feedContextPos = reactive({ x: 0, y: 0 });
    const fabOpen = ref(false);

    // 点击其他地方关闭右键菜单和悬浮球
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.fab-toolbar') && !e.target.closest('.context-menu')) {
        fabOpen.value = false;
        feedContextTarget.value = null;
      }
    });

    // RSSHub 设置
    const rsshubUrl = ref(localStorage.getItem('rss-rsshub-url') || 'https://rsshub.app');
    const rsshubSearch = ref('');
    const rsshubResults = reactive([]);
    const rsshubLoading = ref(false);

    // --- 筛选状态 ---
    const readFilter = ref('all');       // 'all' | 'unread' | 'read'
    const timeFilter = ref('all');       // 'all' | 'today' | 'week' | 'month'

    // --- 计算属性 ---
    const feedArticles = computed(() => {
      let artList;
      if (!currentFeed.value) {
        // 全部文章
        artList = Object.values(articles).flat();
      } else {
        artList = articles[currentFeed.value] || [];
      }

      // 搜索过滤
      if (searchQuery.value) {
        artList = artList.filter(a => a.title.toLowerCase().includes(searchQuery.value.toLowerCase()));
      }

      // 收藏过滤
      if (showFavoritesOnly.value) {
        const favKeys = new Set(favorites.map(f => f.key));
        artList = artList.filter(a => favKeys.has(a.guid || a.link));
      }

      // 已读/未读过滤
      if (readFilter.value === 'unread') {
        artList = artList.filter(a => !a.read);
      } else if (readFilter.value === 'read') {
        artList = artList.filter(a => a.read);
      }

      // 时间过滤
      if (timeFilter.value !== 'all') {
        const now = new Date();
        let cutoff;
        if (timeFilter.value === 'today') {
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (timeFilter.value === 'week') {
          cutoff = new Date(now - 7 * 86400000);
        } else if (timeFilter.value === 'month') {
          cutoff = new Date(now - 30 * 86400000);
        }
        artList = artList.filter(a => {
          try { return new Date(a.pubDate) >= cutoff; } catch { return true; }
        });
      }

      return artList.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    });

    const groupedFeeds = computed(() => {
      const map = {};
      groups.forEach(g => map[g] = []);
      feeds.forEach(f => {
        const g = f.group || '未分组';
        if (!map[g]) map[g] = [];
        map[g].push(f);
      });
      return map;
    });

    // --- 持久化 ---
    watch(groups, () => localStorage.setItem('rss-groups', JSON.stringify(groups)), { deep: true });
    watch(feeds, () => localStorage.setItem('rss-feeds', JSON.stringify(feeds)), { deep: true });
    watch(articles, () => {
      // 限制 localStorage 大小：超过 5MB 时触发警告
      const json = JSON.stringify(articles);
      if (json.length > 4 * 1024 * 1024) {
        toast('文章缓存接近限制，建议清理旧文章');
      }
      localStorage.setItem('rss-articles', json);
    }, { deep: true });
    watch(theme, v => localStorage.setItem('rss-theme', v));

    // --- 缓存清理 ---
    const cacheRetentionDays = ref(parseInt(localStorage.getItem('rss-retention-days') || '14'));

    function cleanOldArticles(days = null) {
      const cutoff = days || cacheRetentionDays.value;
      const now = new Date();
      const favKeys = new Set(favorites.map(f => f.key));
      let removed = 0;

      Object.keys(articles).forEach(feedUrl => {
        if (!Array.isArray(articles[feedUrl])) return;
        articles[feedUrl] = articles[feedUrl].filter(a => {
          // 保留收藏文章
          if (favKeys.has(a.guid || a.link)) return true;
          // 保留未读文章（7天）
          if (!a.read && new Date(a.pubDate) > new Date(now - 7 * 86400000)) return true;
          // 超过 cutoff 天的已读文章删除
          try {
            const pubDate = new Date(a.pubDate);
            const ageDays = (now - pubDate) / 86400000;
            if (ageDays > cutoff) { removed++; return false; }
          } catch {}
          return true;
        });
        // 清理空 feed
        if (articles[feedUrl].length === 0) {
          delete articles[feedUrl];
        }
      });

      if (removed > 0) toast(`已清理 ${removed} 篇过期文章`);
      else toast('没有需要清理的文章');
      return removed;
    }

    function clearAllCache() {
      if (!confirm('确定要清除所有文章缓存吗？订阅源和收藏不会被删除。')) return;
      Object.keys(articles).forEach(k => delete articles[k]);
      toast('已清除所有文章缓存');
    }

    // 页面加载时自动清理
    function autoClean() {
      const lastClean = localStorage.getItem('rss-last-clean');
      const now = new Date();
      // 每天最多自动清理一次
      if (lastClean && (now - new Date(lastClean)) < 86400000) return;
      localStorage.setItem('rss-last-clean', now.toISOString());
      const removed = cleanOldArticles(cacheRetentionDays.value);
      if (removed > 0) console.log(`自动清理: ${removed} 篇过期文章`);
    }

    function saveAISettings() {
      localStorage.setItem('rss-ai-settings', JSON.stringify({ ...aiSettings }));
    }

    // --- 主题 ---
    function setTheme(t) {
      theme.value = t;
      document.documentElement.setAttribute('data-theme', t);
    }

    // --- Toast ---
    function toast(msg) {
      const id = Date.now();
      toasts.push({ id, msg });
      setTimeout(() => {
        const idx = toasts.findIndex(t => t.id === id);
        if (idx > -1) toasts.splice(idx, 1);
      }, 3000);
    }

    // --- 订阅源管理 ---
    // 限制只保留最近 N 天的文章
    function filterRecentItems(items, days = 7) {
      const cutoff = new Date(Date.now() - days * 86400000);
      return items.filter(item => {
        try {
          const d = new Date(item.pubDate);
          return !isNaN(d) && d >= cutoff;
        } catch { return true; }
      });
    }

    async function addFeed(url, group = '未分组') {
      url = url.trim();
      if (!url) return;

      // 检查是否已存在
      if (feeds.find(f => f.url === url)) {
        toast('该订阅源已存在');
        return;
      }

      loading.value = true;
      try {
        const xml = await fetchWithProxy(url);
        const parsed = parseRSS(xml);
        const recentItems = filterRecentItems(parsed.items);
        const feed = {
          id: 'feed_' + Date.now(),
          title: parsed.title,
          url: url,
          group: group,
          lastFetched: new Date().toISOString(),
        };
        feeds.push(feed);
        articles[url] = recentItems.map(item => ({ ...item, feedUrl: url, read: false }));
        currentFeed.value = url;
        toast(`已添加: ${parsed.title} (${recentItems.length}篇)`);
      } catch (e) {
        toast(`添加失败: ${e.message}`);
      }
      loading.value = false;
    }

    function removeFeed(url) {
      const idx = feeds.findIndex(f => f.url === url);
      if (idx > -1) {
        feeds.splice(idx, 1);
        delete articles[url];
        if (currentFeed.value === url) currentFeed.value = null;
        toast('已移除订阅源');
      }
    }

    function moveFeed(url, newGroup) {
      const feed = feeds.find(f => f.url === url);
      if (!feed) return;
      if (!groups.includes(newGroup)) groups.push(newGroup);
      feed.group = newGroup;
      toast(`已移至: ${newGroup}`);
    }

    async function refreshFeed(url) {
      loading.value = true;
      try {
        const xml = await fetchWithProxy(url);
        const parsed = parseRSS(xml);
        const recentItems = filterRecentItems(parsed.items);
        // 保留已阅读状态
        const oldArticles = articles[url] || [];
        const readMap = {};
        oldArticles.forEach(a => { if (a.read) readMap[a.guid || a.link] = true; });
        articles[url] = recentItems.map(item => ({
          ...item,
          feedUrl: url,
          read: !!readMap[item.guid || item.link],
        }));

        // 更新 feed 标题
        const feed = feeds.find(f => f.url === url);
        if (feed) {
          feed.title = parsed.title;
          feed.lastFetched = new Date().toISOString();
        }
        toast('刷新成功');
      } catch (e) {
        toast(`刷新失败: ${e.message}`);
      }
      loading.value = false;
    }

    async function refreshAllFeeds() {
      loading.value = true;
      for (const feed of feeds) {
        try {
          const xml = await fetchWithProxy(feed.url);
          const parsed = parseRSS(xml);
          const recentItems = filterRecentItems(parsed.items);
          articles[feed.url] = recentItems.map(item => ({ ...item, feedUrl: feed.url, read: false }));
          feed.title = parsed.title;
          feed.lastFetched = new Date().toISOString();
        } catch {}
      }
      loading.value = false;
      toast('全部刷新完成');
    }

    // --- 加载缓存 ---
    async function loadCache() {
      try {
        const resp = await fetch('data/feeds-cache.json');
        if (resp.ok) {
          const data = await resp.json();
          // data = { feeds: [...], articles: { url: [...] } }
          if (data.feeds) {
            data.feeds.forEach(f => {
              if (!feeds.find(ff => ff.url === f.url)) {
                feeds.push(f);
              }
            });
          }
          if (data.articles) {
            Object.entries(data.articles).forEach(([url, items]) => {
              if (!articles[url]) {
                articles[url] = items.map(item => ({ ...item, feedUrl: url, read: true }));
              }
            });
          }
        }
      } catch {}
    }

    // --- 分组管理 ---
    function addGroup() {
      const name = prompt('输入分组名称:');
      if (name && !groups.includes(name)) {
        groups.push(name);
      }
    }

    function renameGroup(oldName) {
      const newName = prompt('输入新名称:', oldName);
      if (newName && newName !== oldName) {
        const idx = groups.indexOf(oldName);
        if (idx > -1) groups[idx] = newName;
        feeds.forEach(f => { if (f.group === oldName) f.group = newName; });
      }
    }

    function deleteGroup(name) {
      if (name === '未分组') return toast('无法删除默认分组');
      if (!confirm(`删除分组 "${name}"？订阅源将移至"未分组"`)) return;
      const idx = groups.indexOf(name);
      if (idx > -1) groups.splice(idx, 1);
      feeds.forEach(f => { if (f.group === name) f.group = '未分组'; });
    }

    // --- 文章操作 ---
    function selectArticle(article) {
      currentArticle.value = article;
      article.read = true;
      mobileView.value = 'article';
    }

    function goBackToList() {
      mobileView.value = 'list';
    }

    async function fetchFullContent() {
      if (!currentArticle.value) return;
      const art = currentArticle.value;
      if (art._fullContent) return; // 已抓取过

      toast('正在抓取全文...');
      const content = await extractFullContent(art.link);
      if (content) {
        art.content = cleanHTML(content);
        art._fullContent = true;
        toast('全文抓取完成');
      } else {
        toast('全文抓取失败，显示摘要');
      }
    }

    // --- AI 摘要 ---
    const summaryText = ref('');
    const summaryLoading = ref(false);

    async function generateSummary() {
      if (!currentArticle.value) return;
      if (!aiSettings.apiKey) {
        showModal.value = 'settings';
        toast('请先设置 API Key');
        return;
      }

      const cacheKey = 'summary_' + (currentArticle.value.guid || currentArticle.value.link);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        summaryText.value = cached;
        return;
      }

      summaryText.value = '';
      summaryLoading.value = true;

      try {
        const content = currentArticle.value.content || currentArticle.value.description || '';
        const plainText = new DOMParser().parseFromString(content, 'text/html').body.textContent || '';
        const truncated = plainText.slice(0, 3000);

        const prompt = `请用中文为以下文章生成一段简洁的摘要（100-200字），提炼核心观点和要点：\n\n${truncated}`;

        if (aiSettings.provider === 'openai' || aiSettings.provider === 'custom') {
          const response = await fetch(`${aiSettings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${aiSettings.apiKey}`,
            },
            body: JSON.stringify({
              model: aiSettings.model,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 500,
              stream: true,
            }),
          });

          if (!response.ok) throw new Error(`API 错误: ${response.status}`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  const delta = data.choices?.[0]?.delta?.content || '';
                  fullText += delta;
                  summaryText.value = fullText;
                } catch {}
              }
            }
          }
          localStorage.setItem(cacheKey, fullText);
        } else if (aiSettings.provider === 'claude') {
          const response = await fetch(`${aiSettings.baseUrl}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': aiSettings.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: aiSettings.model,
              max_tokens: 500,
              stream: true,
              messages: [{ role: 'user', content: prompt }],
            }),
          });

          if (!response.ok) throw new Error(`API 错误: ${response.status}`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'content_block_delta') {
                    fullText += data.delta?.text || '';
                    summaryText.value = fullText;
                  }
                } catch {}
              }
            }
          }
          localStorage.setItem(cacheKey, fullText);
        }
      } catch (e) {
        toast(`摘要失败: ${e.message}`);
      }
      summaryLoading.value = false;
    }

    // --- AI 翻译 ---
    const translatedText = ref('');           // 一键翻译结果（纯中文）
    const bilingualText = ref('');            // 逐句对照翻译结果（HTML）
    const translationMode = ref('');          // '' | 'full' | 'bilingual'
    const translationLoading = ref(false);

    async function callAIStream(systemPrompt, onChunk) {
      if (!aiSettings.apiKey) {
        showModal.value = 'settings';
        toast('请先设置 API Key');
        return;
      }
      translationLoading.value = true;

      try {
        if (aiSettings.provider === 'openai' || aiSettings.provider === 'custom') {
          const response = await fetch(`${aiSettings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${aiSettings.apiKey}`,
            },
            body: JSON.stringify({
              model: aiSettings.model,
              messages: [{ role: 'user', content: systemPrompt }],
              max_tokens: 4000,
              stream: true,
            }),
          });
          if (!response.ok) throw new Error(`API 错误: ${response.status}`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  const delta = data.choices?.[0]?.delta?.content || '';
                  fullText += delta;
                  onChunk(fullText);
                } catch {}
              }
            }
          }
          return fullText;
        } else if (aiSettings.provider === 'claude') {
          const response = await fetch(`${aiSettings.baseUrl}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': aiSettings.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: aiSettings.model,
              max_tokens: 4000,
              stream: true,
              messages: [{ role: 'user', content: systemPrompt }],
            }),
          });
          if (!response.ok) throw new Error(`API 错误: ${response.status}`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'content_block_delta') {
                    fullText += data.delta?.text || '';
                    onChunk(fullText);
                  }
                } catch {}
              }
            }
          }
          return fullText;
        }
      } catch (e) {
        toast(`翻译失败: ${e.message}`);
      }
      translationLoading.value = false;
      return '';
    }

    async function translateFull() {
      if (!currentArticle.value) return;

      const cacheKey = 'trans_full_' + (currentArticle.value.guid || currentArticle.value.link);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        translatedText.value = cached;
        translationMode.value = 'full';
        return;
      }

      translationMode.value = 'full';
      translatedText.value = '';
      const content = currentArticle.value.content || currentArticle.value.description || '';
      const plainText = new DOMParser().parseFromString(content, 'text/html').body.textContent || '';

      const prompt = `请将以下英文文章翻译成流畅的中文。只输出中文翻译结果，不要添加任何解释或说明。保持原文的段落结构。\n\n${plainText}`;

      await callAIStream(prompt, (text) => {
        translatedText.value = text;
      });

      if (translatedText.value) {
        localStorage.setItem(cacheKey, translatedText.value);
      }
      translationLoading.value = false;
    }

    async function translateBilingual() {
      if (!currentArticle.value) return;

      const cacheKey = 'trans_bi_' + (currentArticle.value.guid || currentArticle.value.link);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        bilingualText.value = cached;
        translationMode.value = 'bilingual';
        return;
      }

      translationMode.value = 'bilingual';
      bilingualText.value = '';
      const content = currentArticle.value.content || currentArticle.value.description || '';
      const plainText = new DOMParser().parseFromString(content, 'text/html').body.textContent || '';

      const prompt = `请将以下英文文章逐句翻译成中文。对每一段（以空行为分隔），按照以下格式输出：

<p class="bilingual-block">
  <p class="en">[英文原句]</p>
  <p class="zh">[中文翻译]</p>
</p>

保持原文的段落结构，每个段落对一组英文+中文。只输出上面的 HTML 格式，不要添加任何多余的解释。\n\n${plainText}`;

      await callAIStream(prompt, (text) => {
        bilingualText.value = text;
      });

      if (bilingualText.value) {
        localStorage.setItem(cacheKey, bilingualText.value);
      }
      translationLoading.value = false;
    }

    function clearTranslation() {
      translationMode.value = '';
      translatedText.value = '';
      bilingualText.value = '';
    }

    // 格式化纯文本翻译结果（分段）
    function formatTranslation(text) {
      if (!text) return '';
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    }

    // --- Markdown 导出 ---
    function exportMarkdown() {
      if (!currentArticle.value) return;
      const art = currentArticle.value;
      const md = htmlToMarkdown(cleanHTML(art.content || art.description || ''));
      const content = `# ${art.title}\n\n> ${art.author || ''} · ${formatDate(art.pubDate)}\n\n${md}`;
      downloadFile(content, `${art.title.slice(0, 50)}.md`);
      toast('已导出 Markdown');
    }

    function copyMarkdown() {
      if (!currentArticle.value) return;
      const art = currentArticle.value;
      const md = htmlToMarkdown(cleanHTML(art.content || art.description || ''));
      navigator.clipboard?.writeText(md).then(() => {
        toast('已复制到剪贴板');
      }).catch(() => {
        // 降级方案：使用 textarea
        const ta = document.createElement('textarea');
        ta.value = md;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('已复制到剪贴板');
      });
    }

    // --- OPML 导入 ---
    async function handleOPMLImport(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const importedFeeds = parseOPML(text);
        let count = 0;
        for (const f of importedFeeds) {
          if (!feeds.find(ff => ff.url === f.url)) {
            if (!groups.includes(f.group)) groups.push(f.group);
            feeds.push({ id: 'feed_' + Date.now() + '_' + count, ...f });
            count++;
          }
        }
        toast(`已导入 ${count} 个订阅源，开始抓取...`);
        // 逐个后台抓取
        const newFeeds = importedFeeds.filter(f => !articles[f.url]);
        for (const f of newFeeds) {
          try {
            const xml = await fetchWithProxy(f.url);
            const parsed = parseRSS(xml);
            const recentItems = filterRecentItems(parsed.items);
            articles[f.url] = recentItems.map(item => ({ ...item, feedUrl: f.url, read: true }));
          } catch {
            articles[f.url] = [];
          }
        }
        if (newFeeds.length > 0) toast(`${newFeeds.length} 个订阅源抓取完成`);
      } catch (err) {
        toast(`导入失败: ${err.message}`);
      }
    }

    // --- OPML 导出 ---
    function exportOPML() {
      const opml = generateOPML(groups, feeds);
      downloadFile(opml, 'rss-subscriptions.opml', 'text/xml');
      toast('已导出 OPML');
    }

    // --- RSSHub 发现 ---
    async function searchRSSHub() {
      if (!rsshubSearch.value.trim()) return;
      rsshubLoading.value = true;
      rsshubResults.splice(0);
      try {
        // RSSHub 没有官方搜索 API，使用 GitHub 上的路由数据
        const resp = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(rsshubSearch.value)}+repo:DIYgod/RSSHub+path:lib/routes&per_page=10`, {
          headers: { Accept: 'application/vnd.github.v3+json' }
        });
        if (resp.ok) {
          const data = await resp.json();
          data.items?.forEach(item => {
            rsshubResults.push({
              title: item.name?.replace('.ts', '') || item.path,
              url: `https://rsshub.app/${item.name?.replace('.ts', '')}`,
              description: item.path,
            });
          });
        }
        // 补充：预设热门路由
        const hotRoutes = getHotRoutes(rsshubSearch.value);
        hotRoutes.forEach(r => {
          if (!rsshubResults.find(rr => rr.url === r.url)) {
            rsshubResults.push(r);
          }
        });
      } catch {}
      rsshubLoading.value = false;
    }

    function getHotRoutes(query) {
      const routes = [
        { title: '微博热搜', url: 'https://rsshub.app/weibo/search/hot', description: '微博热搜榜' },
        { title: '知乎热榜', url: 'https://rsshub.app/zhihu/hotlist', description: '知乎热门话题' },
        { title: 'V2EX', url: 'https://rsshub.app/v2ex/topics/hot', description: 'V2EX 热门' },
        { title: 'Hacker News', url: 'https://rsshub.app/hackernews/best', description: 'HN 精选' },
        { title: '少数派', url: 'https://rsshub.app/sspai/matrix', description: '少数派 Matrix' },
        { title: '36氪', url: 'https://rsshub.app/36kr/newsflashes', description: '36氪快讯' },
        { title: 'Bilibili 热门', url: 'https://rsshub.app/bilibili/hot-search', description: 'B站热搜' },
        { title: 'GitHub Trending', url: 'https://rsshub.app/github/trending/daily/any', description: 'GitHub 每日趋势' },
        { title: 'TechCrunch', url: 'https://rsshub.app/techcrunch', description: 'TC 科技资讯' },
        { title: 'The Guardian', url: 'https://rsshub.app/guardian', description: '卫报' },
      ];
      if (!query) return routes;
      return routes.filter(r => r.title.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase()));
    }

    // --- 加载缓存数据 ---
    async function loadCachedData() {
      await loadCache();
      // 如果没有任何文章，显示欢迎信息
    }

    // --- 键盘快捷键 ---
    // 改为 Ctrl/Cmd 组合键，避免与输入法/浏览器快捷键冲突
    function handleKeydown(e) {
      // 忽略输入框中的按键
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      const mod = e.metaKey || e.ctrlKey;
      const articles_ = feedArticles.value;
      const currentIdx = articles_.findIndex(a => a === currentArticle.value);

      // 无修饰键：上下切换文章（只在不输入时）
      switch (e.key) {
        case 'j':
          if (mod) break;
          e.preventDefault();
          if (articles_.length === 0) return;
          const nextIdx = currentIdx < articles_.length - 1 ? currentIdx + 1 : 0;
          selectArticle(articles_[nextIdx]);
          nextTick(() => {
            const el = document.querySelector('.article-card.active');
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          return;
        case 'k':
          if (mod) break;
          e.preventDefault();
          if (articles_.length === 0) return;
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : articles_.length - 1;
          selectArticle(articles_[prevIdx]);
          nextTick(() => {
            const el = document.querySelector('.article-card.active');
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          return;
        case 'ArrowDown':
          e.preventDefault();
          if (articles_.length === 0) return;
          selectArticle(articles_[currentIdx < articles_.length - 1 ? currentIdx + 1 : 0]);
          nextTick(() => {
            document.querySelector('.article-card.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          return;
        case 'ArrowUp':
          e.preventDefault();
          if (articles_.length === 0) return;
          selectArticle(articles_[currentIdx > 0 ? currentIdx - 1 : articles_.length - 1]);
          nextTick(() => {
            document.querySelector('.article-card.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (articles_.length === 0) return;
          selectArticle(articles_[currentIdx < articles_.length - 1 ? currentIdx + 1 : 0]);
          nextTick(() => {
            document.querySelector('.article-card.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          return;
        case 'ArrowLeft':
          e.preventDefault();
          if (articles_.length === 0) return;
          selectArticle(articles_[currentIdx > 0 ? currentIdx - 1 : articles_.length - 1]);
          nextTick(() => {
            document.querySelector('.article-card.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          return;
        case 'f':
          if (mod) break;
          toggleFavorite(currentArticle.value);
          return;
          if (currentFeed.value) refreshFeed(currentFeed.value);
          else refreshAllFeeds();
          return;
        case 's':
          if (mod) break;
          generateSummary();
          return;
        case 'm':
          if (mod) break;
          exportMarkdown();
          return;
        case '?':
          showShortcuts.value = !showShortcuts.value;
          return;
        case 'Escape':
          if (showModal.value) showModal.value = '';
          else if (showShortcuts.value) showShortcuts.value = false;
          else if (readingMode.value) readingMode.value = false;
          return;
      }
    }

    onMounted(() => {
      setTheme(theme.value);
      loadCachedData();
      document.addEventListener('keydown', handleKeydown);
      // 延迟自动清理，避免影响首次加载
      setTimeout(autoClean, 5000);
    });

    onUnmounted(() => {
      document.removeEventListener('keydown', handleKeydown);
    });

    // --- 展开/折叠分组状态 ---
    const expandedGroups = reactive({});

    function toggleGroup(name) {
      expandedGroups[name] = !expandedGroups[name];
    }

    function isGroupExpanded(name) {
      return expandedGroups[name] !== false; // 默认展开
    }

    return {
      theme, readingMode, showSidebar, mobileView,
      groups, feeds, articles,
      currentFeed, currentArticle, searchQuery,
      loading, toasts,
      showModal, modalData,
      aiSettings, summaryText, summaryLoading,
      showShortcuts,
      rsshubUrl, rsshubSearch, rsshubResults, rsshubLoading,
      feedArticles, groupedFeeds,
      feedContextTarget, feedContextPos, fabOpen,
      favorites, showFavoritesOnly, toggleFavorite, isFavorited,
      readFilter, timeFilter,
      setTheme, toast,
      addFeed, removeFeed, moveFeed, refreshFeed, refreshAllFeeds,
      addGroup, renameGroup, deleteGroup,
      selectArticle, goBackToList, fetchFullContent,
      generateSummary, exportMarkdown, copyMarkdown,
      handleOPMLImport, exportOPML,
      searchRSSHub, getHotRoutes,
      toggleGroup, isGroupExpanded,
      cacheRetentionDays, cleanOldArticles, clearAllCache,
      formatDate, cleanHTML,
      translatedText, bilingualText, translationMode, translationLoading,
      translateFull, translateBilingual, clearTranslation,
      formatTranslation,
    };
  }
});

app.mount('#app');