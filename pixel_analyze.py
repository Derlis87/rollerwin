#!/usr/bin/env python3
"""Analyze image structure using pixel analysis and color segmentation."""

from PIL import Image
import numpy as np
from collections import Counter

image_path = '/home/z/my-project/upload/pasted_image_1780670811255.png'
img = Image.open(image_path)
img_array = np.array(img)

print(f"Image shape: {img_array.shape}")
print(f"Image size: {img.size}")
print()

# Analyze the dominant colors
pixels = img_array.reshape(-1, 3)
unique_colors = Counter([tuple(p) for p in pixels])
print("Top 30 most common colors (RGB):")
for color, count in unique_colors.most_common(30):
    r, g, b = color
    hex_color = f"#{r:02x}{g:02x}{b:02x}"
    pct = count / len(pixels) * 100
    print(f"  {hex_color} rgb({r:3d},{g:3d},{b:3d}) - {count:7d} pixels ({pct:5.2f}%)")

print("\n" + "=" * 80)

# Analyze by vertical sections (columns)
print("\nVERTICAL SECTION ANALYSIS (sampling every 5 pixels wide):")
for x in range(0, img.size[0], 5):
    col_pixels = img_array[:, x, :]
    avg_color = np.mean(col_pixels, axis=0)
    unique_col = Counter([tuple(p) for p in col_pixels])
    top_color = unique_col.most_common(1)[0]
    hex_avg = f"#{int(avg_color[0]):02x}{int(avg_color[1]):02x}{int(avg_color[2]):02x}"
    top_hex = f"#{top_color[0][0]:02x}{top_color[0][1]:02x}{top_color[0][2]:02x}"
    if top_color[1] > img.size[1] * 0.3:  # Only show dominant colors
        print(f"  x={x:3d}-{x+4:3d}: avg={hex_avg}, dominant={top_hex} ({top_color[1]:3d}/{img.size[1]} px)")

print("\n" + "=" * 80)

# Analyze by horizontal sections (rows)
print("\nHORIZONTAL SECTION ANALYSIS (sampling every 5 pixels tall):")
for y in range(0, img.size[1], 5):
    row_pixels = img_array[y, :, :]
    avg_color = np.mean(row_pixels, axis=0)
    unique_row = Counter([tuple(p) for p in row_pixels])
    top_color = unique_row.most_common(1)[0]
    hex_avg = f"#{int(avg_color[0]):02x}{int(avg_color[1]):02x}{int(avg_color[2]):02x}"
    top_hex = f"#{top_color[0][0]:02x}{top_color[0][1]:02x}{top_color[0][2]:02x}"
    print(f"  y={y:3d}-{y+4:3d}: avg={hex_avg}, dominant={top_hex} ({top_color[1]:3d}/{img.size[0]} px)")

print("\n" + "=" * 80)

# Find regions of specific colors (e.g., text regions)
# Look for dark pixels (likely text) vs light pixels (background)
dark_mask = np.all(img_array < 80, axis=2)
print(f"\nDark pixel regions (likely text/shapes): {np.sum(dark_mask)} pixels ({np.sum(dark_mask)/len(pixels)*100:.1f}%)")

# Find bounding box of dark regions per row
print("\nDark regions per horizontal band (20px bands):")
for y in range(0, img.size[1], 20):
    band = dark_mask[y:y+20, :]
    dark_cols = np.where(np.any(band, axis=0))[0]
    if len(dark_cols) > 0:
        x_start = dark_cols[0]
        x_end = dark_cols[-1]
        density = np.sum(band) / (20 * img.size[0]) * 100
        print(f"  y={y:3d}-{y+19:3d}: dark pixels from x={x_start:3d} to x={x_end:3d}, density={density:.1f}%")
    else:
        print(f"  y={y:3d}-{y+19:3d}: no dark pixels")
