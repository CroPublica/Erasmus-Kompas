import re,json,glob,importlib.util,os
B=os.path.dirname(os.path.abspath(__file__))+'/'
def load(f):
    sp=importlib.util.spec_from_file_location(os.path.basename(f)[:-3],f); m=importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
d={}
for f in sorted(glob.glob(B+'d_*.py')): d.update(load(f).D)
tok=lambda s: set(re.findall(r"[^\W\d_]+",s.lower()))
hr=set(); en=set()
for k,v in d.items(): hr|=tok(k); en|=tok(v)
STOP=set('je se su na za od do po uz iz kao ili koji koje koja nije nema sve svi sva samo barem ima što kako tko gdje koliko koja kojima kroz preko među pored već još jer ali te ni ne da li bi će'.split())
hrv=(hr-en)|STOP
# jednoslovne riječi (a, i, o, u) se više ne preskaču: „91 u 2014–2020” se ranije nikad nije prijavilo
def looks_hr(k):
    if re.search(r'[čćžšđČĆŽŠĐ]',k): return True
    return bool(tok(k)&hrv)
