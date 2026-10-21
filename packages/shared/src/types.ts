/**
 * Public types for the platform. All types are inferred from the Zod schemas
 * (single source of truth) and re-exported here for ergonomic imports.
 */
export type {
  BoundingBox,
  TextMatcher,
} from "./schemas/common.js";
export type { SemanticElement, TargetDescriptor } from "./schemas/element.js";
export type { DeltaGroup, FrameInfo, PageSnapshot } from "./schemas/snapshot.js";
export type {
  MatchCriteria,
  AdvanceCondition,
  Step,
  FlowDefinition,
} from "./schemas/flow.js";
export type { EventType, EventReport } from "./schemas/events.js";
export type {
  GuidanceRequest,
  Instruction,
  InstructionKind,
  GuidanceResponse,
  AiDecision,
  AiGuideDecision,
} from "./schemas/guidance.js";
export type { ChatRequest, ChatResponse } from "./schemas/chat.js";
