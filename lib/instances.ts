// products: an email belongs to a product when one of its keywords appears in the email category or name. ["*"] = every email.
// Emails that match no product (for example newsletters) are not shown under any product.
// icon: optional white logo in public/, shown on a colored tile.
// group: the brand section the instance is shown under (Altametrics or Plum).
export const INSTANCES: Record<string, { label: string; short: string; url: string; env: string; icon?: string; group: string; products: Record<string, string[]> }> = {
  altametrics: { label: "Altametrics", short: "Altametrics", url: "https://g1.altametrics.com", env: "ALTAMETRICS", group: "Altametrics", icon: "/instances/altametrics.png", products: { Operations: ["operations", "inventory"], Timeclock: ["timeclock", "time clock"], Scheduling: ["scheduling"] } },
  plumpos: { label: "Plum POS", short: "Plum POS", url: "https://g1.plumpos.com", env: "PLUMPOS", group: "Plum", icon: "/instances/plum.png", products: { Music: ["music"], "Plum POS": ["point of sale", "plum pos"] } },
  accounting: { label: "Plum Accounting", short: "Plum Accounting", url: "https://g1.plumaccounting.com", env: "ACCOUNTING", group: "Plum", icon: "/instances/plum.png", products: { Accounting: ["*"] } },
  payroll: { label: "Plum Payroll", short: "Plum Payroll", url: "https://g1.plumpayroll.com", env: "PAYROLL", group: "Plum", icon: "/instances/plum.png", products: { Payroll: ["*"] } },
};
