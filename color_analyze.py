#!/usr/bin/env python3
"""Extract and analyze colored text elements from the dark dashboard."""

from PIL import Image, ImageEnhance, ImageFilter
import numpy as np
from collections import Counter

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)
img_array = np.array(img)

# The background is approximately #1d1d20
bg_color = np.array([29, 29, 32])

# Create a mask for non-background pixels (things that aren't the background)
diff = np.abs(img_array.astype(int) - bg_color.astype(int))
non_bg_mask = np.any(diff > 20, axis=2)

# Create a brightened version where non-background pixels are enhanced
bright = np.zeros_like(img_array)
bright[:, :, 0] = 255  # Make them white/bright
bright[:, :, 1] = 255
bright[:, :, 2] = 255

result = np.where(non_bg_mask[:, :, np.newaxis], img_array, np.array([0, 0, 0]))

# Also create an enhanced contrast version
# Amplify the difference from background
amplified = img_array.copy().astype(float)
for c in range(3):
    diff_c = amplified[:, :, c] - bg_color[c]
    amplified[:, :, c] = np.clip(bg_color[c] + diff_c * 8, 0, 255)

# Save the enhanced images
enhanced_img = Image.fromarray(amplified.astype(np.uint8))
enhanced_img.save('/home/z/my-project/upload/enhanced_colors.png')

# Also save a version with only non-background pixels highlighted
highlight_img = Image.fromarray(result)
highlight_img.save('/home/z/my-project/upload/highlighted.png')

print("Enhanced images saved.")

# Now let's look at the specific colored regions
# Teal pixels (#2ab8a7-ish)
teal_mask = (img_array[:, :, 0] < 80) & (img_array[:, :, 1] > 150) & (img_array[:, :, 2] > 130)
teal_coords = np.where(teal_mask)
if len(teal_coords[0]) > 0:
    print(f"\nTEAL pixels: {len(teal_coords[0])} found")
    print(f"  Y range: {teal_coords[0].min()}-{teal_coords[0].max()}")
    print(f"  X range: {teal_coords[1].min()}-{teal_coords[1].max()}")
    # Find clusters
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

# Green pixels (#00c950)
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

# Purple pixels (#36214a-ish) 
purple_mask = (img_array[:, :, 0] > 40) & (img_array[:, :, 0] < 80) & (img_array[:, :, 1] > 20) & (img_array[:, :, 1] < 50) & (img_array[:, :, 2] > 60) & (img_array[:, :, 2] < 100)
purple_coords = np.where(purple_mask)
if len(purple_coords[0]) > 0:
    print(f"\nPURPLE pixels: {len(purple_coords[0])} found")
    print(f"  Y range: {purple_coords[0].min()}-{purple_coords[0].max()}")
    print(f"  X range: {purple_coords[1].min()}-{purple_coords[1].max()}")

# Brighter gray pixels (text-like, #47474d, #4f4f57)
gray_mask = (img_array[:, :, 0] > 60) & (img_array[:, :, 1] > 60) & (img_array[:, :, 2] > 60) & (img_array[:, :, 0] < 140)
gray_coords = np.where(gray_mask)
if len(gray_coords[0]) > 0:
    print(f"\nGRAY TEXT pixels: {len(gray_coords[0])} found")
    print(f"  Y range: {gray_coords[0].min()}-{gray_coords[0].max()}")
    print(f"  X range: {gray_coords[1].min()}-{gray_coords[1].max()}")

# Lighter pixels (white/near-white - #ffffff)
white_mask = (img_array[:, :, 0] > 200) & (img_array[:, :, 1] > 200) & (img_array[:, :, 2] > 200)
white_coords = np.where(white_mask)
if len(white_coords[0]) > 0:
    print(f"\nWHITE pixels: {len(white_coords[0])} found")
    print(f"  Y range: {white_coords[0].min()}-{white_coords[0].max()}")
    print(f"  X range: {white_coords[1].min()}-{white_coords[1].max()}")

# Orange pixels (#fe9a00)
orange_mask = (img_array[:, :, 0] > 200) & (img_array[:, :, 1] > 100) & (img_array[:, :, 1] < 180) & (img_array[:, :, 2] < 50)
orange_coords = np.where(orange_mask)
if len(orange_coords[0]) > 0:
    print(f"\nORANGE pixels: {len(orange_coords[0])} found")
    print(f"  Y range: {orange_coords[0].min()}-{orange_coords[0].max()}")
    print(f"  X range: {orange_coords[1].min()}-{orange_coords[1].max()}")

print("\n" + "=" * 80)
print("Now trying OCR on the amplified contrast image:")
import pytesseract
text = pytesseract.image_to_string(enhanced_img, lang='spa+eng', config='--psm 6 --oem 3')
print(text)

print("\nOCR with PSM 11 on enhanced:")
text2 = pytesseract.image_to_string(enhanced_img, lang='spa+eng', config='--psm 11 --oem 3')
print(text2)

# Try OCR on highlighted version
print("\nOCR on highlighted (white on black):")
highlight_for_ocr = Image.fromarray(np.where(non_bg_mask[:, :, np.newaxis], 255, 0).astype(np.uint8))
text3 = pytesseract.image_to_string(highlight_for_ocr, lang='spa+eng', config='--psm 6 --oem 3')
print(text3)
