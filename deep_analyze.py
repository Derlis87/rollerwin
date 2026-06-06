#!/usr/bin/env python3
"""Deep analysis of chart structure and colored elements."""

from PIL import Image, ImageEnhance, ImageOps
import numpy as np
import pytesseract

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)
img_array = np.array(img)

# Extract gold/orange header region more carefully
# Gold text around x=96-271, y=9-28
print("=" * 80)
print("GOLD TEXT REGION (x=96-275, y=0-35)")
print("=" * 80)
crop = img.crop((96, 0, 280, 35))
scale = 8
crop_large = crop.resize((crop.size[0]*scale, crop.size[1]*scale), Image.LANCZOS)
enhancer = ImageEnhance.Contrast(crop_large)
crop_c = enhancer.enhance(5.0)
crop_gray = crop_c.convert('L')
crop_inv = ImageOps.invert(crop_gray)
crop_inv.save('/home/z/my-project/upload/gold_text.png')
text = pytesseract.image_to_string(crop_inv, lang='spa+eng', config='--psm 7 --oem 3')
print(f"  OCR: '{text.strip()}'")

# White text region (RollerWin + extras)
print("\n" + "=" * 80)
print("WHITE TEXT / LOGO REGION (x=0-260, y=0-35)")
print("=" * 80)
crop2 = img.crop((0, 0, 260, 35))
crop2_large = crop2.resize((crop2.size[0]*scale, crop2.size[1]*scale), Image.LANCZOS)
enhancer = ImageEnhance.Contrast(crop2_large)
crop2_c = enhancer.enhance(5.0)
crop2_gray = crop2_c.convert('L')
crop2_inv = ImageOps.invert(crop2_gray)
crop2_inv.save('/home/z/my-project/upload/logo_text.png')
text2 = pytesseract.image_to_string(crop2_inv, lang='spa+eng', config='--psm 7 --oem 3')
print(f"  OCR: '{text2.strip()}'")

# Full header (x=0-500, y=0-35)
print("\n" + "=" * 80)
print("FULL HEADER (x=0-500, y=0-35)")
print("=" * 80)
crop3 = img.crop((0, 0, 500, 35))
crop3_large = crop3.resize((crop3.size[0]*scale, crop3.size[1]*scale), Image.LANCZOS)
enhancer = ImageEnhance.Contrast(crop3_large)
crop3_c = enhancer.enhance(5.0)
crop3_gray = crop3_c.convert('L')
crop3_inv = ImageOps.invert(crop3_gray)
text3 = pytesseract.image_to_string(crop3_inv, lang='spa+eng', config='--psm 7 --oem 3')
print(f"  OCR: '{text3.strip()}'")
text3b = pytesseract.image_to_string(crop3_inv, lang='eng', config='--psm 6 --oem 3')
print(f"  OCR (PSM6): '{text3b.strip()}'")

# Analyze the teal chart bars in detail
print("\n" + "=" * 80)
print("TEAL CHART BARS ANALYSIS (y=166-214)")
print("=" * 80)

# The chart area spans x=96-811 (from earlier analysis)
# Let's divide into 15 columns (matching 1-15 footer labels)
chart_x_start = 96
chart_x_end = 811
chart_width = chart_x_end - chart_x_start  # 715 pixels
col_width = chart_width / 15  # ~47.7 pixels per column

# The teal bars go from some baseline downward
for col in range(15):
    x1 = int(chart_x_start + col * col_width)
    x2 = int(chart_x_start + (col + 1) * col_width)
    
    # Look at the teal intensity in this column
    region = img_array[:, x1:x2, :]
    
    # Teal pixels
    teal = ((region[:,:,0] < 80) & (region[:,:,1] > 150) & (region[:,:,2] > 130))
    
    # Count teal pixels per row
    teal_per_row = np.sum(teal, axis=1)
    
    # Find the extent of teal bars
    teal_rows = np.where(teal_per_row > 0)[0]
    if len(teal_rows) > 0:
        y_top = teal_rows.min()
        y_bottom = teal_rows.max()
        y_span = y_bottom - y_top
        total_teal = np.sum(teal_per_row)
        print(f"  Col {col+1:2d} (x={x1:3d}-{x2:3d}): teal rows {y_top}-{y_bottom} (span={y_span}px), total teal px={total_teal}")
    else:
        print(f"  Col {col+1:2d} (x={x1:3d}-{x2:3d}): NO teal pixels")

# Also analyze the gold vertical bar (x=256-270, y=135-213)
print("\n" + "=" * 80)
print("GOLD VERTICAL ELEMENT (x=256-270)")
print("=" * 80)
gold_region = img_array[:, 256:270, :]
gold_mask = (gold_region[:,:,0] > 180) & (gold_region[:,:,1] > 130) & (gold_region[:,:,2] < 100)
gold_rows = np.where(np.any(gold_mask, axis=1))[0]
if len(gold_rows) > 0:
    print(f"  Gold vertical element: y={gold_rows.min()}-{gold_rows.max()} (span={gold_rows.max()-gold_rows.min()})")

# Analyze the gray text regions for stat numbers
print("\n" + "=" * 80)
print("GRAY TEXT PIXEL ANALYSIS")
print("=" * 80)

# Look at specific regions for potential number displays
regions_of_interest = [
    ("Top stats area", 96, 50, 811, 70),
    ("Mid stats area", 96, 70, 811, 100),
    ("Labels area", 96, 100, 811, 135),
    ("Pre-chart labels", 96, 135, 811, 170),
]

for name, rx1, ry1, rx2, ry2 in regions_of_interest:
    crop = img.crop((rx1, ry1, rx2, ry2))
    crop_l = crop.resize((crop.size[0]*scale, crop.size[1]*scale), Image.LANCZOS)
    enhancer = ImageEnhance.Contrast(crop_l)
    crop_c = enhancer.enhance(5.0)
    crop_gray = crop_c.convert('L')
    crop_inv = ImageOps.invert(crop_gray)
    
    text = pytesseract.image_to_string(crop_inv, lang='spa+eng', config='--psm 7 --oem 3')
    text = text.strip()
    if text:
        print(f"  {name}: '{text}'")
    
    # Also try PSM 6
    text6 = pytesseract.image_to_string(crop_inv, lang='spa+eng', config='--psm 6 --oem 3')
    text6 = text6.strip()
    if text6:
        print(f"  {name} (PSM6): '{text6}'")

# Analyze the green status indicator area
print("\n" + "=" * 80)
print("GREEN STATUS INDICATOR (top-right corner)")
print("=" * 80)
green_crop = img.crop((895, 0, 933, 35))
green_l = green_crop.resize((green_crop.size[0]*scale, green_crop.size[1]*scale), Image.LANCZOS)
enhancer = ImageEnhance.Contrast(green_l)
green_c = enhancer.enhance(5.0)
green_gray = green_c.convert('L')
green_inv = ImageOps.invert(green_gray)
green_inv.save('/home/z/my-project/upload/green_indicator.png')
text_g = pytesseract.image_to_string(green_inv, lang='spa+eng', config='--psm 7 --oem 3')
print(f"  OCR: '{text_g.strip()}'")

# Detailed look at the purple region
print("\n" + "=" * 80)
print("PURPLE ELEMENT (x=225-257, y=13-28)")
print("=" * 80)
purple_crop = img.crop((225, 0, 260, 35))
purple_l = purple_crop.resize((purple_crop.size[0]*scale, purple_crop.size[1]*scale), Image.LANCZOS)
enhancer = ImageEnhance.Contrast(purple_l)
purple_c = enhancer.enhance(5.0)
purple_gray = purple_c.convert('L')
purple_inv = ImageOps.invert(purple_gray)
purple_inv.save('/home/z/my-project/upload/purple_element.png')
text_p = pytesseract.image_to_string(purple_inv, lang='spa+eng', config='--psm 7 --oem 3')
print(f"  OCR: '{text_p.strip()}'")
