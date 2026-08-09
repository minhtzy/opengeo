export interface BrandFact { id: string; claim: string }
export interface CompetitorProfile { id: string; name: string; aliases: string[] }
export interface BrandProfile { brandId: string; name: string; aliases: string[]; domains: string[]; entityDescription: string; facts: BrandFact[]; competitors: CompetitorProfile[] }
