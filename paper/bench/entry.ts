// Browser bundle for the benchmark: the REAL SDK extractor + REAL shared scorer.
import { extractCandidates } from "../../packages/sdk/src/extraction/extract";
import { bestMatch, rankCandidates, specFromDescriptor } from "../../packages/shared/src/scoring/score";
import { descriptorFromElement } from "../../packages/shared/src/executor/plan";
import { matchText } from "../../packages/shared/src/scoring/text";
(window as any).__cp = { extractCandidates, bestMatch, rankCandidates, specFromDescriptor, descriptorFromElement, matchText };
