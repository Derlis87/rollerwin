#!/usr/bin/env python3
"""
Re-analyze with correct numbers (colors computed by code, not VLM).
This is the DEFINITIVE analysis of the image sequence.
"""

RED_SET = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}

def get_color(n):
    if n == 0:
        return 'G'
    return 'R' if n in RED_SET else 'B'

# Sequence extracted from image (numbers only, colors computed by code)
# Row 1: left to right
row1 = [14,13,11,1,6,12,16,9,26,2,35,28,29,35,11,26,30,5,11,33,8,9,12,25,18,24,4,8,2,28,36,2,27]
# Row 2: continues from row 1
row2 = [25,29,19,0,14,6,31,34,13,4,0,19,10,31,6,16,27,5,13,24,15,6,23,13,1,0,11,34,0,32,30,36,3]
# Row 3: continues from row 2
row3 = [27,35,15,0,5,11,17,6,25,34,15,20,29,11,31,15,22,34,15,15,14,4,13,32,22,32,4,8,14,15,27,18]
# Row 4: continues from row 3
row4 = [24,9,12,33,6,10,1,24,13,18,4,8,2,31,27,10,8,18,27,9]

all_nums = row1 + row2 + row3 + row4

print(f"Total numbers: {len(all_nums)}")

# Print sequence with colors
print("\nSequence with colors:")
for i, n in enumerate(all_nums):
    c = get_color(n)
    print(f"  {i+1:3d}: {n:2d} ({c})", end="")
    if (i+1) % 10 == 0:
        print()
print()

# Filter non-zero for color streak analysis
non_zero = [n for n in all_nums if n != 0]
colors = [get_color(n) for n in non_zero]
print(f"\nNon-zero numbers: {len(non_zero)}")
print(f"Red: {colors.count('R')}, Black: {colors.count('B')}")

# =====================================================
# PART 1: Color streak analysis
# =====================================================
print("\n" + "=" * 60)
print("PART 1: COLOR STREAK ANALYSIS")
print("=" * 60)

streaks = []
cur_len = 1
for i in range(1, len(colors)):
    if colors[i] == colors[i-1]:
        cur_len += 1
    else:
        streaks.append((colors[i-1], cur_len))
        cur_len = 1
streaks.append((colors[-1], cur_len))

print(f"Total streaks: {len(streaks)}")
avg = sum(s for _, s in streaks) / len(streaks)
print(f"Average streak length: {avg:.2f}")
print()

from collections import Counter
dist = Counter(s for _, s in streaks)
print("Streak distribution:")
for l in sorted(dist.keys()):
    c = dist[l]
    pct = c / len(streaks) * 100
    print(f"  {l}: {c:3d} ({pct:5.1f}%)")

print(f"\nStreaks of 3+:")
for i, (col, ln) in enumerate(streaks):
    if ln >= 3:
        cn = "RED" if col == 'R' else "BLACK"
        print(f"  #{i+1}: {cn} x{ln}")

# =====================================================
# PART 2: Engine perspective — break rates
# =====================================================
print("\n" + "=" * 60)
print("PART 2: ENGINE-PERSPECTIVE BREAK RATES")
print("=" * 60)
print("(When engine sees N consecutive at end of history)")
print()

# For each position, check: after N same-color, what happens next?
break_data = {}  # streak_len -> {break: int, continue: int}
for i in range(1, len(colors)):
    # Count current streak ending at position i-1
    streak_len = 1
    j = i - 1
    while j > 0 and colors[j] == colors[j-1]:
        streak_len += 1
        j -= 1
    
    if streak_len not in break_data:
        break_data[streak_len] = {"break": 0, "continue": 0}
    
    if colors[i] != colors[i-1]:
        break_data[streak_len]["break"] += 1
    else:
        break_data[streak_len]["continue"] += 1

# v4.5 hardcoded break probs
HARDCODED = {2: 49.7, 3: 51.8, 4: 51.4, 5: 54.9, 6: 48.5, 7: 45.3, 8: 44.8, 9: 37.5}

print(f"{'Streak':>6} | {'Cases':>5} | {'Break%':>7} | {'Cont%':>7} | {'v4.5 Expected':>14} | {'Diff':>7}")
print("-" * 65)
for sl in sorted(break_data.keys()):
    d = break_data[sl]
    total = d["break"] + d["continue"]
    bp = d["break"] / total * 100
    cp = d["continue"] / total * 100
    expected = HARDCODED.get(sl, 50.0) if sl <= 9 else 37.5
    diff = bp - expected
    print(f"  {sl:>4}  | {total:>5} | {bp:>6.1f}% | {cp:>6.1f}% | {expected:>13.1f}% | {diff:>+6.1f}pp")

# =====================================================
# PART 3: Streak continuation probability chain
# =====================================================
print("\n" + "=" * 60)
print("PART 3: STREAK CONTINUATION CHAIN")
print("=" * 60)
print()

print("Given a streak of 2, probability of it reaching each level:")
if 2 in break_data:
    total2 = break_data[2]["break"] + break_data[2]["continue"]
    p_cont_2 = break_data[2]["continue"] / total2
    p_at_2 = 1.0
    
    print(f"  Streak 2 → continue to 3: {p_cont_2*100:.1f}% (survive: {p_at_2*p_cont_2*100:.1f}%)")
    
    if 3 in break_data:
        total3 = break_data[3]["break"] + break_data[3]["continue"]
        p_cont_3 = break_data[3]["continue"] / total3
        survive_3 = p_at_2 * p_cont_2 * p_cont_3
        print(f"  Streak 3 → continue to 4: {p_cont_3*100:.1f}% (survive: {survive_3*100:.1f}%)")
        
        if 4 in break_data:
            total4 = break_data[4]["break"] + break_data[4]["continue"]
            p_cont_4 = break_data[4]["continue"] / total4
            survive_4 = survive_3 * p_cont_4
            print(f"  Streak 4 → continue to 5: {p_cont_4*100:.1f}% (survive: {survive_4*100:.1f}%)")
            
            if 5 in break_data:
                total5 = break_data[5]["break"] + break_data[5]["continue"]
                p_cont_5 = break_data[5]["continue"] / total5
                survive_5 = survive_4 * p_cont_5
                print(f"  Streak 5 → continue to 6: {p_cont_5*100:.1f}% (survive: {survive_5*100:.1f}%)")
            
            print(f"\n  P(streak reaches 5 from 2): {survive_4*100:.1f}%")
            print(f"  → About 1 in {1/max(0.01,survive_4):.0f} streaks of 2 reach 5+")

# =====================================================
# PART 4: Detailed streak events with engine actions
# =====================================================
print("\n" + "=" * 60)
print("PART 4: EACH STREAK 3+ WITH ENGINE BEHAVIOR")
print("=" * 60)

def get_bp(sl):
    if sl >= 9: return 37.5
    return HARDCODED.get(sl, 50.0)

def calc_force(sl):
    bp = get_bp(sl)
    push_opp = bp >= 50
    avg_boost = max(0, (sl - avg) * 8) if sl > avg else 0
    if push_opp:
        edge = bp - 50
        force = 30 + edge * 8 + min(20, max(0, sl - 3) * 8) + avg_boost
        return force, "OPPOSITE", bp
    else:
        edge = 50 - bp
        force = 25 + edge * 6 + min(15, (sl - 5) * 5)
        return force, "SAME", bp

streak_num = 0
cur_color = colors[0]
cur_start = 0
for i in range(1, len(colors)):
    if colors[i] != colors[i-1]:
        sl = i - cur_start
        if sl >= 3:
            streak_num += 1
            cn = "RED" if cur_color == 'R' else "BLACK"
            opposite = "BLACK" if cur_color == 'R' else "RED"
            print(f"\n  Streak #{streak_num}: {cn} x{sl}")
            
            for step in range(2, sl + 1):
                force, direction, bp = calc_force(step)
                marker = "✓" if step < sl else ("✓" if direction == "OPPOSITE" else "✗")
                if direction == "OPPOSITE":
                    print(f"    Step {step}: PUSH {opposite} (force={force:.0f}, breakPct={bp}%)")
                else:
                    print(f"    Step {step}: PUSH {cn} CONTINUES (force={force:.0f}, breakPct={bp}%)")
            
            # What actually happened
            actual_next = colors[i] if i < len(colors) else None
            if actual_next:
                if actual_next != cur_color:
                    print(f"    → BROKE at step {sl} (next was {actual_next}) ✓")
                else:
                    print(f"    → This shouldn't happen (next was same)")
        
        cur_color = colors[i]
        cur_start = i

# Handle last streak
sl = len(colors) - cur_start
if sl >= 3:
    streak_num += 1
    cn = "RED" if cur_color == 'R' else "BLACK"
    opposite = "BLACK" if cur_color == 'R' else "RED"
    print(f"\n  Streak #{streak_num}: {cn} x{sl} (ONGOING - at end of sequence)")
    for step in range(2, sl + 1):
        force, direction, bp = calc_force(step)
        if direction == "OPPOSITE":
            print(f"    Step {step}: PUSH {opposite} (force={force:.0f}, breakPct={bp}%)")
        else:
            print(f"    Step {step}: PUSH {cn} CONTINUES (force={force:.0f}, breakPct={bp}%)")

# =====================================================
# PART 5: KEY FINDINGS AND DIAGNOSIS
# =====================================================
print("\n\n" + "=" * 60)
print("PART 5: KEY FINDINGS & DIAGNOSIS")
print("=" * 60)

print("""
FINDING 1: MOTOR SOLO ACTIVA ANTI-RACHA A PARTIR DE STREAK 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  • Streak 1: NORMAL mode (Markov decides) 
  • Streak 2: SOFT mode (NEUTRAL — NO anti-streak push)
  • Streak 3+: Anti-streak activates

  PROBLEMA: El motor no hace NADA en streak 1 y 2.
  Esto permite que el ~50% de las rachas de 2 lleguen a 3.

FINDING 2: A STREAK 2, MARKOV PUEDE EMPUJAR EN DIRECCIÓN DE LA RACHA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  En modo SOFT (streak 2), el código usa:
  - Markov-2 con weight=2.5 * 0.2 = 0.5 (cap de 6 pts hacia streak)
  - Markov-3 con weight=1.8 * 0.3 = 0.54 (cap de 8 pts hacia streak)
  - Saturation, Wheel signal

  Si Markov indica que el color de la racha es probable, el motor
  efectivamente AYUDA a que la racha continúe, a pesar de que el 
  modo se llama "SOFT" y es "neutral".

FINDING 3: EL MOTOR SOLO PREDICE — NO PREVIENE RACHAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Incluso con anti-streak perfecto (51.8% a streak 3), casi la 
  mitad de las rachas continúan. Rachas de 3-5 son ESTADÍSTICAMENTE
  NORMALES en ruleta y ocurrirán independientemente del motor.

FINDING 4: LAS ESTADÍSTICAS HARDCODED VS REALIDAD DE ESTA SECUENCIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

# Check how v4.5 expectations compare
print(f"  {'Streak':>6} | {'v4.5':>8} | {'Real':>8} | {'Match?':>7}")
print("  " + "-" * 40)
for sl in sorted(break_data.keys()):
    if sl >= 2:
        d = break_data[sl]
        total = d["break"] + d["continue"]
        bp = d["break"] / total * 100
        expected = get_bp(sl)
        match = "✓" if abs(bp - expected) < 8 else "✗ WAY OFF" if abs(bp - expected) > 15 else "~ close"
        print(f"  {sl:>6} | {expected:>7.1f}% | {bp:>7.1f}% | {match:>7}")

print(f"""
CONCLUSIÓN:
━━━━━━━━━
Las rachas de 3-5 colores seguidos son COMPORTAMIENTO ESTADÍSTICO
NORMAL. El motor v4.5 está diseñado para:
  1. A streak 2: NO intervenir (49.7% = sin ventaja)
  2. A streak 3: Predecir opuesto con 51.8% de confianza
  3. A streak 5: Predecir opuesto con 54.9% (mejor punto!)

PERO: 48.2% de las veces a streak 3, la racha continúa.
Esto NO es un bug del motor — es simplemente probabilidad.

LO QUE SÍ PUEDE MEJORARSE:
  - El motor podría intervenir más agresivamente a streak 2 
    (aunque los datos dicen 49.7% = sin ventaja real)
  - Se podría añadir un "early warning" visual cuando streak=2
    para que el usuario sepa que viene una decisión crítica
""")

