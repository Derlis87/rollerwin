#!/usr/bin/env python3
"""
Analisis profundo de rachas con los 3,920 numeros reales.
Verifica si la logica del motor v4.4 coincide con los resultados reales.
"""

import re
from collections import Counter, defaultdict

RED_SET = set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

def get_color(n):
    if n == 0: return 'green'
    return 'red' if n in RED_SET else 'black'

# Parse the full number sequence from analyze_sequence.py
raw = open('/home/z/my-project/download/analyze_sequence.py').read()
start = raw.find('raw = """') + 8
end = raw.find('"""', start)
numbers_raw = raw[start:end]
cleaned = numbers_raw.replace('\n', ' ').replace('\t', ' ')
cleaned = re.sub(r'(\d)\s+(\d)', r'\1, \2', cleaned)
cleaned = cleaned.strip().rstrip(',').rstrip('.').strip()
parts = [x.strip() for x in cleaned.split(',') if x.strip().isdigit()]
nums = [int(x) for x in parts]
print(f"Total numeros parseados: {len(nums)}")
print(f"Rango: {min(nums)} a {max(nums)}")

# Color distribution
colors = [get_color(n) for n in nums]
color_counts = Counter(colors)
print(f"\nDistribucion de colores:")
print(f"  Rojo:   {color_counts['red']:>5} ({color_counts['red']/len(nums)*100:.1f}%)")
print(f"  Negro:  {color_counts['black']:>5} ({color_counts['black']/len(nums)*100:.1f}%)")
print(f"  Verde:  {color_counts['green']:>5} ({color_counts['green']/len(nums)*100:.1f}%)")

# Filter out green for streak analysis
color_seq = [c for c in colors if c != 'green']
print(f"\nSecuencia sin verdes: {len(color_seq)} spins")

# ============================================================
# PART 1: STREAK LENGTH DISTRIBUTION
# ============================================================
print("\n" + "="*70)
print("PARTE 1: DISTRIBUCION DE LONGITUD DE RACHAS")
print("(Cada racha = grupo de colores consecutivos iguales)")
print("="*70)

streaks = []
current_len = 1
for i in range(1, len(color_seq)):
    if color_seq[i] == color_seq[i-1]:
        current_len += 1
    else:
        streaks.append((color_seq[i-1], current_len))
        current_len = 1
streaks.append((color_seq[-1], current_len))

streak_counts = Counter([s[1] for s in streaks])
total_streaks = len(streaks)
print(f"\nTotal rachas (cambios de color): {total_streaks}")
print(f"Longitud promedio: {sum(s[1] for s in streaks)/total_streaks:.2f}")
print(f"\n{'Longitud':>10} | {'Cantidad':>8} | {'Porcentaje':>10} | {'Acumulado':>10}")
print("-"*55)
cumulative = 0
for length in range(1, max(streak_counts.keys())+1):
    count = streak_counts.get(length, 0)
    pct = (count / total_streaks) * 100
    cumulative += pct
    marker = " <<<" if length >= 3 else ""
    print(f"{length:>10} | {count:>8} | {pct:>9.1f}% | {cumulative:>9.1f}%{marker}")

# Specific stats user cares about
for threshold in [2, 3, 4, 5, 6]:
    count = sum(1 for s in streaks if s[1] >= threshold)
    print(f"\nRachas >= {threshold}: {count} ({count/total_streaks*100:.1f}%)")

red_long = [s for s in streaks if s[0]=='red' and s[1]>=3]
black_long = [s for s in streaks if s[0]=='black' and s[1]>=3]
print(f"\nRachas largas (3+) por color:")
print(f"  Rojas:  {len(red_long)} ({len(red_long)/len([s for s in streaks if s[0]=='red'])*100:.1f}% de todas las rojas)")
print(f"  Negras: {len(black_long)} ({len(black_long)/len([s for s in streaks if s[0]=='black'])*100:.1f}% de todas las negras)")

# Show some examples of 3+ streaks
print(f"\nEjemplos de rachas de 3+ (primeras 15):")
long_streaks = [s for s in streaks if s[1] >= 3]
for s in long_streaks[:15]:
    print(f"  {s[0]} x{s[1]}")

# ============================================================
# PART 2: BREAK PROBABILITY AFTER N CONSECUTIVE SAME COLOR
# ============================================================
print("\n" + "="*70)
print("PARTE 2: PROBABILIDAD DE ROMPER DESPUES DE N CONSECUTIVOS")
print("(Lo que el motor postStreakAnalysis calcula)")
print("="*70)

# For each streak length, what's the probability of breaking vs continuing?
# "After seeing N consecutive same-color, what happens on the NEXT spin?"
break_stats = defaultdict(lambda: {'breaks': 0, 'continues': 0})

i = 0
while i < len(color_seq):
    # Find streak starting at i
    color = color_seq[i]
    j = i
    while j < len(color_seq) and color_seq[j] == color:
        j += 1
    streak_len = j - i
    
    # At each point during the streak, record what happens next
    for pos in range(1, streak_len + 1):
        next_idx = i + pos  # index of the next spin after `pos` same-color results
        if next_idx < len(color_seq):
            if color_seq[next_idx] != color:
                break_stats[pos]['breaks'] += 1
            else:
                break_stats[pos]['continues'] += 1
    
    i = j

print(f"\n{'Despues de':>12} | {'Rompe':>8} | {'Continua':>9} | {'Total':>6} | {'% Rompe':>9} | '% Cont'")
print("-"*65)
for pos in sorted(break_stats.keys()):
    r = break_stats[pos]
    total = r['breaks'] + r['continues']
    if total > 0:
        bp = (r['breaks'] / total) * 100
        cp = (r['continues'] / total) * 100
        note = ""
        if pos == 2 and bp < 50: note = " <<< v4.4 SOFT: NO debe empujar opuesto"
        if pos == 3 and bp < 50: note = " <<< v4.4 MEDIUM: NEUTRO"
        if pos == 4 and bp < 50: note = " <<< v4.4 STRONG: NEUTRO"
        if pos >= 5 and bp < 50: note = " <<< v4.4 ULTRA: NEUTRO"
        print(f"{pos:>9} seguidos | {r['breaks']:>8} | {r['continues']:>9} | {total:>6} | {bp:>8.1f}% | {cp:>7.1f}%{note}")

# ============================================================
# PART 3: THEORETICAL vs ACTUAL
# ============================================================
print("\n" + "="*70)
print("PARTE 3: TEORIA vs REALIDAD")
print("="*70)

p_same = 18/37
p_break = 19/37

print(f"\nP(mismo color) = 18/37 = {p_same*100:.2f}%")
print(f"P(color diferente) = 19/37 = {p_break*100:.2f}%")
print(f"\n{'Racha >= N':>10} | {'Teorico':>10} | {'Real':>10} | {'Diff':>8}")
print("-"*45)
for n in range(1, 12):
    theoretical = (p_same ** (n-1)) * 100
    actual = sum(1 for s in streaks if s[1] >= n) / len(streaks) * 100
    diff = actual - theoretical
    print(f"{n:>10} | {theoretical:>9.1f}% | {actual:>9.1f}% | {diff:>+7.1f}%")

# ============================================================
# PART 4: SIMULATION OF v4.4 ENGINE LOGIC
# ============================================================
print("\n" + "="*70)
print("PARTE 4: SIMULACION DE LA LOGICA v4.4")
print("="*70)

def simulate_post_streak_analysis(color_history, current_streak_len):
    """Exact replica of v4.4 postStreakAnalysis"""
    if len(color_history) < 10:
        return 50
    
    breaks = 0
    total = 0
    for i in range(current_streak_len, len(color_history)):
        last_color = color_history[i-1]
        all_same = True
        for j in range(1, current_streak_len):
            if i - 1 - j < 0 or color_history[i-1-j] != last_color:
                all_same = False
                break
        if all_same:
            total += 1
            if color_history[i] != last_color:
                breaks += 1
    
    if total >= 5:
        return round((breaks / total) * 100)
    return 50

# Simulate engine at each decision point
mode_stats = defaultdict(lambda: {'total': 0, 'correct': 0, 'wrong': 0, 
                                   'pred_opp': 0, 'opp_hit': 0, 'opp_miss': 0,
                                   'pred_same': 0, 'same_hit': 0, 'same_miss': 0,
                                   'avg_bp': []})

for i in range(10, len(color_seq)):
    # Calculate current streak ending at position i-1 (predicting spin i)
    streak = 1
    for j in range(i-1, max(i-20, -1), -1):
        if color_seq[j] == color_seq[i-1]:
            streak += 1
        else:
            break
    
    if streak < 2:
        # NORMAL mode - skip for streak analysis
        continue
    
    streak_color = color_seq[i-1]
    opposite = 'black' if streak_color == 'red' else 'red'
    
    # Run postStreakAnalysis with history up to i-1
    history = color_seq[:i]
    bp = simulate_post_streak_analysis(history, streak)
    
    # Determine engine action
    push_opposite = bp >= 50  # This is the v4.4 logic
    
    # What actually happened
    actual = color_seq[i]
    actual_broke = actual != streak_color
    
    mode = 'NORMAL'
    if streak >= 5: mode = 'ULTRA'
    elif streak == 4: mode = 'STRONG'
    elif streak == 3: mode = 'MEDIUM'
    elif streak == 2: mode = 'SOFT'
    
    r = mode_stats[mode]
    r['total'] += 1
    r['avg_bp'].append(bp)
    
    if push_opposite:
        r['pred_opp'] += 1
        if actual_broke:
            r['opp_hit'] += 1
            r['correct'] += 1
        else:
            r['opp_miss'] += 1
            r['wrong'] += 1
    else:
        r['pred_same'] += 1
        if not actual_broke:
            r['same_hit'] += 1
            r['correct'] += 1
        else:
            r['same_miss'] += 1
            r['wrong'] += 1

print(f"\n{'Modo':>8} | {'Casos':>6} | {'Pred Opp':>8} | {'Opp Hit':>7} | {'Opp Miss':>8} | {'Pred Same':>9} | {'Same Hit':>8} | {'Same Miss':>9} | {'Accuracy':>9} | {'Avg BP':>7}")
print("-"*110)

total_c = 0
total_w = 0
for mode in ['SOFT', 'MEDIUM', 'STRONG', 'ULTRA']:
    r = mode_stats[mode]
    if r['total'] == 0: continue
    total_c += r['correct']
    total_w += r['wrong']
    acc = (r['correct']/r['total'])*100
    avg_bp = sum(r['avg_bp'])/len(r['avg_bp']) if r['avg_bp'] else 50
    print(f"{mode:>8} | {r['total']:>6} | {r['pred_opp']:>8} | {r['opp_hit']:>7} | {r['opp_miss']:>8} | {r['pred_same']:>9} | {r['same_hit']:>8} | {r['same_miss']:>9} | {acc:>8.1f}% | {avg_bp:>6.1f}%")

print("-"*110)
grand_total = total_c + total_w
if grand_total > 0:
    print(f"{'TOTAL':>8} | {grand_total:>6} |          |          |          |            |           |            | {(total_c/grand_total)*100:>8.1f}% |")

# ============================================================
# PART 5: WHAT IF WE ALWAYS PREDICTED OPPOSITE?
# ============================================================
print("\n" + "="*70)
print("PARTE 5: ALTERNATIVAS - Que pasaria si...?")
print("="*70)

alt_stats = defaultdict(lambda: {'total': 0, 'correct': 0})

for i in range(10, len(color_seq)):
    streak = 1
    for j in range(i-1, max(i-20, -1), -1):
        if color_seq[j] == color_seq[i-1]:
            streak += 1
        else:
            break
    
    if streak < 2: continue
    
    streak_color = color_seq[i-1]
    actual = color_seq[i]
    actual_broke = actual != streak_color
    
    mode = 'NORMAL'
    if streak >= 5: mode = 'ULTRA'
    elif streak == 4: mode = 'STRONG'
    elif streak == 3: mode = 'MEDIUM'
    elif streak == 2: mode = 'SOFT'
    
    # Strategy 1: Always predict opposite
    r1 = alt_stats[f'SIEMPRE_OPUESTO_{mode}']
    r1['total'] += 1
    if actual_broke: r1['correct'] += 1
    
    # Strategy 2: Always predict same color (streak continues)
    r2 = alt_stats[f'SIEMPRE_MISMO_{mode}']
    r2['total'] += 1
    if not actual_broke: r2['correct'] += 1
    
    # Strategy 3: Random (50%)
    r3 = alt_stats[f'ALEATORIO_{mode}']
    r3['total'] += 1

print(f"\n{'Estrategia':>25} | {'SOFT':>8} | {'MEDIUM':>8} | {'STRONG':>8} | {'ULTRA':>8} | {'TOTAL':>8}")
print("-"*80)

for strategy_prefix in ['SIEMPRE_OPUESTO', 'SIEMPRE_MISMO', 'ALEATORIO']:
    row = f"{strategy_prefix:>25} |"
    tc = 0; tt = 0
    for mode in ['SOFT', 'MEDIUM', 'STRONG', 'ULTRA']:
        r = alt_stats[f'{strategy_prefix}_{mode}']
        if r['total'] > 0:
            acc = (r['correct']/r['total'])*100
            row += f" {acc:>7.1f}% |"
        else:
            row += f"     N/A |"
        tc += r['correct']
        tt += r['total']
    if tt > 0:
        row += f" {(tc/tt)*100:>7.1f}% |"
    else:
        row += f"     N/A |"
    print(row)

# ============================================================
# PART 6: FREQUENCY OF SEEING LONG STREAKS IN RECENT HISTORY
# ============================================================
print("\n" + "="*70)
print("PARTE 6: QUE VE EL USUARIO - Frecuencia de rachas visibles")
print("(Simula lo que el usuario ve en la interfaz)")
print("="*70)

# User sees last N results. How often do they see a streak of 3+?
for window in [5, 8, 10, 15]:
    count_3plus = 0
    count_4plus = 0
    count_5plus = 0
    total_w = len(color_seq) - window + 1
    
    for start in range(total_w):
        w = color_seq[start:start+window]
        max_run = 1
        run = 1
        for j in range(1, len(w)):
            if w[j] == w[j-1]:
                run += 1
                max_run = max(max_run, run)
            else:
                run = 1
        if max_run >= 3: count_3plus += 1
        if max_run >= 4: count_4plus += 1
        if max_run >= 5: count_5plus += 1
    
    print(f"\nVentana de {window} spins ({total_w} ventanas):")
    print(f"  Contiene racha 3+: {count_3plus:>5} ({count_3plus/total_w*100:>5.1f}%)")
    print(f"  Contiene racha 4+: {count_4plus:>5} ({count_4plus/total_w*100:>5.1f}%)")
    print(f"  Contiene racha 5+: {count_5plus:>5} ({count_5plus/total_w*100:>5.1f}%)")

# ============================================================
# PART 7: DETAILED BREAK ANALYSIS per exact streak length
# ============================================================
print("\n" + "="*70)
print("PARTE 7: ANALISIS DETALLADO - Para CADA longitud exacta de racha")
print("="*70)

# Group all streaks by exact length
by_length = defaultdict(list)
for color, length in streaks:
    by_length[length].append(color)

print(f"\n{'Longitud':>8} | {'Total':>6} | {'Rojos':>6} | {'Negros':>7} | {'% del Total':>10} | {'% Rompe':>9}")
print("-"*60)

# For each streak length, what % of the time did the NEXT spin break it?
for length in sorted(by_length.keys()):
    items = by_length[length]
    total = len(items)
    reds = sum(1 for c in items if c == 'red')
    blacks = total - reds
    pct = total / len(streaks) * 100
    
    # The streak of this length = it DID break at this length
    # (because we're counting completed streaks)
    # So break% = 100% by definition in this counting method
    
    # Let's instead count: after N same-color, does the (N+1)th break?
    # That's Part 2's data. Let me just reference it.
    
    bp_data = break_stats.get(length, None)
    bp_str = f"{bp_data['breaks']/(bp_data['breaks']+bp_data['continues'])*100:.1f}%" if bp_data and (bp_data['breaks']+bp_data['continues']) > 0 else "N/A"
    
    print(f"{length:>8} | {total:>6} | {reds:>6} | {blacks:>7} | {pct:>9.1f}% | {bp_str:>9}")

# ============================================================
# CONCLUSION
# ============================================================
print("\n" + "="*70)
print("RESUMEN EJECUTIVO")
print("="*70)

print(f"""
DATOS: {len(nums)} numeros, {len(color_seq)} spins sin verde
RACHAS: {total_streaks} rachas totales, promedio {sum(s[1] for s in streaks)/total_streaks:.2f} por racha

HECHOS CLAVE:
1. Rachas de 3+ ocurren {sum(1 for s in streaks if s[1]>=3)} veces ({sum(1 for s in streaks if s[1]>=3)/total_streaks*100:.1f}%)
2. Rachas de 4+ ocurren {sum(1 for s in streaks if s[1]>=4)} veces ({sum(1 for s in streaks if s[1]>=4)/total_streaks*100:.1f}%)
3. Rachas de 5+ ocurren {sum(1 for s in streaks if s[1]>=5)} veces ({sum(1 for s in streaks if s[1]>=5)/total_streaks*100:.1f}%)
4. En cualquier ventana de 10 spins, hay racha 3+ en {count_3plus}/{total_w} = {count_3plus/total_w*100:.1f}%
5. Esto significa el usuario VE rachas largas frecuentemente aunque sean normales

PROBABILIDAD DE ROMPER (lo que calcula postStreakAnalysis):
""")

for pos in [2, 3, 4, 5, 6]:
    bp_data = break_stats.get(pos, None)
    if bp_data and (bp_data['breaks']+bp_data['continues']) > 0:
        total = bp_data['breaks'] + bp_data['continues']
        bp = (bp_data['breaks'] / total) * 100
        print(f"  Despues de {pos} seguidos: {bp:.1f}% rompe, {100-bp:.1f}% continua ({total} casos)")

