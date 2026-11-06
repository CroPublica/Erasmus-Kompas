# Erasmus+ Kompas: skripta za video

## 1. Problem

Od dvije tisuće četrnaeste godine u KA2 partnerstvima programa Erasmus+ sudjelovala je tek jedna od tri hrvatske osnovne i srednje škole. Koje su to škole? S kim surađuju? Čime se bave njihovi projekti? Erasmus+ Kompas pruža odgovore na ova pitanja. 

### Što je KA2?

KA2 je ključna aktivnost programa Erasmus+ u kojoj razne organizacije surađuju i razmjenjuju iskustva.

## 2. Ciljani korisnici

Erasmus+ Kompas namijenjen je školama, udrugama, gradovima, županijama, građanima, novinarima te istraživačima koji žele saznati više o KA2 projektima.

## 3. Izvori podataka

Podatke smo preuzeli s Platforme za rezultate projekata Erasmus+ te s Portala otvorenih podataka, gdje smo pronašli podatke Agencije za mobilnost i programe EU-a te registre obrazovnih ustanova u Hrvatskoj.

## 4. Funkcionalnosti

### Pregled

Možete istražiti podatke po županijama i temama, pronaći projekte i organizacije ili pitati Asistenta.

### Karta

Na karti možete vidjeti udio škola koje sudjeluju u svakoj županiji: od četrnaest i pol posto u Zagrebačkoj do gotovo pedeset sedam posto u Varaždinskoj županiji.

### Organizacije

Svaka organizacija ima svoju stranicu. Na primjer, Gimnazija Metković sudjelovala je u dvadeset dva projekta, a jedan je koordinirala. Popis se može filtrirati po županiji, vrsti i razdoblju te preuzeti kao CSV, Excel ili PDF datoteku.

### Mreža pojmova

Jezični model izdvojio je iz projektnih sažetaka probleme, pristupe, ciljane skupine i rezultate. Mreža pojmova prikazuje povezane pojmove, primjerice rano napuštanje školovanja i učenike u nepovoljnom položaju.

### Pitanja

Također možete jednostavno pitati Asistenta na hrvatskom ili engleskom jeziku. Na upit „rano napuštanje školovanja” Asistent pronalazi sto sedamdeset pet relevantnih projekata, s primjerima i izvorima.

## 5. Tehnička arhitektura

Podaci se obrađuju u Pythonu i spajaju u bazu DuckDB, a iz nje nastaje statično web-sjedište izrađeno u alatu Astro. Sažetke je obradio jezični model pokrenut lokalno, a algoritam grupira povezane pojmove u skupine. Kad korisnik postavi pitanje, model samo usmjerava upit. Alati dohvaćaju podatke, a odgovor sastavlja kôd. Zato brojke proizlaze iz podataka, a ne iz modela.

## 6. Korisnička vrijednost

Škole imaju uvid u to tko u njihovoj županiji već sudjeluje u projektima i čime se ti projekti bave. Građani, novinari i istraživači mogu na jednostavan način saznati više o partnerstvima programa Erasmus+ u svojem kraju.

## 7. Daljnji razvoj

U planu su alat za traženje partnera, vodič za prvi projekt, godišnje osvježavanje podataka i javni API.