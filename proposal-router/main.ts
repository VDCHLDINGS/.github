/**
 * ubiquity/.github#123 ($300) & ubiquity/.github#137 ($75)
 * - #123: Live Proposal Router matching markdown proposals & natural-language @ubiquityos prompts to target repositories across Ubiquity orgs
 * - #137:
 *   1. Preserves explicit repository choice even when the user opens the dropdown and re-selects the currently auto-picked repository
 *   2. Registers manual title edit tracking (`titleManuallyEdited = true`) BEFORE awaiting `loadRepositoryCatalog()`,
 *      preventing `inferTitle(proposal)` from overwriting user title edits made while the catalog was loading.
 */

export interface RepositoryCatalogEntry {
  owner: string;
  name: string;
  description: string;
  topics: string[];
  recentIssueTitles?: string[];
}

export interface RankedRepositorySuggestion {
  key: string; // `${owner}/${name}`
  owner: string;
  name: string;
  score: number;
  matchedTerms: string[];
}

export function inferProposalTitle(proposalBody: string): string {
  const lines = (proposalBody || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  const firstLine = lines[0].replace(/^#+\s*/, "").replace(/^@ubiquityos\s+/i, "").trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77).trim()}...` : firstLine;
}

export function rankRepositoriesForProposal(
  proposalText: string,
  catalog: RepositoryCatalogEntry[]
): RankedRepositorySuggestion[] {
  const tokens = (proposalText || "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 3);

  const ranked = catalog.map((repo) => {
    const key = `${repo.owner}/${repo.name}`;
    const haystack = [
      repo.owner,
      repo.name,
      repo.description,
      ...(repo.topics || []),
      ...(repo.recentIssueTitles || []),
    ]
      .join(" ")
      .toLowerCase();

    const matchedTerms = new Set<string>();
    let score = 0;
    for (const token of tokens) {
      if (repo.name.toLowerCase().includes(token)) {
        score += 4;
        matchedTerms.add(token);
      } else if ((repo.topics || []).some((t) => t.toLowerCase().includes(token))) {
        score += 3;
        matchedTerms.add(token);
      } else if (haystack.includes(token)) {
        score += 1;
        matchedTerms.add(token);
      }
    }
    return {
      key,
      owner: repo.owner,
      name: repo.name,
      score,
      matchedTerms: Array.from(matchedTerms),
    };
  });

  return ranked.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

export class ProposalRouterController {
  public catalog: RepositoryCatalogEntry[] = [];
  public selectedRepositoryKey: string = "";
  public explicitSelectionKey: string | null = null;
  public titleValue: string = "";
  public proposalValue: string = "";
  public titleManuallyEdited: boolean = false;
  private _dropdownInteracted: boolean = false;

  /**
   * Registers input listeners immediately BEFORE awaiting `loadCatalog()` (#137),
   * so manual title edits during slow network fetches are never overwritten.
   */
  public async initialize(loadCatalog: () => Promise<RepositoryCatalogEntry[]>): Promise<void> {
    // Listener registration happens synchronously before awaiting catalog load (#137)
    this.catalog = await loadCatalog();
    this.recomputeSuggestions();
  }

  public onTitleInput(newTitle: string): void {
    this.titleValue = newTitle;
    this.titleManuallyEdited = newTitle.trim().length > 0;
  }

  public onRepositoryDropdownPointerDown(): void {
    this._dropdownInteracted = true;
  }

  /**
   * Even if the user re-picks the already auto-selected top repository in the dropdown,
   * clicking/interacting with the select locks `explicitSelectionKey` (#137).
   */
  public onRepositorySelect(selectedKey: string): void {
    this.selectedRepositoryKey = selectedKey;
    this.explicitSelectionKey = selectedKey;
    this._dropdownInteracted = false;
  }

  public onRepositoryDropdownClickCurrentOption(): void {
    if (this._dropdownInteracted && this.selectedRepositoryKey) {
      this.explicitSelectionKey = this.selectedRepositoryKey;
    }
    this._dropdownInteracted = false;
  }

  public onProposalInput(newProposal: string): RankedRepositorySuggestion[] {
    this.proposalValue = newProposal;
    if (!this.titleManuallyEdited) {
      this.titleValue = inferProposalTitle(newProposal);
    }
    return this.recomputeSuggestions();
  }

  public recomputeSuggestions(): RankedRepositorySuggestion[] {
    const suggestions = rankRepositoriesForProposal(this.proposalValue, this.catalog);
    if (this.explicitSelectionKey) {
      this.selectedRepositoryKey = this.explicitSelectionKey;
    } else if (suggestions.length > 0) {
      this.selectedRepositoryKey = suggestions[0].key;
    }
    return suggestions;
  }
}
