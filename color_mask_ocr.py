#!/usr/bin/env python3
"""Extract colored text using color-specific masks."""

from PIL import Image, ImageEnhance, ImageOps
import numpy as np
import pytesseract

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)
img_array = np.array(img)

scale = 6

def mask_and_ocr(img_arr, mask, name):
    """Apply binary mask and OCR result."""
    binary = np.where(mask, 255, 0).astype(np.uint8)
    pil_img = Image.fromarray(binary)
    pil_l = pil_img.resize((pil_img.size[0]*scale, pil_img.size[1]*scale), Image.LANCZOS)
    for psm in [6, 7, 11]:
        text = pytesseract.image_to_string(pil_l, lang='spa+eng', config=f'--psm {psm} --oem 3').strip()
        if text:
            print(f"  {name} PSM{psm}: '{text}'")
    return pil_l

# --- WHITE TEXT ---
print("=" * 80)
print("WHITE TEXT (R>200, G>200, B>200)")
print("=" * 80)
white_mask = (img_array[:,:,0] > 200) & (img_array[:,:,1] > 200) & (img_array[:,:,2] > 200)
mask_and_ocr(img_array, white_mask, "White")

# --- ORANGE/GOLD TEXT ---
print("\n" + "=" * 80)
print("ORANGE/GOLD TEXT (R>180, G>100, B<120)")
print("=" * 80)
orange_mask = (img_array[:,:,0] > 180) & (img_array[:,:,1] > 100) & (img_array[:,:,2] < 120)
mask_and_ocr(img_array, orange_mask, "Orange")

# Also try a tighter gold range
print("\nTight gold (R>190, G>120, B<80):")
gold_mask = (img_array[:,:,0] > 190) & (img_array[:,:,1] > 120) & (img_array[:,:,2] < 80)
mask_and_ocr(img_array, gold_mask, "Gold")

# --- PURPLE TEXT ---
print("\n" + "=" * 80)
print("PURPLE TEXT (R>40, R<90, G>20, G<60, B>55, B<110)")
print("=" * 80)
purple_mask = (img_array[:,:,0] > 40) & (img_array[:,:,0] < 90) & \
              (img_array[:,:,1] > 20) & (img_array[:,:,1] < 60) & \
              (img_array[:,:,2] > 55) & (img_array[:,:,2] < 110)
mask_and_ocr(img_array, purple_mask, "Purple")

# --- TEAL CHART ---
print("\n" + "=" * 80)
print("TEAL (R<80, G>140, B>120)")
print("=" * 80)
teal_mask = (img_array[:,:,0] < 80) & (img_array[:,:,1] > 140) & (img_array[:,:,2] > 120)
mask_and_ocr(img_array, teal_mask, "Teal")

# --- GREEN STATUS ---
print("\n" + "=" * 80)
print("GREEN STATUS (R<30, G>180, B>40, B<150)")
print("=" * 80)
green_mask = (img_array[:,:,0] < 30) & (img_array[:,:,1] > 180) & (img_array[:,:,2] > 40) & (img_array[:,:,2] < 150)
pil_green = mask_and_ocr(img_array, green_mask, "Green")

# --- GRAY TEXT (medium brightness) ---
print("\n" + "=" * 80)
print("GRAY TEXT (brightness 40-90)")
print("=" * 80)
brightness = np.mean(img_array, axis=2)
gray_mask = (brightness > 40) & (brightness < 90) & ~white_mask & ~orange_mask & ~teal_mask & ~purple_mask
mask_and_ocr(img_array, gray_mask, "Gray")

# --- LIGHTER GRAY (90-160) ---
print("\n" + "=" * 80)
print("LIGHTER GRAY TEXT (brightness 90-160)")
print("=" * 80)
lighter_gray = (brightness > 90) & (brightness < 160) & ~white_mask & ~orange_mask & ~teal_mask & ~purple_mask
mask_and_ocr(img_array, lighter_gray, "LightGray")

# Now try to extract the purple area specifically
print("\n" + "=" * 80)
print("PURPLE REGION DETAIL (x=220-260, y=0-35)")
print("=" * 80)
purple_crop = img_array[0:35, 220:260, :]
purple_mask_crop = (purple_crop[:,:,0] > 40) & (purple_crop[:,:,0] < 90) & \
                   (purple_crop[:,:,1] > 20) & (purple_crop[:,:,1] < 60) & \
                   (purple_crop[:,:,2] > 55) & (purple_crop[:,:,2] < 110)
binary = np.where(purple_mask_crop, 255, 0).astype(np.uint8)
pil_img = Image.fromarray(binary)
pil_l = pil_img.resize((pil_img.size[0]*scale*2, pil_img.size[1]*scale*2), Image.LANCZOS)
pil_l.save('/home/z/my-project/upload/purple_detail.png')
text = pytesseract.image_to_string(pil_l, lang='spa+eng', config='--psm 7 --oem 3').strip()
print(f"  Purple detail: '{text}'")
# Try with numbers
text_num = pytesseract.image_to_string(pil_l, lang='eng', config='--psm 7 --oem 3 -c tessedit_char_whitelist=0123456789vV.').strip()
print(f"  Purple (numbers+v): '{text_num}'")

# Try the orange area for version
print("\n" + "=" * 80)
print("ORANGE TEXT DETAIL (x=108-165, y=8-30)")
print("=" * 80)
orange_crop = img_array[8:30, 108:165, :]
orange_mask_crop = (orange_crop[:,:,0] > 180) & (orange_crop[:,:,1] > 100) & (orange_crop[:,:,2] < 120)
binary = np.where(orange_mask_crop, 255, 0).astype(np.uint8)
pil_img = Image.fromarray(binary)
pil_l = pil_img.resize((pil_img.size[0]*scale*2, pil_img.size[1]*scale*2), Image.LANCZOS)
pil_l.save('/home/z/my-project/upload/orange_detail.png')
text = pytesseract.image_to_string(pil_l, lang='spa+eng', config='--psm 7 --oem 3').strip()
print(f"  Orange text: '{text}'")

# Also try the area x=165-280 where "CASINO v6.0" appeared
print("\n" + "=" * 80)
print("MID HEADER DETAIL (x=165-280, y=5-30)")
print("=" * 80)
mid_crop = img_array[5:30, 165:280, :]
brightness_crop = np.mean(mid_crop, axis=2)
binary = np.where(brightness_crop > 40, 255, 0).astype(np.uint8)
pil_img = Image.fromarray(binary)
pil_l = pil_img.resize((pil_img.size[0]*scale*2, pil_img.size[1]*scale*2), Image.LANCZOS)
pil_l.save('/home/z/my-project/upload/mid_header.png')
text = pytesseract.image_to_string(pil_l, lang='spa+eng', config='--psm 7 --oem 3').strip()
print(f"  Mid header: '{text}'")
text2 = pytesseract.image_to_string(pil_l, lang='eng', config='--psm 6 --oem 3').strip()
print(f"  Mid header (PSM6): '{text2}'")

# Let's also extract the version from the purple region more carefully
print("\n" + "=" * 80)
print("VERSION BADGE ANALYSIS")
print("=" * 80)
# The purple area at x=225-260 might contain "V6.0" text
# Let's also check x=155-290 with brightness mask
ver_crop = img_array[5:30, 155:290, :]
brightness_ver = np.mean(ver_crop, axis=2)
binary_v = np.where(brightness_ver > 35, 255, 0).astype(np.uint8)
pil_v = Image.fromarray(binary_v)
pil_v_l = pil_v.resize((pil_v.size[0]*scale*3, pil_v.size[1]*scale*3), Image.LANCZOS)
pil_v_l.save('/home/z/my-project/upload/version_area.png')
text_v = pytesseract.image_to_string(pil_v_l, lang='spa+eng', config='--psm 7 --oem 3').strip()
print(f"  Version area: '{text_v}'")
text_v2 = pytesseract.image_to_string(pil_v_l, lang='eng', config='--psm 6 --oem 3').strip()
print(f"  Version area (PSM6): '{text_v2}'")
# Try with whitelist
text_v3 = pytesseract.image_to_string(pil_v_l, lang='eng', config='--psm 7 --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.v').strip()
print(f"  Version area (whitelist): '{text_v3}'")

# Sample the purple region pixel by pixel
print("\nPurple region pixels (x=225-257, y=10-25):")
for y in range(10, 26):
    row_pixels = []
    for x in range(225, 258):
        r, g, b = int(img_array[y,x,0]), int(img_array[y,x,1]), int(img_array[y,x,2])
        if r > 40 or g > 30 or b > 50:  # Not background
            row_pixels.append(f"({x},{y}):#{r:02x}{g:02x}{b:02x}")
    if row_pixels:
        print(f"  y={y}: {', '.join(row_pixels)}")
