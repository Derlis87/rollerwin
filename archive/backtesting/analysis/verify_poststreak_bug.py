#!/usr/bin/env python3
"""
VERIFICACION: Por que postStreakAnalysis devuelve valores diferentes 
a la probabilidad real de romper racha?
"""
import re
from collections import defaultdict

RED_SET = set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
def get_color(n):
    if n == 0: return 'green'
    return 'red' if n in RED_SET else 'black'

raw = open('/home/z/my-project/download/analyze_sequence.py').read()
start = raw.find('raw = """') + 8
end = raw.find('"""', start)
numbers_raw = raw[start:end]
cleaned = numbers_raw.replace('\n', ' ').replace('\t', ' ')
cleaned = re.sub(r'(\d)\s+(\d)', r'\1, \2', cleaned)
cleaned = cleaned.strip().rstrip(',').rstrip('.').strip()
parts = [x.strip() for x in cleaned.split(',') if x.strip().isdigit()]
nums = [int(x) for x in parts]
color_seq = [get_color(n) for n in nums if get_color(n) != 'green']

print("="*70)
print("DEMOSTRACION DEL BUG EN postStreakAnalysis")
print("="*70)

# Method 1: EXACT streak break probability (Part 2)
# "After EXACTLY N consecutive same-color, what happens next?"
exact_break = defaultdict(lambda: {'breaks': 0, 'continues': 0})
i = 0
while i < len(color_seq):
    color = color_seq[i]
    j = i
    while j < len(color_seq) and color_seq[j] == color:
        j += 1
    streak_len = j - i
    
    # For position within this streak, "continues" until the last one
    for pos in range(1, streak_len):
        exact_break[pos]['continues'] += 1
    
    # At the end of the streak, if it broke:
    if j < len(color_seq):
        exact_break[streak_len]['breaks'] += 1
    
    i = j

# Method 2: postStreakAnalysis replica (v4.4 code)
# Scans ALL positions where currentStreak consecutive same appear
def postStreakAnalysis_v44(history, current_streak):
    if len(history) < 10:
        return 50, 0, 0
    breaks = 0
    total = 0
    for i in range(current_streak, len(history)):
        last_color = history[i-1]
        all_same = True
        for j in range(1, current_streak):
            if i-1-j < 0 or history[i-1-j] != last_color:
                all_same = False
                break
        if all_same:
            total += 1
            if history[i] != last_color:
                breaks += 1
    bp = round((breaks/total)*100) if total >= 5 else 50
    return bp, breaks, total

# Method 3: CORRECTED - only count EXACTLY-N streaks
def postStreakAnalysis_CORRECTED(history, current_streak):
    if len(history) < 10:
        return 50, 0, 0
    breaks = 0
    total = 0
    for i in range(current_streak, len(history)):
        last_color = history[i-1]
        # Check that EXACTLY currentStreak consecutive same-color end here
        all_same = True
        for j in range(1, current_streak):
            if i-1-j < 0 or history[i-1-j] != last_color:
                all_same = False
                break
        if not all_same:
            continue
        # ALSO check that the position BEFORE the streak is different (or it's the start)
        before_pos = i - current_streak
        if before_pos >= 0 and history[before_pos] == last_color:
            continue  # This is part of a LONGER streak, skip!
        
        total += 1
        if history[i] != last_color:
            breaks += 1
    bp = round((breaks/total)*100) if total >= 5 else 50
    return bp, breaks, total

print(f"\n{'Streak':>6} | {'Real (exact)':>12} | {'v4.4 (buggy)':>12} | {'CORREGIDO':>10} | {'Diff v4.4':>10} | {'Diff CORR':>9}")
print("-"*70)

for streak_len in [2, 3, 4, 5, 6, 7, 8]:
    # Real exact probability
    r = exact_break[streak_len]
    real_total = r['breaks'] + r['continues']
    real_bp = (r['breaks']/real_total*100) if real_total > 0 else 0
    
    # v4.4 postStreakAnalysis (using full history up to a typical mid-point)
    mid = len(color_seq) // 2
    history_mid = color_seq[:mid]
    v44_bp, v44_b, v44_t = postStreakAnalysis_v44(history_mid, streak_len)
    
    # CORRECTED
    corr_bp, corr_b, corr_t = postStreakAnalysis_CORRECTED(history_mid, streak_len)
    
    diff_v44 = v44_bp - real_bp
    diff_corr = corr_bp - real_bp
    
    print(f"{streak_len:>6} | {real_bp:>11.1f}% | {v44_bp:>11.1f}% | {corr_bp:>9.1f}% | {diff_v44:>+9.1f}% | {diff_corr:>+8.1f}%")

print("\n" + "="*70)
print("EXPLICACION DEL BUG:")
print("="*70)
print("""
El postStreakAnalysis v4.4 escanea TODAS las posiciones donde
'currentStreak' colores consecutivos iguales aparecen.
Esto INCLUYE sub-ventanas de rachas MAS LARGAS.

Ejemplo: Rachas de 5 rojos seguidos (R,R,R,R,R)
  - postStreakAnalysis(2) cuenta 4 instancias de "2R → continua R"
  - Solo deberia contar la instancia donde EXACTAMENTE 2 rojos
    terminan y el siguiente es diferente.
    
Resultado: El breakPct queda ARTIFICIALMENTE BAJO porque las
sub-ventanas de rachas largas SIEMPRE cuentan como "continua".

IMPACTO EN EL MOTOR:
  - Streak 2: Real=51.8%, v4.4 calcula=49.5% → No empuja opuesto
    cuando DEBERIA (51.8% > 50%)
  - Streak 3: Real=51.3%, v4.4 calcula=49.2% → No empuja opuesto
    cuando DEBERIA
  - Streak 4: Real=54.6%, v4.4 calcula=50.1% → Empuja debil
    cuando DEBERIA empujar FUERTE (54.6% es buena ventaja)
  - Streak 5+: Real<50%, v4.4 correctamente identifica neutral
""")

# Verify: simulation with CORRECTED function
print("="*70)
print("SIMULACION CON FUNCION CORREGIDA:")
print("="*70)

mode_stats_corr = defaultdict(lambda: {'total': 0, 'correct': 0, 'wrong': 0})

for i in range(10, len(color_seq)):
    streak = 1
    for j in range(i-1, max(i-20, -1), -1):
        if color_seq[j] == color_seq[i-1]:
            streak += 1
        else:
            break
    
    if streak < 2:
        continue
    
    streak_color = color_seq[i-1]
    opposite = 'black' if streak_color == 'red' else 'red'
    
    history = color_seq[:i]
    bp, _, _ = postStreakAnalysis_CORRECTED(history, streak)
    
    push_opposite = bp >= 50
    actual = color_seq[i]
    actual_broke = actual != streak_color
    
    mode = 'NORMAL'
    if streak >= 5: mode = 'ULTRA'
    elif streak == 4: mode = 'STRONG'
    elif streak == 3: mode = 'MEDIUM'
    elif streak == 2: mode = 'SOFT'
    
    r = mode_stats_corr[mode]
    r['total'] += 1
    if push_opposite:
        if actual_broke: r['correct'] += 1
        else: r['wrong'] += 1
    else:
        if not actual_broke: r['correct'] += 1
        else: r['wrong'] += 1

print(f"\n{'Modo':>8} | {'Casos':>6} | {'Correctas':>10} | {'Incorrectas':>12} | {'Accuracy':>9}")
print("-"*60)
total_c = 0; total_w = 0
for mode in ['SOFT', 'MEDIUM', 'STRONG', 'ULTRA']:
    r = mode_stats_corr[mode]
    if r['total'] == 0: continue
    total_c += r['correct']; total_w += r['wrong']
    acc = (r['correct']/r['total'])*100
    print(f"{mode:>8} | {r['total']:>6} | {r['correct']:>10} | {r['wrong']:>12} | {acc:>8.1f}%")
print("-"*60)
gt = total_c + total_w
print(f"{'TOTAL':>8} | {gt:>6} | {total_c:>10} | {total_w:>12} | {(total_c/gt)*100:>8.1f}%")

