#!/usr/bin/env python3
"""
Simulación del motor v4.3 CORREGIDO con los 3923 números reales.
Compara v4.2 vs v4.3 para verificar la mejora.
"""

import re
from collections import Counter

RED_SET = set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

def get_color(n):
    if n == 0: return 'green'
    return 'red' if n in RED_SET else 'black'

# Parse numbers (same as before)
raw = open('/home/z/my-project/download/analyze_sequence.py').read()
# Extract the raw string from the script
import re as re_mod
match = re_mod.search(r'raw = """(.+?)"""', raw, re_mod.DOTALL)
if match:
    raw = match.group(1)
else:
    # Fallback: read from the same source
    raw = open('/home/z/my-project/download/analyze_sequence.py').read()
    start = raw.find('raw = """') + 8
    end = raw.find('"""', start)
    raw = raw[start:end]

cleaned = raw.replace('\n', ' ').replace('\t', ' ')
cleaned = re.sub(r'(\d)\s+(\d)', r'\1, \2', cleaned)
cleaned = re.sub(r'(\d),(\d)', r'\1, \2', cleaned)
cleaned = cleaned.replace('.', ',')
cleaned = re.sub(r',\s*,', ', ', cleaned)
cleaned = re.sub(r'\s+', ' ', cleaned).strip()

parts = [p.strip() for p in cleaned.split(',') if p.strip()]
nums = []
for p in parts:
    try:
        n = int(p)
        if 0 <= n <= 36:
            nums.append(n)
    except ValueError:
        pass

print(f"Total números parseados: {len(nums)}")

WHEEL_LAYOUT = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
WHEEL_INDEX = {n: i for i, n in enumerate(WHEEL_LAYOUT)}

# ─── v4.2 postStreakAnalysis (BUGGY) ───
def v42_post_streak(nz_colors, currentStreak):
    all_streaks = []
    breaks = []
    sLen = 1
    for i in range(1, len(nz_colors)):
        if nz_colors[i] == nz_colors[i-1]:
            sLen += 1
        else:
            all_streaks.append(sLen)
            breaks.append((sLen, True))
            sLen = 1
    all_streaks.append(sLen)
    breaks.append((sLen, False))
    
    avg_len = sum(all_streaks) / len(all_streaks) if all_streaks else 2.5
    
    reached = [(sl, b) for sl, b in breaks if b and sl >= currentStreak]
    if len(reached) >= 2:
        broke_at = sum(1 for sl, _ in reached if sl == currentStreak)
        survived = sum(1 for sl, _ in reached if sl > currentStreak)
        total = broke_at + survived
        if total > 0:
            all_completed = [sl for sl, b in breaks if b]
            total_b = len(all_completed) or 1
            overall = sum(1 for sl in all_completed if sl <= currentStreak) / total_b * 100
            specific = broke_at / total * 100
            blended = round(specific * 0.7 + overall * 0.3)
            return blended, avg_len
    return 55, avg_len

# ─── v4.3 postStreakAnalysis (CORRECTED) ───
def v43_post_streak(nz_colors, currentStreak):
    all_streaks = []
    sLen = 1
    for i in range(1, len(nz_colors)):
        if nz_colors[i] == nz_colors[i-1]:
            sLen += 1
        else:
            all_streaks.append(sLen)
            sLen = 1
    all_streaks.append(sLen)
    avg_len = sum(all_streaks) / len(all_streaks) if all_streaks else 2.5
    
    breaks = 0
    total = 0
    for i in range(currentStreak, len(nz_colors)):
        last_color = nz_colors[i - 1]
        all_same = True
        for j in range(1, currentStreak):
            if nz_colors[i - 1 - j] != last_color:
                all_same = False
                break
        if all_same:
            total += 1
            if nz_colors[i] != last_color:
                breaks += 1
    
    if total >= 5:
        bp = (breaks / total) * 100
        return round(bp), avg_len
    return 50, avg_len

# ─── v4.3 Simulation ───
def simulate_v43(history):
    if len(history) < 5:
        return 'black', 50, 'normal', 0, 50
    
    nz = [n for n in history if n != 0]
    nz_colors = [get_color(n) for n in nz]
    
    # Calculate streak
    max_r, max_b = 0, 0
    for c in nz_colors:
        if c == 'red': max_r += 1; max_b = 0
        elif c == 'black': max_b += 1; max_r = 0
    
    current_streak = max(max_r, max_b)
    streak_color = 'red' if max_r > max_b else 'black'
    opposite_color = 'black' if max_r > max_b else 'red'
    
    breakPct, avgStreakLen = v43_post_streak(nz_colors, current_streak)
    avgBoost = (current_streak - avgStreakLen) * 10 if current_streak > avgStreakLen else 0
    
    shouldPush = breakPct >= 50
    baseForce = 35 if current_streak <= 3 else 45
    lengthBonus = max(0, current_streak - 3) * 10
    probBonus = (breakPct - 50) * 1.0 if breakPct >= 50 else 0
    force = baseForce + lengthBonus + probBonus + avgBoost
    
    red_score = 0
    black_score = 0
    
    # Pre-streak multi-window frequency
    def pre_streak_freq(streak_len):
        scores = {'red': 0, 'black': 0}
        before = nz[:-(streak_len)] if streak_len <= len(nz) else []
        if len(before) < 5:
            return scores
        for w, wi in [(10, 1.5), (20, 2.5)]:
            slice_d = before[-w:] if len(before) >= w else before
            stotal = len(slice_d) or 1
            for c in ['red', 'black']:
                freq = sum(1 for n in slice_d if get_color(n) == c)
                score = freq * wi
                actual = (freq / stotal) * 100
                score += (50 - actual) * wi * 0.5
                scores[c] += score
        return scores
    
    if current_streak >= 5:  # ULTRA
        if shouldPush:
            if opposite_color == 'red': red_score += force; black_score -= force * 0.3
            else: black_score += force; red_score -= force * 0.3
        # NO nudge when neutral
        pf = pre_streak_freq(current_streak)
        red_score += pf['red']; black_score += pf['black']
        mode = 'ULTRA'
    elif current_streak == 4:  # STRONG
        if shouldPush:
            if opposite_color == 'red': red_score += force; black_score -= force * 0.5
            else: black_score += force; red_score -= force * 0.5
        # NO nudge when neutral
        pf = pre_streak_freq(4)
        red_score += pf['red']; black_score += pf['black']
        mode = 'STRONG'
    elif current_streak == 3:  # MEDIUM
        if shouldPush:
            if opposite_color == 'red': red_score += force; black_score -= force * 0.5
            else: black_score += force; red_score -= force * 0.5
        pf = pre_streak_freq(3)
        red_score += pf['red']; black_score += pf['black']
        mode = 'MEDIUM'
    elif current_streak == 2:  # SOFT (unchanged from v4.2)
        last10 = nz[-10:]
        freqs = {'red': 0, 'black': 0}
        for n in last10:
            c = get_color(n)
            if c in freqs: freqs[c] += 1
        red_score = freqs['red'] * 1.5
        black_score = freqs['black'] * 1.5
        if opposite_color == 'red':
            red_score += 30; black_score -= 18
        else:
            black_score += 30; red_score -= 18
        red_score += 6 if streak_color != 'red' else -6
        black_score += 6 if streak_color != 'black' else -6
        mode = 'SOFT'
    else:  # NORMAL
        windows = [5, 10, 20, 37]
        weights_w = [1, 1.5, 2.5, 3]
        for w_idx, w in enumerate(windows):
            slice_data = nz[-w:] if len(nz) >= w else nz
            stotal = len(slice_data) or 1
            for c in ['red', 'black']:
                freq = sum(1 for n in slice_data if get_color(n) == c)
                score = freq * weights_w[w_idx]
                actual_pct = (freq / stotal) * 100
                score += (50 - actual_pct) * weights_w[w_idx] * 0.6
                if c == 'red': red_score += score
                else: black_score += score
        # Markov-2
        if len(nz) >= 2:
            trans = {}
            for i in range(2, len(nz)):
                c0 = get_color(nz[i-2]); c1 = get_color(nz[i-1]); c2 = get_color(nz[i])
                if c0 in ('red', 'black') and c1 in ('red', 'black') and c2 in ('red', 'black'):
                    if c0 not in trans: trans[c0] = {}
                    if c1 not in trans[c0]: trans[c0][c1] = {}
                    if c2 not in trans[c0][c1]: trans[c0][c1][c2] = 0
                    trans[c0][c1][c2] += 1
            last_c0 = get_color(nz[-2]); last_c1 = get_color(nz[-1])
            if last_c0 in trans and last_c1 in trans[last_c0]:
                tr = trans[last_c0][last_c1]
                total_m = sum(tr.values())
                if total_m > 0:
                    red_score += (tr.get('red', 0) / total_m) * 100 * 2.5
                    black_score += (tr.get('black', 0) / total_m) * 100 * 2.5
        mode = 'NORMAL'
    
    prediction = 'red' if red_score > black_score else ('black' if black_score > red_score else 'black')
    return prediction, abs(red_score - black_score), mode, current_streak, breakPct

# ─── Run v4.3 simulation ───
print("=" * 80)
print("SIMULACIÓN v4.3 — RESULTADOS")
print("=" * 80)

correct = 0
wrong = 0
total = 0
mode_stats = {'NORMAL': [0, 0], 'SOFT': [0, 0], 'MEDIUM': [0, 0], 'STRONG': [0, 0], 'ULTRA': [0, 0]}
streak_errors = []

for i in range(20, len(nums)):
    history = nums[:i]
    actual = get_color(nums[i])
    if actual == 'green':
        continue
    
    predicted, score, mode, streak_len, bp = simulate_v43(history)
    total += 1
    
    if predicted == actual:
        correct += 1
        mode_stats[mode][0] += 1
    else:
        wrong += 1
        mode_stats[mode][1] += 1
        if streak_len >= 3:
            streak_errors.append((i, actual, predicted, mode, streak_len, bp))

accuracy = correct / total * 100 if total > 0 else 0

print(f"\nTotal predicciones: {total}")
print(f"Correctas: {correct} ({accuracy:.1f}%)")
print(f"Incorrectas: {wrong} ({100-accuracy:.1f}%)")

print(f"\n--- PRECISIÓN POR MODO v4.3 ---")
for mode, (hits, misses) in sorted(mode_stats.items()):
    t = hits + misses
    pct = hits / t * 100 if t > 0 else 0
    print(f"  {mode:8s}: {hits:4d}/{t:4d} ({pct:.1f}%)")

# Compare with v4.2
print(f"\n--- COMPARACIÓN v4.2 vs v4.3 ---")
v42_results = {
    'NORMAL': (941, 1916, 49.1),
    'SOFT': (498, 962, 51.8),
    'MEDIUM': (237, 464, 51.1),
    'STRONG': (124, 227, 54.6),
    'ULTRA': (103, 220, 46.8),
}

print(f"\n{'Modo':10s} | {'v4.2 Acc':>8s} | {'v4.3 Acc':>8s} | {'Cambio':>8s}")
print(f"{'-'*45}")
for mode in ['NORMAL', 'SOFT', 'MEDIUM', 'STRONG', 'ULTRA']:
    v42_pct = v42_results[mode][2]
    v43_h, v43_m = mode_stats[mode]
    v43_t = v43_h + v43_m
    v43_pct = v43_h / v43_t * 100 if v43_t > 0 else 0
    delta = v43_pct - v42_pct
    arrow = '↑' if delta > 0 else ('↓' if delta < 0 else '=')
    print(f"{mode:10s} | {v42_pct:7.1f}% | {v43_pct:7.1f}% | {arrow} {delta:+.1f}%")

v42_total = (941 + 498 + 237 + 124 + 103)
v42_total_preds = (1916 + 962 + 464 + 227 + 220)
v42_global = v42_total / v42_total_preds * 100
v43_global = accuracy
delta_global = v43_global - v42_global
arrow = '↑' if delta_global > 0 else ('↓' if delta_global < 0 else '=')
print(f"{'GLOBAL':10s} | {v42_global:7.1f}% | {v43_global:7.1f}% | {arrow} {delta_global:+.1f}%")

# Show breakPct comparison
print(f"\n--- BREAKPCT: v4.2 (buggy) vs v4.3 (correct) ---")
nz_full = [n for n in nums if n != 0]
nz_colors_full = [get_color(n) for n in nz_full]
for streak_len in [3, 4, 5, 6]:
    v42_bp, _ = v42_post_streak(nz_colors_full, streak_len)
    v43_bp, _ = v43_post_streak(nz_colors_full, streak_len)
    print(f"  Streak {streak_len}: v4.2={v42_bp:5.1f}% | v4.3={v43_bp:5.1f}% | diff={v42_bp - v43_bp:+.1f}%")

# Show ULTRA errors detail
print(f"\n--- ERRORES ULTRA v4.3 (streak >= 5) ---")
ultra_errors = [e for e in streak_errors if e[3] == 'ULTRA']
print(f"Total errores ULTRA: {len(ultra_errors)}")
for err in ultra_errors[:10]:
    print(f"  Spin {err[0]:4d}: pred={err[2]:5s}, real={err[1]:5s}, streak={err[4]}, bp={err[5]:.0f}%")

print(f"\n--- FIN ---")
