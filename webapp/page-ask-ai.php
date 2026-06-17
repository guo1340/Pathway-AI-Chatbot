<?php
/*
Template Name: Ask AI Fullscreen
*/

header('X-Robots-Tag: noindex, nofollow', true);
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0', true);
header('Pragma: no-cache', true);

function pathway_ask_ai_base64url($value)
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function pathway_ask_ai_get_jwt_secret()
{
    if (defined('PATHWAY_RAG_JWT_SECRET')) {
        return (string) PATHWAY_RAG_JWT_SECRET;
    }

    $env_secret = getenv('PATHWAY_RAG_JWT_SECRET');
    if (is_string($env_secret) && $env_secret !== '') {
        return $env_secret;
    }

    foreach (['pathway_rag_jwt_secret', 'rag_chatbot_jwt_secret'] as $option_name) {
        $option_secret = get_option($option_name);
        if (is_string($option_secret) && $option_secret !== '') {
            return $option_secret;
        }
    }

    return '';
}

function pathway_ask_ai_mint_current_user_token($ttl_seconds = 600)
{
    $secret = pathway_ask_ai_get_jwt_secret();
    if ($secret === '') {
        return new WP_Error(
            'missing_secret',
            'JWT secret is not configured for Ask AI.',
            ['status' => 500]
        );
    }

    $user = wp_get_current_user();
    $now = time();
    $exp = $now + (int) $ttl_seconds;
    $header = pathway_ask_ai_base64url(wp_json_encode([
        'alg' => 'HS256',
        'typ' => 'JWT',
    ]));
    $payload = pathway_ask_ai_base64url(wp_json_encode([
        'sub' => (string) $user->ID,
        'user_id' => (int) $user->ID,
        'id' => (int) $user->ID,
        'iat' => $now,
        'exp' => $exp,
        'cap' => ['contributor'],
    ]));
    $signature = pathway_ask_ai_base64url(hash_hmac(
        'sha256',
        $header . '.' . $payload,
        $secret,
        true
    ));

    return [
        'token' => $header . '.' . $payload . '.' . $signature,
        'exp' => $exp,
    ];
}

$current_user = wp_get_current_user();
$user_roles = (array) $current_user->roles;
$ask_ai_allowed_roles = ['administrator', 'contributor', 'contributor_liiv', 'contributor_esp'];
$has_ask_ai_role = (bool) array_intersect($ask_ai_allowed_roles, $user_roles);

// Not logged in → redirect
if (!is_user_logged_in()) {
    $login_url = wp_login_url(get_permalink());

    // Add a short message that your login page can show
    $login_url = add_query_arg([
        'rag_notice' => '1',
        'rag_msg' => rawurlencode('Please log in to access Ask AI. This page is restricted to contributors.'),
    ], $login_url);

    wp_safe_redirect($login_url);
    exit;
}


// Must have one of the Ask AI roles.
if (!$has_ask_ai_role) {
    $login_url = wp_login_url(get_permalink());
    $login_url = add_query_arg([
        'rag_notice' => '1',
        'rag_msg' => rawurlencode('Your account does not have access to Ask AI. Please log in with an authorized account.'),
    ], $login_url);

    wp_safe_redirect($login_url);
    exit;
}

// Mint token (10 minutes). The role gate above is the auth check.
$mint = pathway_ask_ai_mint_current_user_token(600);

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
    'requireAuth' => '1',
    'requiredCap' => 'contributor',
    'accessUrl' => get_permalink(),
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
            overflow: hidden;
        }

        .askai-wrap {
            width: 100%;
            height: var(--askai-available-height, 100dvh);
            overflow: hidden;
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

    <script>
        (function () {
            var wrap = document.querySelector('.askai-wrap');
            if (!wrap) return;

            function setAskAiHeight() {
                var viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                var top = wrap.getBoundingClientRect().top;
                var availableHeight = Math.max(0, viewportHeight - top);
                document.documentElement.style.setProperty('--askai-available-height', availableHeight + 'px');
            }

            setAskAiHeight();
            window.addEventListener('resize', setAskAiHeight);
            window.addEventListener('orientationchange', setAskAiHeight);
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', setAskAiHeight);
            }
        }());
    </script>

    <?php wp_footer(); ?>
</body>

</html>
