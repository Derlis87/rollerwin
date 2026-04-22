import re

with open('cover_strategy.html', 'r') as f:
    html = f.read()

# Fix 1: Remove overflow:hidden from html
html = html.replace('html, body {\n    width: 794px;\n    height: 1123px;\n    margin: 0;\n    padding: 0;\n    background: var(--c-bg);\n    font-family: \'Inter\', sans-serif;\n    overflow: hidden;\n  }',
    '''html, body {
    width: 794px;
    height: 1123px;
    margin: 0;
    padding: 0;
    background: var(--c-bg);
    font-family: 'Inter', sans-serif;
  }''')

# Fix 2: Keep overflow:hidden on .cover only (for clip)
# It already has it, so it's fine

# Fix 3: Move decorative elements within bounds
html = html.replace('top: -80px;\n    right: -80px;', 'top: 0px;\n    right: 0px;')
html = html.replace('bottom: -120px;\n    left: -60px;', 'bottom: 0px;\n    left: 0px;')

with open('cover_strategy.html', 'w') as f:
    f.write(html)

print("Fixed cover HTML")
