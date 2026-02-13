<?php
/*
Template Name: Ask AI Fullscreen
*/

header('X-Robots-Tag: noindex, nofollow', true);
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// Make sure plugin function exists
if (!function_exists('pathway_rag_mint_current_user_token')) {
    status_header(500);
    echo '<h2 style="padding:40px;font-family:system-ui;">Server misconfigured: Pathway RAG Auth plugin not active.</h2>';
    exit;
}

wp_get_current_user();

if (!is_user_logged_in()) {
    wp_redirect(wp_login_url(get_permalink()));
    exit;
}

// Contributor+ check
if (!current_user_can('edit_posts')) {
    status_header(403);
    echo '<h2 style="padding:40px;font-family:system-ui;">Access denied</h2>';
    exit;
}

// Mint JWT server-side (no REST call)
$mint = pathway_rag_mint_current_user_token(600); // 10 minutes
if (is_wp_error($mint)) {
    $status = 500;
    $data = $mint->get_error_data();
    if (is_array($data) && isset($data['status']))
        $status = (int) $data['status'];
    status_header($status);
    echo '<h2 style="padding:40px;font-family:system-ui;">Auth failed: ' . esc_html($mint->get_error_message()) . '</h2>';
    exit;
}

$token = $mint['token'];
$exp = (int) $mint['exp'];
?>
<!doctype html>
<html <?php language_attributes(); ?>>

<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Ask AI</title>
    <?php wp_head(); ?>
</head>

<body style="margin:0;">
    <div id="rag-chatbot-root" data-source="default" data-title="Pathway Chatbot (Beta)"></div>

    <script>
        window.RAG_CHATBOT_CONFIG = {
            apiBase: "https://api.chat.pathway.training",
            token: <?php echo json_encode($token); ?>,
            tokenExp: <?php echo (int) $exp; ?>
        };
    </script>

    <script type="module" crossorigin src="https://chat.pathway.training/assets/main.js"></script>
    <link rel="stylesheet" crossorigin href="https://chat.pathway.training/assets/index.css">

    <?php wp_footer(); ?>
</body>


</html>