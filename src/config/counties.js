// src/config/counties.js — MODIFIED FILE (step 2: every type is open; only a single business can be suspended)
// The 47 counties of Kenya, used by filters and forms.
export const COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay","Isiolo","Kajiado",
  "Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu","Kitui","Kwale","Laikipia",
  "Lamu","Machakos","Makueni","Mandera","Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi",
  "Nakuru","Nandi","Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River",
  "Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot",
];

export const BUSINESS_TYPES = [
  { value: "rental", label: "Rental", blurb: "Apartments, hostels and rooms", open: true },
  { value: "agriculture", label: "Agriculture", blurb: "Farms, produce and inputs", open: true },
  { value: "shop", label: "Shop", blurb: "Retail and online selling", open: true },
];

export const typeLabel = (v) => BUSINESS_TYPES.find((t) => t.value === v)?.label || v;
