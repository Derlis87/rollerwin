#!/usr/bin/env python3
"""Enhanced OCR analysis with image preprocessing for better results."""

from PIL import Image, ImageFilter, ImageOps, ImageEnhance
import pytesseract
import numpy as np

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)
print(f"Original image size: {img.size}")
print(f"Original image mode: {img.mode}")

# Upscale the image for better OCR
scale = 3
img_large = img.resize((img.size[0] * scale, img.size[1] * scale), Image.LANCZOS)
print(f"Upscaled to: {img_large.size}")

# Increase contrast
enhancer = ImageEnhance.Contrast(img_large)
img_contrast = enhancer.enhance(2.0)

# Increase sharpness
enhancer = ImageEnhance.Sharpness(img_contrast)
img_sharp = enhancer.enhance(2.0)

# Convert to grayscale
img_gray = img_sharp.convert('L')

# Apply threshold to make it cleaner
img_thresh = img_gray.point(lambda x: 0 if x < 128 else 255)

# Save preprocessed images for reference
img_thresh.save('/home/z/my-project/upload/preprocessed_thresh.png')
img_contrast.save('/home/z/my-project/upload/preprocessed_contrast.png')

print("=" * 80)
print("OCR on high-contrast upscaled image:")
text1 = pytesseract.image_to_string(img_contrast, lang='spa+eng', config='--psm 6 --oem 3')
print(text1)
print("=" * 80)

print("\nOCR on thresholded upscaled image:")
text2 = pytesseract.image_to_string(img_thresh, lang='spa+eng', config='--psm 6 --oem 3')
print(text2)
print("=" * 80)

print("\nOCR on grayscale upscaled (PSM 11 sparse):")
text3 = pytesseract.image_to_string(img_gray, lang='spa+eng', config='--psm 11 --oem 3')
print(text3)
print("=" * 80)

# Try with PSM 3 (fully automatic) on the contrast-enhanced image
print("\nOCR on contrast-enhanced (PSM 3 auto):")
text4 = pytesseract.image_to_string(img_contrast, lang='spa+eng', config='--psm 3 --oem 3')
print(text4)
print("=" * 80)

# Also try with digits-only config
print("\nOCR digits-only mode:")
text5 = pytesseract.image_to_string(img_contrast, lang='spa+eng', config='--psm 11 -c tessedit_char_whitelist=0123456789.%')
print(text5)
print("=" * 80)

# Detailed word-level with positions on contrast-enhanced
print("\nDETAILED WORD-LEVEL OCR (contrast-enhanced, upscaled):")
data = pytesseract.image_to_data(img_contrast, lang='spa+eng', output_type=pytesseract.Output.DICT, config='--oem 3')
for i in range(len(data['text'])):
    if data['text'][i].strip():
        conf = data['conf'][i]
        x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
        real_x = x // scale
        real_y = y // scale
        print(f"  [orig:{real_x:4d},{real_y:4d}] ({w:3d}x{h:3d}) conf={conf:5.1f} : '{data['text'][i]}'")
