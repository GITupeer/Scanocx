<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#07080E">
    <title>Scanocx API</title>
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --canvas: #07080E;
            --ink: #F5F6FC;
            --muted: #A2A7C4;
            --faint: #6E7595;
            --violet: #7C5CFF;
            --violet-deep: #4B2FD1;
            --blue: #4C7DF5;
            --mint: #10BFA0;
            --line: rgba(255, 255, 255, 0.08);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        html, body {
            min-height: 100%;
        }

        body {
            font-family: 'Outfit', sans-serif;
            color: var(--ink);
            background: var(--canvas);
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
        }

        .hero {
            position: relative;
            min-height: 100vh;
            min-height: 100dvh;
            display: grid;
            place-items: center;
            padding: 2rem 1.5rem 3rem;
            isolation: isolate;
        }

        .atmosphere {
            position: absolute;
            inset: 0;
            z-index: -2;
            background:
                radial-gradient(ellipse 80% 60% at 70% 35%, rgba(76, 125, 245, 0.22), transparent 55%),
                radial-gradient(ellipse 70% 50% at 20% 70%, rgba(124, 92, 255, 0.28), transparent 50%),
                radial-gradient(ellipse 50% 40% at 50% 100%, rgba(16, 191, 160, 0.08), transparent 45%),
                linear-gradient(165deg, #0C0E1A 0%, #07080E 45%, #0A0618 100%);
        }

        .grid {
            position: absolute;
            inset: 0;
            z-index: -1;
            background-image:
                linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 64px 64px;
            mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 75%);
            opacity: 0.7;
        }

        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(60px);
            pointer-events: none;
            z-index: -1;
            animation: drift 14s ease-in-out infinite alternate;
        }

        .orb-a {
            width: min(42vw, 380px);
            height: min(42vw, 380px);
            top: 8%;
            right: 12%;
            background: rgba(124, 92, 255, 0.35);
        }

        .orb-b {
            width: min(36vw, 300px);
            height: min(36vw, 300px);
            bottom: 12%;
            left: 8%;
            background: rgba(76, 125, 245, 0.28);
            animation-delay: -4s;
            animation-duration: 18s;
        }

        @keyframes drift {
            from { transform: translate(0, 0) scale(1); }
            to { transform: translate(-24px, 18px) scale(1.08); }
        }

        .stage {
            width: min(100%, 920px);
            display: grid;
            grid-template-columns: 1.05fr 0.95fr;
            align-items: center;
            gap: clamp(2rem, 5vw, 4rem);
        }

        @media (max-width: 820px) {
            .stage {
                grid-template-columns: 1fr;
                text-align: center;
                justify-items: center;
            }
        }

        .copy {
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
            animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .brand {
            font-family: 'Syne', sans-serif;
            font-weight: 800;
            font-size: clamp(3.2rem, 9vw, 5.5rem);
            line-height: 0.95;
            letter-spacing: -0.04em;
            background: linear-gradient(120deg, #FFFFFF 20%, #C4B5FF 55%, #7EB6FF 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }

        .headline {
            font-family: 'Syne', sans-serif;
            font-weight: 700;
            font-size: clamp(1.15rem, 2.4vw, 1.45rem);
            letter-spacing: -0.02em;
            color: var(--ink);
            max-width: 22ch;
        }

        @media (max-width: 820px) {
            .headline {
                max-width: 28ch;
                margin-inline: auto;
            }
        }

        .lede {
            color: var(--muted);
            font-size: 1.05rem;
            line-height: 1.55;
            max-width: 34ch;
        }

        @media (max-width: 820px) {
            .lede {
                max-width: 38ch;
            }
        }

        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            margin-top: 0.5rem;
            align-items: center;
        }

        @media (max-width: 820px) {
            .actions {
                justify-content: center;
            }
        }

        .cta {
            display: inline-flex;
            align-items: center;
            gap: 0.55rem;
            padding: 0.85rem 1.35rem;
            border-radius: 999px;
            font-weight: 600;
            font-size: 0.95rem;
            text-decoration: none;
            color: #fff;
            background: linear-gradient(120deg, var(--violet), var(--blue));
            box-shadow: 0 10px 30px rgba(76, 125, 245, 0.28);
            transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }

        .cta:hover {
            transform: translateY(-2px);
            filter: brightness(1.06);
            box-shadow: 0 14px 36px rgba(124, 92, 255, 0.35);
        }

        .cta svg {
            width: 16px;
            height: 16px;
        }

        .ghost {
            display: inline-flex;
            align-items: center;
            gap: 0.45rem;
            padding: 0.85rem 1.1rem;
            border-radius: 999px;
            font-weight: 500;
            font-size: 0.92rem;
            text-decoration: none;
            color: var(--muted);
            border: 1px solid var(--line);
            background: rgba(255, 255, 255, 0.03);
            transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .ghost:hover {
            color: var(--ink);
            border-color: rgba(255, 255, 255, 0.18);
            background: rgba(255, 255, 255, 0.06);
        }

        .status {
            display: inline-flex;
            align-items: center;
            gap: 0.55rem;
            color: var(--faint);
            font-size: 0.88rem;
            margin-top: 0.25rem;
        }

        .pulse {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--mint);
            box-shadow: 0 0 0 0 rgba(16, 191, 160, 0.55);
            animation: pulse 2.2s ease-out infinite;
        }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(16, 191, 160, 0.5); }
            70% { box-shadow: 0 0 0 10px rgba(16, 191, 160, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 191, 160, 0); }
        }

        .visual {
            position: relative;
            width: min(100%, 420px);
            aspect-ratio: 1;
            animation: rise 1.05s 0.12s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .visual::before {
            content: '';
            position: absolute;
            inset: 8%;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(124, 92, 255, 0.35), transparent 70%);
            filter: blur(28px);
            animation: glow 5s ease-in-out infinite alternate;
        }

        @keyframes glow {
            from { opacity: 0.55; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1.04); }
        }

        .visual img {
            position: relative;
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 24px 48px rgba(76, 125, 245, 0.25));
        }

        .meta {
            position: absolute;
            left: 1.5rem;
            right: 1.5rem;
            bottom: 1.25rem;
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            color: var(--faint);
            font-size: 0.78rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            animation: rise 1.1s 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        @keyframes rise {
            from {
                opacity: 0;
                transform: translateY(18px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .orb, .pulse, .visual::before,
            .copy, .visual, .meta {
                animation: none;
            }
        }
    </style>
</head>
<body>
    <main class="hero">
        <div class="atmosphere" aria-hidden="true"></div>
        <div class="grid" aria-hidden="true"></div>
        <div class="orb orb-a" aria-hidden="true"></div>
        <div class="orb orb-b" aria-hidden="true"></div>

        <div class="stage">
            <div class="copy">
                <h1 class="brand">Scanocx</h1>
                <p class="headline">Backend API for document scanning and analysis</p>
                <p class="lede">The server is up and accepting requests from the Scanocx mobile app.</p>
                <div class="actions">
                    <a class="cta" href="/api/health">
                        Check health
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </a>
                    <a class="ghost" href="/horizon" rel="noopener">Horizon</a>
                </div>
                <p class="status">
                    <span class="pulse" aria-hidden="true"></span>
                    Status: operational · {{ config('app.env') }}
                </p>
            </div>

            <div class="visual" aria-hidden="true">
                <img src="/logo.png" alt="" width="512" height="512">
            </div>
        </div>

        <footer class="meta">
            <span>Scanocx API</span>
            <span>Laravel {{ app()->version() }}</span>
        </footer>
    </main>
</body>
</html>
