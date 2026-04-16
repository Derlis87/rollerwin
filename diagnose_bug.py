#!/usr/bin/env python3
"""
Diagnóstico exacto: Simular motor v4.5 paso a paso sobre la secuencia
del usuario y mostrar QUÉ predijo el motor vs QUÉ cayó realmente.
"""

RED_SET = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}

def get_color(n):
    if n == 0:
        return 'G'
    return 'R' if n in RED_SET else 'B'

# Full sequence from user's latest screenshot
row1 = [14,13,11,1,6,12,16,9,26,2,35,28,29,35,11,26,30,5,11,33,8,9,12,25,18,24,4,8,2,28,36,2,27]
row2 = [25,29,19,0,14,6,31,34,13,4,0,19,10,31,6,16,27,5,13,24,15,6,23,13,1,0,11,34,0,32,30,36,3]
row3 = [27,35,15,0,5,11,17,6,25,34,15,20,29,11,31,15,22,34,15,15,14,4,13,32,22,32,4,8,14,15,27,18]
row4 = [24,9,12,33,6,10,1,24,13,18,4,8,2,31,27,10,8,18,27,9,14,26,34,0,5,11,12,23,21,32,1]

all_nums = row1 + row2 + row3 + row4
non_zero = [n for n in all_nums if n != 0]
colors = [get_color(n) for n in non_zero]

print(f"Total: {len(all_nums)} numeros, {len(non_zero)} no-cero")
print(f"Red: {colors.count('R')}, Black: {colors.count('B')}")
print()

# v4.5 hardcoded break probabilities
BREAK_PROBS = {2: 49.7, 3: 51.8, 4: 51.4, 5: 54.9, 6: 48.5, 7: 45.3, 8: 44.8, 9: 37.5}

def get_bp(sl):
    return BREAK_PROBS.get(sl, 50.0) if sl <= 9 else 37.5

def get_streak(color_list, up_to):
    """Get current streak at position up_to (exclusive)"""
    if up_to < 1:
        return 0, None
    streak = 1
    c = color_list[up_to - 1]
    for j in range(up_to - 2, -1, -1):
        if color_list[j] == c:
            streak += 1
        else:
            break
    return streak, c

# Simulate engine at each step from position 5 onward
# Focus on the LAST 30 entries where the user's complaint is
print("=" * 70)
print("SIMULACIÓN DEL MOTOR v4.5 - ÚLTIMOS 30 SPINS")
print("=" * 70)
print()
print(f"{'#':>4} | {'Num':>3} | {'Color':>5} | {'Streak':>6} | {'ColorR':>6} | {'Modo':>8} | {'Predice':>7} | {'Real':>5} | {'OK?':>3}")
print("-" * 70)

consecutive_wrongs = 0
max_consecutive_wrongs = 0
wrong_streaks = []

for i in range(max(0, len(non_zero) - 30), len(non_zero) - 1):
    streak_len, streak_color = get_streak(colors, i + 1)
    actual_next = colors[i + 1]
    opposite = 'B' if streak_color == 'R' else 'R'
    
    if streak_len >= 5:
        bp = get_bp(streak_len)
        if bp >= 50:  # Push opposite
            mode = "ULTRA-OPP"
            predicted = opposite
        else:  # Push same
            mode = "ULTRA-SAM"
            predicted = streak_color
    elif streak_len == 4:
        mode = "STRONG"
        bp = get_bp(4)  # 51.4%
        predicted = opposite  # Push opposite
    elif streak_len == 3:
        mode = "MEDIUM"
        bp = get_bp(3)  # 51.8%
        predicted = opposite  # Push opposite
    elif streak_len == 2:
        mode = "SOFT"
        predicted = "NEUTRAL"  # No push
    else:
        mode = "NORMAL"
        predicted = "MARKOV"
    
    if predicted in ['R', 'B']:
        correct = predicted == actual_next
        ok_str = "✓" if correct else "✗"
        if not correct:
            consecutive_wrongs += 1
            max_consecutive_wrongs = max(max_consecutive_wrongs, consecutive_wrongs)
        else:
            consecutive_wrongs = 0
    else:
        ok_str = "·"
    
    num = non_zero[i + 1]
    color_name = "RED" if actual_next == 'R' else "BLK"
    streak_name = "RED" if streak_color == 'R' else "BLK" if streak_color else "-"
    pred_name = {"R": "RED", "B": "BLK", "NEUTRAL": "NEUTR", "MARKOV": "MRKV"}.get(predicted, "?")
    
    print(f"{i+1:>4} | {num:>3} | {color_name:>5} | {streak_len:>6} | {streak_name:>6} | {mode:>8} | {pred_name:>7} | {actual_next:>5} | {ok_str:>3}")

print()
print(f"Máximas predicciones consecutivas equivocadas: {max_consecutive_wrongs}")
print()

# Now trace the SPECIFIC red streak the user is complaining about
print("=" * 70)
print("RACHA ROJA ESPECÍFICA - Lo que el usuario vio")
print("=" * 70)
print()

# Find the last long red streak
# From the end: 12(R), 23(R), 21(R), 32(R), 1(R) = streak 5
# Before that: 11(B) → breaks, 5(R), 34(R) → streak 2 of R, then 0(G) resets
# Before 0(G): 34(R)

# Let me find the exact position
for i in range(len(colors) - 1, -1, -1):
    if colors[i] == 'B':
        # Found the last Black before the final Red streak
        red_streak_start = i + 1
        red_streak_len = len(colors) - red_streak_start
        print(f"Racha Roja final: posiciones {red_streak_start+1} a {len(colors)} ({red_streak_len} rojos)")
        print(f"Números: {non_zero[red_streak_start:]}")
        print()
        break

# Trace what the engine predicted at each step of this red streak
print("Comportamiento del motor durante esta racha roja:")
print()

for j in range(red_streak_start, len(colors)):
    if j == len(colors) - 1:
        # Last number - this is what we're predicting FOR
        streak_at = j  # streak up to this point
        sl, sc = get_streak(colors, streak_at)
    else:
        continue
    
    # Actually let me trace the predictions that were made BEFORE each red fell
    pass

# Better approach: for each red number in the streak, what did the engine 
# predict BEFORE that number fell?
print("Predicción del motor ANTES de cada Rojo:")
print()

for j in range(red_streak_start, len(non_zero)):
    # What streak did the engine see before this number?
    sl, sc = get_streak(colors, j)
    if sl == 0 or j == 0:
        print(f"  Spin {j+1}: {non_zero[j]} ({colors[j]}) — primer spin, sin historia")
        continue
    
    opposite = 'B' if sc == 'R' else 'R'
    
    if sl >= 5:
        bp = get_bp(sl)
        if bp >= 50:
            mode = f"ULTRA→{opposite}"
            pred = opposite
        else:
            mode = f"ULTRA→{sc}"
            pred = sc
    elif sl == 4:
        mode = f"STRONG→{opposite}"
        pred = opposite
    elif sl == 3:
        mode = f"MEDIUM→{opposite}"
        pred = opposite
    elif sl == 2:
        mode = "SOFT(neutral)"
        pred = "neutral"
    else:
        mode = "NORMAL"
        pred = "Markov"
    
    actual = colors[j]
    correct = "✓" if pred == actual else ("✗" if pred in ['R', 'B'] else "~")
    
    color_str = "Rojo" if actual == 'R' else "Negro"
    streak_str = "Rojo" if sc == 'R' else "Negro" if sc == 'B' else "-"
    pred_str = {"R": "Rojo", "B": "Negro", "neutral": "Neutral", "Markov": "Markov"}.get(pred, pred)
    
    print(f"  Spin {j+1}: Cayó {non_zero[j]} ({color_str})")
    print(f"    → El motor veía: racha de {sl} {streak_str}")
    print(f"    → Modo: {mode}, Predicción: {pred_str} {correct}")
    print()

print("=" * 70)
print("DIAGNÓSTICO DEL BUG")
print("=" * 70)
print("""
PROBLEMA IDENTIFICADO:
━━━━━━━━━━━━━━━━━━━━━

Cuando hay una racha de Rojo:
  Streak 1: NORMAL → Markov decide (no hay problema)
  Streak 2: SOFT → NEUTRAL (no empuja, tampoco hay problema)  
  Streak 3: MEDIUM → Empuja NEGRO con 51.8% ← AQUÍ EMPIEZA EL PROBLEMA
  Streak 4: STRONG → Empuja NEGRO con 51.4% ← SIGUE EQUIVOCÁNDOSE
  Streak 5: ULTRA → Empuja NEGRO con 54.9% ← FUERZA MÁXIMA EN DIRECCIÓN ERRÓNEA

El motor predice "Negro" durante 3 spins consecutivos (streaks 3,4,5) 
mientras Rojo sigue cayendo. El usuario pierde 3 apuestas seguidas.

POR QUÉ PASA:
  - A streak 3, solo hay 51.8% de probabilidad de que rompa. 
    Eso significa ~48% de probabilidad de que la racha CONTINÚE.
  - La ventaja de 1.8% es estadísticamente insignificante.
  - Cuando falla en streak 3, el motor NO se autocorrige — 
    simplemente empuja más fuerte en streak 4 y 5.

LA CORRECCIÓN NECESARIA:
━━━━━━━━━━━━━━━━━━━━━━━
  1. A streak 3: NO empujar opuesto (la ventaja es muy débil: solo 1.8%)
  2. A streak 4: NO empujar opuesto (la ventaja es aún más débil: 1.4%)
  3. Solo activar anti-racha a streak 5 (donde la ventaja REAL es 4.9%)
  4. Streak 6: Neutral (48.5% = sin ventaja)
  5. Streak 7+: Empujar mismo color (la racha probablemente continúa)
""")

