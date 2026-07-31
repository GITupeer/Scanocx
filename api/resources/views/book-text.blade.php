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
            --accent-soft: rgba(61, 90, 254, 0.1);
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
            margin-bottom: 1.75rem;
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

        .controls {
            display: grid;
            gap: 1rem;
            margin: 1.5rem 0 2rem;
        }

        .field {
            display: grid;
            gap: 0.45rem;
        }

        .field-label {
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--faint);
        }

        .page-select {
            appearance: none;
            width: 100%;
            font: inherit;
            font-size: 1rem;
            font-weight: 600;
            color: var(--ink);
            background:
                url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath fill='%235C6478' d='M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06z'/%3E%3C/svg%3E")
                right 0.9rem center / 16px no-repeat,
                var(--paper);
            border: 1px solid var(--line);
            border-radius: 12px;
            padding: 0.85rem 2.5rem 0.85rem 1rem;
            box-shadow: 0 8px 20px rgba(26, 29, 43, 0.04);
            cursor: pointer;
        }

        .page-select:focus {
            outline: 2px solid rgba(61, 90, 254, 0.35);
            outline-offset: 2px;
        }

        .toc-panel {
            background: var(--paper);
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 1rem 1rem 0.75rem;
            box-shadow: 0 10px 28px rgba(26, 29, 43, 0.04);
        }

        .toc-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            margin-bottom: 0.75rem;
        }

        .toc-title {
            font-family: 'Fraunces', Georgia, serif;
            font-size: 1.1rem;
            font-weight: 500;
            letter-spacing: -0.01em;
        }

        .toc-count {
            font-size: 0.75rem;
            font-weight: 700;
            color: var(--accent);
            background: var(--accent-soft);
            padding: 0.2rem 0.55rem;
            border-radius: 999px;
        }

        .toc-list {
            list-style: none;
            display: grid;
            gap: 0.15rem;
        }

        .toc-list a {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            text-decoration: none;
            color: inherit;
            padding: 0.65rem 0.55rem;
            border-radius: 10px;
            transition: background 0.15s ease;
        }

        .toc-list a:hover {
            background: #F3F5FB;
        }

        .toc-list .level-1 a {
            padding-left: 1.35rem;
        }

        .toc-text {
            flex: 1;
            font-size: 0.98rem;
            font-weight: 700;
            line-height: 1.3;
            letter-spacing: -0.01em;
        }

        .level-1 .toc-text {
            font-size: 0.92rem;
            font-weight: 500;
            color: var(--muted);
        }

        .toc-page {
            min-width: 1.8rem;
            text-align: center;
            font-size: 0.78rem;
            font-weight: 800;
            color: var(--accent);
            background: var(--accent-soft);
            border-radius: 6px;
            padding: 0.2rem 0.4rem;
            font-variant-numeric: tabular-nums;
        }

        .level-1 .toc-page {
            color: var(--muted);
            background: #EEF1F8;
            font-weight: 700;
        }

        article.page {
            background: var(--paper);
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 1.4rem 1.35rem 1.5rem;
            margin-bottom: 1.1rem;
            box-shadow: 0 10px 28px rgba(26, 29, 43, 0.04);
            animation: rise 0.6s ease both;
            scroll-margin-top: 1.25rem;
        }

        article.page.is-active {
            outline: 2px solid rgba(61, 90, 254, 0.28);
            outline-offset: 2px;
        }

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
            .controls { display: none; }
            article.page {
                box-shadow: none;
                break-inside: avoid;
                outline: none;
            }
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
        </section>

        @if (count($sections) > 0)
            <div class="controls">
                <div class="field">
                    <label class="field-label" for="page-jump">Przejdź do strony</label>
                    <select id="page-jump" class="page-select" aria-label="Wybierz stronę">
                        @foreach ($sections as $section)
                            <option value="{{ $section['id'] }}">{{ $section['label'] }}</option>
                        @endforeach
                    </select>
                </div>

                @if (count($toc) > 0)
                    <nav class="toc-panel" aria-label="Spis treści">
                        <div class="toc-head">
                            <h2 class="toc-title">Spis treści</h2>
                            <span class="toc-count">{{ count($toc) }}</span>
                        </div>
                        <ul class="toc-list">
                            @foreach ($toc as $entry)
                                <li class="level-{{ $entry['level'] }}">
                                    <a href="#{{ $entry['target'] }}" data-target="{{ $entry['target'] }}">
                                        <span class="toc-text">{{ $entry['text'] }}</span>
                                        <span class="toc-page">{{ $entry['page_label'] }}</span>
                                    </a>
                                </li>
                            @endforeach
                        </ul>
                    </nav>
                @endif
            </div>
        @endif

        @if (count($sections) === 0)
            <div class="empty-book">Ta książka nie ma jeszcze żadnych stron.</div>
        @else
            @foreach ($sections as $section)
                <article class="page" id="{{ $section['id'] }}">
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

    <script>
        (function () {
            var select = document.getElementById('page-jump');
            if (!select) return;

            function jumpTo(id, updateSelect) {
                var el = document.getElementById(id);
                if (!el) return;
                document.querySelectorAll('article.page.is-active').forEach(function (node) {
                    node.classList.remove('is-active');
                });
                el.classList.add('is-active');
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (updateSelect) select.value = id;
            }

            select.addEventListener('change', function () {
                jumpTo(select.value, false);
            });

            document.querySelectorAll('[data-target]').forEach(function (link) {
                link.addEventListener('click', function (event) {
                    var id = link.getAttribute('data-target');
                    if (!id) return;
                    event.preventDefault();
                    jumpTo(id, true);
                    history.replaceState(null, '', '#' + id);
                });
            });

            if (location.hash) {
                var hashId = location.hash.slice(1);
                if (document.getElementById(hashId)) {
                    select.value = hashId;
                    setTimeout(function () {
                        jumpTo(hashId, true);
                    }, 50);
                }
            }
        })();
    </script>
</body>
</html>
