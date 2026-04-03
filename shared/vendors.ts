export interface VendorProfile {
  shortName: string;
  name: string;
  description: string;
  market: string;
  strengths: string[];
  weaknesses: string[];
  color: string;
  moduleRatings: Record<string, number>; // 1-5 scale per module
  platformType: "erp" | "eam" | "pms"; // What this platform covers
  coveredModules: string[]; // Which modules this platform actually handles
  costs?: {
    implementationTotal: number;
    ongoingAnnual: number;
    sevenYearTotal: number;
    platform: string;
    eam: string;
    hcm: string;
    pms: string;
  };
}

// Maps functionalArea names → vendor rating keys
const moduleKeyMap: Record<string, string> = {
  "Accounts Payable": "AP",
  "Asset Data": "Asset Data",
  "Asset Management": "Asset Mgmt",
  "Asset Performance & Lifecycle": "Asset Performance",
  "Billing": "Billing",
  "Budgeting": "Budgeting",
  "Capital Budgeting": "Capital Budgeting",
  "Case Management": "Case Mgmt",
  "Cash, Investment & Debt": "Cash Debt",
  "Contracts & Procurement": "Procurement",
  "Core Accounting": "Core Accounting",
  "Environmental Health & Safety": "EHS",
  "Fixed Assets": "Fixed Assets",
  "General Scheduling": "General Scheduling",
  "Grant Management": "Grant Mgmt",
  "HR General": "HR",
  "Inventory & Warehouse": "Inventory",
  "Maintenance": "Maintenance",
  "Operations & Administrative Scheduling": "Ops Scheduling",
  "Payroll": "Payroll",
  "Project Grants": "Project Grants",
  "Property Management": "Property Mgmt",
  "Public Safety Scheduling": "Public Safety Scheduling",
  "Talent Acquisition": "Talent",
  "Timekeeping": "Timekeeping",
  "Utility Billing": "Utility Billing",
  "Tax Collection": "Tax Collection",
};

const EAM_MODULES = [
  "Asset Data", "Asset Management", "Asset Performance & Lifecycle",
  "Maintenance", "Inventory & Warehouse", "Environmental Health & Safety", "Fixed Assets",
];

const REVENUE_MODULES = [
  "Utility Billing", "Tax Collection",
];

const FINANCE_HR_MODULES = [
  "Accounts Payable", "Billing", "Budgeting", "Capital Budgeting",
  "Case Management", "Cash, Investment & Debt", "Contracts & Procurement",
  "Core Accounting", "General Scheduling", "Grant Management", "HR General",
  "Operations & Administrative Scheduling", "Payroll", "Project Grants",
  "Property Management", "Public Safety Scheduling", "Talent Acquisition", "Timekeeping",
];

export const vendorProfiles: VendorProfile[] = [
  // ==================== ERP / HCM PLATFORMS ====================
  {
    shortName: "tyler",
    name: "Tyler Technologies",
    description: "Government-focused ERP covering Finance, HR, EAM, and Property Management. Built exclusively for public sector with strong asset management and maintenance. 100% coverage on 10 modules.",
    market: "Public Sector ERP — Finance, HR, Asset Management, Property Management, Permitting",
    color: "#1B5E20",
    platformType: "erp",
    coveredModules: [...FINANCE_HR_MODULES, ...EAM_MODULES, ...REVENUE_MODULES],
    strengths: [
      "Built exclusively for government — deep public sector domain knowledge",
      "Perfect 100% on 10 modules: Asset Data, Asset Mgmt, Asset Performance, Capital Budgeting, Case Mgmt, EHS (98.6%), Fixed Assets, Inventory, Maintenance, Timekeeping",
      "Strong Payroll (95.9%), Public Safety Scheduling (94.7%), Operations Scheduling (94.1%)",
      "Unified platform covering ERP + HCM + EAM + PMS — no multi-vendor integration needed",
      "Proven track record with thousands of government implementations",
    ],
    weaknesses: [
      "Property Management weaker than competitors (53.9%)",
      "HR General coverage has gaps (68.9%) — weaker HCM than Workday/Oracle",
      "Core Accounting below top tier (78.6%)",
      "Cash, Investment & Debt moderate (62.1%) — relies on third-party for treasury",
      "Contracts & Procurement gaps (85.8%) compared to Workday (98.6%)",
    ],
    moduleRatings: {
      "AP": 4, "Billing": 3, "Budgeting": 4, "Capital Budgeting": 5,
      "Cash Debt": 2, "Core Accounting": 3, "Grant Mgmt": 3, "Project Grants": 2,
      "Procurement": 4, "HR": 2, "Payroll": 5, "Timekeeping": 5,
      "Talent": 3, "Case Mgmt": 5, "General Scheduling": 3,
      "Public Safety Scheduling": 4, "Ops Scheduling": 4, "Property Mgmt": 2,
      // EAM modules (Tyler's own — very strong)
      "Asset Data": 5, "Asset Mgmt": 5, "Asset Performance": 5,
      "Fixed Assets": 5, "Maintenance": 5, "Inventory": 5, "EHS": 5,
      // Revenue modules
      "Utility Billing": 4, "Tax Collection": 4,
    },
  },
  {
    shortName: "workday",
    name: "Workday",
    description: "Cloud-native ERP and HCM platform with unified data model. Strong across Finance, HR, Procurement, and Property Management. Also offers EAM capabilities.",
    market: "Cloud ERP + HCM — Finance, HR, Procurement, Planning, Property Management, and EAM",
    color: "#F68D2E",
    platformType: "erp",
    costs: {
      implementationTotal: 22199999,
      ongoingAnnual: 1351261,
      sevenYearTotal: 31655830,
      platform: "Workday",
      eam: "Workday EAM",
      hcm: "Workday HCM",
      pms: "Workday",
    },
    coveredModules: [...FINANCE_HR_MODULES, ...EAM_MODULES, ...REVENUE_MODULES],
    strengths: [
      "Unified single-platform architecture — no integration between HR, Finance, and Operations",
      "Strong coverage across Finance (96%+), HR (97.5%), Procurement (98.6%)",
      "Perfect Property Management (100%), Grant Management (98.1%), Payroll (98.2%)",
      "Best-in-class Budgeting and Planning (96%+) with Adaptive Planning",
      "Consumer-grade UX with high adoption rates",
    ],
    weaknesses: [
      "Fixed Assets coverage has gaps (66.7%)",
      "Cash, Investment & Debt moderate (80.5%)",
      "Capital Budgeting below Oracle (86.1% vs 100%)",
      "EAM capabilities not as deep as dedicated EAM platforms like Maximo",
    ],
    moduleRatings: {
      "AP": 5, "Billing": 4, "Budgeting": 5, "Capital Budgeting": 4,
      "Cash Debt": 3, "Core Accounting": 4, "Grant Mgmt": 5, "Project Grants": 5,
      "Procurement": 5, "HR": 5, "Payroll": 5, "Timekeeping": 5,
      "Talent": 5, "Case Mgmt": 5, "General Scheduling": 4,
      "Public Safety Scheduling": 4, "Ops Scheduling": 4, "Property Mgmt": 5,
      // EAM modules (Workday's own EAM)
      "Asset Data": 5, "Asset Mgmt": 4, "Asset Performance": 4,
      "Fixed Assets": 2, "Maintenance": 5, "Inventory": 5, "EHS": 4,
      // Revenue modules
      "Utility Billing": 3, "Tax Collection": 3,
    },
  },
  {
    shortName: "oracle_cloud",
    name: "Oracle Cloud",
    description: "Comprehensive cloud ERP suite with strong financials, HCM, and planning. Perfect EHS and Capital Budgeting coverage. Best for complex financial organizations.",
    costs: {
      implementationTotal: 20155696,
      ongoingAnnual: 1045288,
      sevenYearTotal: 27471708,
      platform: "Oracle Cloud ERP",
      eam: "Oracle EAM",
      hcm: "Oracle Cloud HCM",
      pms: "Oracle PMS",
    },
    market: "Cloud ERP + HCM — Finance, HR, SCM, Planning, and Enterprise Performance Management",
    color: "#C74634",
    platformType: "erp",
    coveredModules: [...FINANCE_HR_MODULES, ...EAM_MODULES, ...REVENUE_MODULES],
    strengths: [
      "Perfect Capital Budgeting (100%), EHS (100%), Accounts Payable (100%)",
      "Strong HR General (99.2%), Budgeting (97.0%), Payroll (97.3%)",
      "Comprehensive EPM and analytics capabilities",
      "Broad module coverage across all enterprise functions",
      "Strong global and multi-entity support",
    ],
    weaknesses: [
      "Asset Management very weak (15.6%) — typically needs EAM partner",
      "Inventory & Warehouse below threshold (63.8%)",
      "Maintenance gaps (73.2%) — not a dedicated EAM platform",
      "Fixed Assets weak (45.5%)",
      "Property Management moderate (81.6%)",
    ],
    moduleRatings: {
      "AP": 5, "Billing": 3, "Budgeting": 5, "Capital Budgeting": 5,
      "Cash Debt": 4, "Core Accounting": 4, "Grant Mgmt": 4, "Project Grants": 5,
      "Procurement": 5, "HR": 5, "Payroll": 5, "Timekeeping": 4,
      "Talent": 4, "Case Mgmt": 5, "General Scheduling": 3,
      "Public Safety Scheduling": 3, "Ops Scheduling": 4, "Property Mgmt": 3,
      // EAM modules (Oracle's native EAM — weak)
      "Asset Data": 5, "Asset Mgmt": 1, "Asset Performance": 3,
      "Fixed Assets": 1, "Maintenance": 3, "Inventory": 2, "EHS": 5,
      // Revenue modules
      "Utility Billing": 3, "Tax Collection": 3,
    },
  },

  // ==================== EAM PLATFORMS ====================
  {
    shortName: "maximo",
    name: "IBM Maximo",
    description: "Industry-leading enterprise asset management platform. Best-in-class for asset-intensive operations including maintenance, inventory, and work order management.",
    market: "Enterprise Asset Management — Asset lifecycle, maintenance, inventory, and field operations",
    color: "#054ADA",
    platformType: "eam",
    coveredModules: EAM_MODULES,
    strengths: [
      "Perfect Maintenance coverage (100%) — industry gold standard",
      "Excellent Asset Management (96.7%) and Asset Performance (100%)",
      "Strong Inventory & Warehouse (98.3%)",
      "Proven at scale in utilities, transportation, energy, and government",
      "Deep work order management and preventive maintenance capabilities",
    ],
    weaknesses: [
      "EAM-only — requires a separate ERP/HCM platform for Finance and HR",
      "Environmental Health & Safety moderate (70%)",
      "Fixed Assets moderate (50%) — often handled by the ERP platform",
      "Integration required with ERP for financial posting and procurement",
    ],
    moduleRatings: {
      "Asset Data": 5, "Asset Mgmt": 5, "Asset Performance": 5,
      "Fixed Assets": 2, "Maintenance": 5, "Inventory": 5, "EHS": 3,
    },
  },
  {
    shortName: "nv5",
    name: "NV5",
    description: "Enterprise asset management platform with strong asset lifecycle and field service capabilities. Excellent Fixed Assets and Asset Management coverage.",
    market: "Enterprise Asset Management — Asset lifecycle, field service, and infrastructure management",
    color: "#2E8B57",
    platformType: "eam",
    coveredModules: EAM_MODULES,
    strengths: [
      "Perfect Asset Management (100%) and Fixed Assets (100%)",
      "Strong Asset Performance & Lifecycle (97.4%)",
      "Good Inventory & Warehouse (94.8%) and Maintenance (94.8%)",
      "Strong infrastructure and field service capabilities",
    ],
    weaknesses: [
      "EAM-only — requires a separate ERP/HCM platform",
      "Environmental Health & Safety is a gap (61.4%)",
      "Integration required with ERP for financial posting",
    ],
    moduleRatings: {
      "Asset Data": 5, "Asset Mgmt": 5, "Asset Performance": 5,
      "Fixed Assets": 5, "Maintenance": 4, "Inventory": 4, "EHS": 2,
    },
  },
  {
    shortName: "oracle_eam",
    name: "Oracle EAM",
    description: "Oracle's native enterprise asset management and EHS capabilities, supplemented by Brightly for maintenance. Best-in-class Environmental Health & Safety.",
    market: "Enterprise Asset Management — Oracle-native EAM with EHS strength",
    color: "#8B0000",
    platformType: "eam",
    coveredModules: EAM_MODULES,
    strengths: [
      "Perfect Environmental Health & Safety (100%) — best in class",
      "Seamless integration with Oracle Cloud ERP (native platform)",
      "Strong Asset Performance (84.2%)",
      "No integration overhead when paired with Oracle Cloud ERP",
    ],
    weaknesses: [
      "Asset Management very weak (15.6%) — significant gap",
      "Maintenance moderate (73.2%)",
      "Inventory & Warehouse below threshold (63.8%)",
      "Fixed Assets weak (45.5%)",
      "Typically supplemented with Brightly or other EAM partners",
    ],
    moduleRatings: {
      "Asset Data": 5, "Asset Mgmt": 1, "Asset Performance": 3,
      "Fixed Assets": 1, "Maintenance": 3, "Inventory": 2, "EHS": 5,
    },
  },
];

// Default module weights
export const defaultModuleWeights: Record<string, number> = {
  "Accounts Payable": 8,
  "Asset Data": 5,
  "Asset Management": 8,
  "Asset Performance & Lifecycle": 7,
  "Billing": 5,
  "Budgeting": 9,
  "Capital Budgeting": 6,
  "Case Management": 3,
  "Cash, Investment & Debt": 6,
  "Contracts & Procurement": 8,
  "Core Accounting": 10,
  "Environmental Health & Safety": 7,
  "Fixed Assets": 6,
  "General Scheduling": 4,
  "Grant Management": 7,
  "HR General": 8,
  "Inventory & Warehouse": 6,
  "Maintenance": 8,
  "Operations & Administrative Scheduling": 4,
  "Payroll": 9,
  "Project Grants": 4,
  "Property Management": 6,
  "Public Safety Scheduling": 4,
  "Talent Acquisition": 5,
  "Timekeeping": 6,
  "Utility Billing": 7,
  "Tax Collection": 6,
};

function getModuleRatingKey(functionalArea: string): string {
  return moduleKeyMap[functionalArea] || "Core Accounting";
}

export function getVendorModuleRating(vendor: VendorProfile, functionalArea: string): number {
  const key = getModuleRatingKey(functionalArea);
  return vendor.moduleRatings[key] ?? 0;
}

export function generateVendorResponse(
  moduleRating: number,
  criticality: string,
  reqIndex: number
): "S" | "F" | "C" | "T" | "N" {
  const variant = reqIndex % 10;

  if (moduleRating === 0) return "N"; // Platform doesn't cover this module
  if (moduleRating === 5) return "S";
  if (moduleRating === 4) return variant < 8 ? "S" : "F";
  if (moduleRating === 3) {
    if (criticality === "Desired") {
      if (variant < 3) return "S";
      if (variant < 7) return "F";
      return "C";
    } else {
      if (variant < 2) return "F";
      if (variant < 6) return "C";
      return "T";
    }
  }
  if (moduleRating === 2) {
    if (variant < 3) return "C";
    if (variant < 8) return "T";
    return "N";
  }
  // Rating 1
  if (criticality === "Desired" && variant < 3) return "T";
  return "N";
}
