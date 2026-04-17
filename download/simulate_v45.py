#!/usr/bin/env python3
"""
Simulación del motor v4.5 vs v4.4 con los 3,920 números reales.
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

# v4.5 hardcoded break probabilities
BREAK_PROBS = {2: 51.8, 3: 51.3, 4: 54.6, 5: 48.5, 6: 45.3, 7: 44.8, 8: 37.5}

def get_break_prob(streak_len):
    if streak_len >= 9: return 40.0
    return BREAK_PROBS.get(streak_len, 50.0)

# v4.5 logic
def v45_decision(bp):
    push_opposite = bp >= 50
    push_same = bp < 50
    return push_opposite, push_same

# v4.4 logic (dynamic postStreakAnalysis approximation)
def v44_post_streak(history, streak_len):
    if len(history) < 10: return 50
    breaks = 0; total = 0
    for i in range(streak_len, len(history)):
        last_c = history[i-1]
        ok = True
        for j in range(1, streak_len):
            if i-1-j < 0 or history[i-1-j] != last_c:
                ok = False; break
        if ok:
            total += 1
            if history[i] != last_c: breaks += 1
    if total >= 5: return round((breaks/total)*100)
    return 50

# Simulate both engines
def simulate(engine='v4.5'):
    mode_stats = defaultdict(lambda: {'total': 0, 'correct': 0, 'wrong': 0,
                                       'opp': 0, 'opp_hit': 0, 'same': 0, 'same_hit': 0})
    
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
        
        if engine == 'v4.5':
            bp = get_break_prob(streak)
        else:
            bp = v44_post_streak(color_seq[:i], streak)
        
        push_opp, push_same = v45_decision(bp)
        
        mode = {2: 'SOFT', 3: 'MEDIUM', 4: 'STRONG'}.get(streak)
        if streak >= 5: mode = 'ULTRA'
        if not mode: continue
        
        r = mode_stats[mode]
        r['total'] += 1
        
        if push_opp:
            r['opp'] += 1
            if actual_broke:
                r['correct'] += 1; r['opp_hit'] += 1
            else:
                r['wrong'] += 1
        else:
            r['same'] += 1
            if not actual_broke:
                r['correct'] += 1; r['same_hit'] += 1
            else:
                r['wrong'] += 1
    
    return mode_stats

print("="*80)
print("COMPARACION: v4.4 (buggy) vs v4.5 (hardcoded) vs SIEMPRE_OPUESTO vs SIEMPRE_MISMO")
print("="*80)

engines = {'v4.4': simulate('v4.4'), 'v4.5': simulate('v4.5'), 
           'SIEMPRE_OPUESTO': simulate('always_opp'), 'SIEMPRE_MISMO': simulate('always_same')}

# Actually let's compute always_opp and always_same separately
def simulate_simple(strategy):
    mode_stats = defaultdict(lambda: {'total': 0, 'correct': 0, 'wrong': 0})
    for i in range(10, len(color_seq)):
        streak = 1
        for j in range(i-1, max(i-20, -1), -1):
            if color_seq[j] == color_seq[i-1]:
                streak += 1
            else:
                break
        if streak < 2: continue
        actual = color_seq[i]
        streak_color = color_seq[i-1]
        actual_broke = actual != streak_color
        mode = {2: 'SOFT', 3: 'MEDIUM', 4: 'STRONG'}.get(streak)
        if streak >= 5: mode = 'ULTRA'
        if not mode: continue
        r = mode_stats[mode]
        r['total'] += 1
        if strategy == 'opp':
            if actual_broke: r['correct'] += 1
            else: r['wrong'] += 1
        else:
            if not actual_broke: r['correct'] += 1
            else: r['wrong'] += 1
    return mode_stats

engines = {
    'v4.4 (buggy)': simulate('v4.4'),
    'v4.5 (nuevo)': simulate('v4.5'),
    'SIEMPRE_OPUESTO': simulate_simple('opp'),
    'SIEMPRE_MISMO': simulate_simple('same'),
}

for engine_name, stats in engines.items():
    print(f"\n{'─'*80}")
    print(f"  MOTOR: {engine_name}")
    print(f"{'─'*80}")
    print(f"  {'Modo':>8} | {'Casos':>6} | {'Pred Opp':>8} | {'Opp Hit':>7} | {'Pred Same':>9} | {'Same Hit':>8} | {'Accuracy':>9}")
    print(f"  {'─'*70}")
    tc = 0; tw = 0
    for mode in ['SOFT', 'MEDIUM', 'STRONG', 'ULTRA']:
        r = stats[mode]
        if r['total'] == 0: continue
        tc += r['correct']; tw += r['wrong']
        acc = (r['correct']/r['total'])*100
        opp = r.get('opp', 0)
        same = r.get('same', 0)
        oh = r.get('opp_hit', 0)
        sh = r.get('same_hit', 0)
        print(f"  {mode:>8} | {r['total']:>6} | {opp:>8} | {oh:>7} | {same:>9} | {sh:>8} | {acc:>8.1f}%")
    print(f"  {'─'*70}")
    gt = tc + tw
    if gt > 0:
        print(f"  {'TOTAL':>8} | {gt:>6} |          |          |            |           | {(tc/gt)*100:>8.1f}%")

# Improvement summary
v44 = simulate('v4.4')
v45 = simulate('v4.5')
print(f"\n{'='*80}")
print("RESUMEN DE MEJORAS v4.4 → v4.5:")
print(f"{'='*80}")
for mode in ['SOFT', 'MEDIUM', 'STRONG', 'ULTRA']:
    old = v44[mode]
    new = v45[mode]
    if old['total'] == 0: continue
    old_acc = (old['correct']/old['total'])*100
    new_acc = (new['correct']/new['total'])*100
    diff = new_acc - old_acc
    arrow = "↑" if diff > 0.5 else ("↓" if diff < -0.5 else "=")
    print(f"  {mode:>8}: {old_acc:>5.1f}% → {new_acc:>5.1f}% ({arrow} {diff:>+5.1f}pp)")

tc_o = sum(v44[m]['correct'] for m in ['SOFT','MEDIUM','STRONG','ULTRA'])
tt_o = sum(v44[m]['total'] for m in ['SOFT','MEDIUM','STRONG','ULTRA'])
tc_n = sum(v45[m]['correct'] for m in ['SOFT','MEDIUM','STRONG','ULTRA'])
tt_n = sum(v45[m]['total'] for m in ['SOFT','MEDIUM','STRONG','ULTRA'])
print(f"  {'TOTAL':>8}: {(tc_o/tt_o)*100:>5.1f}% → {(tc_n/tt_n)*100:>5.1f}% ({(tc_n/tt_n - tc_o/tt_o)*100:>+5.1f}pp)")

