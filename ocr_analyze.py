#!/usr/bin/env python3
"""Analyze the RollerWin roulette dashboard screenshot using OCR and image processing."""

import pytesseract
from PIL import Image
import sys

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'

# Open the image
img = Image.open(image_path)
print(f"Image size: {img.size}")
print(f"Image mode: {img.mode}")
print("=" * 80)

# Full OCR with Spanish language support
text = pytesseract.image_to_string(img, lang='spa+eng', config='--psm 6')
print("FULL OCR TEXT (Spanish+English):")
print(text)
print("=" * 80)

# Now try with different PSM modes for better number extraction
print("\nOCR with PSM 4 (single column of text):")
text4 = pytesseract.image_to_string(img, lang='spa+eng', config='--psm 4')
print(text4)
print("=" * 80)

print("\nOCR with PSM 11 (sparse text):")
text11 = pytesseract.image_to_string(img, lang='spa+eng', config='--psm 11')
print(text11)
print("=" * 80)

# Also get data with bounding boxes
print("\nDETAILED WORD-LEVEL OCR WITH CONFIDENCE:")
data = pytesseract.image_to_data(img, lang='spa+eng', output_type=pytesseract.Output.DICT)
for i in range(len(data['text'])):
    if data['text'][i].strip():
        conf = data['conf'][i]
        x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
        print(f"  [{x:4d},{y:4d}] ({w:3d}x{h:3d}) conf={conf:5.1f} : '{data['text'][i]}'")
