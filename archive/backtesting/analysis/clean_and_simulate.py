import re
import json

# Read raw sequence
with open('/home/z/my-project/download/raw-sequence-new.txt', 'r') as f:
    raw = f.read().strip()

# Step 1: Replace all whitespace (spaces, newlines, tabs) with comma
text = re.sub(r'\s+', ',', raw)

# Step 2: Replace periods with comma (e.g., "19. 16" -> "19, 16")
text = text.replace('.', ',')

# Step 3: Split by comma
parts = text.split(',')

# Step 4: Filter valid numbers (0-36)
numbers = []
for p in parts:
    p = p.strip()
    if not p:
        continue
    try:
        n = int(p)
        if 0 <= n <= 36:
            numbers.append(n)
    except ValueError:
        pass

# Step 5: Save cleaned sequence
clean_line = ', '.join(str(n) for n in numbers)
with open('/home/z/my-project/download/clean-sequence-new.txt', 'w') as f:
    f.write(clean_line + '\n')

print(f"Total numbers cleaned: {len(numbers)}")
print(f"Zeros: {numbers.count(0)}")
print(f"First 20: {numbers[:20]}")
print(f"Last 20: {numbers[-20:]}")

# Basic stats
colors = {'red': 0, 'black': 0, 'green': 0}
red_nums = {1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36}
black_nums = {2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35}
for n in numbers:
    if n == 0: colors['green'] += 1
    elif n in red_nums: colors['red'] += 1
    elif n in black_nums: colors['black'] += 1
    else: print(f"WARNING: Unknown number {n}")

print(f"\nColor distribution:")
print(f"  Red: {colors['red']} ({colors['red']/len(numbers)*100:.1f}%)")
print(f"  Black: {colors['black']} ({colors['black']/len(numbers)*100:.1f}%)")
print(f"  Green: {colors['green']} ({colors['green']/len(numbers)*100:.1f}%)")

# Check for streaks
max_streak = 0
streak = 0
prev_color = None
for n in numbers:
    if n == 0:
        continue
    c = 'red' if n in red_nums else 'black'
    if c == prev_color:
        streak += 1
    else:
        streak = 1
        prev_color = c
    if streak > max_streak:
        max_streak = streak
print(f"\nMax color streak: {max_streak}")
