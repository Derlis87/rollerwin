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

print("PROBABILIDADES REALES desde la perspectiva del motor")
print("Pregunta: cuando veo N consecutivos, que pasa en el siguiente spin?")
print()

engine_stats = defaultdict(lambda: {'total': 0, 'breaks': 0, 'continues': 0})

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
    if streak >= 5:
        key = '5+'
    else:
        key = str(streak)
    engine_stats[key]['total'] += 1
    if actual_broke:
        engine_stats[key]['breaks'] += 1
    else:
        engine_stats[key]['continues'] += 1

print("Streak  | Casos  | Rompe  | Continua | % Rompe | % Cont  | Decision")
print("-"*75)

for key in ['2', '3', '4', '5+']:
    r = engine_stats[key]
    if r['total'] == 0: continue
    bp = (r['breaks']/r['total'])*100
    cp = (r['continues']/r['total'])*100
    if bp > 50.5:
        decision = "OPUESTO"
    elif cp > 50.5:
        decision = "MISMO"
    else:
        decision = "NEUTRO"
    print(f"{key:>6}  | {r['total']:>6} | {r['breaks']:>6} | {r['continues']:>9} | {bp:>7.1f}% | {cp:>6.1f}% | {decision}")

print("\nDesglose ULTRA por longitud exacta:")
for streak_len in range(5, 15):
    breaks = 0; continues = 0; total = 0
    for i in range(10, len(color_seq)):
        streak = 1
        for j in range(i-1, max(i-20, -1), -1):
            if color_seq[j] == color_seq[i-1]:
                streak += 1
            else:
                break
        if streak != streak_len: continue
        actual = color_seq[i]
        actual_broke = actual != color_seq[i-1]
        total += 1
        if actual_broke: breaks += 1
        else: continues += 1
    if total == 0: break
    bp = (breaks/total)*100
    print(f"  Streak {streak_len:>2}: {total:>4} casos, {bp:>5.1f}% rompe, {(100-bp):.1f}% continua")

