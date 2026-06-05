#!/usr/bin/env python3
"""Extract and analyze colored text elements from the dark dashboard."""

from PIL import Image, ImageEnhance, ImageFilter
import numpy as np
from collections import Counter
import pytesseract

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)
img_array = np.array(img)

# The background is approximately #1d1d20
bg_color = np.array([29, 29, 32])

# Create mask for non-background pixels
diff = np.abs(img_array.astype(int) - bg_color.astype(int))
non_bg_mask = np.any(diff > 20, axis=2)

# Create amplified version
amplified = img_array.copy().astype(np.float64)
for c in range(3):
    diff_c = amplified[:, :, c] - bg_color[c]
    amplified[:, :, c] = np.clip(bg_color[c] + diff_c * 8, 0, 255)

enhanced_img = Image.fromarray(amplified.astype(np.uint8))
enhanced_img.save('/home/z/my-project/upload/enhanced_colors.png')

# Teal pixels (#2ab8a7-ish)
teal_mask = (img_array[:, :, 0] < 80) & (img_array[:, :, 1] > 150) & (img_array[:, :, 2] > 130)
teal_coords = np.where(teal_mask)
if len(teal_coords[0]) > 0:
    print(f"TEAL pixels: {len(teal_coords[0])} found")
    print(f"  Y range: {teal_coords[0].min()}-{teal_coords[0].max()}")
    print(f"  X range: {teal_coords[1].min()}-{teal_coords[1].max()}")
    for y in range(teal_coords[0].min(), teal_coords[0].max()+1, 5):
        row_teal = np.where(teal_mask[y])[0]
        if len(row_teal) > 0:
            print(f"  y={y}: x={row_teal.min()}-{row_teal.max()} ({len(row_teal)} px)")

# Gold/yellow pixels
gold_mask = (img_array[:, :, 0] > 180) & (img_array[:, :, 1] > 130) & (img_array[:, :, 2] < 100)
gold_coords = np.where(gold_mask)
if len(gold_coords[0]) > 0:
    print(f"\nGOLD pixels: {len(gold_coords[0])} found")
    print(f"  Y range: {gold_coords[0].min()}-{gold_coords[0].max()}")
    print(f"  X range: {gold_coords[1].min()}-{gold_coords[1].max()}")
    for y in range(gold_coords[0].min(), gold_coords[0].max()+1, 3):
        row_gold = np.where(gold_mask[y])[0]
        if len(row_gold) > 0:
            print(f"  y={y}: x={row_gold.min()}-{row_gold.max()} ({len(row_gold)} px)")

# Green pixels
green_mask = (img_array[:, :, 0] < 50) & (img_array[:, :, 1] > 180) & (img_array[:, :, 2] < 150)
green_coords = np.where(green_mask)
if len(green_coords[0]) > 0:
    print(f"\nGREEN pixels: {len(green_coords[0])} found")
    print(f"  Y range: {green_coords[0].min()}-{green_coords[0].max()}")
    print(f"  X range: {green_coords[1].min()}-{green_coords[1].max()}")
    for y in range(green_coords[0].min(), green_coords[0].max()+1, 3):
        row_green = np.where(green_mask[y])[0]
        if len(row_green) > 0:
            print(f"  y={y}: x={row_green.min()}-{row_green.max()} ({len(row_green)} px)")

# Purple pixels
purple_mask = (img_array[:, :, 0] > 40) & (img_array[:, :, 0] < 80) & (img_array[:, :, 1] > 20) & (img_array[:, :, 1] < 50) & (img_array[:, :, 2] > 60) & (img_array[:, :, 2] < 100)
purple_coords = np.where(purple_mask)
if len(purple_coords[0]) > 0:
    print(f"\nPURPLE pixels: {len(purple_coords[0])} found")
    print(f"  Y range: {purple_coords[0].min()}-{purple_coords[0].max()}")
    print(f"  X range: {purple_coords[1].min()}-{purple_coords[1].max()}")

# Gray text pixels
gray_mask = (img_array[:, :, 0] > 60) & (img_array[:, :, 1] > 60) & (img_array[:, :, 2] > 60) & (img_array[:, :, 0] < 140)
gray_coords = np.where(gray_mask)
if len(gray_coords[0]) > 0:
    print(f"\nGRAY TEXT pixels: {len(gray_coords[0])} found")
    print(f"  Y range: {gray_coords[0].min()}-{gray_coords[0].max()}")
    print(f"  X range: {gray_coords[1].min()}-{gray_coords[1].max()}")

# White pixels
white_mask = (img_array[:, :, 0] > 200) & (img_array[:, :, 1] > 200) & (img_array[:, :, 2] > 200)
white_coords = np.where(white_mask)
if len(white_coords[0]) > 0:
    print(f"\nWHITE pixels: {len(white_coords[0])} found")
    print(f"  Y range: {white_coords[0].min()}-{white_coords[0].max()}")
    print(f"  X range: {white_coords[1].min()}-{white_coords[1].max()}")

# Orange pixels
orange_mask = (img_array[:, :, 0] > 200) & (img_array[:, :, 1] > 100) & (img_array[:, :, 1] < 180) & (img_array[:, :, 2] < 50)
orange_coords = np.where(orange_mask)
if len(orange_coords[0]) > 0:
    print(f"\nORANGE pixels: {len(orange_coords[0])} found")
    print(f"  Y range: {orange_coords[0].min()}-{orange_coords[0].max()}")
    print(f"  X range: {orange_coords[1].min()}-{orange_coords[1].max()}")

print("\n" + "=" * 80)

# Try OCR on amplified image
print("OCR on amplified image (PSM 6):")
text = pytesseract.image_to_string(enhanced_img, lang='spa+eng', config='--psm 6 --oem 3')
print(text)

print("\nOCR on amplified image (PSM 11):")
text2 = pytesseract.image_to_string(enhanced_img, lang='spa+eng', config='--psm 11 --oem 3')
print(text2)

# Create binary mask image for OCR
mask_img = np.zeros((img_array.shape[0], img_array.shape[1]), dtype=np.uint8)
mask_img[non_bg_mask] = 255
mask_pil = Image.fromarray(mask_img)
mask_pil.save('/home/z/my-project/upload/binary_mask.png')

print("\nOCR on binary mask (PSM 6):")
text3 = pytesseract.image_to_string(mask_pil, lang='spa+eng', config='--psm 6 --oem 3')
print(text3)

print("\nOCR on binary mask (PSM 11):")
text4 = pytesseract.image_to_string(mask_pil, lang='spa+eng', config='--psm 11 --oem 3')
print(text4)

# Upscale and try
scale = 4
mask_large = mask_pil.resize((mask_pil.size[0]*scale, mask_pil.size[1]*scale), Image.LANCZOS)
print("\nOCR on upscaled binary mask (PSM 11):")
text5 = pytesseract.image_to_string(mask_large, lang='spa+eng', config='--psm 11 --oem 3')
print(text5)

# Also try with inverted colors (white bg, black text)
inv_mask = Image.fromarray(255 - mask_img)
inv_large = inv_mask.resize((inv_mask.size[0]*scale, inv_mask.size[1]*scale), Image.LANCZOS)
print("\nOCR on inverted upscaled mask (PSM 6):")
text6 = pytesseract.image_to_string(inv_large, lang='spa+eng', config='--psm 6 --oem 3')
print(text6)

print("\nOCR on inverted upscaled mask (PSM 11):")
text7 = pytesseract.image_to_string(inv_large, lang='spa+eng', config='--psm 11 --oem 3')
print(text7)

# Detailed word-level on best candidate (inverted upscaled)
print("\nDETAILED OCR on inverted upscaled mask:")
data = pytesseract.image_to_data(inv_large, lang='spa+eng', output_type=pytesseract.Output.DICT, config='--oem 3')
for i in range(len(data['text'])):
    if data['text'][i].strip():
        conf = data['conf'][i]
        x, y, w, h = data['left'][i]//scale, data['top'][i]//scale, data['width'][i]//scale, data['height'][i]//scale
        print(f"  [orig:{x:4d},{y:4d}] ({w:3d}x{h:3d}) conf={conf:5.1f} : '{data['text'][i]}'")
