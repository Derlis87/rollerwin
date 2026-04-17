#!/usr/bin/env python3
"""
Analyze the roulette sequence from the user's screenshot to verify
whether the v4.5 anti-streak engine logic matches actual results.
"""

# Sequence extracted from image via VLM
# Format: (number, color) where R=red, B=black, G=green
sequence_raw = """14-R, 13-B, 11-B, 1-R, 6-B, 12-B, 16-R, 9-R, 26-B, 2-B, 
35-R, 28-B, 29-R, 35-R, 11-B, 26-B, 30-R, 5-R, 11-B, 33-B, 
8-B, 12-B, 25-R, 18-R, 24-B, 4-B, 8-B, 2-B, 28-B, 36-R, 
2-B, 27-R, 25-R, 29-R, 19-R, 0-G, 14-R, 6-B, 31-B, 34-R, 
13-B, 4-B, 0-G, 19-R, 10-B, 31-B, 6-B, 16-R, 27-R, 5-R, 
13-B, 24-B, 15-B, 6-B, 23-R, 13-B, 1-R, 0-G, 11-B, 34-R, 
0-G, 32-R, 30-R, 36-R, 3-R, 27-R, 35-R, 15-B, 0-G, 5-R, 
11-B, 17-B, 6-B, 25-R, 34-R, 15-B, 20-B, 29-R, 11-B, 31-B, 
15-B, 22-B, 34-R, 15-B, 15-B, 14-R, 4-B, 13-B, 32-R, 22-B, 
32-R, 4-B, 8-B, 14-R, 15-B, 27-R, 18-R, 24-B, 9-R, 12-B, 
33-B, 6-B, 10-B, 1-R, 24-B, 13-B, 18-R, 4-B, 8-B, 2-B, 
31-B, 27-R, 10-B, 8-B, 18-R, 27-R, 9-R"""

RED_SET = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}

def get_color(n):
    if n == 0:
        return 'G'
    return 'R' if n in RED_SET else 'B'

# Parse sequence
raw_entries = sequence_raw.replace('\n', '').split(',')
entries = []
for e in raw_entries:
    e = e.strip()
    parts = e.split('-')
    num = int(parts[0])
    col = parts[1]
    # Verify color
    actual_col = get_color(num)
    if col != actual_col:
        print(f"COLOR MISMATCH: {num} is {actual_col} but VLM said {col}")
    entries.append((num, actual_col))

print(f"Total entries: {len(entries)}")
print()

# Filter non-zero for streak analysis
non_zero_colors = [c for _, c in entries if c != 'G']
print(f"Non-zero entries: {len(non_zero_colors)}")
print()

# =====================================================
# PART 1: Analyze actual color streaks in the sequence
# =====================================================
print("=" * 60)
print("PART 1: COLOR STREAK ANALYSIS")
print("=" * 60)

all_streaks = []
current_streak = 1
for i in range(1, len(non_zero_colors)):
    if non_zero_colors[i] == non_zero_colors[i-1]:
        current_streak += 1
    else:
        all_streaks.append((non_zero_colors[i-1], current_streak))
        current_streak = 1
all_streaks.append((non_zero_colors[-1], current_streak))

print(f"Total color streaks: {len(all_streaks)}")
print(f"Average streak length: {sum(s for _, s in all_streaks) / len(all_streaks):.2f}")
print()

# Distribution of streak lengths
from collections import Counter
streak_counts = Counter(s for _, s in all_streaks)
print("Streak length distribution:")
for length in sorted(streak_counts.keys()):
    count = streak_counts[length]
    pct = (count / len(all_streaks)) * 100
    bar = "█" * int(pct / 2)
    print(f"  Streak {length}: {count:3d} times ({pct:5.1f}%) {bar}")

print()

# Show streaks of length 3+
print("Streaks of 3+ consecutive same color:")
for i, (color, length) in enumerate(all_streaks):
    if length >= 3:
        color_name = "RED" if color == 'R' else "BLACK"
        print(f"  #{i+1}: {color_name} x {length}")

print()

# =====================================================
# PART 2: Simulate v4.5 engine behavior at each step
# =====================================================
print("=" * 60)
print("PART 2: V4.5 ENGINE SIMULATION")
print("=" * 60)

# v4.5 hardcoded break probabilities (engine perspective)
BREAK_PROBS = {
    2: 49.7,
    3: 51.8,
    4: 51.4,
    5: 54.9,
    6: 48.5,
    7: 45.3,
    8: 44.8,
}

def get_break_prob(streak_len):
    if streak_len >= 9:
        return 37.5
    return BREAK_PROBS.get(streak_len, 50.0)

def compute_anti_streak_force(streak_len, avg_streak_len):
    bp = get_break_prob(streak_len)
    push_opposite = bp >= 50
    push_same = bp < 50
    
    avg_boost = max(0, (streak_len - avg_streak_len) * 8) if streak_len > avg_streak_len else 0
    
    if push_opposite:
        edge = bp - 50
        base_force = 30
        edge_bonus = edge * 8
        length_bonus = min(20, max(0, streak_len - 3) * 8)
        force = base_force + edge_bonus + length_bonus + avg_boost
        return force, push_opposite, push_same
    else:
        edge = 50 - bp
        base_force = 25
        edge_bonus = edge * 6
        length_bonus = min(15, (streak_len - 5) * 5)
        force = base_force + edge_bonus + length_bonus
        return force, push_opposite, push_same

# Simulate engine at each position
predictions = []  # (position, streak_len, mode, predicted_color, actual_color, correct)

non_zero_nums = [n for n, c in entries if c != 'G']

# Track streak state
streak_len = 0
streak_color = None

# Calculate avg streak length from full history
color_history = non_zero_colors
all_streaks_for_avg = []
s = 1
for i in range(1, len(color_history)):
    if color_history[i] == color_history[i-1]:
        s += 1
    else:
        all_streaks_for_avg.append(s)
        s = 1
all_streaks_for_avg.append(s)
avg_streak = sum(all_streaks_for_avg) / len(all_streaks_for_avg)

print(f"Average streak length: {avg_streak:.2f}")
print()

# For each position, determine what the engine would predict
# We need at least 5 non-zero numbers
mode_stats = {}  # mode -> {correct, total}

for i in range(5, len(non_zero_nums)):
    # Current history
    history = non_zero_nums[:i]
    colors_so_far = [get_color(n) for n in history]
    non_zero_so_far = [c for c in colors_so_far if c != 'G']
    
    # Calculate current streak at end of history
    cur_streak = 1
    for j in range(len(non_zero_so_far) - 1, 0, -1):
        if non_zero_so_far[j] == non_zero_so_far[j-1]:
            cur_streak += 1
        else:
            break
    
    cur_streak_color = non_zero_so_far[-1] if non_zero_so_far else None
    opposite = 'B' if cur_streak_color == 'R' else 'R'
    
    # Determine mode
    if cur_streak >= 5:
        mode = "ULTRA"
        bp = get_break_prob(cur_streak)
        force, push_opp, push_same = compute_anti_streak_force(cur_streak, avg_streak)
        if push_opp:
            predicted = opposite
        else:
            predicted = cur_streak_color
        reason = f"breakPct={bp}%"
    elif cur_streak == 4:
        mode = "STRONG"
        bp = get_break_prob(4)
        force, push_opp, push_same = compute_anti_streak_force(4, avg_streak)
        predicted = opposite if push_opp else cur_streak_color
        reason = f"breakPct={bp}%"
    elif cur_streak == 3:
        mode = "MEDIUM"
        bp = get_break_prob(3)
        force, push_opp, push_same = compute_anti_streak_force(3, avg_streak)
        predicted = opposite if push_opp else cur_streak_color
        reason = f"breakPct={bp}%"
    elif cur_streak == 2:
        mode = "SOFT"
        predicted = "NEUTRAL"  # No anti-streak push, Markov decides
        reason = "breakPct=49.7% (neutral)"
    else:
        mode = "NORMAL"
        predicted = "MARKOV"
        reason = "streak<2"
    
    # Actual next color
    actual_color = get_color(non_zero_nums[i])
    
    if mode not in mode_stats:
        mode_stats[mode] = {"correct": 0, "total": 0}
    
    if mode == "SOFT":
        # Engine is neutral, can't evaluate direction
        mode_stats[mode]["total"] += 1
    elif mode == "NORMAL":
        # Would need full Markov simulation - just note it
        mode_stats[mode]["total"] += 1
    else:
        mode_stats[mode]["total"] += 1
        if predicted == actual_color:
            mode_stats[mode]["correct"] += 1
    
    predictions.append({
        "pos": i,
        "streak": cur_streak,
        "streak_color": cur_streak_color,
        "mode": mode,
        "predicted": predicted,
        "actual": actual_color,
        "correct": predicted == actual_color if mode not in ["SOFT", "NORMAL"] else None,
        "reason": reason
    })

# Print mode statistics
print("Engine mode activation and accuracy:")
for mode in ["NORMAL", "SOFT", "MEDIUM", "STRONG", "ULTRA"]:
    if mode in mode_stats:
        s = mode_stats[mode]
        total = s["total"]
        correct = s["correct"]
        pct = (correct / total * 100) if total > 0 and mode not in ["SOFT", "NORMAL"] else 0
        bar = "█" * int(pct / 3) if pct > 0 else ""
        print(f"  {mode:8s}: {total:3d} activations, {correct:3d} correct ({pct:5.1f}%) {bar}")

print()

# =====================================================
# PART 3: Critical analysis — streak continuation rate
# =====================================================
print("=" * 60)
print("PART 3: CRITICAL ANALYSIS — STREAK CONTINUATION")
print("=" * 60)

# For each streak level, how often does the streak continue?
print("When streak of N is observed at END of history:")
print("  (simulating what the engine sees)")
print()

streak_break_data = {}
for pred in predictions:
    sl = pred["streak"]
    if sl not in streak_break_data:
        streak_break_data[sl] = {"continue": 0, "break": 0}
    actual = pred["actual"]
    streak_c = pred["streak_color"]
    if actual == streak_c:
        streak_break_data[sl]["continue"] += 1
    else:
        streak_break_data[sl]["break"] += 1

for sl in sorted(streak_break_data.keys()):
    d = streak_break_data[sl]
    total = d["continue"] + d["break"]
    break_pct = (d["break"] / total * 100) if total > 0 else 0
    cont_pct = (d["continue"] / total * 100) if total > 0 else 0
    engine_bp = get_break_prob(sl) if sl <= 9 else 37.5
    diff = break_pct - engine_bp
    print(f"  Streak {sl}: {total:3d} cases → {d['break']:3d} break ({break_pct:5.1f}%) / {d['continue']:3d} cont ({cont_pct:5.1f}%) | Engine expects {engine_bp:5.1f}% break | Diff: {diff:+5.1f}pp")

print()

# =====================================================
# PART 4: Show the problematic streaks (3-5+)
# =====================================================
print("=" * 60)
print("PART 4: STREAKS OF 3+ WITH ENGINE BEHAVIOR")
print("=" * 60)

# Find streaks and show engine behavior
streak_events = []
current = {"color": non_zero_so_far[0], "len": 1, "positions": [0]} if non_zero_so_far else None
for i in range(1, len(non_zero_so_far)):
    if non_zero_so_far[i] == non_zero_so_far[i-1]:
        current["len"] += 1
        current["positions"].append(i)
    else:
        if current and current["len"] >= 3:
            streak_events.append(current)
        current = {"color": non_zero_so_far[i], "len": 1, "positions": [i]}
if current and current["len"] >= 3:
    streak_events.append(current)

for event in streak_events:
    color_name = "RED" if event["color"] == 'R' else "BLACK"
    pos_range = f"pos {event['positions'][0]}-{event['positions'][-1]}"
    
    # What would engine predict at each step of this streak?
    engine_actions = []
    for step in range(2, event["len"] + 1):
        bp = get_break_prob(step)
        force, push_opp, push_same = compute_anti_streak_force(step, avg_streak)
        if push_opp:
            engine_actions.append(f"Step {step}: PUSH OPPOSITE (force={force:.0f}, breakPct={bp}%)")
        elif push_same:
            engine_actions.append(f"Step {step}: PUSH SAME COLOR (force={force:.0f}, breakPct={bp}%)")
        else:
            engine_actions.append(f"Step {step}: NEUTRAL (breakPct={bp}%)")
    
    print(f"  {color_name} x{event['len']} ({pos_range}):")
    for action in engine_actions:
        print(f"    {action}")
    print()

# =====================================================
# PART 5: Key findings summary
# =====================================================
print("=" * 60)
print("PART 5: KEY FINDINGS")
print("=" * 60)

# Calculate break rate for streak 2
if 2 in streak_break_data:
    d = streak_break_data[2]
    total = d["continue"] + d["break"]
    break_pct = (d["break"] / total * 100) if total > 0 else 0
    print(f"1. Streak 2: Engine is NEUTRAL (49.7% expected break). Actual: {break_pct:.1f}% break ({total} cases)")
    print(f"   → This means at streak 2, the engine does NOTHING to prevent continuation.")
    print(f"   → Streak naturally continues ~{100-break_pct:.1f}% of the time to streak 3.")

if 3 in streak_break_data:
    d = streak_break_data[3]
    total = d["continue"] + d["break"]
    break_pct = (d["break"] / total * 100) if total > 0 else 0
    print(f"\n2. Streak 3: Engine pushes OPPOSITE (51.8% expected break). Actual: {break_pct:.1f}% break ({total} cases)")
    print(f"   → Force = 30 + (51.8-50)*8 = {30 + (51.8-50)*8:.1f} points opposite")
    print(f"   → But {100-break_pct:.1f}% of the time the streak STILL continues to 4.")

if 4 in streak_break_data:
    d = streak_break_data[4]
    total = d["continue"] + d["break"]
    break_pct = (d["break"] / total * 100) if total > 0 else 0
    print(f"\n3. Streak 4: Engine pushes OPPOSITE (51.4% expected break). Actual: {break_pct:.1f}% break ({total} cases)")
    print(f"   → Streak reaches 4 about {streak_break_data[3]['continue']/max(1, streak_break_data[3]['continue']+streak_break_data[3]['break'])*100:.1f}% of time from streak 3.")

# Calculate probability of reaching streak 5 from streak 2
if 2 in streak_break_data and 3 in streak_break_data and 4 in streak_break_data:
    p_cont_2 = streak_break_data[2]["continue"] / (streak_break_data[2]["continue"] + streak_break_data[2]["break"])
    p_cont_3 = streak_break_data[3]["continue"] / (streak_break_data[3]["continue"] + streak_break_data[3]["break"])
    p_cont_4 = streak_break_data[4]["continue"] / (streak_break_data[4]["continue"] + streak_break_data[4]["break"])
    p_reach_5 = p_cont_2 * p_cont_3 * p_cont_4 * 100
    print(f"\n4. PROBABILITY OF REACHING STREAK 5 FROM STREAK 2:")
    print(f"   P(continue@2) = {p_cont_2*100:.1f}%")
    print(f"   P(continue@3) = {p_cont_3*100:.1f}%")
    print(f"   P(continue@4) = {p_cont_4*100:.1f}%")
    print(f"   P(reach 5 from 2) = {p_cont_2:.2f} x {p_cont_3:.2f} x {p_cont_4:.2f} = {p_reach_5:.1f}%")
    print(f"   → About 1 in {100/max(1,p_reach_5):.0f} streaks of 2 will reach 5+")

print(f"\n5. EXPECTED BEHAVIOR EXPLANATION:")
print(f"   The engine CANNOT prevent streaks — it only PREDICTS.")
print(f"   Even at streak 3 with 51.8% break rate, ~48.2% continue.")
print(f"   From streak 2, the engine is NEUTRAL (no edge), so it lets Markov decide.")
print(f"   Long streaks (3-5) are NORMAL statistical behavior in roulette.")
print(f"   The question is: when the engine PREDICTS, is it correct more often than wrong?")

