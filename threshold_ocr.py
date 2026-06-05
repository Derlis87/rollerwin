#!/usr/bin/env python3
"""Aggressive text extraction with multiple brightness thresholds."""

from PIL import Image, ImageEnhance, ImageOps
import numpy as np
import pytesseract

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)
img_array = np.array(img).astype(float)

scale = 6

def extract_and_ocr(img_arr, threshold, name):
    """Create binary image at given brightness threshold and OCR it."""
    # Create binary: pixels brighter than threshold = white, else black
    brightness = np.mean(img_arr, axis=2)
    binary = np.where(brightness > threshold, 255, 0).astype(np.uint8)
    pil_img = Image.fromarray(binary)
    pil_l = pil_img.resize((pil_img.size[0]*scale, pil_img.size[1]*scale), Image.LANCZOS)
    
    text = pytesseract.image_to_string(pil_l, lang='spa+eng', config='--psm 6 --oem 3').strip()
    if text:
        print(f"  threshold={threshold:3d}: '{text}'")
    return text

# Full image at various thresholds
print("=" * 80)
print("THRESHOLD-BASED OCR ON FULL IMAGE")
print("=" * 80)
for t in [30, 35, 40, 45, 50, 55, 60]:
    extract_and_ocr(img_array, t, "full")

# Header region
print("\n" + "=" * 80)
print("THRESHOLD OCR ON HEADER (x=0-500, y=0-35)")
print("=" * 80)
header = img_array[0:35, 0:500, :]
for t in [30, 35, 40, 45, 50, 55, 60, 65, 70]:
    extract_and_ocr(header, t, "header")

# Data area between header and chart
print("\n" + "=" * 80)
print("THRESHOLD OCR ON DATA AREA (x=96-811, y=50-165)")
print("=" * 80)
data = img_array[50:165, 96:811, :]
for t in [30, 35, 40, 45, 50, 55]:
    extract_and_ocr(data, t, "data")

# Chart area with numbers
print("\n" + "=" * 80)
print("THRESHOLD OCR ON CHART AREA (x=96-811, y=165-220)")
print("=" * 80)
chart = img_array[165:220, 96:811, :]
for t in [30, 35, 40, 45, 50]:
    extract_and_ocr(chart, t, "chart")

# Now let's try extracting ONLY the green channel since text might be in a specific color
print("\n" + "=" * 80)
print("CHANNEL-SPECIFIC ANALYSIS")
print("=" * 80)

for ch, name in [(0, 'RED'), (1, 'GREEN'), (2, 'BLUE')]:
    channel = img_array[:, :, ch]
    for t in [30, 40, 50, 60, 80, 100]:
        binary = np.where(channel > t, 255, 0).astype(np.uint8)
        pil_img = Image.fromarray(binary)
        pil_l = pil_img.resize((pil_img.size[0]*scale, pil_img.size[1]*scale), Image.LANCZOS)
        text = pytesseract.image_to_string(pil_l, lang='spa+eng', config='--psm 6 --oem 3').strip()
        if text and len(text) > 3:
            print(f"  {name} channel, t={t:3d}: '{text[:100]}'")

# Try extracting just the area with the green status indicator more carefully
print("\n" + "=" * 80)
print("GREEN STATUS INDICATOR DETAIL")
print("=" * 80)
green_region = img_array[0:30, 895:933, :]
green_channel = green_region[:, :, 1]
binary = np.where(green_channel > 100, 255, 0).astype(np.uint8)
pil_img = Image.fromarray(binary)
pil_l = pil_img.resize((pil_img.size[0]*scale, pil_img.size[1]*scale), Image.LANCZOS)
pil_l.save('/home/z/my-project/upload/green_status.png')
text = pytesseract.image_to_string(pil_l, lang='spa+eng', config='--psm 6 --oem 3').strip()
print(f"  Green channel > 100: '{text}'")

# Check individual pixel colors around the logo area
print("\n" + "=" * 80)
print("HEADER PIXEL SAMPLING (y=10-20)")
print("=" * 80)
for x in range(0, 500, 5):
    for y in [10, 15, 20]:
        r, g, b = int(img_array[y, x, 0]), int(img_array[y, x, 1]), int(img_array[y, x, 2])
        brightness = (r + g + b) / 3
        if brightness > 35:
            print(f"  ({x:3d},{y:3d}): rgb({r:3d},{g:3d},{b:3d}) brightness={brightness:.0f}")
