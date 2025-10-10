<?php
/**
 * Plugin Name: RAG Chatbot
 * Description: React-based RAG chatbot widget. Use via shortcode [rag_chatbot].
 * Version: 0.1.0
 * Author: You
 */

if (!defined('ABSPATH')) { exit; }

define('RAG_CHATBOT_VERSION', '0.1.0');
define('RAG_CHATBOT_PLUGIN_URL', plugin_dir_url(__FILE__));
define('RAG_CHATBOT_PLUGIN_PATH', plugin_dir_path(__FILE__));

/**
 * Settings (override via wp-config.php or a filter)
 * - RAG_CHATBOT_API_BASE: your backend URL (FastAPI/Express/etc.)
 * - RAG_CHATBOT_DEV_SERVER: vite dev (e.g. http://localhost:5173) for local testing inside WP
 */
if (!defined('RAG_CHATBOT_API_BASE')) {
  define('RAG_CHATBOT_API_BASE', apply_filters('rag_chatbot_api_base', 'http://localhost:8000'));
}
if (!defined('RAG_CHATBOT_DEV_SERVER')) {
  // Set in wp-config.php during dev: define('RAG_CHATBOT_DEV_SERVER', 'http://localhost:5173');
  define('RAG_CHATBOT_DEV_SERVER', '');
}

/**
 * Shortcode [rag_chatbot]
 * Optional attrs: source, title
 */
function rag_chatbot_shortcode($atts = []) {
  global $rag_chatbot_rendered;
  $atts = shortcode_atts([
    'source' => 'site',       // tag/source id your backend understands
    'title'  => 'Ask our AI',
  ], $atts, 'rag_chatbot');

  // Container div for React app; data-* lets React pick up runtime config
  $div = sprintf(
    '<div id="rag-chatbot-root" data-source="%s" data-title="%s"></div>',
    esc_attr($atts['source']),
    esc_attr($atts['title'])
  );

  // Enqueue assets
  rag_chatbot_enqueue_assets();

  // Mark as rendered to avoid duplicate root when also printing site-wide
  $rag_chatbot_rendered = true;

  return $div;
}
add_shortcode('rag_chatbot', 'rag_chatbot_shortcode');

function rag_chatbot_is_dev() {
  // Dev mode if constant provided and host reachable; keep simple toggle
  return !empty(RAG_CHATBOT_DEV_SERVER);
}

function rag_chatbot_enqueue_assets() {
  $handle = 'rag-chatbot-app';

  if (rag_chatbot_is_dev()) {
    // Point to Vite dev server (no bundling)
    wp_enqueue_script(
      $handle,
      RAG_CHATBOT_DEV_SERVER . '/src/main.tsx',
      [],
      RAG_CHATBOT_VERSION,
      true
    );
  } else {
    // Production: load built assets from /plugin/dist
    // Vite generates manifest.*.json but to keep it simple, just use fixed names you control.
    wp_enqueue_style(
      $handle . '-css',
      RAG_CHATBOT_PLUGIN_URL . 'dist/assets/styles.css',
      [],
      RAG_CHATBOT_VERSION
    );
    wp_enqueue_script(
      $handle,
      RAG_CHATBOT_PLUGIN_URL . 'dist/assets/main.js',
      [],
      RAG_CHATBOT_VERSION,
      true
    );
  }

  // Pass WP → JS config
  wp_localize_script($handle, 'RAG_CHATBOT_CONFIG', [
    'apiBase' => RAG_CHATBOT_API_BASE,      // e.g. http://localhost:8000
    'dev'     => rag_chatbot_is_dev(),
  ]);
}

/**
 * Optional: print site-wide floating widget container in footer.
 * Enabled by default; filter `rag_chatbot_sitewide_enabled` to false to disable.
 * Uses `rag_chatbot_sitewide_atts` to customize default source/title.
 */
function rag_chatbot_print_sitewide_widget() {
  if (is_admin()) { return; }
  $enabled = apply_filters('rag_chatbot_sitewide_enabled', true);
  if (!$enabled) { return; }

  // If a shortcode already rendered the root on this request, skip
  global $rag_chatbot_rendered;
  if (!empty($rag_chatbot_rendered)) { return; }

  // Enqueue assets (safe to call multiple times)
  rag_chatbot_enqueue_assets();

  $atts = wp_parse_args(apply_filters('rag_chatbot_sitewide_atts', []), [
    'source' => 'site',
    'title'  => 'Ask our AI',
  ]);

  echo sprintf(
    '<div id="rag-chatbot-root" data-source="%s" data-title="%s"></div>',
    esc_attr($atts['source']),
    esc_attr($atts['title'])
  );
}
add_action('wp_footer', 'rag_chatbot_print_sitewide_widget', 100);