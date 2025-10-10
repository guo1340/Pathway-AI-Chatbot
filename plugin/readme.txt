=== RAG Chatbot ===
Contributors: Yoseph Berhanu
Tags: chatbot, ai, rag, search, assistant
Requires at least: 6.0
Tested up to: 6.6
Stable tag: 0.1.0
License: MIT

React-based RAG chatbot for WordPress. Floating widget site‑wide or via shortcode.

== Description ==
Renders a floating chat widget powered by a RAG backend. Use site‑wide (default) or only on specific pages via shortcode.

== Installation ==
1. Build the web app assets in the repo root:
   - cd webapp && npm install && npm run build
2. Copy the `plugin/` folder into `wp-content/plugins/rag-chatbot/`.
3. Activate “RAG Chatbot” in WP Admin → Plugins.

== Configuration ==
Add to `wp-config.php`:

```
define('RAG_CHATBOT_API_BASE', 'http://localhost:8000');
// optional for local dev hot reload inside WP:
// define('RAG_CHATBOT_DEV_SERVER', 'http://localhost:5173');
```

Filters:
- `rag_chatbot_api_base`
- `rag_chatbot_sitewide_enabled` (default true)
- `rag_chatbot_sitewide_atts` (default `{ source: 'site', title: 'Ask our AI' }`)

== Usage ==
Site‑wide floating widget: enabled by default.

Shortcode on a page/post (suppresses site‑wide instance on that page):

```
[rag_chatbot source="site" title="Ask our AI"]
```

== Changelog ==
= 0.1.0 =
* Initial release.


