<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#F7F8FC">
    <title>{{ $book->title }} · Scanocx</title>
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #F7F8FC;
            --paper: #FFFFFF;
            --ink: #1A1D2B;
            --muted: #5C6478;
            --faint: #8B93A7;
            --line: rgba(26, 29, 43, 0.08);
            --accent: #3D5AFE;
            --ai: #0F9F7B;
            --ocr: #5C6478;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        html { scroll-behavior: smooth; }

        body {
            font-family: 'Source Sans 3', system-ui, sans-serif;
            color: var(--ink);
            background:
                radial-gradient(ellipse 70% 40% at 10% 0%, rgba(61, 90, 254, 0.06), transparent 55%),
                radial-gradient(ellipse 50% 35% at 90% 8%, rgba(15, 159, 123, 0.05), transparent 50%),
                var(--bg);
            -webkit-font-smoothing: antialiased;
            line-height: 1.65;
        }

        .shell {
            width: min(100%, 720px);
            margin: 0 auto;
            padding: 2rem 1.25rem 4rem;
        }

        header.top {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 1rem;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--line);
        }

        .brand {
            font-size: 0.8rem;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--faint);
            text-decoration: none;
        }

        .meta {
            font-size: 0.85rem;
            color: var(--muted);
        }

        .hero {
            margin-bottom: 2.5rem;
            animation: rise 0.55s ease both;
        }

        h1 {
            font-family: 'Fraunces', Georgia, serif;
            font-weight: 700;
            font-size: clamp(1.85rem, 5vw, 2.6rem);
            line-height: 1.15;
            letter-spacing: -0.02em;
            margin-bottom: 0.65rem;
        }

        .lede {
            color: var(--muted);
            font-size: 1.02rem;
            max-width: 42ch;
        }

        .toc {
            display: flex;
            flex-wrap: wrap;
            gap: 0.45rem;
            margin: 1.35rem 0 0;
        }

        .toc a {
            font-size: 0.78rem;
            font-weight: 600;
            color: var(--muted);
            text-decoration: none;
            padding: 0.28rem 0.55rem;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.7);
        }

        .toc a:hover {
            color: var(--accent);
            border-color: rgba(61, 90, 254, 0.35);
        }

        article.page {
            background: var(--paper);
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 1.4rem 1.35rem 1.5rem;
            margin-bottom: 1.1rem;
            box-shadow: 0 10px 28px rgba(26, 29, 43, 0.04);
            animation: rise 0.6s ease both;
        }

        article.page:nth-child(odd) { animation-delay: 0.04s; }
        article.page:nth-child(even) { animation-delay: 0.08s; }

        .page-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            margin-bottom: 0.9rem;
            padding-bottom: 0.65rem;
            border-bottom: 1px solid var(--line);
        }

        .page-label {
            font-family: 'Fraunces', Georgia, serif;
            font-weight: 500;
            font-size: 1.05rem;
            letter-spacing: -0.01em;
        }

        .badge {
            font-size: 0.68rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            padding: 0.22rem 0.5rem;
            border-radius: 999px;
            background: #EEF1F8;
            color: var(--ocr);
        }

        .badge.ai {
            background: rgba(15, 159, 123, 0.12);
            color: var(--ai);
        }

        .badge.empty {
            background: #F3F0E8;
            color: #9A7B4F;
        }

        .body p {
            font-size: 1.05rem;
            margin-bottom: 0.85rem;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
        }

        .body p:last-child { margin-bottom: 0; }

        .empty-note {
            color: var(--faint);
            font-style: italic;
            font-size: 0.98rem;
        }

        .empty-book {
            text-align: center;
            padding: 3rem 1rem;
            color: var(--muted);
            border: 1px dashed var(--line);
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.6);
        }

        footer.bottom {
            margin-top: 2.5rem;
            padding-top: 1rem;
            border-top: 1px solid var(--line);
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            color: var(--faint);
            font-size: 0.78rem;
            letter-spacing: 0.03em;
        }

        @keyframes rise {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
            .hero, article.page { animation: none; }
            html { scroll-behavior: auto; }
        }

        @media print {
            body { background: #fff; }
            article.page {
                box-shadow: none;
                break-inside: avoid;
            }
            .toc { display: none; }
        }
    </style>
</head>
<body>
    <div class="shell">
        <header class="top">
            <a class="brand" href="/">Scanocx</a>
            <span class="meta">
                {{ $withTextCount }} z {{ $sectionCount }}
                {{ $sectionCount === 1 ? 'sekcji' : 'sekcji' }} z tekstem
            </span>
        </header>

        <section class="hero">
            <h1>{{ $book->title }}</h1>
            <p class="lede">
                Pełny tekst książki — AI tam, gdzie dostępne, w pozostałych miejscach OCR.
                {{ $pageCount }} {{ $pageCount === 1 ? 'strona skanu' : ($pageCount < 5 ? 'strony skanu' : 'stron skanu') }}.
            </p>

            @if (count($sections) > 1)
                <nav class="toc" aria-label="Spis stron">
                    @foreach ($sections as $i => $section)
                        <a href="#p-{{ $i + 1 }}">{{ $section['label'] }}</a>
                    @endforeach
                </nav>
            @endif
        </section>

        @if (count($sections) === 0)
            <div class="empty-book">Ta książka nie ma jeszcze żadnych stron.</div>
        @else
            @foreach ($sections as $i => $section)
                <article class="page" id="p-{{ $i + 1 }}">
                    <div class="page-head">
                        <h2 class="page-label">{{ $section['label'] }}</h2>
                        @if ($section['source'] === 'ai')
                            <span class="badge ai">AI</span>
                        @elseif ($section['source'] === 'ocr')
                            <span class="badge">OCR</span>
                        @else
                            <span class="badge empty">Brak tekstu</span>
                        @endif
                    </div>
                    <div class="body">
                        @forelse ($section['paragraphs'] as $paragraph)
                            <p>{{ $paragraph }}</p>
                        @empty
                            <p class="empty-note">Brak tekstu na tej stronie.</p>
                        @endforelse
                    </div>
                </article>
            @endforeach
        @endif

        <footer class="bottom">
            <span>Udostępnione z Scanocx</span>
            <span>{{ optional($book->updated_at)?->timezone('Europe/Warsaw')?->format('d.m.Y H:i') }}</span>
        </footer>
    </div>
</body>
</html>
