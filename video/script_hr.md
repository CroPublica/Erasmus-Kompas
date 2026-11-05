# Erasmus+ Kompas: skripta za video

## 1. Problem

Od dvije tisuće četrnaeste godine u KA2 partnerstvima programa Erasmus+ sudjelovala je tek jedna od tri hrvatske osnovne i srednje škole. Koje su to škole? S kim surađuju? Čime se bave njihovi projekti? Erasmus+ Kompas pruža odgovore na ova pitanja. 

## 2. Ciljni korisnici

Erasmus+ Kompas namijenjen je školama, udrugama, gradovima, županijama, građanima, novinarima te istraživačima koji žele saznati više o samim projektima.

## 3. Izvori podataka

Podatke smo smo preuzeli s Platforme za rezultate projekata Erasmus+ te s Portala otvorenih podataka, gdje smo pronašli podatke Agencije za mobilnost i programe EU-a te registre obrazovnih ustanova u Hrvatskoj.

## 4. Funkcionalnosti

### Karta

Na karti odmah možemo vidjeti udio škola koji sudjeluje u svakoj županiji: od četrnaest i pol posto u Zagrebačkoj do gotovo pedeset sedam posto u Varaždinskoj županiji.

### Organizacije

Svaka organizacija ima svoju stranicu. Naprimjer, gimnazija Metković sudjelovala je u dvadeset dva projekta, a jedan je koordinirala. Popis se može filtrirati po županiji, vrsti i razdoblju te ga možete preuzeti kao CSV, Excel ili PDF datoteku.

### Mreža pojmova

Jezični model izdvojio je iz projektnih sažetaka probleme, pristupe, ciljne skupine i rezultate. Mreža pojmova pokazuje što ide zajedno, primjerice rano napuštanje školovanja i učenike u nepovoljnom položaju.

### Pitanja

Također možete i jednostavno pitati, na hrvatskom ili engleskom jeziku. Na upit „rani prekid školovanja” Asistent po značenju prepoznaje rano napuštanje školovanja i pronalazi četrdeset dva projekta, s primjerima i izvorima.

## 5. Tehnička arhitektura

Podaci se obrađuju u Pythonu i spajaju u bazu DuckDB, a iz nje nastaje statično web-sjedište izrađeno u alatu Astro. Sažetke je obradio jezični model pokrenut lokalno, a algoritam grupira povezane pojmove u skupine. Kad korisnik postavi pitanje, model samo usmjerava upit. Alati dohvaćaju podatke, a odgovor sastavlja kôd. Zato brojke proizlaze iz podataka, a ne iz modela.

## 6. Korisnička vrijednost

Škole imaju uvid u to tko u njihovoj županiji već sudjeluje u projektima i čime se ti projekti bave. Građani, novinari i istraživači mogu na jednostavan način saznati više o partnerstvima programa Erasmus+ u svojem kraju.

## 7. Daljnji razvoj

U planu su alat za traženje partnera, vodič za prvi projekt, redovito osvježavanje podataka svake godine i javni API.