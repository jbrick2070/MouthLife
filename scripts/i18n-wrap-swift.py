#!/usr/bin/env python3
"""
Routes on-screen text in the native SwiftUI screens through L10n.t(...).

    python scripts/i18n-wrap-swift.py            rewrite files in place (safe to run again)

Wraps the text argument of Text, Label, Button, Toggle, Picker, TextField, Link and of
.navigationTitle / .accessibilityLabel / .accessibilityHint. Calls that take a closure label,
a named first argument (Button(action:), Text(verbatim:)) or more than plain text are left alone.
"""
import io
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'native-apple', 'MouthLifeApp', 'UI')
SINGLE_ARG = {'Text'}                      # wrap only when the call has exactly one unlabeled argument
FIRST_ARG = {'Label', 'Button', 'Toggle', 'Picker', 'TextField', 'Link'}
MODIFIERS = {'navigationTitle', 'accessibilityLabel', 'accessibilityHint'}


def split_args(body):
    """Split a call's argument text at top-level commas."""
    args, depth, cur, i, n = [], 0, '', 0, len(body)
    while i < n:
        c = body[i]
        if c == '"':
            j = i + 1
            while j < n and body[j] != '"':
                if body[j] == '\\' and j + 1 < n and body[j + 1] == '(':
                    d = 1
                    j += 2
                    while j < n and d > 0:
                        if body[j] == '(':
                            d += 1
                        elif body[j] == ')':
                            d -= 1
                        j += 1
                    continue
                j += 2 if body[j] == '\\' else 1
            cur += body[i:j + 1]
            i = j + 1
            continue
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        if c == ',' and depth == 0:
            args.append(cur)
            cur = ''
        else:
            cur += c
        i += 1
    args.append(cur)
    return args


def find_close(src, open_idx):
    depth, i, n = 0, open_idx, len(src)
    while i < n:
        c = src[i]
        if c == '"':
            if src.startswith('"""', i):
                i = src.index('"""', i + 3) + 3
                continue
            i += 1
            while i < n and src[i] != '"':
                if src[i] == '\\' and i + 1 < n and src[i + 1] == '(':
                    d = 1
                    i += 2
                    while i < n and d > 0:
                        if src[i] == '(':
                            d += 1
                        elif src[i] == ')':
                            d -= 1
                        i += 1
                    continue
                i += 2 if src[i] == '\\' else 1
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def wrappable(arg):
    a = arg.strip()
    if not a or a.startswith('L10n.t(') or a.startswith('{') or a.startswith('Text(') or a.startswith('Image('):
        return False
    if re.match(r'^[A-Za-z_]\w*\s*:', a):      # labeled argument (action:, verbatim:, role:, title:)
        return False
    if 'specifier:' in a or a.startswith('.'):
        return False
    return True


def wrap(arg):
    lead = arg[:len(arg) - len(arg.lstrip())]
    trail = arg[len(arg.rstrip()):]
    return f'{lead}L10n.t({arg.strip()}){trail}'


CALL = re.compile(r'(?<![\w.])(' + '|'.join(sorted(SINGLE_ARG | FIRST_ARG)) + r')\(|\.(' + '|'.join(sorted(MODIFIERS)) + r')\(')


def transform(src):
    out, pos, count = [], 0, 0
    for m in CALL.finditer(src):
        if m.start() < pos:
            continue
        name = m.group(1) or m.group(2)
        open_idx = m.end() - 1
        close = find_close(src, open_idx)
        if close < 0:
            continue
        body = src[open_idx + 1:close]
        args = split_args(body)
        if name in SINGLE_ARG or name in MODIFIERS:
            if len(args) != 1 or not wrappable(args[0]):
                continue
        elif not wrappable(args[0]):
            continue
        # Translate nested calls inside the remaining arguments too.
        rest = [transform(a)[0] for a in args[1:]]
        inner_first, _ = (args[0], 0)
        new_body = ','.join([wrap(inner_first)] + rest)
        out.append(src[pos:open_idx + 1])
        out.append(new_body)
        pos = close
        count += 1
    out.append(src[pos:])
    return ''.join(out), count


total = 0
for d, _, files in os.walk(ROOT):
    for f in files:
        if not f.endswith('.swift'):
            continue
        p = os.path.join(d, f)
        src = io.open(p, encoding='utf-8').read()
        new, n = transform(src)
        if new != src:
            io.open(p, 'w', encoding='utf-8', newline='').write(new)
        total += n
        print(f'{n:4d}  {os.path.relpath(p, ROOT)}')
print('wrapped', total, 'calls')
