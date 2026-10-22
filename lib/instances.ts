// products: an email belongs to a product when one of its keywords appears in the email category or name. ["*"] = every email.
// With more than one product, emails that match none are grouped as "Other".
// icon: optional white logo in public/, shown on a colored tile.
// group: the brand section the instance is shown under (Altametrics or Plum).
export const INSTANCES: Record<string, { label: string; short: string; url: string; env: string; icon?: string; group: string; products: Record<string, string[]> }> = {
  altametrics: { label: "g1.altametrics.com", short: "Altametrics", url: "https://g1.altametrics.com", env: "ALTAMETRICS", group: "Altametrics", icon: "/instances/altametrics.png", products: { Inventory: ["inventory"], Timeclock: ["timeclock", "time clock"], Scheduling: ["scheduling"] } },
  plumpos: { label: "g1.plumpos.com", short: "Plum POS", url: "https://g1.plumpos.com", env: "PLUMPOS", group: "Plum", icon: "/instances/plum.png", products: { Music: ["music"], "Plum POS": ["point of sale", "plum pos"] } },
  accounting: { label: "g1.plumaccounting.com", short: "Accounting", url: "https://g1.plumaccounting.com", env: "ACCOUNTING", group: "Plum", icon: "/instances/plum.png", products: { Accounting: ["*"] } },
  payroll: { label: "g1.plumpayroll.com", short: "Payroll", url: "https://g1.plumpayroll.com", env: "PAYROLL", group: "Plum", icon: "/instances/plum.png", products: { Payroll: ["*"] } },
};
