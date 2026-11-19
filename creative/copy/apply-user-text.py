# Puts a rewritten copy/USER-TEXT.md back into the code: python3 copy/apply-user-text.py <rewritten.md>  (run from creative/)
# Each changed line is replaced where copy/user-text-key.json says it is used; what cannot be placed safely is listed for a hand edit.
import json, re, subprocess, sys

# Run once, on code with no other changes: a second run would put the new words in again where they contain the old ones.
if subprocess.run(['git', 'diff', '--quiet', '--', 'src', 'netlify', '*.html']).returncode:
    sys.exit('Commit or undo the changes in src/, netlify/ and the pages first: this must run on the code the list was made from.')

key = json.load(open('copy/user-text-key.json'))
new = {}
for line in open(sys.argv[1], encoding='utf-8'):
    m = re.match(r'^\[(\d+)\]\s?(.*?)\s*$', line)
    if m: new[m.group(1)] = m.group(2)

SLOT = re.compile(r'\{[^{}]*\}')
def typographic(text):
    return re.sub(r"(?<=\w)'(?=\w)|(?<=\w)'(?=\s|$|[.,!?])", '’', text)

def pattern(segment):
    return r'\s+'.join(re.escape(word) for word in segment.split(' '))

sources, manual, done = {}, [], 0
for i, entry in key.items():
    if i not in new or new[i] == entry['text']: continue
    old, rewrite = entry['text'], typographic(new[i])
    places = entry.get('places') or [entry['file']]
    if re.fullmatch(r'DELETE\b.*', rewrite.strip()) and not rewrite.strip().startswith('Deletes'):
        manual.append((i, 'DELETE', old, rewrite, places)); continue
    old_parts, new_parts = SLOT.split(old), SLOT.split(rewrite)
    if SLOT.findall(old) != SLOT.findall(rewrite):
        manual.append((i, 'slots differ', old, rewrite, places)); continue
    for place in places:
        file, _, line = place.partition(':')
        text = sources.setdefault(file, open(file, encoding='utf-8').read())
        lines = text.split('\n')
        start = sum(len(l) + 1 for l in lines[:max(0, int(line or 1) - 20)]) if line else 0
        end = sum(len(l) + 1 for l in lines[:int(line) + 8]) if line else len(text)
        window, at, out, ok = text[start:end], 0, '', True
        for before, after in zip(old_parts, new_parts):
            if not before.strip():
                if after.strip(): ok = False; break
                continue
            # The words keep their surroundings; leading and trailing spaces of a piece stay as the code has them.
            lead, core, _trail = re.match(r'^(\s*)(.*?)(\s*)$', before).groups()
            found = re.compile(pattern(core)).search(window, at)
            if not found: ok = False; break
            replacement = after.strip() if core else after
            quote = window[found.start() - 1] if found.start() else ''
            if quote == "'" and "'" in replacement or quote == '"' and '"' in replacement: replacement = replacement.replace('"', '“')
            out += window[at:found.start()] + replacement
            at = found.end()
        if not ok:
            manual.append((i, f'not found in {place}', old, rewrite, [place])); continue
        sources[file] = text[:start] + out + window[at:] + text[end:]
        done += 1

for file, text in sources.items(): open(file, 'w', encoding='utf-8').write(text)
print(done, 'places replaced;', len(manual), 'left for a hand edit')
json.dump([dict(id=i, why=why, old=old, new=rewrite, places=places) for i, why, old, rewrite, places in manual], open('/tmp/manual.json', 'w'), ensure_ascii=False, indent=1)
for i, why, old, rewrite, places in manual: print(f'[{i}] {why}\n   old: {old}\n   new: {rewrite}\n   at: {places}')
