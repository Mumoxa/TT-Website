/**
 * Company name → generic industry descriptor mapping
 * Covers JSE-listed, retail, telco, financial services, mining, FMCG, tech, etc.
 * Case-insensitive matching, longest names first to avoid partial collisions.
 */

export const COMPANY_MAP = new Map([
  // Retail - National
  ["Shoprite Group", "National retailer"],
  ["Shoprite Checkers", "National retailer"],
  ["Shoprite", "National retailer"],
  ["Checkers Sixty60", "National retailer"],
  ["Checkers", "National retailer"],
  ["Pick n Pay", "National retailer"],
  ["Pick n Pay Group", "National retailer"],
  ["Woolworths Holdings", "National retailer"],
  ["Woolworths", "National retailer"],
  ["Spar Group", "National retailer"],
  ["Spar", "National retailer"],
  ["Makro", "National retailer"],
  ["Game Stores", "National retailer"],
  ["Game", "National retailer"],
  ["Builders Warehouse", "National retailer"],
  ["Builders", "National retailer"],
  ["Mr Price Group", "National retailer"],
  ["Mr Price", "National retailer"],
  ["TFG", "National retailer"],
  ["The Foschini Group", "National retailer"],
  ["Foschini", "National retailer"],
  ["Pepkor", "National retailer"],
  ["Pep", "National retailer"],
  ["Ackermans", "National retailer"],
  ["Massmart", "National retailer"],
  ["Clicks Group", "National pharmacy and retail chain"],
  ["Clicks", "National pharmacy and retail chain"],
  ["Dis-Chem Pharmacies", "National pharmacy and retail chain"],
  ["Dis-Chem", "National pharmacy and retail chain"],

  // Telecommunications
  ["Vodacom Group", "Major telecommunications provider"],
  ["Vodacom", "Major telecommunications provider"],
  ["MTN Group", "Major telecommunications provider"],
  ["MTN", "Major telecommunications provider"],
  ["Telkom SA", "Major telecommunications provider"],
  ["Telkom", "Major telecommunications provider"],
  ["Cell C", "Major telecommunications provider"],
  ["Rain Mobile", "Major telecommunications provider"],
  ["Rain", "Major telecommunications provider"],

  // Financial Services
  ["Capitec Bank", "Leading financial services provider"],
  ["Capitec", "Leading financial services provider"],
  ["First National Bank", "Leading financial services provider"],
  ["FNB", "Leading financial services provider"],
  ["Standard Bank Group", "Leading financial services provider"],
  ["Standard Bank", "Leading financial services provider"],
  ["Absa Group", "Leading financial services provider"],
  ["Absa", "Leading financial services provider"],
  ["Nedbank Group", "Leading financial services provider"],
  ["Nedbank", "Leading financial services provider"],
  ["Discovery Limited", "Leading financial services provider"],
  ["Discovery", "Leading financial services provider"],
  ["Sanlam", "Leading financial services provider"],
  ["Old Mutual", "Leading financial services provider"],
  ["Momentum Metropolitan", "Leading financial services provider"],
  ["Momentum", "Leading financial services provider"],
  ["Liberty Group", "Leading financial services provider"],
  ["Liberty", "Leading financial services provider"],
  ["Investec", "Leading financial services provider"],
  ["Rand Merchant Bank", "Leading financial services provider"],
  ["RMB", "Leading financial services provider"],
  ["African Bank", "Leading financial services provider"],

  // Energy, Mining, Resources
  ["Sasol Limited", "Major energy and chemicals company"],
  ["Sasol", "Major energy and chemicals company"],
  ["Eskom Holdings", "Major energy utility"],
  ["Eskom", "Major energy utility"],
  ["Anglo American Platinum", "Major mining and resources company"],
  ["Anglo American", "Major mining and resources company"],
  ["AngloGold Ashanti", "Major mining and resources company"],
  ["BHP Group", "Major mining and resources company"],
  ["BHP", "Major mining and resources company"],
  ["Sibanye-Stillwater", "Major mining and resources company"],
  ["Sibanye", "Major mining and resources company"],
  ["Gold Fields", "Major mining and resources company"],
  ["Harmony Gold", "Major mining and resources company"],
  ["Exxaro Resources", "Major mining and resources company"],
  ["Exxaro", "Major mining and resources company"],
  ["Kumba Iron Ore", "Major mining and resources company"],
  ["Transnet SOC", "Major logistics and infrastructure company"],
  ["Transnet", "Major logistics and infrastructure company"],

  // FMCG & Manufacturing
  ["Tiger Brands", "Leading FMCG manufacturer"],
  ["Unilever South Africa", "Leading FMCG manufacturer"],
  ["Unilever", "Leading FMCG manufacturer"],
  ["Nestlé South Africa", "Leading FMCG manufacturer"],
  ["Nestlé", "Leading FMCG manufacturer"],
  ["Coca-Cola Beverages Africa", "Leading beverage manufacturer"],
  ["Coca-Cola", "Leading beverage manufacturer"],
  ["AB InBev", "Leading beverage manufacturer"],
  ["South African Breweries", "Leading beverage manufacturer"],
  ["SAB", "Leading beverage manufacturer"],
  ["Heineken Beverages", "Leading beverage manufacturer"],
  ["Heineken", "Leading beverage manufacturer"],
  ["British American Tobacco", "Leading FMCG manufacturer"],
  ["BAT", "Leading FMCG manufacturer"],
  ["Distell", "Leading beverage manufacturer"],
  ["RCL Foods", "Leading FMCG manufacturer"],
  ["Astral Foods", "Leading FMCG manufacturer"],
  ["Pioneer Foods", "Leading FMCG manufacturer"],

  // Technology & Telecoms Global
  ["Dimension Data", "Leading technology services provider"],
  ["BCX", "Leading technology services provider"],
  ["Business Connexion", "Leading technology services provider"],
  ["Altron", "Leading technology services provider"],
  ["EOH Holdings", "Leading technology services provider"],
  ["EOH", "Leading technology services provider"],
  ["Amazon Web Services", "Global technology company"],
  ["Amazon", "Global technology company"],
  ["Google Cloud", "Global technology company"],
  ["Google", "Global technology company"],
  ["Microsoft Corporation", "Global technology company"],
  ["Microsoft", "Global technology company"],
  ["Apple Inc", "Global technology company"],
  ["Apple", "Global technology company"],
  ["Meta Platforms", "Global technology company"],
  ["Meta", "Global technology company"],
  ["Facebook", "Global technology company"],
  ["Oracle Corporation", "Global enterprise software provider"],
  ["Oracle", "Global enterprise software provider"],
  ["SAP Africa", "Global enterprise software provider"],
  ["SAP", "Global enterprise software provider"],
  ["Salesforce", "Global enterprise software provider"],
  ["IBM South Africa", "Global technology company"],
  ["IBM", "Global technology company"],
  ["Accenture South Africa", "Global professional services firm"],
  ["Accenture", "Global professional services firm"],
  ["Deloitte South Africa", "Global professional services firm"],
  ["Deloitte", "Global professional services firm"],
  ["PwC South Africa", "Global professional services firm"],
  ["PwC", "Global professional services firm"],
  ["KPMG South Africa", "Global professional services firm"],
  ["KPMG", "Global professional services firm"],
  ["EY South Africa", "Global professional services firm"],
  ["EY", "Global professional services firm"],
  ["McKinsey & Company", "Global management consultancy"],
  ["McKinsey", "Global management consultancy"],
  ["BCG", "Global management consultancy"],
  ["Boston Consulting Group", "Global management consultancy"],
  ["Bain & Company", "Global management consultancy"],
  ["Bain", "Global management consultancy"],

  // Automotive & Industrial
  ["Toyota South Africa", "International automotive manufacturer"],
  ["Toyota", "International automotive manufacturer"],
  ["Volkswagen South Africa", "International automotive manufacturer"],
  ["Volkswagen", "International automotive manufacturer"],
  ["BMW South Africa", "International automotive manufacturer"],
  ["BMW", "International automotive manufacturer"],
  ["Mercedes-Benz South Africa", "International automotive manufacturer"],
  ["Mercedes-Benz", "International automotive manufacturer"],
  ["Mercedes", "International automotive manufacturer"],
  ["Ford Motor Company", "International automotive manufacturer"],
  ["Ford", "International automotive manufacturer"],
  ["Isuzu Motors", "International automotive manufacturer"],
  ["Isuzu", "International automotive manufacturer"],
  ["Nissan South Africa", "International automotive manufacturer"],
  ["Nissan", "International automotive manufacturer"],
  ["Barloworld", "Leading industrial group"],
  ["Bidvest Group", "Leading diversified industrial group"],
  ["Bidvest", "Leading diversified industrial group"],
  ["Imperial Logistics", "Major logistics and infrastructure company"],
  ["Imperial", "Major logistics and infrastructure company"],

  // Media & Entertainment
  ["MultiChoice Group", "Leading media and entertainment group"],
  ["MultiChoice", "Leading media and entertainment group"],
  ["DStv", "Leading media and entertainment group"],
  ["Naspers Limited", "Major technology and media group"],
  ["Naspers", "Major technology and media group"],
  ["Prosus N.V.", "Major technology investment group"],
  ["Prosus", "Major technology investment group"],
  ["Takealot Group", "Leading e-commerce platform"],
  ["Takealot", "Leading e-commerce platform"],

  // Payments & Fintech
  ["Paystack", "Leading payments technology company"],
  ["PayPal", "Leading payments technology company"],
  ["Visa Inc", "Leading payments technology company"],
  ["Visa", "Leading payments technology company"],
  ["Mastercard", "Leading payments technology company"],
  ["Ozow", "Leading payments technology company"],
  ["Yoco", "Leading fintech company"],
  ["Peach Payments", "Leading payments technology company"],

  // Healthcare & Pharma
  ["Netcare Limited", "Leading private healthcare provider"],
  ["Netcare", "Leading private healthcare provider"],
  ["Mediclinic International", "Leading private healthcare provider"],
  ["Mediclinic", "Leading private healthcare provider"],
  ["Life Healthcare", "Leading private healthcare provider"],
  ["Aspen Pharmacare", "Leading pharmaceutical manufacturer"],
  ["Aspen", "Leading pharmaceutical manufacturer"],
  ["Adcock Ingram", "Leading pharmaceutical manufacturer"],

  // Property & Construction
  ["Growthpoint Properties", "Leading property group"],
  ["Growthpoint", "Leading property group"],
  ["Redefine Properties", "Leading property group"],
  ["Redefine", "Leading property group"],
  ["WBHO", "Leading construction and engineering group"],
  ["Murray & Roberts", "Leading construction and engineering group"],

  // Generic JSE references that should be sanitized
  ["JSE-listed retail group", "National retailer"],
  ["JSE-listed retailer", "National retailer"],
  ["JSE-listed bank", "Leading financial services provider"],
  ["JSE-listed insurer", "Leading financial services provider"],
  ["JSE-listed mining company", "Major mining and resources company"],
  ["JSE-listed technology company", "Leading technology company"],
  ["Nasdaq-listed payments technology giant", "Leading payments technology company"],
  ["Nasdaq-listed technology company", "Global technology company"],
  ["International automotive manufacturer", "International automotive manufacturer"],
]);

// Additional brand-specific identifiers that can reveal client
const BRAND_IDENTIFIERS = new Map([
  ["Sixty60", "National retailer"],
  ["Knect", "Major telecommunications provider"],
  ["M-Pesa", "Major telecommunications provider"],
  ["PayShap", "Leading financial services provider"],
  ["eBucks", "Leading financial services provider"],
  ["Discovery Vitality", "Leading financial services provider"],
]);

// Merge brand identifiers into main map for lookup
for (const [brand, desc] of BRAND_IDENTIFIERS) {
  if (!COMPANY_MAP.has(brand)) COMPANY_MAP.set(brand, desc);
}

// For quick lookup - sorted by length descending to match longest first
export const SORTED_COMPANIES = [...COMPANY_MAP.entries()].sort((a, b) => b[0].length - a[0].length);

// Suffixes that often follow a known company and should be included in replacement
// Sorted longest first to avoid partial matches (e.g., " Holdings" before " Holdings Ltd" would cause early match)
export const COMPANY_SUFFIXES = [
  " Holdings Limited",
  " Holdings Ltd",
  " Group Limited",
  " Group Ltd",
  " (Pty) Ltd",
  " Limited Group",
  " Holdings",
  " Pty Limited",
  " Pty Ltd",
  " Limited",
  " Group",
  " SOC Ltd",
  " Incorporated",
  " Corporation",
  " South Africa",
  " Ltd",
  " Corp",
  " LLC",
  " Inc",
  " SOC",
  " SA",
];

// Industry keyword → descriptor fallback when company is unknown
export const INDUSTRY_FALLBACKS = [
  { keywords: ["retail", "shop", "store", "supermarket", "grocery"], descriptor: "National retailer" },
  { keywords: ["bank", "financial", "insurance", "investment", "fintech", "lending", "credit"], descriptor: "Leading financial services provider" },
  { keywords: ["telecom", "telco", "mobile", "network", "5g", "telecommunication"], descriptor: "Major telecommunications provider" },
  { keywords: ["mining", "minerals", "gold", "platinum", "coal", "iron ore", "resources"], descriptor: "Major mining and resources company" },
  { keywords: ["energy", "oil", "gas", "petrochemical", "chemicals", "utility", "power"], descriptor: "Major energy and chemicals company" },
  { keywords: ["logistics", "transport", "shipping", "freight", "supply chain"], descriptor: "Major logistics and infrastructure company" },
  { keywords: ["fmcg", "consumer goods", "beverage", "food", "manufacturing", "fmcg manufacturer"], descriptor: "Leading FMCG manufacturer" },
  { keywords: ["pharmacy", "pharmaceutical", "healthcare", "hospital", "medical", "clinic"], descriptor: "Leading private healthcare provider" },
  { keywords: ["technology", "software", "saas", "cloud", "it services", "digital", "tech", "data", "analytics", "ai"], descriptor: "Leading technology company" },
  { keywords: ["e-commerce", "ecommerce", "marketplace", "online retail"], descriptor: "Leading e-commerce platform" },
  { keywords: ["media", "entertainment", "broadcasting", "publishing", "streaming"], descriptor: "Leading media and entertainment group" },
  { keywords: ["automotive", "vehicle", "car manufacturer", "auto", "motor"], descriptor: "International automotive manufacturer" },
  { keywords: ["payments", "payment", "fintech", "transaction"], descriptor: "Leading payments technology company" },
  { keywords: ["consulting", "professional services", "advisory", "audit"], descriptor: "Global professional services firm" },
  { keywords: ["property", "real estate", "construction", "engineering"], descriptor: "Leading property and construction group" },
  { keywords: ["agriculture", "farming", "agri"], descriptor: "Leading agribusiness" },
  { keywords: ["education", "university", "school", "training"], descriptor: "Leading education provider" },
];

export const DEFAULT_DESCRIPTOR = "Leading organisation in its sector";

// All unique generic descriptors for UI dropdown
export const ALL_DESCRIPTORS = [...new Set([
  ...[...COMPANY_MAP.values()],
  ...INDUSTRY_FALLBACKS.map(f => f.descriptor),
  DEFAULT_DESCRIPTOR,
  "National retailer",
  "Major telecommunications provider",
  "Leading financial services provider",
  "Major mining and resources company",
  "Leading technology company",
  "Global technology company",
  "Leading FMCG manufacturer",
  "International automotive manufacturer",
  "Leading e-commerce platform",
  "Leading private healthcare provider",
  "Major logistics and infrastructure company",
])].sort();

// Predefined company description templates by descriptor
export const DESCRIPTOR_TEMPLATES = {
  "National retailer": "Our client is a well-established national retailer with a strong presence across South Africa. They operate multiple store formats and are known for their commitment to customer service and operational excellence.",
  "Major telecommunications provider": "Our client is a major telecommunications provider serving millions of customers across South Africa and the continent. They are at the forefront of digital innovation and connectivity.",
  "Leading financial services provider": "Our client is a leading financial services provider with a diversified portfolio across banking, insurance, and investment management. They are recognised for their stability and customer-centric approach.",
  "Major mining and resources company": "Our client is a major mining and resources company with operations across Southern Africa. They are committed to sustainable mining practices and operational excellence.",
  "Leading technology company": "Our client is a leading technology company driving digital transformation across multiple industries. They foster a culture of innovation and continuous learning.",
  "Global technology company": "Our client is a global technology company with a significant presence in South Africa. They build products used by millions worldwide and maintain high engineering standards.",
  "Leading FMCG manufacturer": "Our client is a leading FMCG manufacturer with a portfolio of well-known consumer brands. They have a strong manufacturing and distribution footprint.",
  "International automotive manufacturer": "Our client is an international automotive manufacturer with operations in South Africa. They are known for engineering excellence and innovation.",
  "Leading e-commerce platform": "Our client is a leading e-commerce platform that has transformed online retail in South Africa. They operate at significant scale with a focus on customer experience.",
  "Leading private healthcare provider": "Our client is a leading private healthcare provider with facilities across the country. They are committed to clinical excellence and patient care.",
  "Major logistics and infrastructure company": "Our client is a major logistics and infrastructure company that plays a critical role in South Africa's supply chain. They operate at national scale.",
  "Leading organisation in its sector": "Our client is a leading organisation in its sector with a strong market position and reputation for excellence. They offer a dynamic and growth-oriented environment.",
  "Global professional services firm": "Our client is a global professional services firm with a strong South African practice. They advise leading organisations across multiple industries.",
  "Global management consultancy": "Our client is a global management consultancy that works with executive teams on their most critical challenges.",
  "Leading payments technology company": "Our client is a leading payments technology company enabling digital commerce across Africa. They operate at the intersection of finance and technology.",
};

/**
 * Detect industry from surrounding text context
 */
export function inferIndustryFromContext(text, companyName = "") {
  const lower = (text + " " + companyName).toLowerCase();
  for (const { keywords, descriptor } of INDUSTRY_FALLBACKS) {
    if (keywords.some(k => lower.includes(k))) {
      return descriptor;
    }
  }
  return DEFAULT_DESCRIPTOR;
}
