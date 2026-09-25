// Starting points for the agent's market research, per country. These are
// hints, not an allowlist: the agent still searches the open web and judges
// every source itself. Keep entries to well-established shops.

export interface Region {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
  timezone: string; // IANA, used to localize web search
  languages: string[];
  retailers: string[];
  priceComparison: string[];
  marketplaces: string[]; // second-hand / classifieds
  prebuiltBrands?: string[];
}

export const REGIONS: Region[] = [
  {
    code: "CH",
    name: "Switzerland",
    currency: "CHF",
    timezone: "Europe/Zurich",
    languages: ["German", "French", "Italian"],
    retailers: ["digitec.ch", "galaxus.ch", "brack.ch", "interdiscount.ch", "microspot.ch", "mediamarkt.ch", "alternate.ch", "steg-electronics.ch", "pcking.ch"],
    priceComparison: ["toppreise.ch"],
    marketplaces: ["ricardo.ch", "tutti.ch", "anibis.ch", "ebay.ch"],
  },
  {
    code: "DE",
    name: "Germany",
    currency: "EUR",
    timezone: "Europe/Berlin",
    languages: ["German"],
    retailers: ["mindfactory.de", "alternate.de", "caseking.de", "notebooksbilliger.de", "cyberport.de", "computeruniverse.net", "galaxus.de", "mediamarkt.de", "proshop.de", "amazon.de"],
    priceComparison: ["geizhals.de", "idealo.de"],
    marketplaces: ["kleinanzeigen.de", "ebay.de", "backmarket.de", "rebuy.de"],
    prebuiltBrands: ["dubaro.de", "one.de", "memorypc.de", "agando.de", "caseking.de (King Mod systems)"],
  },
  {
    code: "AT",
    name: "Austria",
    currency: "EUR",
    timezone: "Europe/Vienna",
    languages: ["German"],
    retailers: ["e-tec.at", "cyberport.at", "mediamarkt.at", "alternate.at", "galaxus.at", "amazon.de"],
    priceComparison: ["geizhals.at"],
    marketplaces: ["willhaben.at", "ebay.at", "ebay.de"],
  },
  {
    code: "US",
    name: "United States",
    currency: "USD",
    timezone: "America/New_York",
    languages: ["English"],
    retailers: ["newegg.com", "microcenter.com", "bestbuy.com", "bhphotovideo.com", "amazon.com"],
    priceComparison: ["pcpartpicker.com"],
    marketplaces: ["ebay.com", "reddit.com/r/hardwareswap", "backmarket.com", "craigslist.org"],
    prebuiltBrands: ["nzxt.com", "maingear.com", "ibuypower.com", "cyberpowerpc.com", "originpc.com", "starforgesystems.com"],
  },
  {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    timezone: "Europe/London",
    languages: ["English"],
    retailers: ["scan.co.uk", "overclockers.co.uk", "ebuyer.com", "currys.co.uk", "box.co.uk", "cclonline.com", "amazon.co.uk"],
    priceComparison: ["uk.pcpartpicker.com"],
    marketplaces: ["ebay.co.uk", "uk.webuy.com", "gumtree.com", "backmarket.co.uk"],
    prebuiltBrands: ["pcspecialist.co.uk", "chillblast.com", "scan.co.uk (3XS)", "overclockers.co.uk"],
  },
  {
    code: "FR",
    name: "France",
    currency: "EUR",
    timezone: "Europe/Paris",
    languages: ["French"],
    retailers: ["ldlc.com", "materiel.net", "topachat.com", "grosbill.com", "fnac.com", "amazon.fr"],
    priceComparison: ["ledenicheur.fr", "idealo.fr", "fr.pcpartpicker.com"],
    marketplaces: ["leboncoin.fr", "ebay.fr", "backmarket.fr"],
  },
  {
    code: "NL",
    name: "Netherlands",
    currency: "EUR",
    timezone: "Europe/Amsterdam",
    languages: ["Dutch"],
    retailers: ["coolblue.nl", "megekko.nl", "azerty.nl", "alternate.nl", "bol.com", "amazon.nl"],
    priceComparison: ["tweakers.net/pricewatch"],
    marketplaces: ["marktplaats.nl", "tweakers.net/aanbod", "ebay.nl"],
  },
  {
    code: "BE",
    name: "Belgium",
    currency: "EUR",
    timezone: "Europe/Brussels",
    languages: ["Dutch", "French"],
    retailers: ["coolblue.be", "alternate.be", "megekko.nl", "bol.com", "amazon.com.be"],
    priceComparison: ["tweakers.net/pricewatch"],
    marketplaces: ["2dehands.be", "2ememain.be", "ebay.be"],
  },
  {
    code: "IT",
    name: "Italy",
    currency: "EUR",
    timezone: "Europe/Rome",
    languages: ["Italian"],
    retailers: ["amazon.it", "drako.it", "nexths.it", "mediaworld.it", "eprice.it"],
    priceComparison: ["trovaprezzi.it", "idealo.it"],
    marketplaces: ["subito.it", "ebay.it"],
  },
  {
    code: "ES",
    name: "Spain",
    currency: "EUR",
    timezone: "Europe/Madrid",
    languages: ["Spanish"],
    retailers: ["pccomponentes.com", "coolmod.com", "amazon.es", "mediamarkt.es"],
    priceComparison: ["idealo.es", "es.pcpartpicker.com"],
    marketplaces: ["wallapop.com", "ebay.es"],
  },
  {
    code: "SE",
    name: "Sweden",
    currency: "SEK",
    timezone: "Europe/Stockholm",
    languages: ["Swedish"],
    retailers: ["komplett.se", "inet.se", "webhallen.com", "proshop.se", "elgiganten.se"],
    priceComparison: ["prisjakt.nu"],
    marketplaces: ["blocket.se", "tradera.com"],
  },
  {
    code: "NO",
    name: "Norway",
    currency: "NOK",
    timezone: "Europe/Oslo",
    languages: ["Norwegian"],
    retailers: ["komplett.no", "proshop.no", "elkjop.no", "multicom.no"],
    priceComparison: ["prisjakt.no"],
    marketplaces: ["finn.no"],
  },
  {
    code: "DK",
    name: "Denmark",
    currency: "DKK",
    timezone: "Europe/Copenhagen",
    languages: ["Danish"],
    retailers: ["proshop.dk", "komplett.dk", "computersalg.dk", "elgiganten.dk"],
    priceComparison: ["pricerunner.dk"],
    marketplaces: ["dba.dk"],
  },
  {
    code: "PL",
    name: "Poland",
    currency: "PLN",
    timezone: "Europe/Warsaw",
    languages: ["Polish"],
    retailers: ["x-kom.pl", "morele.net", "komputronik.pl", "mediaexpert.pl"],
    priceComparison: ["ceneo.pl"],
    marketplaces: ["olx.pl", "allegro.pl"],
  },
  {
    code: "CA",
    name: "Canada",
    currency: "CAD",
    timezone: "America/Toronto",
    languages: ["English", "French"],
    retailers: ["canadacomputers.com", "memoryexpress.com", "newegg.ca", "bestbuy.ca", "amazon.ca"],
    priceComparison: ["ca.pcpartpicker.com"],
    marketplaces: ["kijiji.ca", "ebay.ca"],
  },
  {
    code: "AU",
    name: "Australia",
    currency: "AUD",
    timezone: "Australia/Sydney",
    languages: ["English"],
    retailers: ["pccasegear.com", "scorptec.com.au", "mwave.com.au", "centrecom.com.au", "umart.com.au", "amazon.com.au"],
    priceComparison: ["au.pcpartpicker.com", "staticice.com.au"],
    marketplaces: ["gumtree.com.au", "ebay.com.au"],
  },
  {
    code: "NZ",
    name: "New Zealand",
    currency: "NZD",
    timezone: "Pacific/Auckland",
    languages: ["English"],
    retailers: ["pbtech.co.nz", "computerlounge.co.nz", "mightyape.co.nz"],
    priceComparison: ["pricespy.co.nz", "nz.pcpartpicker.com"],
    marketplaces: ["trademe.co.nz"],
  },
  {
    code: "IN",
    name: "India",
    currency: "INR",
    timezone: "Asia/Kolkata",
    languages: ["English"],
    retailers: ["mdcomputers.in", "primeabgb.com", "vedantcomputers.com", "amazon.in", "flipkart.com"],
    priceComparison: ["pcpricetracker.in"],
    marketplaces: ["olx.in"],
  },
];

export function getRegion(code: string): Region | undefined {
  return REGIONS.find((r) => r.code === code);
}

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN", "INR"];
