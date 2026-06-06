#!/usr/bin/env python3
"""Fixed bar height analysis + final data extraction."""

from PIL import Image, ImageEnhance, ImageOps
import numpy as np
import pytesseract

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)
img_array = np.array(img)

# --- BAR HEIGHT ANALYSIS ---
chart_x_start = 96
chart_x_end = 811
col_width = (chart_x_end - chart_x_start) / 15
chart_top = 50   # start from top of chart area
chart_bottom = 214

print("=" * 80)
print("TEAL BAR ANALYSIS - Full height scan from y=50 to y=214")
print("=" * 80)

for col in range(15):
    x1 = int(chart_x_start + col * col_width) + 5
    x2 = int(chart_x_start + (col + 1) * col_width) - 5
    
    col_data = img_array[:, x1:x2, :]
    teal = ((col_data[:,:,0] < 80) & (col_data[:,:,1] > 150) & (col_data[:,:,2] > 130))
    teal_per_row = np.sum(teal, axis=1)
    
    if np.any(teal_per_row > 0):
        teal_rows = np.where(teal_per_row > 0)[0]
        bar_top = teal_rows.min()
        bar_bottom = teal_rows.max()
        bar_height = bar_bottom - bar_top + 1
        max_teal_width = int(np.max(teal_per_row))
        rows_with_teal = int(np.sum(teal_per_row > 0))
        print(f"  Col {col+1:2d}: teal y={bar_top:3d}-{bar_bottom:3d}, height={bar_height}px, rows_with_teal={rows_with_teal}, max_width={max_teal_width}px")
    else:
        print(f"  Col {col+1:2d}: no teal data")

# --- GOLD BAR ANALYSIS ---
print("\n" + "=" * 80)
print("GOLD ELEMENT ANALYSIS")
print("=" * 80)
for col in range(15):
    x1 = int(chart_x_start + col * col_width) + 5
    x2 = int(chart_x_start + (col + 1) * col_width) - 5
    
    col_data = img_array[:, x1:x2, :]
    gold = (col_data[:,:,0] > 180) & (col_data[:,:,1] > 130) & (col_data[:,:,2] < 100)
    gold_per_row = np.sum(gold, axis=1)
    
    if np.any(gold_per_row > 0):
        gold_rows = np.where(gold_per_row > 0)[0]
        print(f"  Col {col+1:2d}: gold y={gold_rows.min()}-{gold_rows.max()}")

# --- GRAY/TEXT ANALYSIS ---
print("\n" + "=" * 80)
print("LIGHTER PIXEL (TEXT) ANALYSIS per column region")
print("=" * 80)
for col in range(15):
    x1 = int(chart_x_start + col * col_width)
    x2 = int(chart_x_start + (col + 1) * col_width)
    
    col_data = img_array[50:170, x1:x2, :]
    # Look for pixels that are noticeably lighter than background
    bright = ((col_data[:,:,0] > 50) & (col_data[:,:,1] > 50) & (col_data[:,:,2] > 50))
    bright_per_row = np.sum(bright, axis=1)
    
    if np.any(bright_per_row > 0):
        bright_rows = np.where(bright_per_row > 0)[0]
        total_bright = int(np.sum(bright_per_row))
        print(f"  Col {col+1:2d} (y=50-170): bright pixels at y={bright_rows.min()+50}-{bright_rows.max()+50}, total={total_bright}px")

# --- SPECIFIC AREA OCR with char whitelist ---
print("\n" + "=" * 80)
print("NUMBER EXTRACTION - each column header area")
print("=" * 80)

scale = 8
for col in range(15):
    x1 = int(chart_x_start + col * col_width)
    x2 = int(chart_x_start + (col + 1) * col_width)
    
    # Check area above the chart for number labels
    for y_start, y_end in [(50, 70), (70, 90), (90, 110), (110, 135), (135, 155), (155, 170)]:
        crop = img.crop((x1, y_start, x2, y_end))
        if crop.size[0] < 3 or crop.size[1] < 3:
            continue
        crop_l = crop.resize((crop.size[0]*scale, crop.size[1]*scale), Image.LANCZOS)
        enhancer = ImageEnhance.Contrast(crop_l)
        crop_c = enhancer.enhance(5.0)
        crop_gray = crop_c.convert('L')
        crop_inv = ImageOps.invert(crop_gray)
        
        text = pytesseract.image_to_string(crop_inv, lang='eng', 
            config='--psm 10 --oem 3 -c tessedit_char_whitelist=0123456789').strip()
        if text and len(text) <= 4:
            print(f"  Col {col+1:2d}, y={y_start}-{y_end}: '{text}'")

# Try extracting the full area between header and chart with numbers whitelist
print("\n" + "=" * 80)
print("FULL DATA AREA - numbers only (y=50-170, x=96-811)")
print("=" * 80)
crop = img.crop((96, 50, 811, 170))
crop_l = crop.resize((crop.size[0]*scale, crop.size[1]*scale), Image.LANCZOS)
enhancer = ImageEnhance.Contrast(crop_l)
crop_c = enhancer.enhance(5.0)
crop_gray = crop_c.convert('L')
crop_inv = ImageOps.invert(crop_gray)
crop_inv.save('/home/z/my-project/upload/data_area.png')
text = pytesseract.image_to_string(crop_inv, lang='eng', 
    config='--psm 6 --oem 3 -c tessedit_char_whitelist=0123456789.').strip()
print(f"  Numbers only: '{text}'")
text2 = pytesseract.image_to_string(crop_inv, lang='eng', 
    config='--psm 11 --oem 3 -c tessedit_char_whitelist=0123456789.').strip()
print(f"  Numbers only (PSM11): '{text2}'")

# Full data area with all chars
text3 = pytesseract.image_to_string(crop_inv, lang='spa+eng', config='--psm 4 --oem 3').strip()
print(f"  Full text (PSM4): '{text3}'")

# Check specific areas that might have labels
print("\n" + "=" * 80)
print("LABEL EXTRACTION - left sidebar area")
print("=" * 80)
for y_start in range(50, 170, 10):
    y_end = y_start + 10
    crop = img.crop((10, y_start, 90, y_end))
    crop_l = crop.resize((crop.size[0]*scale, crop.size[1]*scale), Image.LANCZOS)
    enhancer = ImageEnhance.Contrast(crop_l)
    crop_c = enhancer.enhance(5.0)
    crop_gray = crop_c.convert('L')
    crop_inv = ImageOps.invert(crop_gray)
    text = pytesseract.image_to_string(crop_inv, lang='spa+eng', config='--psm 7 --oem 3').strip()
    if text:
        print(f"  y={y_start}-{y_end}: '{text}'")
