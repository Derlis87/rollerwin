#!/usr/bin/env python3
"""Slice image into horizontal bands and process each for OCR."""

from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import numpy as np
import pytesseract

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)

# Define horizontal bands to process separately
bands = [
    ("Header (y=0-35)", (0, 35)),
    ("Sub-header (y=35-70)", (35, 70)),
    ("Row 1 (y=70-100)", (70, 100)),
    ("Row 2 (y=100-135)", (100, 135)),
    ("Row 3 (y=135-170)", (135, 170)),
    ("Chart area top (y=170-195)", (170, 195)),
    ("Chart area bottom (y=195-220)", (195, 220)),
    ("Footer (y=220-263)", (220, 263)),
]

for name, (y1, y2) in bands:
    crop = img.crop((0, y1, img.size[0], y2))
    
    # Upscale 4x
    scale = 4
    crop_large = crop.resize((crop.size[0]*scale, crop.size[1]*scale), Image.LANCZOS)
    
    # Enhance contrast
    enhancer = ImageEnhance.Contrast(crop_large)
    crop_contrast = enhancer.enhance(3.0)
    
    # Enhance sharpness
    enhancer = ImageEnhance.Sharpness(crop_contrast)
    crop_sharp = enhancer.enhance(2.0)
    
    # Convert to grayscale
    crop_gray = crop_sharp.convert('L')
    
    # Invert (white background)
    crop_inverted = ImageOps.invert(crop_gray)
    
    # Save for reference
    crop_inverted.save(f'/home/z/my-project/upload/band_{y1}_{y2}.png')
    
    # OCR with multiple PSM modes
    print(f"\n{'='*60}")
    print(f"BAND: {name}")
    print(f"{'='*60}")
    
    for psm in [6, 7, 11, 13]:
        try:
            text = pytesseract.image_to_string(crop_inverted, lang='spa+eng', config=f'--psm {psm} --oem 3')
            text = text.strip()
            if text:
                print(f"  PSM {psm}: {text}")
        except:
            pass
    
    # Also try word-level detailed OCR
    try:
        data = pytesseract.image_to_data(crop_inverted, lang='spa+eng', output_type=pytesseract.Output.DICT, config='--oem 3')
        words = []
        for i in range(len(data['text'])):
            if data['text'][i].strip() and data['conf'][i] > 30:
                x = data['left'][i] // scale
                y = data['top'][i] // scale + y1
                w = data['width'][i] // scale
                h = data['height'][i] // scale
                words.append(f"'{data['text'][i]}' (conf:{data['conf'][i]:.0f}, pos:[{x},{y}] size:{w}x{h})")
        if words:
            print(f"  DETAILED WORDS: {' | '.join(words)}")
    except:
        pass

# Also try the full image with heavy preprocessing
print("\n" + "=" * 80)
print("FULL IMAGE - HEAVY PREPROCESSING")
print("=" * 80)

scale = 4
img_large = img.resize((img.size[0]*scale, img.size[1]*scale), Image.LANCZOS)
enhancer = ImageEnhance.Contrast(img_large)
img_contrast = enhancer.enhance(4.0)
enhancer = ImageEnhance.Sharpness(img_contrast)
img_sharp = enhancer.enhance(3.0)
img_gray = img_sharp.convert('L')
img_inverted = ImageOps.invert(img_gray)
img_inverted.save('/home/z/my-project/upload/full_enhanced.png')

for psm in [4, 6, 11, 12]:
    text = pytesseract.image_to_string(img_inverted, lang='spa+eng', config=f'--psm {psm} --oem 3')
    text = text.strip()
    if text:
        print(f"  PSM {psm}:\n{text}")
