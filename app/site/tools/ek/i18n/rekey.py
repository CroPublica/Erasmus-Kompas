import json,re,sys,importlib.util
B='/home/claude/v8/i18n/'
sp=importlib.util.spec_from_file_location('ent',B+'ent.py'); m=importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
ent=dict(m.ENT); ent.update(json.load(open(B+'countries.json',encoding='utf-8')))
v7=open('/home/claude/proto/erasmus-kompas-dizajn-v7.html',encoding='utf-8').read()
i=v7.index('const D = ')+10
D,_=json.JSONDecoder().raw_decode(v7[i:])
names=set(ent)
for c in D['counties']: names.add(c['label']); names.add(c['label'].replace(' županija',''))
lst=sorted(names,key=len,reverse=True)
ER=re.compile(r'(?<![\w-])(?:'+'|'.join(re.escape(x) for x in lst)+r')(?![\w-])')
def norm(t):
    t=re.sub(r'\s+',' ',t).strip()
    t=re.sub(r'(\d{4})\.\s?[–-]\s?(\d{4})\.?',r'\1–\2',t)
    t=re.sub(r'(\d)\s%',r'\1%',t)
    return t
def key(raw):
    t=norm(raw); t=ER.sub('{E}',t); t=re.sub(r'\d+(?:[.,]\d+)*','{N}',t); return t
data=set()
for p in D['projects']: data.add(p[1].strip().lower())
for o in D['orgs']: data.add(o[1].strip().lower()); data.add((o[2] or '').strip().lower())
for t in D['topics']['topics']: data.add(t['name'].lower())
for n in D['graph']['nodes']: data.add(n[2].lower()); data.add((n[3] or '').lower())
for c in D['graph']['communities']: data.update(x.lower() for x in c['name'])
if __name__=='__main__':
    src=json.load(open(sys.argv[1])); out={}
    for k,v in src.items():
        if v['raw'].lower() in data or k.lower() in data: continue
        nk=key(v['raw'])
        if nk=='{E}' : continue
        if not re.search(r'[^\W\d_]{2,}',re.sub(r'\{[NE]\}','',nk)): continue
        if nk not in out: out[nk]=v
    json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=0); print(len(src),'->',len(out))
