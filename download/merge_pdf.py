from pypdf import PdfReader, PdfWriter, Transformation

A4_W, A4_H = 595.28, 841.89

cover_pdf = '/home/z/my-project/download/cover_strategy.pdf'
body_pdf = '/home/z/my-project/download/estrategia-rentable-v52.pdf'
output_pdf = '/home/z/my-project/download/estrategia-rentable-v52.pdf'

# Read
cover_reader = PdfReader(cover_pdf)
body_reader = PdfReader(body_pdf)

# Create writer
writer = PdfWriter()

# Add cover (page 1)
cover_page = cover_reader.pages[0]
cw, ch = float(cover_page.mediabox.width), float(cover_page.mediabox.height)
if abs(cw - A4_W) > 2 or abs(ch - A4_H) > 2:
    sx, sy = A4_W / cw, A4_H / ch
    cover_page.add_transformation(Transformation().scale(sx=sx, sy=sy))
    cover_page.mediabox.lower_left = (0, 0)
    cover_page.mediabox.upper_right = (A4_W, A4_H)
writer.add_page(cover_page)

# Add body pages
for page in body_reader.pages:
    pw, ph = float(page.mediabox.width), float(page.mediabox.height)
    if abs(pw - A4_W) > 2 or abs(ph - A4_H) > 2:
        sx, sy = A4_W / pw, A4_H / ph
        page.add_transformation(Transformation().scale(sx=sx, sy=sy))
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    writer.add_page(page)

# Metadata
writer.add_metadata({
    '/Title': 'Estrategia Rentable - Smart Prediction v5.2',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Estrategia de gestion de bankroll y apuestas para ruleta con Smart Prediction v5.2'
})

with open(output_pdf, 'wb') as f:
    writer.write(f)

print(f'Merged PDF: {output_pdf}')
print(f'Pages: {len(writer.pages)}')
