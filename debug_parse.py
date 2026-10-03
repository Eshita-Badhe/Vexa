import ast
from pathlib import Path
src = Path('backend/services/anomaly_detector.py').read_text(encoding='utf-8')
print(src[:2000])
print('--- PARSING ---')
ast.parse(src)
print('OK')
