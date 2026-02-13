<?php
/*
Template Name: Ask AI Fullscreen
*/

header('X-Robots-Tag: noindex, nofollow', true);
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0', true);
header('Pragma: no-cache', true);

// Ensure plugin is active
if (!function_exists('pathway_rag_mint_current_user_token')) {
    status_header(500);
    echo '<h2 style="padding:40px;font-family:system-ui;">Server misconfigured: RAG Auth plugin not active.</h2>';
    exit;
}

wp_get_current_user();

// Not logged in → redirect
if (!is_user_logged_in()) {
    wp_redirect(wp_login_url(get_permalink()));
    exit;
}

// Must be contributor+
if (!current_user_can('edit_posts')) {
    // If you prefer: show 403 instead of redirect
    wp_redirect(wp_login_url(get_permalink()));
    exit;
}

// Mint token (10 minutes)
$mint = pathway_rag_mint_current_user_token(600);

if (is_wp_error($mint)) {
    $status = 500;
    $data = $mint->get_error_data();
    if (is_array($data) && isset($data['status'])) {
        $status = (int) $data['status'];
    }
    status_header($status);
    echo '<h2 style="padding:40px;font-family:system-ui;">Auth failed: ' . esc_html($mint->get_error_message()) . '</h2>';
    exit;
}

$token = $mint['token'];
$exp = (int) $mint['exp'];

// Iframe app + params
$iframe_base = 'https://chat.pathway.training/';

// Optional: let WP control these
$api_base = 'https://api.chat.pathway.training';
$source = 'default';
$title = 'Pathway Chatbot (Beta)';

// Build iframe URL with query params
$iframe_url = add_query_arg([
    'apiBase' => $api_base,
    'token' => $token,
    'exp' => $exp,
    'source' => $source,
    'title' => $title,
], $iframe_base);

?><!doctype html>
<html <?php language_attributes(); ?>>

<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Ask AI</title>
    <?php wp_head(); ?>

    <style>
        html,
        body {
            margin: 0;
            height: 100%;
        }

        .askai-wrap {
            width: 100%;
            height: 100vh;
        }

        .askai-iframe {
            width: 100%;
            height: 100%;
            border: 0;
            display: block;
        }
    </style>
</head>

<body>
    <div class="askai-wrap">
        <iframe class="askai-iframe" src="<?php echo esc_url($iframe_url); ?>" allow="clipboard-write"
            referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>

    <?php wp_footer(); ?>
</body>

</html>