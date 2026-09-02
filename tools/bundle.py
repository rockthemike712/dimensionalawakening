#!/usr/bin/env python3
"""Bundle the game into one HTML file (for the claude.ai artifact).

Usage: python3 tools/bundle.py OUT.html
Runs esbuild on src/main.js (three stays external, loaded from a CDN import map),
inlines the result into index.html and strips the document skeleton the artifact
host adds itself.
"""
import re, subprocess, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1])
js = subprocess.run(['npx', '--yes', 'esbuild@0.24.0', str(root/'src/main.js'), '--bundle', '--format=esm',
                     '--external:three', '--log-level=warning'], capture_output=True, text=True, check=True).stdout
html = (root/'index.html').read_text()
lines = [l for l in html.split('\n') if not re.match(r'\s*(<!DOCTYPE|<html|</html|<head|</head|<body|</body|<meta|<link rel="icon")', l)]
html = '\n'.join(lines)
html = re.sub(r'<title>.*?</title>', '<title>Dimensional Awakening</title>', html, count=1)
html = html.replace('{"imports":{"three":"./vendor/three.module.min.js"}}',
                    '{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js"}}')
html = html.replace('<script type="module" src="./src/main.js"></script>',
                    '<script type="module">\n' + js.replace('</script', '<\\/script') + '</script>')
assert 'cdn.jsdelivr' in html and '<script type="module">' in html
out.write_text(html)
print('wrote', out, len(html), 'bytes')
