#!/usr/bin/env python3
"""Final analysis pass - extract all remaining data with targeted regions."""

from PIL import Image, ImageEnhance, ImageOps, ImageFilter
import numpy as np
import pytesseract

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)
img_array = np.array(img)

scale = 6

def ocr_region(img, x1, y1, x2, y2, scale=scale, psm=7):
    """Extract and OCR a specific region with preprocessing."""
    crop = img.crop((x1, y1, x2, y2))
    if crop.size[0] < 3 or crop.size[1] < 3:
        return ""
    crop_l = crop.resize((crop.size[0]*scale, crop.size[1]*scale), Image.LANCZOS)
    enhancer = ImageEnhance.Contrast(crop_l)
    crop_c = enhancer.enhance(4.0)
    enhancer = ImageEnhance.Sharpness(crop_c)
    crop_c = enhancer.enhance(2.0)
    crop_gray = crop_c.convert('L')
    crop_inv = ImageOps.invert(crop_gray)
    try:
        text = pytesseract.image_to_string(crop_inv, lang='spa+eng', config=f'--psm {psm} --oem 3')
        return text.strip()
    except:
        return ""

def ocr_multi(img, x1, y1, x2, y2, name=""):
    """OCR a region with multiple PSM modes."""
    results = []
    for psm in [6, 7, 11, 13]:
        r = ocr_region(img, x1, y1, x2, y2, psm=psm)
        if r:
            results.append(f"PSM{psm}: '{r}'")
    if results:
        print(f"  {name}:")
        for r in results:
            print(f"    {r}")
    return results

print("=" * 80)
print("TARGETED REGION ANALYSIS")
print("=" * 80)

# Header area - slice into smaller pieces
print("\n--- HEADER SLICES ---")
ocr_multi(img, 15, 5, 105, 30, "Logo text (x=15-105)")
ocr_multi(img, 105, 5, 165, 30, "After logo (x=105-165)")
ocr_multi(img, 165, 5, 280, 30, "Mid header (x=165-280)")
ocr_multi(img, 280, 5, 450, 30, "Right header (x=280-450)")
ocr_multi(img, 450, 5, 650, 30, "Far right header (x=450-650)")
ocr_multi(img, 650, 5, 900, 30, "Far far right (x=650-900)")

# Stats rows area (y=50-170) - this is where the main data would be
print("\n--- MAIN DATA AREA (y=50-170) ---")

# Try to find the text labels by scanning horizontally in small windows
print("\nHorizontal scan of text regions (y=50-170):")
for y_start in range(50, 165, 15):
    y_end = y_start + 15
    text = ocr_region(img, 96, y_start, 820, y_end, psm=11)
    if text and len(text) > 2:
        print(f"  y={y_start}-{y_end}: '{text}'")

# Let's also look at column-by-column data for the chart area (y=170-215)
print("\n--- CHART DATA AREA - column analysis (y=170-215) ---")

# Check if there are specific colored numbers/dots above each bar
for y_start in range(135, 170, 8):
    y_end = y_start + 8
    for x_start in range(96, 811, 48):
        x_end = x_start + 48
        crop = img.crop((x_start, y_start, x_end, y_end))
        crop_l = crop.resize((crop.size[0]*scale, crop.size[1]*scale), Image.LANCZOS)
        enhancer = ImageEnhance.Contrast(crop_l)
        crop_c = enhancer.enhance(4.0)
        crop_gray = crop_c.convert('L')
        crop_inv = ImageOps.invert(crop_gray)
        
        # Check if there's any non-background content
        arr = np.array(crop_gray)
        if np.min(arr) < 100:  # Has content
            text = pytesseract.image_to_string(crop_inv, lang='eng', config='--psm 10 --oem 3 -c tessedit_char_whitelist=0123456789').strip()
            if text:
                col_num = (x_start - 96) // 47 + 1
                print(f"  y={y_start}-{y_end}, col~{col_num} (x={x_start}): '{text}'")

# Analyze the exact bar heights by looking at the top edge of teal in each column
print("\n--- EXACT BAR HEIGHT ANALYSIS ---")
chart_x_start = 96
chart_x_end = 811
col_width = (chart_x_end - chart_x_start) / 15
chart_bottom = 214  # approximate bottom of chart
chart_top = 166  # approximate top of chart area

for col in range(15):
    x1 = int(chart_x_start + col * col_width) + 5  # offset a bit to center
    x2 = int(chart_x_start + (col + 1) * col_width) - 5
    
    # Scan from bottom to top to find where teal begins
    col_data = img_array[chart_top:chart_bottom+1, x1:x2, :]
    teal = ((col_data[:,:,0] < 80) & (col_data[:,:,1] > 150) & (col_data[:,:,2] > 130))
    teal_per_row = np.sum(teal, axis=1)
    
    if np.any(teal_per_row > 0):
        # Find top and bottom of teal content
        teal_rows = np.where(teal_per_row > 0)[0]
        bar_top = teal_rows.min() + chart_top
        bar_bottom = teal_rows.max() + chart_top
        bar_height = bar_bottom - bar_top
        max_width = max(np.sum(teal_per_row > 0))  # rows with teal
        # The "height" is really the fill ratio
        fill_pct = np.sum(teal_per_row > 0) / (chart_bottom - chart_top + 1) * 100
        print(f"  Col {col+1:2d}: teal from y={bar_top} to y={bar_bottom}, height={bar_height}px, fill={fill_pct:.0f}%, max_teal_per_row={np.max(teal_per_row)}")
    else:
        print(f"  Col {col+1:2d}: no teal data")

# Now let's look at pixel values in a few specific areas to understand color coding
print("\n--- SPECIFIC PIXEL VALUE SAMPLING ---")
# Sample some specific positions
samples = [
    (55, 15, "Logo center"),
    (200, 20, "After logo text"),
    (350, 20, "Mid header"),
    (750, 20, "Right header"),
    (130, 155, "Above chart col 1"),
    (350, 155, "Above chart col 5"),
    (580, 155, "Above chart col 10"),
    (130, 190, "Chart col 1 center"),
    (260, 190, "Chart col 4 (empty?)"),
    (480, 190, "Chart col 9 center"),
    (800, 190, "Chart col 15 center"),
    (130, 130, "Pre-chart area col 1"),
    (400, 130, "Pre-chart area col 6"),
    (650, 130, "Pre-chart area col 11"),
    (260, 200, "Gold bar area"),
]

for x, y, desc in samples:
    if 0 <= x < img.size[0] and 0 <= y < img.size[1]:
        r, g, b = img_array[y, x]
        print(f"  ({x:3d},{y:3d}) {desc}: rgb({r:3d},{g:3d},{b:3d}) = #{r:02x}{g:02x}{b:02x}")
