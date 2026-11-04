import json,glob,importlib.util,os
B=os.path.dirname(os.path.abspath(__file__))
def load(f):
    sp=importlib.util.spec_from_file_location(os.path.basename(f)[:-3],f); m=importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
ent=dict(load(B+'/ent.py').ENT)
ent.update(json.load(open(B+'/countries.json',encoding='utf-8')))
d={}
for f in sorted(glob.glob(B+'/d_*.py')):
    m=load(f); 
    for k,v in m.D.items():
        if k in d and d[k]!=v: print('DUPLIKAT s drugom vrijednošću:',k)
        d[k]=v
ctry=json.load(open(B+'/countries.json',encoding='utf-8'))
out='/* engleski rječnik: generira se iz i18n/*.py (python3 i18n/gen.py) */\nconst EN_ENT = '+json.dumps(ent,ensure_ascii=False,indent=1)+';\nconst EN_CTRY = '+json.dumps(sorted(set(ctry.values())),ensure_ascii=False)+';\nconst EN_DICT = '+json.dumps(d,ensure_ascii=False,indent=0)+';\n'
open(B+'/../i18n-en.js','w',encoding='utf-8').write(out)
print(len(ent),'entiteta',len(d),'izraza')
