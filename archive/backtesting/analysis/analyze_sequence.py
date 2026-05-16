#!/usr/bin/env python3
"""
Análisis profundo de la secuencia de ruleta enviada por el usuario.
Simula el motor v4.2 paso a paso para identificar anomalías.
"""

import re
from collections import Counter, defaultdict
from copy import deepcopy

# ─── PARSE NUMBERS ───
raw = """9, 36, 25, 28, 23, 12, 15, 26, 35, 28, 28, 15, 14, 24, 29, 2, 9, 3, 8, 21, 4, 22, 24, 3, 25, 29, 6, 8, 5, 17, 13, 23, 1, 28, 3, 15, 8, 20, 4, 10, 13, 22, 6, 13, 23, 21, 21, 23, 15, 36, 26, 4, 29, 35, 28, 8, 20, 21, 11, 0, 5, 22, 27, 0, 1, 7, 9, 7, 1, 18, 5, 18, 34, 20, 33, 8, 16, 35, 22, 27, 0, 1, 7, 20, 14, 33, 20, 7, 26, 8, 31, 16, 12, 25, 9, 15, 18, 9, 1, 36, 14, 13, 9, 9, 28, 30, 14, 21, 1, 9, 0, 31, 31, 20, 25, 17, 6, 11, 30, 14, 11, 23, 13, 13, 9, 7, 4, 25, 12, 12, 9, 0, 24, 8, 0, 13, 2, 30, 25, 34, 15, 27, 0, 25, 9, 20, 28, 28, 29, 29, 23, 6, 22, 34, 19, 24, 12, 6, 20, 24, 8, 22, 30, 10, 21, 18, 27, 35, 21, 33, 15, 5, 35, 16, 1, 17, 20, 31, 3, 4, 26, 11, 29, 8, 10, 13, 36, 21, 2, 28, 24, 30, 31, 13, 17, 22, 32, 16, 21, 36, 11, 10, 25, 9, 17, 28, 8, 20, 33, 34, 10, 28, 14, 26, 8, 14, 7, 26, 9, 27, 26, 33, 15, 23, 15, 33, 7, 6, 6, 28, 7, 18, 15, 22, 24, 26, 21, 31, 0, 29, 10, 35, 7, 28, 20, 35, 29, 11, 28, 7, 24, 32, 4, 32, 0, 36, 1, 5, 5, 30, 5, 17, 21, 19, 2, 12, 34, 0, 26, 30, 21, 17, 36, 36, 12, 9, 9, 14, 27, 18, 19, 6, 33, 6, 35, 16, 4, 12, 6, 32, 17, 11, 29, 10, 3, 0, 11, 7, 4, 17, 11, 9, 16, 28, 36, 18, 35, 26, 24, 33, 23, 26, 13, 15, 17, 5, 16, 3, 8, 4, 36, 6, 22, 29, 11, 1, 8, 35, 10, 15, 12, 12, 31, 8, 29, 13, 25, 0, 33, 2, 33, 18, 27, 36, 29, 30, 1, 31, 32, 34, 25, 10, 15, 7, 5, 22, 29, 11, 11, 0, 2, 0, 22, 20, 0, 21, 0, 16, 36, 28, 14, 0, 2, 0, 22, 20, 0, 23, 0, 16, 36, 21, 20, 18, 26, 26, 31, 15, 29, 23, 34, 32, 36, 26, 6, 34, 21, 17, 6, 19, 8, 8, 31, 10, 28, 6, 5, 10, 31, 25, 34, 16, 30, 29, 23, 32, 18, 17, 10, 2, 3, 16, 27, 10, 10, 3, 34, 34, 0, 36, 34, 2, 1, 19, 14, 25, 18, 28, 12, 31, 21, 4, 4, 33, 6, 32, 35, 33, 33, 9, 28, 8, 35, 36, 29, 6, 16, 1, 1, 25, 32, 17, 16, 3, 11, 29, 26, 27, 35, 25, 36, 8, 29, 6, 7, 27, 33, 1, 18, 29, 36, 30, 20, 26, 28, 32, 0, 11, 34, 14, 33, 34, 22, 16, 6, 16, 11, 24, 33, 9, 8, 20, 29, 12, 20, 15, 25, 5, 8, 19, 24, 17, 2, 34, 6, 9, 31, 14, 1, 28, 22, 34, 32, 33, 5, 36, 4, 15, 1, 4, 18, 18, 22, 13, 1, 36, 35, 29, 9, 28, 6, 33, 36, 22, 19, 26, 3, 8, 1, 1, 31, 15, 4, 29, 3, 4, 30, 9, 24, 12, 12, 18, 29, 2, 30, 23, 9, 35, 27, 16, 9, 6, 5, 13, 15, 5, 18, 35, 3, 6, 15, 11, 30, 6, 16, 6, 15, 0, 30, 13, 34, 33, 3, 5, 24, 32, 11, 18, 36, 20, 22, 22, 29, 32, 1, 11, 30, 17, 27, 31, 13, 35, 33, 9, 32, 13, 35, 12, 0, 15, 12, 13, 36, 14, 24, 28, 31, 31, 17, 28, 4, 1, 31, 2, 30, 23, 28, 21, 17, 25, 28, 16, 2, 30, 3, 25, 9, 35, 7, 0, 17, 18, 9, 24, 13, 22, 24, 33, 6, 35, 19, 12, 13, 8, 6, 14, 30, 12, 18, 35, 2, 11, 23, 13, 24, 5, 7, 29, 6, 28, 21, 17, 24, 30, 34, 24, 3, 23, 31, 1, 34, 12, 21, 21, 18, 31, 32, 24, 33, 36, 27, 13, 2, 9, 2, 20, 21, 31, 15, 24, 2, 16, 19, 4, 15, 1, 29, 32, 16, 1, 17, 24, 34, 25, 29, 14, 12, 23, 14, 35, 32, 35, 13, 34, 11, 34, 1, 26, 22, 30, 8, 33, 35, 11, 8, 16, 4, 35, 13, 8, 27, 23, 31, 1, 26, 18, 17, 36, 22, 2, 34, 26, 4, 28, 2, 14, 13, 21, 31, 6, 12, 13, 15, 27, 3, 10, 17, 17, 28, 10, 25, 4, 24, 34, 19, 2, 14, 21, 20, 28, 26, 20, 33, 0, 34, 4, 16, 20, 35, 25, 11, 35, 21, 35, 28, 25, 8, 15, 27, 31, 15, 25, 31, 22, 35, 35, 21, 13, 35, 23, 11, 10, 25, 6, 24, 14, 3, 12, 13, 6, 24, 33, 1, 31, 28, 6, 10, 0, 0, 15, 34, 20, 23, 32, 27, 23, 17, 20, 4, 11, 14, 22, 1, 36, 15, 36, 2, 24, 24, 20, 23, 19, 7, 10, 11, 17, 1, 26, 5, 23, 11, 6, 6, 0, 14, 27, 35, 24, 20, 4, 23, 23, 25, 0, 9, 26, 26, 9, 15, 17, 16, 26, 16, 27, 29, 18, 30, 25, 23, 21, 33, 13, 14, 12, 14, 18, 15, 20, 3, 18, 1, 12, 6, 11, 30, 29, 19, 30, 17, 13, 12, 30, 14, 9, 10, 8, 5, 28, 24, 13, 11, 25, 8, 7, 1, 21, 31, 18, 4, 26, 6, 7, 8, 22, 17, 18, 2, 19, 6, 19, 10, 27, 3, 19, 27, 9, 22, 12, 18, 27, 1, 23, 1, 26, 16, 11, 26, 34, 13, 17, 30, 18, 34, 0, 35, 0, 29, 5, 23, 12, 3, 4, 34, 10, 27, 15, 16, 7, 30, 21, 12, 31, 26, 16, 32, 18, 6, 31, 36, 25, 21, 9, 25, 28, 19, 1, 26, 30, 22, 4, 22, 6, 2, 31, 5, 22, 10, 12, 15, 29, 30, 25, 9, 25, 34, 0, 3, 36, 6, 8, 33, 14, 4, 1, 23, 28,35, 11, 27, 5, 32, 22, 9, 24, 21, 4, 23, 14, 15, 12, 18, 18, 4, 27, 0, 2, 35, 8, 14 , 16, 10, 4, 7, 22, 15, 32, 32, 19, 28,3, 23, 8, 12, 4, 10, 13, 12, 9, 9, 23, 15, 35, 24, 4, 24, 17, 28, 1, 22, 31, 12, 32, 12, 14, 18, 15, 32, 34, 2, 11, 6, 14, 26, 8, 18, 6, 17, 34, 34, 27, 27, 16, 2, 0, 2, 2, 36, 12, 11, 29, 12, 6, 22, 15, 31, 19, 32, 30, 24, 35, 25, 30, 16, 4, 17, 0, 12, 27, 5, 11, 5, 13, 33, 6, 2, 5, 4, 1, 24, 15, 29, 18, 9, 30, 6, 26, 2, 19, 31, 6, 21, 30, 28, 22, 33, 10, 1, 15, 17, 16, 15, 21, 5, 34, 11, 29, 17, 13, 16, 27, 28, 7, 8, 1, 8, 34, 34, 25, 17, 2, 34, 16, 8, 14, 36, 27, 8, 36, 17, 19, 24, 5, 12, 3, 26, 36, 25, 29, 34, 20, 20, 20, 12, 34, 19, 34, 26, 32, 20, 28, 8, 14, 13, 4, 14, 5, 34, 25, 8, 24, 13, 27, 27, 17, 2, 9, 18, 30, 2, 36, 6, 27, 11, 24, 19, 12, 0, 0, 15, 25, 29, 16, 22, 35, 17, 36, 23, 24, 32, 21, 8, 30, 14, 8, 31, 23, 36, 33, 23, 3, 30, 28, 6, 10, 12, 16, 14, 8, 18, 21, 31, 6, 7, 35, 9, 5, 31, 16, 18, 8, 1, 19, 36, 15, 4, 2, 18, 0, 25, 16, 21, 24, 1, 7, 22, 14, 31, 17, 18, 16, 15, 28, 1, 26, 5, 4, 5, 6, 21, 14, 1, 25, 13, 29, 7, 22, 5, 30, 20, 16, 27, 18, 14, 20, 17, 36, 20, 32, 27, 0, 18, 34, 29, 19, 21, 2, 31, 32, 22, 32, 3, 20, 21, 11, 35, 32, 32, 36, 25, 20, 29, 14, 5, 0, 6, 6, 8, 6, 23, 16, 9, 2, 26, 7, 3, 21, 25, 27, 21, 6, 14, 33, 12, 36, 12, 2, 20, 14, 13, 0, 14, 6, 22, 35, 26, 21, 28, 20, 5, 20, 25, 7, 27, 36, 24, 28, 15, 35, 13, 10, 18, 11, 8, 33, 32, 5, 29, 21, 32, 34, 15, 8, 32, 10, 33, 22, 12, 30, 35, 7, 1, 27, 16, 23, 34, 28, 28, 29, 2, 26, 10, 2, 20, 22, 7, 3, 5, 2, 36, 10, 18, 13, 15, 21, 8, 14, 18, 20, 14, 1, 31, 32, 16, 15, 16, 11, 28, 0, 11, 4, 18, 13, 30, 13, 17, 36, 23, 30, 24, 33, 4, 22, 28, 7, 9, 11, 19, 26, 17, 11, 2, 35, 31, 18, 18 13, 32, 14, 3, 12, 21, 35, 11, 9, 22, 1, 25, 8, 16, 7, 26, 35, 29, 23, 29, 20, 19, 19, 19, 19, 25, 28, 19, 19, 8, 15, 23, 5, 23, 5, 35, 27, 4, 3, 26, 19, 5, 5, 12, 13, 12, 9, 28, 27, 1, 33, 18, 15, 30, 33, 28, 34, 19, 26, 10, 32, 18, 7, 34, 2, 31, 34, 14, 12, 3, 24, 20, 1, 6, 26, 22, 34, 18, 30, 12, 23, 15, 14, 34, 9, 26 , 33, 11, 7, 19, 15, 33, 7, 2, 35, 35, 32, 11, 30, 5, 10, 1, 11, 36, 24, 16, 28, 16, 16, 15, 35, 17, 34, 28, 17, 5, 33, 18, 20, 30, 23, 35, 31, 16, 19, 21, 17, 13, 8, 4, 21, 12, 0, 36, 20, 17, 33, 7, 20, 22, 17, 32, 33, 18, 36, 16, 11, 16, 31, 0, 20, 2, 1, 16, 5, 24, 18, 27, 26, 17, 6, 5, 36, 22, 25, 29, 12, 4, 2, 14, 12, 16, 16, 20, 20, 16, 11, 23, 4, 16, 16, 28, 3, 33, 20, 25, 26, 36, 20, 9, 31, 5, 5, 35, 21, 3, 21, 31, 13, 30, 29, 7, 23, 22, 15, 29, 13, 24, 36, 6, 15, 13, 33, 26, 31, 24, 29, 5, 4, 22, 23, 17, 20, 8, 1, 0, 14, 34, 5, 27, 32, 20, 18, 6, 21, 8, 34, 9, 22, 23, 13, 4, 28, 34, 8, 3, 19, 4, 15, 16, 5, 24, 16, 30, 15, 20, 0, 28, 18, 11, 1, 16, 18, 17, 28, 3, 34, 15, 5, 21, 1, 17, 6, 35, 26, 7, 24, 28, 2, 19, 29, 34, 5, 25, 22, 15, 12, 32, 1, 21, 33, 0, 14, 20, 33, 24, 4, 25, 5, 29, 7, 1, 36, 8, 3, 19, 16, 25, 26, 13, 23, 20, 20, 27, 11, 23, 20, 3, 19, 29, 12, 10, 1, 24, 10, 32, 16, 3, 27, 2, 16, 31, 4, 19, 24, 8, 15, 11, 31, 9, 22, 31, 1, 31, 4, 16, 22, 15, 2, 18, 12, 32, 19, 23, 21, 29, 29, 2, 5, 21, 15, 9, 14, 9, 0, 32, 23, 27, 35, 33, 19. 16, 34, 5, 14, 17, 1, 17, 34, 26, 26, 14, 2, 35, 7, 25, 2, 1, 33, 16, 36, 20, 15, 2, 21, 0, 0, 18, 18, 5, 13, 23, 18, 24, 28, 30, 31, 31 , 25, 17, 36, 10, 7, 14, 35, 10, 32, 36, 9, 34, 19, 34, 32, 18, 24, 20, 21, 22, 36, 32 , 23, 24, 30, 20, 19, 25, 24, 33, 25, 8, 10, 32, 7, 5, 6, 25, 31, 26, 21, 1, 6, 3, 2, 20, 29, 21, 14, 31, 10, 14, 0, 36, 22, 2, 14, 29, 20, 28, 31, 34, 34, 17, 34, 9, 27, 25, 36, 28, 19, 15, 4, 11, 10, 15, 3, 22, 32, 10, 35, 19, 12, 15, 3, 13, 16, 22, 32, 17, 26, 0, 18, 10, 9, 7, 18, 21, 15, 9, 27, 24, 19, 18, 32, 29, 8, 26, 8, 4, 20, 6, 0, 20, 12, 2, 7, 28, 9, 2, 15, 25, 31, 26, 12, 27, 20, 36, 27, 8, 32, 16, 20, 7, 1, 7, 17, 4, 20, 25, 23, 13, 5, 12, 14, 18, 19, 11, 33, 16, 36, 10, 34, 10, 33, 1, 32, 34, 1, 34, 11, 19, 36, 15, 27, 8, 25, 17, 14, 35, 18, 19, 21 , 12, 21, 31, 9, 27, 7, 6, 21, 29, 24, 0, 35, 4, 25, 23, 12, 17, 35, 13, 30, 29, 4, 7, 13, 8, 6, 20, 19, 15, 16, 8, 11, 3, 5, 14,18, 23, 30, 34, 10, 29, 33, 15, 8, 22, 15, 6, 35, 20, 33, 13, 27, 31, 4, 26,28, 3, 26, 10, 0, 25, 24, 5, 27, 9, 15, 1, 8, 18, 30, 13, 30, 24, 18, 18, 24, 15, 35, 12, 0, 21, 1, 2, 23, 19, 11, 18, 23, 35, 29, 5, 11, 6, 12, 31, 2, 10, 1, 25, 28, 32, 26, 16, 27, 17, 11, 24, 30, 26, 3, 10, 3, 31, 22, 10, 9, 11, 11, 5, 17, 30, 24, 25, 19, 8, 24, 14, 23, 28, 35, 16, 31, 31, 5, 10, 11, 11, 1, 3, 21, 1, 22, 8, 12, 19, 22, 10, 20, 0, 9, 1, 4, 7, 17, 0, 0, 34, 19, 22, 0, 1, 35, 22, 28, 23, 19, 29, 9, 9, 9, 28, 5, 17, 32, 24, 16, 21, 36, 5, 31, 14, 28, 11, 21, 20, 33, 32, 32, 24, 32, 4, 28, 23, 9, 21, 17, 35, 6, 0, 11, 20, 26, 32, 1, 35, 18, 8, 1, 11, 6, 0, 2, 24, 21, 5, 3, 36, 0, 2, 23, 7, 13, 17, 3, 23, 20, 18, 29, 18, 29, 16, 12, 24, 28, 12, 6, 16, 29, 12, 29, 30, 21, 13, 32, 0, 35, 31, 10, 17, 33, 2, 26, 24, 23, 3, 32, 22, 36, 14, 0, 16, 33, 5, 20, 0, 21, 11, 24, 24, 21, 0, 12, 5, 34, 33, 23, 11, 3, 17, 6, 9, 33, 9, 33, 21, 31, 20, 3, 6, 34, 3, 21, 2, 24, 2, 24, 13, 27, 7, 0, 34, 12, 25, 28, 13, 20, 25, 31, 28, 34, 20, 35, 29, 26, 7, 31, 21, 35, 5, 11, 18, 25, 21, 17, 30, 32, 10, 31, 23, 34, 31, 28, 2, 21, 18, 2, 5, 0, 19, 34, 2, 11, 27, 23, 17, 6, 9, 14, 34, 19, 33, 18, 11, 22, 1, 7, 23, 32, 29, 10, 17, 2, 0, 25, 24, 6, 5, 12,  19, 21, 13, 17, 29, 17, 33, 34, 11, 6, 10, 12, 1, 20, 12, 1, 17, 12, 7, 2, 18, 10, 13, 22, 34, 27, 11, 26, 26, 4, 26, 4, 32, 36, 3, 16, 35, 33, 2, 5, 15, 35, 11, 24, 33, 21, 15, 0, 34, 15, 1, 18, 30, 22, 20, 3, 15, 0, 13, 6, 8, 22, 0, 24, 8, 19, 34, 19, 8, 36, 11, 33, 17, 24, 16, 32, 0, 12, 24, 17, 22, 7, 29, 27, 22, 34, 27, 10, 2, 8, 7, 16, 9, 5, 22, 15, 10, 10, 15, 18, 19, 8, 30, 19, 30, 5, 30, 15, 15, 24, 16, 11, 35, 0, 29, 23, 29, 30, 23, 10, 33, 25, 3, 12, 35, 7, 36, 30, 10, 24, 23, 36, 8, 20, 36, 10, 19, 4, 32, 18, 13, 20, 7, 29, 1, 35, 14, 0, 21, 3, 24, 16, 3, 28, 21, 10, 4, 25, 13, 30, 6, 28, 26, 27, 33, 25, 16, 28, 34, 27, 24, 9 24, 33, 36, 10, 14, 27, 7, 36, 4, 10, 25, 28, 31, 25, 17, 11, 15, 10, 14, 6, 29, 23, 11, 25, 15, 14, 18, 21, 0, 10, 34, 16, 34, 32, 11, 32, 26, 32, 21, 3, 28, 13, 30, 32, 17, 18, 29, 4, 15, 34, 10, 31, 30, 17, 0, 10, 2, 34, 2, 36, 0, 12, 15, 32, 25, 11, 27, 4, 33, 31, 33, 2, 24, 18, 25, 29, 0, 6, 28, 26, 26, 24, 34, 17, 33, 23, 32, 6, 27, 1, 12, 15, 25, 23, 20, 21, 15, 25, 1, 18, 23, 14, 25, 36, 9, 18, 18, 17, 18, 22, 9, 32, 4, 3, 8, 28, 29, 8, 6, 13, 1, 32, 8, 9, 26, 36, 18, 21, 4, 21, 5, 6, 16, 23, 4, 0, 3, 31, 26, 33, 31, 15, 17, 13, 35, 22, 22, 28, 6, 31, 21, 30, 22, 28, 20, 1, 9, 33, 21, 19, 33, 10, 29, 0, 18, 15, 1, 34, 27, 31, 22, 17, 3, 33, 4, 16, 22, 17, 32, 28, 25, 1, 34, 10, 12, 26, 18, 0, 27, 2, 36, 0, 11, 4, 20, 26, 22, 0, 28, 23, 22, 16, 28, 32, 25, 7, 17, 3, 11, 35, 5, 31, 12, 19, 20, 12, 21, 22, 17, 34, 27, 25, 3, 12, 27, 14, 26, 16, 21, 28, 17, 8, 36, 5, 33, 28, 12, 11, 11, 10, 15, 3, 18, 22, 28, 22, 18, 35, 14, 4, 30, 28, 36, 6, 14, 3, 23, 19, 15, 30, 2, 20, 9, 32, 31, 19, 32, 23, 24, 33, 3, 20, 3, 9, 24, 0, 1, 27, 35, 19, 12, 2, 36, 0, 25, 32, 4, 34, 7, 29, 17, 36, 17, 6, 12, 11, 11, 3, 30, 10, 12, 3, 17, 16, 31, 2, 2, 5, 20, 5, 4, 18, 35, 10, 2, 12, 14, 18, 31, 12, 9, 26, 18, 12, 5, 3, 16, 36, 7, 35, 17, 20, 32, 1, 36, 23, 28, 29, 1, 28, 33, 13, 29, 15, 11, 33, 15, 24, 7, 1, 2, 3, 20, 5, 3, 12, 5, 4, 36, 27, 11, 0, 15, 2, 15, 15, 1, 0, 35, 16, 27, 11, 14, 12, 2, 16, 19, 15, 6, 17, 3, 22, 2, 14, 1, 7, 21, 17, 15, 12, 21, 11, 18, 4, 0, 35, 15, 19, 23, 14, 19, 22, 1, 12, 20, 19, 26, 18, 33, 18, 23, 4, 14, 2, 33, 34, 30, 6, 23, 28, 3, 31, 24, 12, 0, 17, 20, 8, 34, 11, 22, 3, 28, 27, 4, 29, 11, 22, 36, 19, 2, 22, 27, 9, 5, 29, 23, 7, 0, 17, 33, 28, 31, 0, 28, 16, 3, 27, 32, 35, 26, 10, 16, 33, 10, 33, 3, 31, 2, 20, 3, 14, 32, 17, 32, 2, 22, 1, 29, 36, 17, 0, 18, 17, 29, 20, 17, 4, 31, 22, 26, 11, 12, 15, 17, 7, 23, 34, 9, 8, 14, 14, 22, 13, 27, 18, 2, 27, 16, 33, 21, 3, 9, 30, 26, 25, 34, 30, 26, 20, 17, 27, 19, 6, 26, 15, 9, 4, 15, 28, 36, 12, 28, 17, 7, 3, 7, 30, 35, 17, 25, 5, 28, 1, 27, 5, 2, 17, 34, 36, 27, 33, 1, 20, 13, 17, 19, 18, 17, 33, 7, 11, 2, 8, 32, 36, 31, 26, 0, 16, 8, 30, 29, 14, 13, 10, 0, 35, 21, 23, 25, 29, 31, 19, 16, 27, 3, 2, 25, 30, 5, 11, 25, 23, 30, 19, 4, 18, 32, 6, 18, 10, 10, 26, 34, 18, 0, 17, 17, 1, 32, 28, 29, 0, 20, 17, 22, 7, 30, 1, 27, 29, 15, 9, 28, 6, 14, 35, 27, 7, 1, 6, 35, 32, 21, 9, 15, 31, 28, 27, 31, 10, 4, 33, 17, 16, 0, 36, 23, 9, 21, 11, 26, 22, 16, 34, 18, 22, 7, 20, 5, 29, 20, 11, 7, 30, 1, 1, 34, 34, 35, 33, 33, 16, 0, 15, 9, 36, 21, 12, 25, 17, 21, 12, 16, 6, 2, 7, 1 , 23, 1, 28, 36, 19, 22, 19, 24, 36, 9, 14, 8, 12, 22, 25, 28, 23, 33, 28, 13, 3, 24, 16, 6, 5, 17, 5, 23, 7, 2, 34, 28, 28, 22, 22, 21, 31, 10, 20, 27, 18, 3, 19, 6, 21, 35, 24, 21, 24, 24, 3, 34, 14, 30, 1, 34, 3, 3, 29,  12, 31, 4, 2, 27, 17, 29, 5, 6, 9, 27, 34, 24, 0, 10 , 26, 18, 29, 28, 7, 22, 19, 13, 22, 8, 11, 27, 20 , 27, 13, 2, 32, 8, 4, 16, 29, 17, 25, 11, 36, 15, 20, 27, 25, 8, 8, 9, 21, 7, 17, 5, 25, 26, 8, 25, 3, 2, 33, 30, 27, 11, 8, 26, 21, 2, 17, 15, 17, 33, 27, 3, 4, 11, 32, 4, 19, 13, 2, 34, 21, 29, 20, 3, 23, 3, 30, 14, 31, 28, 4, 17, 2, 6, 29, 8, 13, 22, 23, 31, 8, 16, 22, 8, 36, 10, 29, 8, 28, 4, 11, 19, 13, 13, 26, 24, 24, 2, 7, 18, 25, 17, 10, 34, 7, 2, 28, 19, 28, 20, 8, 21, 21, 26, 30, 18, 27, 1, 33, 10, 19, 14, 7, 3, 4, 10, 15, 19, 32, 15, 25, 32, 33, 6, 5, 29, 14, 4, 10, 30, 14, 9, 15, 8, 8, 24, 28, 16, 35, 5, 0, 7, 31, 18, 8, 28, 24, 3, 3, 17, 26, 12, 12, 16, 33, 23, 18, 35, 30, 12, 22, 30, 2, 2, 31, 5, 5, 17, 16, 4, 24, 5, 18, 30, 25, 14, 8, 17, 31, 31, 28, 4, 27, 35, 7, 19, 25, 32, 26, 8, 36, 16, 19, 34, 27, 35, 3, 7, 22, 27, 10, 16, 19, 26, 16, 6, 0, 14, 22, 32, 31, 34, 2, 22, 34, 18, 28, 9, 11, 13, 27, 29, 25, 35, 34, 29, 34, 3, 7, 6, 6, 17, 28, 9, 6, 18, 5, 29, 1, 26, 5, 17, 27, 1, 14, 20, 23, 20, 35, 36, 9, 17, 32, 30, 5, 1, 21, 6, 26, 1, 20, 19, 4, 13, 17, 15, 7, 12, 33, 2, 11, 26, 8, 0, 31, 14, 5, 9, 27, 29, 32, 29, 21, 5, 30, 29, 10, 26, 36, 3, 21, 18, 18, 21, 25, 28, 28, 12, 22, 2, 5, 15, 11, 9, 12, 17, 3, 21, 22, 27, 12, 17, 32, 16, 4, 12, 1, 11, 22, 27, 31, 0, 20, 2, 23, 12, 28, 24, 29, 2, 16, 36, 17, 0, 35, 7, 28, 28, 2, 33, 7, 22, 26, 22, 14, 3, 3, 33, 26, 4, 11, 27, 22, 1, 6, 22, 23, 34, 24, 10, 20, 3, 36, 23, 34, 15, 33, 12, 7, 36, 33, 5, 15, 29, 36, 20, 0, 0, 4, 11, 27, 25, 22, 34, 34, 7, 6, 27, 0, 21, 6, 14, 14, 21,  36, 15, 13, 5, 23, 13, 19, 14, 24, 1, 24, 8 28, 21, 21, 13, 4, 4, 6, 16, 3, 28, ,13, 5, 16, 24, 27, 26, 10, 13, 7, 7, 16, 3, 20, 27, 11, 20, 15, 0, 10, 24, 18, 35, 35, 26, 5, 10, 27, 24, 13, 4, 26, 8, 23, 18, 17, 12, 8, 10, 28, 30, 4, 1, 36, 26, 7, 0, 11, 6, 36, 34, 30, 21, 28, 14, 33, 3, 31, 15, 26, 28, 19, 33, 27, 27, 0, 34, 8, 18, 34, 23, 17, 7, 0, 2, 14, 20, 32, 27, 7, 21, 20, 32, 16, 23, 15, 28, 3, 5, 33, 19, 15, 2, 11, 2, 14, 13, 11, 1, 6, 12, 16, 9, 26, 2, 35, 28, 29, 35, 11, 26, 30, 5, 11, 33"""

# Clean and parse
cleaned = raw.replace('\n', ' ').replace('\t', ' ')
# Fix malformed entries like "28,35" -> "28, 35", "18 13" -> "18, 13", etc.
cleaned = re.sub(r'(\d)\s+(\d)', r'\1, \2', cleaned)
cleaned = re.sub(r'(\d),(\d)', r'\1, \2', cleaned)  # no space after comma
# Fix "19." -> "19," (period instead of comma)
cleaned = cleaned.replace('.', ',')
# Fix "28, ,13" -> "28, 13"
cleaned = re.sub(r',\s*,', ', ', cleaned)
# Fix empty entries from double commas
cleaned = re.sub(r'\s+', ' ', cleaned).strip()

parts = [p.strip() for p in cleaned.split(',') if p.strip()]
nums = []
bad_entries = []
for i, p in enumerate(parts):
    try:
        n = int(p)
        if 0 <= n <= 36:
            nums.append(n)
        else:
            bad_entries.append((i, p, f"out of range: {n}"))
    except ValueError:
        bad_entries.append((i, p, "not a number"))

print(f"=" * 80)
print(f"ANALISIS COMPLETO DE SECUENCIA DE RULETA")
print(f"=" * 80)

if bad_entries:
    print(f"\n[!] ENTRADAS CON ERRORES ({len(bad_entries)}):")
    for idx, val, reason in bad_entries[:20]:
        print(f"    Pos {idx}: '{val}' -> {reason}")

print(f"\nTotal numeros validos: {len(nums)}")
print(f"Primer numero: {nums[0]}")
print(f"Ultimo numero: {nums[-1]}")

# ─── BASIC STATS ───
RED_SET = set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

def get_color(n):
    if n == 0: return 'green'
    return 'red' if n in RED_SET else 'black'

colors = [get_color(n) for n in nums]
non_zero = [n for n in nums if n != 0]
non_zero_colors = [c for c in colors if c != 'green']

print(f"\n--- DISTRIBUCION BASICA ---")
print(f"Total spins: {len(nums)}")
print(f"Ceros (0): {nums.count(0)} ({nums.count(0)/len(nums)*100:.1f}%)")
print(f"Non-zero: {len(non_zero)}")
print(f"Rojos: {colors.count('red')} ({colors.count('red')/len(nums)*100:.1f}%)")
print(f"Negros: {colors.count('black')} ({colors.count('black')/len(nums)*100:.1f}%)")
print(f"Verdes: {colors.count('green')} ({colors.count('green')/len(nums)*100:.1f}%)")
print(f"Rojos (solo non-zero): {non_zero_colors.count('red')} ({non_zero_colors.count('red')/len(non_zero_colors)*100:.1f}%)")
print(f"Negros (solo non-zero): {non_zero_colors.count('black')} ({non_zero_colors.count('black')/len(non_zero_colors)*100:.1f}%)")

# Number frequency
num_counts = Counter(nums)
print(f"\n--- FRECUENCIA DE NUMEROS (Top 15 mas frecuentes) ---")
for num, count in num_counts.most_common(15):
    color = get_color(num)
    print(f"  #{num:2d} ({color:5s}): {count} veces")

print(f"\n--- FRECUENCIA DE NUMEROS (Top 15 menos frecuentes) ---")
for num, count in num_counts.most_common()[-15:]:
    color = get_color(num)
    print(f"  #{num:2d} ({color:5s}): {count} veces")

# Missing numbers
all_nums = set(range(37))
missing = all_nums - set(nums)
if missing:
    print(f"\n[!] Numeros que NUNCA aparecen: {sorted(missing)}")
else:
    print(f"\nTodos los numeros 0-36 aparecen al menos una vez")

# ─── STREAK ANALYSIS ───
print(f"\n--- ANALISIS DE RACHAS DE COLOR ---")
streaks = []
current_streak = 1
for i in range(1, len(non_zero_colors)):
    if non_zero_colors[i] == non_zero_colors[i-1]:
        current_streak += 1
    else:
        streaks.append((non_zero_colors[i-1], current_streak))
        current_streak = 1
streaks.append((non_zero_colors[-1], current_streak))

streak_lengths = [s[1] for s in streaks]
print(f"Total rachas: {len(streaks)}")
print(f"Promedio longitud: {sum(streak_lengths)/len(streak_lengths):.2f}")
print(f"Maxima racha: {max(streak_lengths)} ({[s for s in streaks if s[1] == max(streak_lengths)][0][0]})")

# Streak length distribution
streak_dist = Counter(streak_lengths)
print(f"\nDistribucion de longitud de rachas:")
for length in sorted(streak_dist.keys()):
    count = streak_dist[length]
    pct = count / len(streaks) * 100
    bar = '#' * int(pct)
    print(f"  Longitud {length:2d}: {count:4d} ({pct:5.1f}%) {bar}")

# Break rates at each streak length
print(f"\n--- TASA DE RUPTURA POR LONGITUD DE RACHA ---")
print(f"(Que porcentaje de rachas se ROMPEN al llegar a esta longitud)")
for target_len in range(2, 12):
    reached = [s for s in streaks if s[1] >= target_len]
    if len(reached) >= 2:
        broke = [s for s in reached if s[1] == target_len]
        survived = [s for s in reached if s[1] > target_len]
        break_rate = len(broke) / len(reached) * 100
        print(f"  Rachas de {target_len}: {len(reached)} alcanzaron, {len(broke)} rompieron ({break_rate:.1f}%), {len(survived)} continuaron ({100-break_rate:.1f}%)")

# ─── CONSECUTIVE ZEROS ───
print(f"\n--- ANALISIS DE CEROS ---")
zero_positions = [i for i, n in enumerate(nums) if n == 0]
consecutive_zeros = []
zero_streak = 0
for n in nums:
    if n == 0:
        zero_streak += 1
    else:
        if zero_streak > 0:
            consecutive_zeros.append(zero_streak)
        zero_streak = 0
if zero_streak > 0:
    consecutive_zeros.append(zero_streak)

print(f"Ceros totales: {len(zero_positions)}")
print(f"Porcentaje: {len(zero_positions)/len(nums)*100:.2f}% (esperado: 2.70%)")
if consecutive_zeros:
    print(f"Rachas de cero: {consecutive_zeros}")
    print(f"Max racha de ceros: {max(consecutive_zeros)}")

# Check back-to-back zeros
back_to_back = sum(1 for i in range(1, len(nums)) if nums[i] == 0 and nums[i-1] == 0)
print(f"Ceros consecutivos (back-to-back): {back_to_back}")

# ─── CONSECUTIVE SAME NUMBER ───
print(f"\n--- NUMEROS REPETIDOS CONSECUTIVAMENTE ---")
consecutive_same = []
for i in range(1, len(nums)):
    if nums[i] == nums[i-1] and nums[i] != 0:
        consecutive_same.append((i-1, nums[i]))

if consecutive_same:
    print(f"Total repeticiones consecutivas: {len(consecutive_same)}")
    # Group by number
    same_counts = Counter([x[1] for x in consecutive_same])
    for num, count in same_counts.most_common(10):
        print(f"  #{num:2d} ({get_color(num)}): repetido consecutivamente {count} veces")
else:
    print(f"No hay numeros repetidos consecutivamente")

# ─── ALTERNATING PATTERN ANALYSIS ───
print(f"\n--- PATRONES DE ALTERNANCIA ---")
# Check for long alternating patterns
alt_streaks = []
alt_len = 1
for i in range(1, len(non_zero_colors)):
    if non_zero_colors[i] != non_zero_colors[i-1]:
        alt_len += 1
    else:
        if alt_len >= 4:
            alt_streaks.append(alt_len)
        alt_len = 1
if alt_len >= 4:
    alt_streaks.append(alt_len)

if alt_streaks:
    print(f"Patrones de alternancia >= 4: {len(alt_streaks)}")
    print(f"Longitudes: {sorted(alt_streaks, reverse=True)[:10]}")
else:
    print("No hay patrones de alternancia larga")

# ─── WHEEL DISPLACEMENT ANALYSIS ───
WHEEL_LAYOUT = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
WHEEL_INDEX = {n: i for i, n in enumerate(WHEEL_LAYOUT)}

displacements = []
for i in range(1, len(nums)):
    if nums[i] == 0 or nums[i-1] == 0:
        continue
    idx_prev = WHEEL_INDEX.get(nums[i-1])
    idx_curr = WHEEL_INDEX.get(nums[i])
    if idx_prev is not None and idx_curr is not None:
        diff = idx_curr - idx_prev
        if diff < 0: diff += 37
        displacements.append(diff)

print(f"\n--- DESPLAZAMIENTO DE RULETA (Wheel Displacement) ---")
print(f"Total desplazamientos: {len(displacements)}")
if displacements:
    avg_disp = sum(displacements) / len(displacements)
    print(f"Promedio: {avg_disp:.1f} posiciones")
    print(f"Mediana: {sorted(displacements)[len(displacements)//2]}")
    
    # Check for consistent dealer (low variance in recent spins)
    for window_size in [5, 10, 20]:
        if len(displacements) >= window_size:
            recent = displacements[-window_size:]
            avg = sum(recent) / len(recent)
            variance = sum((d - avg)**2 for d in recent) / len(recent)
            std = variance ** 0.5
            print(f"  Ultimas {window_size} tiradas: avg={avg:.1f}, var={variance:.1f}, std={std:.1f}")

# ─── V4.2 PREDICTION SIMULATION ───
print(f"\n{'=' * 80}")
print(f"SIMULACION MOTOR v4.2 - PREDICCION COLOR")
print(f"{'=' * 80}")

def simulate_v42_prediction(history):
    """Port of the v4.2 anti-streak logic for color prediction."""
    if len(history) < 5:
        return 'black', 50, 'normal', 0, 0  # default
    
    nz = [n for n in history if n != 0]
    nz_colors = [get_color(n) for n in nz]
    
    # Calculate current streak
    max_r, max_b = 0, 0
    for c in nz_colors:
        if c == 'red': max_r += 1; max_b = 0
        elif c == 'black': max_b += 1; max_r = 0
    
    current_streak = max(max_r, max_b)
    streak_color = 'red' if max_r > max_b else 'black'
    opposite_color = 'black' if max_r > max_b else 'red'
    
    # Post-streak analysis
    def post_streak_analysis():
        if len(nz_colors) < 10:
            return 55, 2.5
        all_streaks = []
        breaks = []
        s_len = 1
        for i in range(1, len(nz_colors)):
            if nz_colors[i] == nz_colors[i-1]:
                s_len += 1
            else:
                all_streaks.append(s_len)
                breaks.append((s_len, True))
                s_len = 1
        all_streaks.append(s_len)
        breaks.append((s_len, False))
        
        avg_len = sum(all_streaks) / len(all_streaks) if all_streaks else 2.5
        
        reached = [(sl, b) for sl, b in breaks if b and sl >= current_streak]
        if len(reached) >= 2:
            broke_at = sum(1 for sl, _ in reached if sl == current_streak)
            total = len(reached)
            specific = broke_at / total * 100
            all_completed = [sl for sl, b in breaks if b]
            total_b = len(all_completed) or 1
            overall = sum(1 for sl in all_completed if sl <= current_streak) / total_b * 100
            blended = round(specific * 0.7 + overall * 0.3)
            return blended, avg_len
        return 55, avg_len
    
    breakPct, avgStreakLen = post_streak_analysis()
    avgBoost = (current_streak - avgStreakLen) * 10 if current_streak > avgStreakLen else 0
    
    # Compute anti-streak force
    bp = breakPct
    shouldPush = bp >= 49
    baseForce = 40 if current_streak <= 3 else 50
    lengthBonus = max(0, current_streak - 3) * 12
    probBonus = (bp - 49) * 1.2 if bp >= 49 else 0
    force = baseForce + lengthBonus + probBonus + avgBoost
    
    red_score = 0
    black_score = 0
    
    if current_streak >= 5:  # ULTRA
        if shouldPush:
            if opposite_color == 'red': red_score += force; black_score -= force * 0.3
            else: black_score += force; red_score -= force * 0.3
        else:
            if opposite_color == 'red': red_score += 5
            else: black_score += 5
        mode = 'ULTRA'
    elif current_streak == 4:  # STRONG
        if shouldPush:
            if opposite_color == 'red': red_score += force; black_score -= force * 0.5
            else: black_score += force; red_score -= force * 0.5
        else:
            if opposite_color == 'red': red_score += 15
            else: black_score += 15
        mode = 'STRONG'
    elif current_streak == 3:  # MEDIUM
        if shouldPush:
            if opposite_color == 'red': red_score += force; black_score -= force * 0.5
            else: black_score += force; red_score -= force * 0.5
        mode = 'MEDIUM'
    elif current_streak == 2:  # SOFT
        # Simplified: anti-streak nudge + freq
        last10 = nz[-10:]
        freqs = {'red': 0, 'black': 0}
        for n in last10:
            c = get_color(n)
            if c in freqs: freqs[c] += 1
        
        red_score = freqs['red'] * 1.5
        black_score = freqs['black'] * 1.5
        
        # Anti-streak nudge
        if opposite_color == 'red':
            red_score += 30; black_score -= 18
        else:
            black_score += 30; red_score -= 18
        
        # Streak
        red_score += 6 if streak_color != 'red' else -6
        black_score += 6 if streak_color != 'black' else -6
        
        mode = 'SOFT'
    else:  # NORMAL
        # Multi-window frequency
        windows = [5, 10, 20, 37]
        weights_w = [1, 1.5, 2.5, 3]
        for w_idx, w in enumerate(windows):
            slice_data = nz[-w:] if len(nz) >= w else nz
            stotal = len(slice_data) or 1
            expected = 50  # for 2 categories
            for c in ['red', 'black']:
                freq = sum(1 for n in slice_data if get_color(n) == c)
                score = freq * weights_w[w_idx]
                actual_pct = (freq / stotal) * 100
                deviation = expected - actual_pct
                score += deviation * weights_w[w_idx] * 0.6
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
                total = sum(tr.values())
                if total > 0:
                    red_score += (tr.get('red', 0) / total) * 100 * 2.5
                    black_score += (tr.get('black', 0) / total) * 100 * 2.5
        
        mode = 'NORMAL'
    
    prediction = 'red' if red_score > black_score else ('black' if black_score > red_score else 'black')
    total_score = abs(red_score - black_score)
    
    return prediction, total_score, mode, current_streak, breakPct

# Run simulation
correct = 0
wrong = 0
total_predictions = 0
mode_stats = {'NORMAL': [0, 0], 'SOFT': [0, 0], 'MEDIUM': [0, 0], 'STRONG': [0, 0], 'ULTRA': [0, 0]}
streak_bugs = []  # Cases where anti-streak should have kicked in but predicted wrong
missed_opportunities = []

# Start from spin 20 to have enough history
print(f"\nSimulando desde spin 20 hasta {len(nums)}...")
for i in range(20, len(nums)):
    history = nums[:i]
    actual_color = get_color(nums[i])
    if actual_color == 'green':
        continue
    
    predicted, score, mode, streak_len, breakPct = simulate_v42_prediction(history)
    total_predictions += 1
    
    if predicted == actual_color:
        correct += 1
        mode_stats[mode][0] += 1
    else:
        wrong += 1
        mode_stats[mode][1] += 1
        
        # Log streak bugs
        if streak_len >= 3:
            streak_bugs.append({
                'spin': i,
                'actual': actual_color,
                'predicted': predicted,
                'mode': mode,
                'streak_len': streak_len,
                'breakPct': breakPct,
                'prev_nums': history[-streak_len:]
            })

accuracy = correct / total_predictions * 100 if total_predictions > 0 else 0

print(f"\n--- RESULTADOS DE SIMULACION v4.2 ---")
print(f"Total predicciones: {total_predictions}")
print(f"Correctas: {correct} ({accuracy:.1f}%)")
print(f"Incorrectas: {wrong} ({100-accuracy:.1f}%)")

print(f"\n--- PRECISION POR MODO ---")
for mode, (hits, misses) in sorted(mode_stats.items()):
    total_mode = hits + misses
    pct = hits / total_mode * 100 if total_mode > 0 else 0
    print(f"  {mode:8s}: {hits:4d}/{total_mode:4d} ({pct:.1f}%)")

print(f"\n--- ERRORES EN MODO ANTI-STREAK (streak >= 3) ---")
print(f"Total errores durante rachas: {len(streak_bugs)}")
if streak_bugs:
    # Analyze error patterns
    by_streak_len = {}
    by_mode = {}
    for bug in streak_bugs:
        sl = bug['streak_len']
        m = bug['mode']
        by_streak_len[sl] = by_streak_len.get(sl, 0) + 1
        by_mode[m] = by_mode.get(m, 0) + 1
    
    print(f"\n  Por longitud de racha:")
    for sl in sorted(by_streak_len.keys()):
        print(f"    Streak {sl}: {by_streak_len[sl]} errores")
    
    print(f"\n  Por modo:")
    for m in sorted(by_mode.keys()):
        print(f"    {m}: {by_mode[m]} errores")
    
    print(f"\n  Primeros 20 errores de racha:")
    for bug in streak_bugs[:20]:
        prev_str = ', '.join([str(n) for n in bug['prev_nums']])
        print(f"    Spin {bug['spin']:4d}: prediccion={bug['predicted']:5s}, real={bug['actual']:5s}, "
              f"streak={bug['streak_len']}, mode={bug['mode']:6s}, breakPct={bug['breakPct']:.0f}%, "
              f"prev=[{prev_str}]")

# ─── SPECIFIC ANOMALY DETECTION ───
print(f"\n{'=' * 80}")
print(f"DETECCION DE ANOMALIAS ESPECIFICAS")
print(f"{'=' * 80}")

# 1. Check for "18 13" without comma (fused numbers)
print(f"\n--- CHECK: Posibles numeros fusionados ---")
# Already handled in parsing, check if any numbers > 36 were rejected
out_of_range = [e for e in bad_entries if 'out of range' in e[2]]
if out_of_range:
    print(f"Numeros fuera de rango detectados: {len(out_of_range)}")
    for idx, val, reason in out_of_range:
        print(f"  Pos {idx}: '{val}' -> {reason}")
else:
    print(f"No se detectaron numeros fusionados (todos estan en rango 0-36)")

# 2. Double comma / empty entries
print(f"\n--- CHECK: Entradas vacias o dobles comas ---")
empty_entries = [e for e in bad_entries if 'not a number' in e[2]]
if empty_entries:
    print(f"Entradas vacias detectadas: {len(empty_entries)}")
else:
    print(f"No hay entradas vacias")

# 3. Check expected red/black ratio
print(f"\n--- CHECK: Balance Rojo/Negro ---")
expected_ratio = 48.65  # European roulette (18/37)
actual_ratio = non_zero_colors.count('red') / len(non_zero_colors) * 100
deviation = actual_ratio - expected_ratio
print(f"Proporcion Rojo (non-zero): {actual_ratio:.2f}% (esperado: {expected_ratio:.2f}%)")
print(f"Desviacion: {deviation:+.2f}%")
if abs(deviation) > 2:
    print(f"  [!] Desviacion significativa detectada!")
else:
    print(f"  OK - Dentro de rango normal")

# 4. Check for suspicious patterns (e.g., long runs of same color)
print(f"\n--- CHECK: Rachas inusualmente largas ---")
long_streaks = [(s[0], s[1]) for s in streaks if s[1] >= 6]
if long_streaks:
    print(f"Rachas >= 6 encontradas: {len(long_streaks)}")
    for color, length in long_streaks:
        # Find where this streak occurred
        idx = 0
        count = 0
        for i, (c, l) in enumerate(streaks):
            if c == color and l == length:
                if count == [x for x in streaks if x[0] == color and x[1] == length].index((color, length)):
                    # Find position in original sequence
                    pos = sum(s[1] for s in streaks[:i])
                    print(f"  Pos ~{pos}: {length}x {color} consecutivos")
                count += 1
else:
    print(f"No hay rachas de 6+ colores")

# 5. Parity check
print(f"\n--- CHECK: Paridad (Impar/Par) ---")
odd = sum(1 for n in non_zero if n % 2 == 1)
even = sum(1 for n in non_zero if n % 2 == 0)
print(f"Impares: {odd} ({odd/len(non_zero)*100:.1f}%)")
print(f"Pares: {even} ({even/len(non_zero)*100:.1f}%)")

# 6. Dozen check
print(f"\n--- CHECK: Docenas ---")
d1 = sum(1 for n in non_zero if 1 <= n <= 12)
d2 = sum(1 for n in non_zero if 13 <= n <= 24)
d3 = sum(1 for n in non_zero if 25 <= n <= 36)
total_d = d1 + d2 + d3
print(f"1ra docena (1-12): {d1} ({d1/total_d*100:.1f}%)")
print(f"2da docena (13-24): {d2} ({d2/total_d*100:.1f}%)")
print(f"3ra docena (25-36): {d3} ({d3/total_d*100:.1f}%)")

# 7. Zero frequency anomaly
print(f"\n--- CHECK: Frecuencia de Cero ---")
zero_rate = nums.count(0) / len(nums) * 100
expected_zero = 100/37  # 2.70%
print(f"Tasa de cero: {zero_rate:.2f}% (esperado: {expected_zero:.2f}%)")
if zero_rate > 4:
    print(f"  [!] Tasa de cero inusualmente alta!")
elif zero_rate < 1.5:
    print(f"  [!] Tasa de cero inusualmente baja!")

# ─── SPECIFIC BUG PATTERNS ───
print(f"\n{'=' * 80}")
print(f"ANALISIS DE PATRONES CRITICOS PARA EL MOTOR")
print(f"{'=' * 80}")

# Pattern: After 3+ same color, what actually happens next?
print(f"\n--- LO QUE PASA DESPUES DE RACHAS (DATO REAL) ---")
for target_streak in [2, 3, 4, 5, 6, 7, 8]:
    results = []
    for i in range(len(non_zero_colors) - target_streak):
        # Check if spins i to i+target_streak-1 are same color
        streak_color_check = non_zero_colors[i]
        is_streak = all(non_zero_colors[i+j] == streak_color_check for j in range(target_streak))
        if is_streak and i + target_streak < len(non_zero_colors):
            # Check what comes after (skip zeros in original sequence)
            # Find the next non-zero color after this streak
            actual_pos = 0
            count = 0
            for j in range(len(nums)):
                if get_color(nums[j]) != 'green':
                    if count == i + target_streak:
                        actual_pos = j
                        break
                    count += 1
            
            if actual_pos > 0 and actual_pos + 1 < len(nums):
                next_color = get_color(nums[actual_pos + 1]) if get_color(nums[actual_pos + 1]) != 'green' else None
                if next_color:
                    results.append(next_color == streak_color_check)  # True = continued
    
    if len(results) >= 3:
        continued = sum(1 for r in results if r)
        broke = sum(1 for r in results if not r)
        break_rate = broke / len(results) * 100
        print(f"  Streak {target_streak}: {len(results)} casos, {broke} rompen ({break_rate:.1f}%), {continued} continuan ({100-break_rate:.1f}%)")
    elif len(results) > 0:
        continued = sum(1 for r in results if r)
        broke = sum(1 for r in results if not r)
        print(f"  Streak {target_streak}: {len(results)} casos (pocos datos), {broke} rompen, {continued} continuan")

print(f"\n--- FIN DEL ANALISIS ---")
print(f"Total numeros procesados: {len(nums)}")
